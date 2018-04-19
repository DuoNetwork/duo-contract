pragma solidity ^0.4.21;
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
		Trading,
		PreReset,
		UpwardReset,
		DownwardReset,
		PeriodicReset,
		PostReset,
		Inception
	}

	struct Price {
		uint priceInWei;
		uint timeInSecond;
	}

	State public state;
	address feeCollector;
	address priceFeed1; 
	address priceFeed2; 
	address priceFeed3;
	address public duoTokenAddress;

	uint decimals;
	mapping(address => uint256) public balancesA;
	mapping(address => uint256) public balancesB;
	mapping (address => mapping (address => uint256)) public allowanceA;
	mapping (address => mapping (address => uint256)) public allowanceB;
	address[] public users;
	mapping (address => bool) public existingUsers;
	mapping(address => uint256) public ethPendingWithdrawal;
	uint public feeAccumulatedInWei;

	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;

	address admin;
	// public parameters, do not change after deployment
	Price public resetPrice; 
	Price public lastPrice; 
	uint public alphaInBP;
	uint public periodCouponInWei; 
	uint public limitPeriodicInWei; 
	uint public limitUpperInWei; 
	uint public limitLowerInWei;
	uint public commissionRateInBP;
	uint public period;
	// public info
	uint public betaInWei = WEI_DENOMINATOR;
	uint public navAInWei;
	uint public navBInWei; 
	
	// public parameters, can change after deployment
	uint public memberThresholdInWei;
	uint public iterationGasThreshold;

	// private parameters, can change after deployment
	uint preResetWaitingBlocks = 10;
	uint postResetWaitingBlocks = 10;
	uint priceTolInBP = 500; 
	uint priceFeedTolInBP = 100;
	uint priceFeedTimeTol = 1 minutes;
	uint priceUpdateCoolDown;

	// cycle state variables
	uint numOfPrices = 0;
	uint lastPreResetBlockNo = 0;
	uint lastPostResetBlockNo = 0;
	uint public nextResetAddrIndex = 0;
	address firstAddr;
	address secondAddr;
	Price firstPrice;
	Price secondPrice;

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

	event StartTrading();
	event StartPreReset();
	event StartReset();
	event StartPostReset();

	event TransferA(address indexed from, address indexed to, uint256 value);
	event TransferB(address indexed from, address indexed to, uint256 value);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond);
	
	function Custodian (
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
		uint gasThreshold) 
		public 
	{
		state = State.Inception;
		admin = msg.sender;
		decimals = 18;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
		priceFeed1 = pf1;
		priceFeed2 = pf2;
		priceFeed3 = pf3;
		duoTokenAddress = duoAddress;
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
		priceUpdateCoolDown = p - 10 minutes;
	}

	function startContract(uint priceInWei, uint timeInSecond) public inState(State.Inception) 
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
			balancesA[user] = 0;
			balancesB[user] = 0;
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
			if (navBInWei >= limitUpperInWei) {
				state = State.UpwardReset;
				betaInWei = WEI_DENOMINATOR;
			} else if(navBInWei <= limitLowerInWei) {
				state = State.DownwardReset;
				betaInWei = WEI_DENOMINATOR;
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
			}
			emit StartReset();
		} else {
			emit StartPreReset();
		}

		return true;
	}

	function startPostReset() public inState(State.PostReset) returns (bool success) {
		if (block.number - lastPostResetBlockNo >= postResetWaitingBlocks) {
			state = State.Trading;
			emit StartTrading();
		} else {
			emit StartPostReset();
		}

		return true;
	}

	function startReset() public returns (bool success) {
		require(state == State.UpwardReset || state == State.DownwardReset || state == State.PeriodicReset);
		uint bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
		uint newBFromAPerA;
		uint newBFromBPerB;
		if (state == State.DownwardReset){
			newBFromAPerA = navAInWei.sub(navBInWei).mul(betaInWei).div(bAdj);
		} else {
			newBFromAPerA = navAInWei.sub(WEI_DENOMINATOR).mul(betaInWei).div(bAdj);
			newBFromBPerB = state == State.UpwardReset ? navBInWei.sub(WEI_DENOMINATOR).mul(betaInWei).div(bAdj) : 0;
		}

		while (nextResetAddrIndex < users.length && gasleft() > iterationGasThreshold) {
			uint currentBalanceA = balancesA[users[nextResetAddrIndex]];
			uint currentBalanceB = balancesB[users[nextResetAddrIndex]];
			uint newBalanceA;
			uint newBalanceB;
			if (state == State.DownwardReset)
				(newBalanceA, newBalanceB) = downwardResetForAddress(
					currentBalanceA,
					currentBalanceB, 
					newBFromAPerA,
					alphaInBP,
					navBInWei);
			else // periodic and upward has similar logic in issuing new A and B
				(newBalanceA, newBalanceB) = upwardResetForAddress(
					currentBalanceA, 
					currentBalanceB,
					newBFromAPerA, 
					newBFromBPerB,
					alphaInBP); 
			balancesA[users[nextResetAddrIndex]] = newBalanceA;
			balancesB[users[nextResetAddrIndex]] = newBalanceB;
			nextResetAddrIndex++;
		}

		if (nextResetAddrIndex >= users.length) {
			if (state != State.PeriodicReset) {
				resetPrice.priceInWei = lastPrice.priceInWei;
				resetPrice.timeInSecond = lastPrice.timeInSecond;
				navBInWei = WEI_DENOMINATOR;
			}
			
			navAInWei = WEI_DENOMINATOR;
			nextResetAddrIndex = 0;

			state = State.PostReset;
			lastPostResetBlockNo = block.number;
			emit StartPostReset();
			return true;
		} else{
			emit StartReset();
			return false;
		}
	}

	function upwardResetForAddress(
		uint balanceA,
		uint balanceB, 
		uint newBFromAPerA, 
		uint newBFromBPerB,
		uint alpha) 
		pure
		internal 
		returns(uint newBalanceA, uint newBalanceB)
	{
		uint newBFromA = balanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
		uint newAFromA = newBFromA.mul(alpha).div(BP_DENOMINATOR);
		uint newBFromB = balanceB.mul(newBFromBPerB).div(WEI_DENOMINATOR);
		uint newAFromB = newBFromB.mul(alpha).div(BP_DENOMINATOR);
		newBalanceA = balanceA.add(newAFromA).add(newAFromB);
		newBalanceB = balanceB.add(newBFromA).add(newBFromB);
	}

	function downwardResetForAddress(
		uint balanceA, 
		uint balanceB,
		uint newBFromAPerA,
		uint alpha,
		uint navB) 
		pure
		internal 
		returns(uint newBalanceA, uint newBalanceB)
	{
		uint newBFromA = balanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
		uint newAFromA = newBFromA.mul(alpha).div(BP_DENOMINATOR);
		newBalanceA = balanceA.mul(navB).div(WEI_DENOMINATOR).add(newAFromA);
		newBalanceB = balanceB.mul(navB).div(WEI_DENOMINATOR).add(newBFromA);
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

	function getMedian(uint a, uint b, uint c) public pure returns (uint){
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
		require(balancesA[msg.sender] >= deductAmtInWeiA && balancesB[msg.sender] >= deductAmtInWeiB);
		uint amtEthInWei = deductAmtInWeiA
			.add(deductAmtInWeiB)
			.mul(WEI_DENOMINATOR)
			.mul(WEI_DENOMINATOR)
			.div(resetPrice.priceInWei)
			.div(betaInWei);
		uint feeInWei = getFee(amtEthInWei);
		balancesA[msg.sender] = balancesA[msg.sender].sub(deductAmtInWeiA);
		balancesB[msg.sender] = balancesB[msg.sender].sub(deductAmtInWeiB);
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
		balancesA[msg.sender] = balancesA[msg.sender].add(tokenValueA);
		balancesB[msg.sender] = balancesB[msg.sender].add(tokenValueB);
		return true;
	}

	function checkBalanceA(address add) public constant returns(uint) {
		return balancesA[add];
	}
	
	function checkBalanceB(address add) public constant returns(uint) {
		return balancesB[add];
	}

	function checkAllowanceA(address _user, address _spender) public constant returns(uint) {
		return allowanceA[_user][_spender];
	}

	function checkAllowanceB(address _user, address _spender) public constant returns(uint) {
		return allowanceB[_user][_spender];
	}
	
	function transferA(address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balancesA[_from] >= _tokens);
		// Check for overflows
		require(balancesA[_to].add(_tokens) > balancesA[_to]);

		// Save this for an assertion in the future
		uint previousBalances = balancesA[_from].add(balancesA[_to]);
		//check whether _to is new. if new then add
		checkNewUser(_to);
		// Subtract from the sender
		balancesA[_from] = balancesA[_from].sub(_tokens);
		// Add the same to the recipient
		balancesA[_to] = balancesA[_to].add(_tokens);
		
		emit TransferA(_from, _to, _tokens);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balancesA[_from].add(balancesA[_to]) == previousBalances);
		return true;
	}

	function transferB(address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balancesB[_from] >= _tokens);
		// Check for overflows
		require(balancesB[_to].add(_tokens) > balancesB[_to]);

		// Save this for an assertion in the future
		uint previousBalances = balancesB[_from].add(balancesB[_to]);
		//check whether _to is new. if new then add
		checkNewUser(_to);
		// Subtract from the sender
		balancesB[_from] = balancesB[_from].sub(_tokens);
		// Add the same to the recipient
		balancesB[_to] = balancesB[_to].add(_tokens);
		emit TransferB(_from, _to, _tokens);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balancesB[_from].add(balancesB[_to]) == previousBalances);
		return true;
	}

	function approveA(address _sender, address _spender, uint _tokens) 
		public 
		returns (bool success) 
	{
		allowanceA[_sender][_spender] = _tokens;
		return true;
	}
	
	function approveB(address _sender, address _spender, uint _tokens) 
		public 
		returns (bool success) 
	{
		allowanceB[_sender][_spender] = _tokens;
		return true;
	}

	function transferAFrom(address _spender, address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(_tokens <= allowanceA[_from][_spender]);	 // Check allowance
		allowanceA[_from][_spender] = allowanceA[_from][_spender].sub(_tokens);
		transferA(_from, _to, _tokens);
		return true;
	}
	
	function transferBFrom(address _spender, address _from, address _to, uint _tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(_tokens <= allowanceB[_from][_spender]);	 // Check allowance
		allowanceB[_from][_spender] = allowanceB[_from][_spender].sub(_tokens);
		transferB(_from, _to, _tokens);
		return true;
	}

	//admin function
	function setFeeAddress(address newAddress) public only(admin) inState(State.Trading) returns (bool success) {
		feeCollector = newAddress;
		return true;
	}

	function setCommission(uint newComm) public only(admin) inState(State.Trading) returns (bool success) {
		require(newComm > 0);
		require(newComm < BP_DENOMINATOR);
		commissionRateInBP = newComm;
		return true;
	}

	function setMemberThresholdInWei(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		memberThresholdInWei = newValue;
		return true;
	}

	function setIterationGasThreshold(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		iterationGasThreshold = newValue;
		return true;
	}

	function setPreResetWaitingBlocks(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		preResetWaitingBlocks = newValue;
		return true;
	}

	function setPostResetWaitingBlocks(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		postResetWaitingBlocks = newValue;
		return true;
	}

	function setPriceTolInBP(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		priceTolInBP = newValue;
		return true;
	}

	function setPriceFeedTolInBP(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		priceFeedTolInBP = newValue;
		return true;
	}

	function setPriceFeedTimeTol(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		priceFeedTimeTol = newValue;
		return true;
	}

	function setPriceUpdateCoolDown(uint newValue) public only(admin) inState(State.Trading) returns (bool success) {
		priceUpdateCoolDown = newValue;
		return true;
	}

	function getNumOfUsers() public view returns (uint256) {
		return users.length;
	}
}



	