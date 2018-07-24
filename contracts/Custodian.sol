pragma solidity ^0.4.24;
import { DUO } from "./DUO.sol";

library SafeMath {
	function mul(uint a, uint b) internal pure returns (uint) {
		uint c = a * b;
		assert(a == 0 || c / a == b);
		return c;
	}

	function div(uint a, uint b) internal pure returns (uint) {
		// assert(b > 0); // Solidity automatically throws when dividing by 0
		uint c = a / b;
		// assert(a == b * c + a % b); // There is no case in which this doesn't hold
		return c;
	}

	function sub(uint a, uint b) internal pure returns (uint) {
		assert(b <= a);
		return a - b;
	}

	function add(uint a, uint b) internal pure returns (uint) {
		uint c = a + b;
		assert(c >= a);
		return c;
	}

	function diff(uint a, uint b) internal pure returns (uint) {
		return a > b ? sub(a, b) : sub(b, a);
	}

	function gt(uint a, uint b) internal pure returns(bytes1) {
		bytes1 c;
		c = 0x0;
		if (a > b) {
			c = 0x1;
		}
		return c;
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
		address source;
	}

	uint public totalSupplyA;
	uint public totalSupplyB;

	DUO duoToken;
	address aTokenAddress;
	address bTokenAddress;
	// below 6 address are returned by getSystemAddresses
	address operator;
	address feeCollector;
	address priceFeed1; 
	address priceFeed2; 
	address priceFeed3;
	address poolManager;

	// address pool for allocation
	address[] public addrPool =[
		0x415DE7Edfe2c9bBF8449e33Ff88c9be698483CC0,
		0xd066FbAc54838c1d3c3113fc4390B9F99fEb7678,
		0xB0f396d1fba9a5C699695B69337635Fad6547B13,
		0x290FC07db2BF4b385987059E919B78898941102e,
		0x06C59e1aD2299EA99631850291021eda772715eb,
		0xd34d743B5bfDF21e0D8829f0eEA52cC493628610
	];
	mapping(address => uint) addrStatus;

	uint constant decimals = 18;
	// balance and allowance for A and B
	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) existingUsers;

	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	uint constant MIN_BALANCE = 10000000000000000;

	// below 4 data are returned in getSystemPrices
	Price resetPrice; 
	Price lastPrice;
	Price firstPrice;
	Price secondPrice;
	// below 19 states are returned in getSystemStates
	State state;
	uint navAInWei;
	uint navBInWei; 
	uint alphaInBP;
	uint betaInWei = WEI_DENOMINATOR;
	uint feeAccumulatedInWei;
	uint periodCouponInWei; 
	uint limitPeriodicInWei; 
	uint limitUpperInWei; 
	uint limitLowerInWei;
	uint commissionRateInBP;
	uint period;
	uint iterationGasThreshold = 65000;
	uint ethDuoFeeRatio = 800;
	uint preResetWaitingBlocks = 10;
	uint priceTolInBP = 500; 
	uint priceFeedTolInBP = 100;
	uint priceFeedTimeTol = 1 minutes;
	uint priceUpdateCoolDown;
	uint adminCoolDown = 1 hours;
	uint numOfPrices = 0;
	uint nextResetAddrIndex = 0;
	uint lastAdminTime;

	// cycle state variables
	uint lastPreResetBlockNo = 0;

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

	modifier isPriceFeed() {
		require(msg.sender == priceFeed1 || msg.sender == priceFeed2 || msg.sender == priceFeed3);
		_;
	}

	modifier inAddrPool() {
		require(addrStatus[msg.sender] == 1);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		require(currentTime - lastAdminTime > adminCoolDown);
		_;
		lastAdminTime = currentTime;
	}

	// state events
	event StartTrading(uint navAInWei, uint navBInWei);
	event StartPreReset();
	event StartReset(uint nextIndex, uint total);
	event Create(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event Redeem(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event TotalSupply(uint totalSupplyA, uint totalSupplyB);
	event CommitPrice(uint indexed priceInWei, uint indexed timeInSecond, address sender, uint index);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond, address sender, uint navAInWei, uint navBInWei);

	// token events
	event Transfer(address indexed from, address indexed to, uint value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);
	
	// admin events
	event AddAddress(address added1, address added2, address newPoolManager);
	event UpdateAddress(address current, address newAddr);
	event RemoveAddress(address addr, address newPoolManager);
	event SetValue(uint index, uint oldValue, uint newValue);
	event CollectFee(address addr, uint value, uint feeAccumulatedInWei);
	
	constructor(
		address feeAddress, 
		address duoAddress,
		address pf1,
		address pf2,
		address pf3,
		address poolMng,
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint coolDown) 
		public 
	{
		for (uint i = 0; i < addrPool.length; i++) {
			addrStatus[addrPool[i]] = 1;
		}
		state = State.Inception;
		poolManager = poolMng;
		addrStatus[poolManager] = 2;
		operator = msg.sender;
		addrStatus[operator] = 2;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
		addrStatus[feeCollector] = 2;
		priceFeed1 = pf1;
		addrStatus[priceFeed1] = 2;
		priceFeed2 = pf2;
		addrStatus[priceFeed2] = 2;
		priceFeed3 = pf3;
		addrStatus[priceFeed3] = 2;
		duoToken = DUO(duoAddress);
		alphaInBP = alpha;
		periodCouponInWei = r; 
		limitPeriodicInWei = hp; 
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		commissionRateInBP = c;
		period = p;
		navAInWei = WEI_DENOMINATOR;
		navBInWei = WEI_DENOMINATOR;
		priceUpdateCoolDown = coolDown;
		bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
	}

	// start of public functions
	function create(bool payFeeInEth) 
		public 
		payable 
		inState(State.Trading) 
		returns (bool success) 
	{	
		require(msg.value > 0);
		uint ethAmtInWei; 
		uint feeInWei;
		(ethAmtInWei, feeInWei) = deductFee(msg.value, payFeeInEth);
		uint numeritor = ethAmtInWei
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
		address sender = msg.sender;
		balanceOf[0][sender] = balanceOf[0][sender].add(tokenValueA);
		balanceOf[1][sender] = balanceOf[1][sender].add(tokenValueB);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.add(tokenValueA);
		totalSupplyB = totalSupplyB.add(tokenValueB);
		emit Create(
			sender, 
			ethAmtInWei, 
			tokenValueA, 
			tokenValueB, 
			payFeeInEth ? feeInWei : 0, 
			payFeeInEth ? 0 : feeInWei);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		return true;
	}

	function redeem(uint amtInWeiA, uint amtInWeiB, bool payFeeInEth) 
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amtInWeiA > 0 && amtInWeiB > 0);
		uint adjAmtInWeiA = amtInWeiA.mul(BP_DENOMINATOR).div(alphaInBP);
		uint deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
		uint deductAmtInWeiA = deductAmtInWeiB.mul(alphaInBP).div(BP_DENOMINATOR);
		address sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWeiA && balanceOf[1][sender] >= deductAmtInWeiB);
		uint ethAmtInWei = deductAmtInWeiA
			.add(deductAmtInWeiB)
			.mul(WEI_DENOMINATOR)
			.mul(WEI_DENOMINATOR)
			.div(resetPrice.priceInWei)
			.div(betaInWei);
		uint feeInWei;
		(ethAmtInWei,  feeInWei) = deductFee(ethAmtInWei, payFeeInEth);
		
		balanceOf[0][sender] = balanceOf[0][sender].sub(deductAmtInWeiA);
		balanceOf[1][sender] = balanceOf[1][sender].sub(deductAmtInWeiB);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.sub(deductAmtInWeiA);
		totalSupplyB = totalSupplyB.sub(deductAmtInWeiB);
		msg.sender.transfer(ethAmtInWei);
		emit Redeem(
			sender, 
			ethAmtInWei, 
			deductAmtInWeiA, 
			deductAmtInWeiB, 
			payFeeInEth ? feeInWei : 0, 
			payFeeInEth ? 0 : feeInWei);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		return true;
	}

	function deductFee(
		uint ethAmtInWei, 
		bool payFeeInEth) 
		internal 
		returns (
			uint ethAmtAfterFeeInWei, 
			uint feeInWei) 
	{
		feeInWei = ethAmtInWei.mul(commissionRateInBP).div(BP_DENOMINATOR);
		if (payFeeInEth) {
			feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
			ethAmtAfterFeeInWei = ethAmtInWei.sub(feeInWei);
		} else {
			feeInWei = feeInWei.mul(ethDuoFeeRatio);
			require(duoToken.transferFrom(msg.sender, this, feeInWei));
			ethAmtAfterFeeInWei = ethAmtInWei;
		}
	}
	
	function calculateNav(
		uint priceInWei, 
		uint timeInSecond, 
		uint resetPriceInWei, 
		uint resetTimeInSecond,
		uint bInWei) 
		public 
		view 
		returns (uint, uint) 
	{
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
				// excessive B is enough to cover excessive A
				//if (excessBInWei >= excessAInWei) {
				uint excessBAfterAInWei = excessBInWei.sub(excessAInWei);
				newAFromAPerA = excessAInWei;
				newBFromAPerA = 0;
				uint newBFromExcessBPerB = excessBAfterAInWei.mul(betaInWei).div(bAdj);
				newAFromBPerB = newBFromExcessBPerB.mul(alphaInBP).div(BP_DENOMINATOR);
				newBFromBPerB = excessAInWei.add(newBFromExcessBPerB);			
				// ignore this case for now as it requires a very high coupon rate 
				// and very low upper limit for upward reset and a very high periodic limit
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

			emit TotalSupply(totalSupplyA, totalSupplyB);

			emit StartReset(nextResetAddrIndex, users.length);
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
			currentAddress = users[localResetAddrIndex];
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
				resetPrice.source = lastPrice.source;
				navBInWei = WEI_DENOMINATOR;
			}
			
			navAInWei = WEI_DENOMINATOR;
			nextResetAddrIndex = 0;

			state = State.Trading;
			emit StartTrading(navAInWei, navBInWei);
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset(localResetAddrIndex, users.length);
			return false;
		}
	}

	function getSystemAddresses() public view returns (address[8] sysAddr) {
		sysAddr[0] = operator;
		sysAddr[1] = feeCollector;
		sysAddr[2] = priceFeed1; 
		sysAddr[3] = priceFeed2; 
		sysAddr[4] = priceFeed3;
		sysAddr[5] = poolManager;
		sysAddr[6] = aTokenAddress;
		sysAddr[7] = bTokenAddress;
	}

	function getSystemStates() public view returns (uint[28] sysState) {
		sysState[0] = uint(state);
		sysState[1] = navAInWei;
		sysState[2] = navBInWei; 
		sysState[3] = totalSupplyA;
		sysState[4] = totalSupplyB; 
		sysState[5] = address(this).balance;
		sysState[6] = alphaInBP;
		sysState[7] = betaInWei;
		sysState[8] = feeAccumulatedInWei;
		sysState[9] = periodCouponInWei; 
		sysState[10] = limitPeriodicInWei; 
		sysState[11] = limitUpperInWei; 
		sysState[12] = limitLowerInWei;
		sysState[13] = commissionRateInBP;
		sysState[14] = period;
		sysState[15] = iterationGasThreshold;
		sysState[16] = ethDuoFeeRatio;
		sysState[17] = preResetWaitingBlocks;
		sysState[18] = priceTolInBP; 
		sysState[19] = priceFeedTolInBP;
		sysState[20] = priceFeedTimeTol;
		sysState[21] = priceUpdateCoolDown;
		sysState[22] = numOfPrices;
		sysState[23] = nextResetAddrIndex;
		sysState[24] = lastAdminTime;
		sysState[25] = adminCoolDown;
		sysState[26] = users.length;
		sysState[27] = addrPool.length;
	}

	function getSystemPrices() 
		public 
		view 
		returns (
			address firstAddr, 
			uint firstPx, 
			uint firstTs, 
			address secondAddr, 
			uint secondPx, 
			uint secondTs,
			address resetAddr,
			uint resetPx,
			uint resetTs,
			address lastAddr,
			uint lastPx,
			uint lastTs) 
	{
		firstAddr = firstPrice.source;
		firstPx = firstPrice.priceInWei;
		firstTs = firstPrice.timeInSecond;
		secondAddr = secondPrice.source;
		secondPx = secondPrice.priceInWei;
		secondTs = secondPrice.timeInSecond;
		resetAddr = resetPrice.source;
		resetPx = resetPrice.priceInWei;
		resetTs = resetPrice.timeInSecond;
		lastAddr = lastPrice.source;
		lastPx = lastPrice.priceInWei;
		lastTs = lastPrice.timeInSecond;
	}

	// end of public functions
	// start of price feed functions

	function startContract(
		uint priceInWei, 
		uint timeInSecond,
		address aAddr,
		address bAddr) 
		public 
		inState(State.Inception) 
		isPriceFeed() 
		returns (bool success) 
	{
		require(timeInSecond <= getNowTimestamp());
		lastPrice.timeInSecond = timeInSecond;
		lastPrice.priceInWei = priceInWei;
		lastPrice.source = msg.sender;
		resetPrice.timeInSecond = timeInSecond;
		resetPrice.priceInWei = priceInWei;
		resetPrice.source = msg.sender;
		aTokenAddress = aAddr;
		bTokenAddress = bAddr;
		state = State.Trading;
		emit AcceptPrice(priceInWei, timeInSecond, msg.sender, WEI_DENOMINATOR, WEI_DENOMINATOR);
		emit StartTrading(navAInWei, navBInWei);
		return true;
	}

	function commitPrice(uint priceInWei, uint timeInSecond) 
		public 
		inState(State.Trading) 
		isPriceFeed()
		returns (bool success)
	{	
		require(timeInSecond <= getNowTimestamp());
		require(timeInSecond > lastPrice.timeInSecond.add(priceUpdateCoolDown));
		uint priceDiff;
		if (numOfPrices == 0) {
			priceDiff = priceInWei.diff(lastPrice.priceInWei);
			if (priceDiff.mul(BP_DENOMINATOR).div(lastPrice.priceInWei) <= priceTolInBP) {
				acceptPrice(priceInWei, timeInSecond, msg.sender);
			} else {
				// wait for the second price
				firstPrice = Price(priceInWei, timeInSecond, msg.sender);
				emit CommitPrice(priceInWei, timeInSecond, msg.sender, 0);
				numOfPrices++;
			}
		} else if (numOfPrices == 1) {
			if (timeInSecond > firstPrice.timeInSecond.add(priceUpdateCoolDown)) {
				if (firstPrice.source == msg.sender)
					acceptPrice(priceInWei, timeInSecond, msg.sender);
				else
					acceptPrice(firstPrice.priceInWei, timeInSecond, firstPrice.source);
			} else {
				require(firstPrice.source != msg.sender);
				// if second price times out, use first one
				if (firstPrice.timeInSecond.add(priceFeedTimeTol) < timeInSecond || 
					firstPrice.timeInSecond.sub(priceFeedTimeTol) > timeInSecond) {
					acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond, firstPrice.source);
				} else {
					priceDiff = priceInWei.diff(firstPrice.priceInWei);
					if (priceDiff.mul(BP_DENOMINATOR).div(firstPrice.priceInWei) <= priceTolInBP) {
						acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond, firstPrice.source);
					} else {
						// wait for the third price
						secondPrice = Price(priceInWei, timeInSecond, msg.sender);
						emit CommitPrice(priceInWei, timeInSecond, msg.sender, 1);
						numOfPrices++;
					} 
				}
			}
		} else if (numOfPrices == 2) {
			if (timeInSecond > firstPrice.timeInSecond + priceUpdateCoolDown) {
				if ((firstPrice.source == msg.sender || secondPrice.source == msg.sender))
					acceptPrice(priceInWei, timeInSecond, msg.sender);
				else
					acceptPrice(secondPrice.priceInWei, timeInSecond, secondPrice.source);
			} else {
				require(firstPrice.source != msg.sender && secondPrice.source != msg.sender);
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
				acceptPrice(acceptedPriceInWei, firstPrice.timeInSecond, firstPrice.source);
			}
		} else {
			return false;
		}

		return true;
	}

	function acceptPrice(uint priceInWei, uint timeInSecond, address source) internal {
		lastPrice.priceInWei = priceInWei;
		lastPrice.timeInSecond = timeInSecond;
		lastPrice.source = source;
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
		emit AcceptPrice(priceInWei, timeInSecond, source, navAInWei, navBInWei);
	}

	function getMedian(uint a, uint b, uint c) internal pure returns (uint) {
		if (a.gt(b) ^ c.gt(a) == 0x0) {
			return a;
		} else if(b.gt(a) ^ c.gt(b) == 0x0) {
			return b;
		} else {
			return c;
		}
	}

	// end of price feed functions	
	// start of token functions

	function transferInternal(uint index, address from, address to, uint tokens) 
		internal 
		inState(State.Trading)
		returns (bool success) 
	{
		// Prevent transfer to 0x0 address. Use burn() instead
		require(to != 0x0);
		// Check if the sender has enough
		require(balanceOf[index][from] >= tokens);

		// Save this for an assertion in the future
		uint previousBalances = balanceOf[index][from].add(balanceOf[index][to]);
		// Subtract from the sender
		balanceOf[index][from] = balanceOf[index][from].sub(tokens);
		// Add the same to the recipient
		balanceOf[index][to] = balanceOf[index][to].add(tokens);
	
		checkUser(from, balanceOf[index][from], balanceOf[1 - index][from]);
		checkUser(to, balanceOf[index][to], balanceOf[1 - index][to]);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balanceOf[index][from].add(balanceOf[index][to]) == previousBalances);
		emit Transfer(from, to, tokens, index);
		return true;
	}

	function determineAddress(uint index, address from) internal view returns (address) {
		return index == 0 && msg.sender == aTokenAddress || 
			index == 1 && msg.sender == bTokenAddress 
			? from : msg.sender;
	}

	function transfer(uint index, address from, address to, uint tokens)
		public
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		return transferInternal(index, determineAddress(index, from), to, tokens);
	}

	function transferFrom(uint index, address spender, address from, address to, uint tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		address spenderToUse = determineAddress(index, spender);
		require(tokens <= allowance[index][from][spenderToUse]);	 // Check allowance
		allowance[index][from][spenderToUse] = allowance[index][from][spenderToUse].sub(tokens);
		return transferInternal(index, from, to, tokens);
	}

	function approve(uint index, address sender, address spender, uint tokens) 
		public 
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		address senderToUse = determineAddress(index, sender);
		allowance[index][senderToUse][spender] = tokens;
		emit Approval(senderToUse, spender, tokens, index);
		return true;
	}

	// end of token functions
	// start of admin functions

	function collectFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amountInWei > 0);
		require(amountInWei <= feeAccumulatedInWei);
		feeAccumulatedInWei = feeAccumulatedInWei.sub(amountInWei);
		feeCollector.transfer(amountInWei);
		emit CollectFee(msg.sender, amountInWei, feeAccumulatedInWei);
		return true;
	}

	function setValue(uint idx, uint newValue) public only(operator) inUpdateWindow() returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			require(newValue < BP_DENOMINATOR);
			oldValue = commissionRateInBP;
			commissionRateInBP = newValue;
		} else if (idx == 1) {
			oldValue = ethDuoFeeRatio;
			ethDuoFeeRatio = newValue;
		} else if (idx == 2) {
			oldValue = iterationGasThreshold;
			iterationGasThreshold = newValue;
		} else if (idx == 3) {
			oldValue = preResetWaitingBlocks;
			preResetWaitingBlocks = newValue;
		} else if (idx == 4) {
			oldValue = priceTolInBP;
			priceTolInBP = newValue;
		} else if (idx == 5) {
			oldValue = priceFeedTolInBP;
			priceFeedTolInBP = newValue;
		} else if (idx == 6) {
			oldValue = priceFeedTimeTol;
			priceFeedTimeTol = newValue;
		} else if (idx == 7) {
			require(newValue < period);
			oldValue = priceUpdateCoolDown;
			priceUpdateCoolDown = newValue;
		} else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

	function addAddress(address addr1, address addr2) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2);
		uint index = getNextAddrIndex();
		poolManager = addrPool[index];
		removeFromPool(index);
		addrPool.push(addr1);
		addrStatus[addr1] = 1;
		addrPool.push(addr2);
		addrStatus[addr2] = 1;
		emit AddAddress(addr1, addr2, poolManager);
		return true;
	}

	function removeAddress(address addr) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(addrPool.length > 3 && addrStatus[addr] == 1);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == addr) {
				removeFromPool(i);
				break;
            }
		}
		uint index = getNextAddrIndex();
		poolManager = addrPool[index];
		removeFromPool(index);
		emit RemoveAddress(addr, poolManager);
		return true;
	}

	function updateAddress(address current) public inAddrPool() inUpdateWindow() returns (bool success) {
		require(addrPool.length > 3);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == msg.sender) {
				removeFromPool(i);
				break;
            }
		}
		uint index = getNextAddrIndex();
		address addr = addrPool[index];
		removeFromPool(index);

		if (current == priceFeed1) {
			priceFeed1 = addr;
		} else if (current == priceFeed2) {
			priceFeed2 = addr;
		} else if (current == priceFeed3) {
			priceFeed3 = addr;
		} else if (current == feeCollector) {
			feeCollector = addr;
		} else if (current == operator) {
			operator = addr;
		} else {
			revert();
		}
		emit UpdateAddress(current, addr);
		return true;
	}

	function removeFromPool(uint idx) internal {
		addrStatus[addrPool[idx]] = 2;
		if (idx < addrPool.length - 1)
			addrPool[idx] = addrPool[addrPool.length-1];
		delete addrPool[addrPool.length - 1];
		addrPool.length--;
	}

	function getNextAddrIndex() internal view returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		if(users.length > 255) {
			address randomUserAddress = users[prevHashNumber % users.length];
			return uint256(keccak256(abi.encodePacked(randomUserAddress))) % addrPool.length;
		} else {
			return prevHashNumber % addrPool.length;
		}
	}

	// end of admin functions
	// start of internal utility functions


	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
	
	function checkUser(address user, uint256 balanceA, uint256 balanceB) internal {
		uint userIdx = existingUsers[user] - 1;
		if ( userIdx > 0) {
			if (balanceA < MIN_BALANCE && balanceB < MIN_BALANCE) {
				uint lastIdx = users.length - 1;
				address lastUser = users[lastIdx];
				if (userIdx < lastIdx)
					users[userIdx] = lastUser;
				delete users[lastIdx];
				users.length--;
				existingUsers[lastUser] = userIdx + 1;
			}
		} else if (balanceA >= MIN_BALANCE || balanceB >= MIN_BALANCE) {
			users.push(user);
			existingUsers[user] = users.length;
		}
	}
	// end of internal utility functions
}