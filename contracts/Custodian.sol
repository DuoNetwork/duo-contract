pragma solidity ^0.4.23;
import { DUO } from "./DUO.sol";

library SafeMath {
	function mul(uint256 a, uint256 b) internal pure returns (uint256) {
		uint256 c = a * b;
		assert(a == 0 || c / a == b);
		return c;
	}

	function div(uint256 a, uint256 b) internal pure returns (uint256) {
		// assert(b > 0); // Solidity automatically throws when dividing by 0
		uint256 c = a / b;
		// assert(a == b * c + a % b); // There is no case in which this doesn't hold
		return c;
	}

	function sub(uint256 a, uint256 b) internal pure returns (uint256) {
		assert(b <= a);
		return a - b;
	}

	function add(uint256 a, uint256 b) internal pure returns (uint256) {
		uint256 c = a + b;
		assert(c >= a);
		return c;
	}

	function gt(uint x, uint y) internal pure returns(bytes1) {
		bytes1 b;
		b = 0x0;
		if (x > y) {
			b = 0x1;
		}
		return b;
	}
}

contract Custodian {
	using SafeMath for uint;
	enum State {
		Inception,
		Trading,
		PreReset,
		UpwardReset,
		DownwardReset,
		PeriodicReset
	}

	struct Price {
		uint priceInWei;
		uint timeInSecond;
	}

	State public state;
	address duoTokenAddress;
	// below 6 address are returned by getSystemAddresses
	address admin;
	address feeCollector;
	address priceFeed1; 
	address priceFeed2; 
	address priceFeed3;
	address addrAdder;

	address[] public addrPool =[
	    0x1952E39f7Bc9E00FAffcEa0305E09c065DBd8eFd,
	    0x51a123239894F0C7175F9c0e9e9519d9D74194f6,
	    0x15421ef85E1f4ED8e20Cdf35894caa3d2fb43344,
		0x11B73358799D057D195fCeC8B93C70E54E39da27
	];
	mapping(address => uint) addrStatus;

	uint constant decimals = 18;
	mapping(address => uint)[2] public balanceOf;
	//mapping(address => uint)[] public balanceBOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	//mapping (address => mapping (address => uint)) public allowanceB;
	address[] public users;
	mapping (address => bool) existingUsers;
	mapping(address => uint) public ethPendingWithdrawal;

	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;

	Price public resetPrice; 
	Price public lastPrice; 
	// below 18 states are returned in getSystemStates
	uint alphaInBP;
	uint betaInWei = WEI_DENOMINATOR;
	uint feeAccumulatedInWei;
	uint periodCouponInWei; 
	uint limitPeriodicInWei; 
	uint limitUpperInWei; 
	uint limitLowerInWei;
	uint commissionRateInBP;
	uint period;
	uint iterationGasThreshold;
	uint memberThresholdInWei;
	uint preResetWaitingBlocks = 10;
	uint priceTolInBP = 500; 
	uint priceFeedTolInBP = 100;
	uint priceFeedTimeTol = 1 minutes;
	uint priceUpdateCoolDown;
	uint numOfPrices = 0;
	uint nextResetAddrIndex = 0;
	// nav and current total supply
	uint public navAInWei;
	uint public navBInWei; 
	uint public totalSupplyA;
	uint public totalSupplyB;

	// cycle state variables
	uint lastPreResetBlockNo = 0;
	// below 4 data are returned in getStagingPrices
	address firstAddr;
	address secondAddr;
	Price firstPrice;
	Price secondPrice;
	
	// reset intermediate values
	uint bAdj;
	uint newAFromAPerA;
	uint newAFromBPerB;
	uint newBFromAPerA;
	uint newBFromBPerB;

	modifier inState(State _state) {
		require(state == _state);
		_;
	}

	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier among(address addr1, address addr2, address addr3) {
		require(msg.sender == addr1 || msg.sender == addr2 || msg.sender == addr3);
		_;
	}

	modifier isDuoMember() {
		DUO duoToken = DUO(duoTokenAddress);
		require(duoToken.balanceOf(msg.sender) >= memberThresholdInWei);
		_;
	}

	modifier inAddrPool() {
		require(addrStatus[msg.sender] == 1);
		_;
	}

	event StartTrading();
	event StartPreReset();
	event StartReset();

	event Transfer(address indexed from, address indexed to, uint256 value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond);
	event AddAddress(address added1, address added2, address newAdder);
	event UpdateAddress(address current, address newAddr);
	event RemoveAddress(address addr, address newAddr);
	
	constructor(
		address feeAddress, 
		address duoAddress,
		address pf1,
		address pf2,
		address pf3,
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint memberThreshold,
		uint gasThreshold,
		uint coolDown) 
		public 
	{
		for (uint i = 0; i < addrPool.length; i++) {
			addrStatus[addrPool[i]] = 1;
		}
		state = State.Inception;
		addrAdder = msg.sender;
		admin = msg.sender;
		addrStatus[addrAdder] = 2;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
		addrStatus[feeCollector] = 2;
		priceFeed1 = pf1;
		addrStatus[priceFeed1] = 2;
		priceFeed2 = pf2;
		addrStatus[priceFeed2] = 2;
		priceFeed3 = pf3;
		addrStatus[priceFeed3] = 2;
		duoTokenAddress = duoAddress;
		addrStatus[duoTokenAddress] = 2;
		alphaInBP = alpha;
		periodCouponInWei = r; 
		limitPeriodicInWei = hp; 
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		commissionRateInBP = c;
		period = p;
		memberThresholdInWei = memberThreshold;
		iterationGasThreshold = gasThreshold;
		navAInWei = 1;
		navBInWei = 1;
		priceUpdateCoolDown = coolDown;
		bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
	}

	function startContract(
		uint priceInWei, 
		uint timeInSecond) 
		public 
		inState(State.Inception) 
		among(priceFeed1, priceFeed2, priceFeed3) 
		returns (bool success) 
	{
		require(timeInSecond <= getNowTimestamp());
		lastPrice.timeInSecond = timeInSecond;
		lastPrice.priceInWei = priceInWei;
		resetPrice.timeInSecond = timeInSecond;
		resetPrice.priceInWei = priceInWei;
		state = State.Trading;
		return true;
	}
	
	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
	
	function checkNewUser(address user) internal {
		if (!existingUsers[user]) {
			users.push(user);
			existingUsers[user] = true;
			balanceOf[0][user] = 0;
			balanceOf[1][user] = 0;
		}
	}

	function calculateNav(
		uint priceInWei, 
		uint timeInSecond, 
		uint resetPriceInWei, 
		uint resetTimeInSecond,
		uint bInWei) 
	public view returns (uint, uint) {
		uint numOfPeriods = timeInSecond.sub(resetTimeInSecond).div(period);
		uint navParent = priceInWei.mul(WEI_DENOMINATOR).div(resetPriceInWei);
		navParent = navParent
			.mul(WEI_DENOMINATOR)
			.mul(alphaInBP.add(BP_DENOMINATOR))
			.div(BP_DENOMINATOR)
			.div(bInWei
		);
		uint navA = periodCouponInWei.mul(numOfPeriods).add(WEI_DENOMINATOR);
		uint navAAdj = navA.mul(alphaInBP).div(BP_DENOMINATOR);
		if (navParent <= navAAdj)
			return (navParent.mul(BP_DENOMINATOR).div(alphaInBP), 0);
		else
			return (navA, navParent.sub(navAAdj));
	}

	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			uint newBFromA;
			uint newAFromA;
			if (navBInWei >= limitUpperInWei) {
				state = State.UpwardReset;
				betaInWei = WEI_DENOMINATOR;
				uint excessAInWei = navAInWei.sub(WEI_DENOMINATOR);
				uint excessBInWei = navBInWei.sub(WEI_DENOMINATOR);
				uint excessBForAInWei = excessAInWei.mul(BP_DENOMINATOR).div(alphaInBP);
				// excessive B is enough to cover excessive A
				//if (excessBInWei >= excessBForAInWei) {
				uint excessBAfterAInWei = excessBInWei.sub(excessBForAInWei);
				newAFromAPerA = excessAInWei;
				newBFromAPerA = 0;
				uint newBFromExcessBPerB = excessBAfterAInWei.mul(betaInWei).div(bAdj);
				newAFromBPerB = newBFromExcessBPerB.mul(alphaInBP).div(BP_DENOMINATOR);
				newBFromBPerB = excessBForAInWei.add(newBFromExcessBPerB);			
				// ignore this case for now as it requires a very small alpha 
				// and very low upper limit for upward reset
				/*} else {
					uint excessAForBInWei = excessBInWei.mul(alphaInBP).div(BP_DENOMINATOR);
					uint excessAAfterBInWei = excessAInWei.sub(excessAForBInWei);
					newAFromBPerB = 0;
					newBFromBPerB = excessBInWei;
					newBFromAPerA = excessAAfterBInWei.mul(betaInWei).div(bAdj);
					newAFromAPerA = excessAForBInWei.add(newBFromAPerA.mul(alphaInBP).div(BP_DENOMINATOR));
				}*/
				// adjust total supply
				totalSupplyA = totalSupplyA
					.add(totalSupplyA
						.mul(newAFromAPerA)
						.add(totalSupplyB
							.mul(newAFromBPerB))
						.div(WEI_DENOMINATOR)
				);
				totalSupplyB = totalSupplyB
					.add(totalSupplyA
						.mul(newBFromAPerA)
						.add(totalSupplyB
							.mul(newBFromBPerB))
						.div(WEI_DENOMINATOR)
				);
			} else if(navBInWei <= limitLowerInWei) {
				state = State.DownwardReset;
				betaInWei = WEI_DENOMINATOR;
				newBFromAPerA = navAInWei.sub(navBInWei).mul(betaInWei).div(bAdj);
				// below are not used and set to 0
				newAFromAPerA = 0;
				newBFromBPerB = 0;
				newAFromBPerB = 0;
				// adjust total supply
				newBFromA = totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				totalSupplyA = totalSupplyA.mul(navBInWei).div(WEI_DENOMINATOR).add(newAFromA);
				totalSupplyB = totalSupplyB.mul(navBInWei).div(WEI_DENOMINATOR).add(newBFromA);
			} else { // navAInWei >= limitPeriodicInWei
				state = State.PeriodicReset;
				uint num = alphaInBP
					.add(BP_DENOMINATOR)
					.mul(lastPrice.priceInWei);
				uint den = num
					.sub(
						resetPrice.priceInWei
							.mul(alphaInBP)
							.mul(betaInWei)
							.mul(navAInWei
								.sub(WEI_DENOMINATOR))
							.div(WEI_DENOMINATOR)
							.div(WEI_DENOMINATOR)
				);
				betaInWei = betaInWei.mul(num).div(den);
				newBFromAPerA = navAInWei.sub(WEI_DENOMINATOR).mul(betaInWei).div(bAdj);
				// below are not used and set to 0
				newBFromBPerB = 0;
				newAFromAPerA = 0;
				newAFromBPerB = 0;
				// adjust total supply
				newBFromA = totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				totalSupplyA = totalSupplyA.add(newAFromA);
				totalSupplyB = totalSupplyB.add(newBFromA);
			}

			emit StartReset();
		} else 
			emit StartPreReset();

		return true;
	}

	function startReset() public returns (bool success) {
		require(state == State.UpwardReset || state == State.DownwardReset || state == State.PeriodicReset);
		uint currentBalanceA;
		uint currentBalanceB;
		uint newBalanceA;
		uint newBalanceB;
		uint newAFromA;
		uint newBFromA;
		address currentAddress;
		uint localResetAddrIndex = nextResetAddrIndex;
		while (localResetAddrIndex < users.length && gasleft() > iterationGasThreshold) {
			currentAddress = users[nextResetAddrIndex];
			currentBalanceA = balanceOf[0][currentAddress];
			currentBalanceB = balanceOf[1][currentAddress];
			if (state == State.DownwardReset) {
				newBFromA = currentBalanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.mul(navBInWei).div(WEI_DENOMINATOR).add(newAFromA);
				newBalanceB = currentBalanceB.mul(navBInWei).div(WEI_DENOMINATOR).add(newBFromA);
			}
			else if (state == State.UpwardReset) {
				newBalanceA = currentBalanceA
					.add(currentBalanceA
						.mul(newAFromAPerA)
						.add(currentBalanceB
							.mul(newAFromBPerB))
						.div(WEI_DENOMINATOR)
				);
				newBalanceB = currentBalanceB
					.add(currentBalanceA
						.mul(newBFromAPerA)
						.add(currentBalanceB
							.mul(newBFromBPerB))
						.div(WEI_DENOMINATOR)
				);
			} else {
				newBFromA = currentBalanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.add(newAFromA);
				newBalanceB = currentBalanceB.add(newBFromA);
			}

			balanceOf[0][currentAddress] = newBalanceA;
			balanceOf[1][currentAddress] = newBalanceB;
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			if (state != State.PeriodicReset) {
				resetPrice.priceInWei = lastPrice.priceInWei;
				resetPrice.timeInSecond = lastPrice.timeInSecond;
				navBInWei = WEI_DENOMINATOR;
			}
			
			navAInWei = WEI_DENOMINATOR;
			nextResetAddrIndex = 0;

			state = State.Trading;
			emit StartTrading();
			return true;
		} else{
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset();
			return false;
		}
	}

	function acceptPrice(uint priceInWei, uint timeInSecond) internal {
		lastPrice.priceInWei = priceInWei;
		lastPrice.timeInSecond = timeInSecond;
		numOfPrices = 0;
		(navAInWei, navBInWei) = calculateNav(
			lastPrice.priceInWei, 
			lastPrice.timeInSecond, 
			resetPrice.priceInWei, 
			resetPrice.timeInSecond, 
			betaInWei);
		if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei || navAInWei >= limitPeriodicInWei) {
			state = State.PreReset;
			lastPreResetBlockNo = block.number;
			emit StartPreReset();
		} 
		emit AcceptPrice(priceInWei, timeInSecond);
	}

	function getMedian(uint a, uint b, uint c) internal pure returns (uint){
		if (a.gt(b) ^ c.gt(a) == 0x0) {
			return a;
		} else if(b.gt(a) ^ c.gt(b) == 0x0) {
			return b;
		} else {
			return c;
		}
	}

	//PriceFeed
	function commitPrice(uint priceInWei, uint timeInSecond) 
		public 
		inState(State.Trading) 
		among(priceFeed1, priceFeed2, priceFeed3) 
		returns (bool success)
	{	
		require(timeInSecond <= getNowTimestamp());
		require(timeInSecond > lastPrice.timeInSecond.add(priceUpdateCoolDown));
		uint priceDiff;
		if (numOfPrices == 0) {
			priceDiff = getPriceDiff(priceInWei, lastPrice.priceInWei);
			if (priceDiff.mul(BP_DENOMINATOR).div(lastPrice.priceInWei) <= priceTolInBP) {
				acceptPrice(priceInWei, timeInSecond);
			} else {
				// wait for the second price
				firstPrice = Price(priceInWei, timeInSecond);
				firstAddr = msg.sender;
				numOfPrices++;
			}
		} else if (numOfPrices == 1) {
			if (timeInSecond > firstPrice.timeInSecond.add(priceUpdateCoolDown)) {
				if (firstAddr == msg.sender)
					acceptPrice(priceInWei, timeInSecond);
				else
					acceptPrice(firstPrice.priceInWei, timeInSecond);
			} else {
				require(firstAddr != msg.sender);
				// if second price times out, use first one
				if (firstPrice.timeInSecond.add(priceFeedTimeTol) < timeInSecond || 
					firstPrice.timeInSecond.sub(priceFeedTimeTol) > timeInSecond) {
					acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond);
				} else {
					priceDiff = getPriceDiff(priceInWei, firstPrice.priceInWei);
					if (priceDiff.mul(BP_DENOMINATOR).div(firstPrice.priceInWei) <= priceTolInBP) {
						acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond);
					} else {
						// wait for the third price
						secondPrice = Price(priceInWei, timeInSecond);
						secondAddr = msg.sender;
						numOfPrices++;
					} 
				}
			}
		} else if (numOfPrices == 2) {
			if (timeInSecond > firstPrice.timeInSecond + priceUpdateCoolDown) {
				if ((firstAddr == msg.sender || secondAddr == msg.sender))
					acceptPrice(priceInWei, timeInSecond);
				else
					acceptPrice(secondPrice.priceInWei, timeInSecond);
			} else {
				require(firstAddr != msg.sender && secondAddr != msg.sender);
				uint acceptedPriceInWei;
				// if third price times out, use first one
				if (firstPrice.timeInSecond.add(priceFeedTimeTol) < timeInSecond || 
					firstPrice.timeInSecond.sub(priceFeedTimeTol) > timeInSecond) {
					acceptedPriceInWei = firstPrice.priceInWei;
				} else {
					// take median and proceed
					// first and second price will never be equal in this part
					// if second and third price are the same, they are median
					if (secondPrice.priceInWei == priceInWei) {
						acceptedPriceInWei = priceInWei;
					} else {
						acceptedPriceInWei = getMedian(firstPrice.priceInWei, secondPrice.priceInWei, priceInWei);
					}
				}
				acceptPrice(acceptedPriceInWei, firstPrice.timeInSecond);
			}
		} else {
			return false;
		}

		return true;
	}

	function getPriceDiff(uint price1InWei, uint price2InWei) 
		internal 
		pure 
		returns(uint) 
	{
		return price1InWei > price2InWei 
			? price1InWei.sub(price2InWei) 
			: price2InWei.sub(price1InWei);
	}

	function getFee(uint ethInWei) internal constant returns(uint) {
		return ethInWei.mul(commissionRateInBP).div(BP_DENOMINATOR);
	}

	function redeem(uint amtInWeiA, uint amtInWeiB) 
		public 
		inState(State.Trading) 
		isDuoMember() 
		returns (bool success) 
	{
		require(amtInWeiA > 0 && amtInWeiB > 0);
		uint adjAmtInWeiA = amtInWeiA.mul(BP_DENOMINATOR).div(alphaInBP);
		uint deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
		uint deductAmtInWeiA = deductAmtInWeiB.mul(alphaInBP).div(BP_DENOMINATOR);
		require(balanceOf[0][msg.sender] >= deductAmtInWeiA && balanceOf[1][msg.sender] >= deductAmtInWeiB);
		uint amtEthInWei = deductAmtInWeiA
			.add(deductAmtInWeiB)
			.mul(WEI_DENOMINATOR)
			.mul(WEI_DENOMINATOR)
			.div(resetPrice.priceInWei)
			.div(betaInWei);
		uint feeInWei = getFee(amtEthInWei);
		balanceOf[0][msg.sender] = balanceOf[0][msg.sender].sub(deductAmtInWeiA);
		balanceOf[1][msg.sender] = balanceOf[1][msg.sender].sub(deductAmtInWeiB);
		totalSupplyA = totalSupplyA.sub(deductAmtInWeiA);
		totalSupplyB = totalSupplyB.sub(deductAmtInWeiB);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].add(amtEthInWei.sub(feeInWei));
		return true;
	}

	function withdraw(uint amtEthInWei) public inState(State.Trading) returns (bool success) {
		require(amtEthInWei > 0 && amtEthInWei <= ethPendingWithdrawal[msg.sender] && amtEthInWei < address(this).balance);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].sub(amtEthInWei);
		msg.sender.transfer(amtEthInWei);
		return true;
	}

	function collectFee(uint amountInWei) public only(feeCollector) inState(State.Trading) returns (bool success) {
		require(amountInWei > 0);
		require(amountInWei <= feeAccumulatedInWei);
		feeCollector.transfer(amountInWei);
		return true;
	}

	function create() 
		public 
		payable 
		inState(State.Trading) 
		isDuoMember() 
		returns (bool success) 
	{
		uint feeInWei = getFee(msg.value);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		uint numeritor = msg.value
						.sub(feeInWei)
						.mul(resetPrice.priceInWei)
						.mul(betaInWei)
						.mul(BP_DENOMINATOR
		);
		uint denominator = WEI_DENOMINATOR
						.mul(WEI_DENOMINATOR)
						.mul(alphaInBP
							.add(BP_DENOMINATOR)
		);
		uint tokenValueB = numeritor.div(denominator);
		uint tokenValueA = tokenValueB.mul(alphaInBP).div(BP_DENOMINATOR);
		checkNewUser(msg.sender);
		balanceOf[0][msg.sender] = balanceOf[0][msg.sender].add(tokenValueA);
		balanceOf[1][msg.sender] = balanceOf[1][msg.sender].add(tokenValueB);
		totalSupplyA = totalSupplyA.add(tokenValueA);
		totalSupplyB = totalSupplyB.add(tokenValueB);
		return true;
	}

	function addAddr(address addr1, address addr2) public only(addrAdder) returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2);
		uint index = getNowTimestamp() % addrPool.length;
		addrAdder = addrPool[index];
		removeFromPool(index);
		addrPool.push(addr1);
		addrStatus[addr1] = 1;
		addrPool.push(addr2);
		addrStatus[addr2] = 1;
		emit AddAddress(addr1, addr2, addrAdder);
		return true;
	}

	function removeAddr(address addr) public only(addrAdder) returns (bool success) {
		require(addrPool.length > 3 && addrStatus[addr] == 1);
		uint index = getNowTimestamp() % addrPool.length;
		addrAdder = addrPool[index];
		removeFromPool(index);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == addr) {
				removeFromPool(i);
				break;
            }
		}
		emit RemoveAddress(addr, addrAdder);
		return true;
	}

	function removeFromPool(uint idx) internal  {
		addrStatus[addrPool[idx]] = 2;
		if (idx < addrPool.length - 1)
			addrPool[idx] = addrPool[addrPool.length-1];
		delete addrPool[addrPool.length - 1];
		addrPool.length--;
	}

	function updateAddr(address current) public inAddrPool() returns (address addr) {
		require(addrPool.length > 3);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == msg.sender) {
				removeFromPool(i);
				break;
            }
		}
		uint index = getNowTimestamp() % addrPool.length;
		addr = addrPool[index];
		removeFromPool(index);

		if (current == priceFeed1) {
			priceFeed1 = addr;
		} else if (current == priceFeed2) {
			priceFeed2 = addr;
		} else if (current == priceFeed3) {
			priceFeed3 = addr;
		} else if (current == feeCollector) {
			feeCollector = addr;
		} else if (current == admin) {
			admin = addr;
		} else {
			revert();
		}

		emit UpdateAddress(current, addr);
	}
	
	function transfer(uint index, address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balanceOf[index][_from] >= _tokens);
		// Check for overflows
		require(balanceOf[index][_to].add(_tokens) > balanceOf[index][_to]);

		// Save this for an assertion in the future
		uint previousBalances = balanceOf[index][_from].add(balanceOf[index][_to]);
		//check whether _to is new. if new then add
		checkNewUser(_to);
		// Subtract from the sender
		balanceOf[index][_from] = balanceOf[index][_from].sub(_tokens);
		// Add the same to the recipient
		balanceOf[index][_to] = balanceOf[index][_to].add(_tokens);
		
		emit Transfer(_from, _to, _tokens, index);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balanceOf[index][_from].add(balanceOf[index][_to]) == previousBalances);
		return true;
	}

	function approve(uint index, address _sender, address _spender, uint _tokens) 
		public 
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		allowance[index][_sender][_spender] = _tokens;
		emit Approval(_sender, _spender, _tokens, index);
		return true;
	}
	
	function transferFrom(uint index, address _spender, address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		require(_tokens <= allowance[index][_from][_spender]);	 // Check allowance
		allowance[index][_from][_spender] = allowance[index][_from][_spender].sub(_tokens);
		transfer(index, _from, _to, _tokens);
		return true;
	}

	//admin function
	function setValue(uint idx, uint newValue) 
		public 
		only(admin) 
		inState(State.Trading) 
		returns (
			bool success
			) 
	{
		if (idx == 0) {
			commissionRateInBP = newValue;
		} else if (idx == 1) {
			memberThresholdInWei = newValue;
		} else if (idx == 2) {
			iterationGasThreshold = newValue;
		} else if (idx == 3) {
			preResetWaitingBlocks = newValue;
		} else if (idx == 4) {
			priceTolInBP = newValue;
		} else if (idx == 5) {
			priceFeedTolInBP = newValue;
		} else if (idx == 6) {
			priceFeedTimeTol = newValue;
		} else if (idx == 7) {
			priceUpdateCoolDown = newValue;
		} else {
			revert();
		}
		
		return true;
	}

	function getSystemAddresses() public view returns (address[6] sysAddr) {
		sysAddr[0] = admin;
		sysAddr[1] = feeCollector;
		sysAddr[2] = priceFeed1; 
		sysAddr[3] = priceFeed2; 
		sysAddr[4] = priceFeed3;
		sysAddr[5] = addrAdder;
	}

	function getSystemStates() public view returns (uint[20] sysState) {
		sysState[0] = alphaInBP;
		sysState[1] = betaInWei;
		sysState[2] = feeAccumulatedInWei;
		sysState[3] = periodCouponInWei; 
		sysState[4] = limitPeriodicInWei; 
		sysState[5] = limitUpperInWei; 
		sysState[6] = limitLowerInWei;
		sysState[7] = commissionRateInBP;
		sysState[8] = period;
		sysState[9] = iterationGasThreshold;
		sysState[10] = memberThresholdInWei;
		sysState[11] = preResetWaitingBlocks;
		sysState[12] = priceTolInBP; 
		sysState[13] = priceFeedTolInBP;
		sysState[14] = priceFeedTimeTol;
		sysState[15] = priceUpdateCoolDown;
		sysState[16] = numOfPrices;
		sysState[17] = nextResetAddrIndex;
		sysState[18] = users.length;
		sysState[19] = addrPool.length;
	}

	function getStagingPrices() 
		public 
		view 
		returns (
			address addr1, 
			uint px1, 
			uint ts1, 
			address addr2, 
			uint px2, 
			uint ts2) {
		addr1 = firstAddr;
		addr2 = secondAddr;
		px1 = firstPrice.priceInWei;
		ts1 = firstPrice.timeInSecond;
		px2 = secondPrice.priceInWei;
		ts2 = secondPrice.timeInSecond;
	}
}