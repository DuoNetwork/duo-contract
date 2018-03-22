pragma solidity ^0.4.19;

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
}


contract DUO {
    function balanceOf(address tokenOwner) public constant returns (uint balance);
}

contract Custodian {
	using SafeMath for uint;
	enum State {
		Trading,
		PreReset,
		UpwardReset,
		DownwardReset,
		PostReset
	}

	struct Price {
		uint priceInWei;
		uint timeInSeconds;
	}

	State public state;
	address feeCollector;
	address priceFeed1; 
	address priceFeed2; 
	address priceFeed3;
	address public duoTokenAddress;

	uint decimals;
	mapping(address => uint256) balancesA;
	mapping(address => uint256) balancesB;
	mapping (address => mapping (address => uint256)) allowanceA;
	mapping (address => mapping (address => uint256)) allowanceB;
	address[] users;
	mapping (address => bool) existingUsers;
	mapping(address => uint256) public ethPendingWithdrawal;
	uint feeAccumulatedInWei;

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
	uint priceFeedBlockTimeTol = 2 minutes;
	uint priceUpdateCoolDown;

	// cycle state variables
	uint numOfPrices = 0;
	uint lastPreResetBlockNo = 0;
	uint lastPostResetBlockNo = 0;
	uint nextResetAddrIndex = 0;
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
	
	function Custodian (
		uint ethPriceInWei, 
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
		admin = msg.sender;
		decimals = 18;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
	    resetPrice.priceInWei = ethPriceInWei;
		resetPrice.timeInSeconds = now;
		lastPrice.priceInWei = ethPriceInWei;
		lastPrice.timeInSeconds = now;
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
    
    
	function checkNewUser(address user) internal {
		if (!existingUsers[user]) {
			users.push(user);
			existingUsers[user] = true;
			balancesA[user] = 0;
			balancesB[user] = 0;
		}
	}

	function updateNav() internal {
		uint numOfDays = (lastPrice.timeInSeconds.sub(resetPrice.timeInSeconds)).div(period);
		navAInWei = periodCouponInWei.mul(numOfDays).add(WEI_DENOMINATOR);
		navBInWei = lastPrice.priceInWei.mul(WEI_DENOMINATOR)
								.mul(alphaInBP.add(BP_DENOMINATOR))
								.div(BP_DENOMINATOR)
								.div(resetPrice.priceInWei)
								.sub(navAInWei.mul(alphaInBP).div(BP_DENOMINATOR));
	}

	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			if (navBInWei >= limitUpperInWei || navBInWei >= WEI_DENOMINATOR)  // limitUpperInWei always larger than 1 ether; For upward reset, the only condition should be navBInWei >= limitUpperInWei
				state = State.UpwardReset;
			else
				state = State.DownwardReset;
			StartReset();
		} 

		return true;
	}

	function startPostReset() public inState(State.PostReset) returns (bool success) {
		if (block.number - lastPostResetBlockNo >= postResetWaitingBlocks) {
			state = State.Trading;
			StartTrading();
		} 

		return true;
	}

	function startReset() public returns (bool success) {
		require(state == State.UpwardReset || state == State.DownwardReset);
		uint bAdj = alphaInBP.add(BP_DENOMINATOR).div(BP_DENOMINATOR);
		uint newBFromAPerA;
		uint newBFromBPerB;
		uint existingBalanceAdj;
		if (state == State.UpwardReset) {
			newBFromAPerA = navAInWei.sub(WEI_DENOMINATOR).div(bAdj);
			newBFromBPerB = navBInWei.sub(WEI_DENOMINATOR).div(bAdj);
		} else {
			newBFromAPerA = navAInWei.sub(navBInWei).div(bAdj);
			existingBalanceAdj = navBInWei.div(WEI_DENOMINATOR);
		}
		uint aAdj = alphaInBP.div(BP_DENOMINATOR);
		while (nextResetAddrIndex < users.length && msg.gas > iterationGasThreshold) {
			if (state == State.UpwardReset) 
				upwardResetForAddress(
					users[nextResetAddrIndex], 
					newBFromAPerA, 
					newBFromBPerB, 
					aAdj); 
			else 
				downwardResetForAddress(
					users[nextResetAddrIndex], 
					newBFromAPerA, 
					existingBalanceAdj, 
					aAdj);
			
			nextResetAddrIndex++;
		}

		if (nextResetAddrIndex >= users.length) {
			resetPrice.priceInWei = lastPrice.priceInWei;
			resetPrice.timeInSeconds = lastPrice.timeInSeconds;
			navAInWei = WEI_DENOMINATOR;
			navBInWei = WEI_DENOMINATOR;
			nextResetAddrIndex = 0;

			state = State.PostReset;
			lastPostResetBlockNo = block.number;
			StartPostReset();
		} else 
			StartReset();
		return true;
	}

	function upwardResetForAddress(
		address addr, 
		uint newBFromAPerA, 
		uint newBFromBPerB, 
		uint aAdj) 
		internal 
	{
		uint balanceA = balancesA[addr];
		uint balanceB = balancesB[addr];
		uint newBFromA = balanceA.mul(newBFromAPerA);
		uint newAFromA = newBFromA.mul(aAdj);
		uint newBFromB = balanceB.mul(newBFromBPerB);
		uint newAFromB = newBFromB.mul(aAdj);
		balancesA[addr] = balanceA.add(newAFromA).add(newAFromB);
		balancesB[addr] = balanceB.add(newBFromA).add(newBFromB);
	}

	function downwardResetForAddress(
		address addr, 
		uint newBFromAPerA, 
		uint existingBalanceAdj, 
		uint aAdj) 
		internal 
	{
		uint balanceA = balancesA[addr];
		uint balanceB = balancesB[addr];
		uint newBFromA = balanceA.mul(newBFromAPerA);
		uint newAFromA = newBFromA.mul(aAdj);
		balancesA[addr] = balanceA.mul(existingBalanceAdj).add(newAFromA);
		balancesB[addr] = balanceB.mul(existingBalanceAdj).add(newBFromA);
	}

	function acceptPrice(uint priceInWei, uint timeInSeconds) internal returns (bool) {
		lastPrice.priceInWei = priceInWei;
		lastPrice.timeInSeconds = timeInSeconds;
		numOfPrices = 0;
		updateNav();
		if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei || navAInWei >= limitPeriodicInWei) {
			state = State.PreReset;
			lastPreResetBlockNo = block.number;
			StartPreReset();
			return true;
		} 

		return true;
	}

	//PriceFeed
	function commitPrice(uint priceInWei, uint timeInSeconds) 
		public 
		inState(State.Trading) 
		among(priceFeed1, priceFeed2, priceFeed3) 
		returns (bool success)
	{	
		require(timeInSeconds < now && now.sub(timeInSeconds) <= priceFeedBlockTimeTol);
		require(timeInSeconds > lastPrice.timeInSeconds + priceUpdateCoolDown);
		uint priceDiff;
		if (numOfPrices == 0) {
			priceDiff = getPriceDiff(priceInWei, lastPrice.priceInWei);
			if (priceDiff.mul(BP_DENOMINATOR).div(lastPrice.priceInWei) <= priceTolInBP) {
				acceptPrice(priceInWei, timeInSeconds);
			} else {
				// wait for the second price
				firstPrice = Price(priceInWei, timeInSeconds);
				firstAddr = msg.sender;
				numOfPrices++;
			}
		} else if (numOfPrices == 1) {
			if (timeInSeconds > firstPrice.timeInSeconds + priceUpdateCoolDown) {
				if (firstAddr == msg.sender)
					acceptPrice(priceInWei, timeInSeconds);
				else
					acceptPrice(firstPrice.priceInWei, timeInSeconds);
			} else {
				require(firstAddr != msg.sender);
				// if second price times out, use first one
				if (firstPrice.timeInSeconds + priceFeedTimeTol > timeInSeconds) {
					acceptPrice(firstPrice.priceInWei, firstPrice.timeInSeconds);
				} else {
					priceDiff = getPriceDiff(priceInWei, firstPrice.priceInWei);
					if (priceDiff.mul(BP_DENOMINATOR).div(firstPrice.priceInWei) <= priceTolInBP) {
						acceptPrice(firstPrice.priceInWei, firstPrice.timeInSeconds);
					} else {
						// wait for the third price
						secondPrice = Price(priceInWei, timeInSeconds);
						secondAddr = msg.sender;
						numOfPrices++;
					} 
				}
			}
		} else if (numOfPrices == 2) {
			if (timeInSeconds > firstPrice.timeInSeconds + priceUpdateCoolDown) {
				if ((firstAddr == msg.sender || secondAddr == msg.sender))
					acceptPrice(priceInWei, timeInSeconds);
				else
					acceptPrice(secondPrice.priceInWei, timeInSeconds);
			} else {
				require(firstAddr != msg.sender && secondAddr != msg.sender);
				uint acceptedPriceInWei;
				// if third price times out, use first one
				if (firstPrice.timeInSeconds + priceFeedTimeTol > timeInSeconds) {
					acceptedPriceInWei = firstPrice.priceInWei;
				} else {
					// take median and proceed
					// first and second price will never be equal in this part
					// if second and third price are the same, they are median
					if (secondPrice.priceInWei == priceInWei) {
						acceptedPriceInWei = priceInWei;
					} else if (firstPrice.priceInWei
						.sub(secondPrice.priceInWei)
						.mul(priceInWei.sub(firstPrice.priceInWei)) > 0) {
						acceptedPriceInWei = firstPrice.priceInWei;
					} else if (secondPrice.priceInWei
						.sub(firstPrice.priceInWei)
						.mul(priceInWei.sub(secondPrice.priceInWei)) > 0) {
						acceptedPriceInWei = secondPrice.priceInWei;
					} else {
						acceptedPriceInWei = priceInWei;
					}
				}
				acceptPrice(acceptedPriceInWei, firstPrice.timeInSeconds);
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
		uint amtEthInWei = (deductAmtInWeiA.add(deductAmtInWeiB)).div(resetPrice.priceInWei);
		uint feeInWei = getFee(amtEthInWei);
		balancesA[msg.sender] = balancesA[msg.sender].sub(amtInWeiA);
		balancesB[msg.sender] = balancesB[msg.sender].sub(amtInWeiB);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].add(amtEthInWei.sub(feeInWei));
		return true;
	}

	function withdraw(uint amtEthInWei) public inState(State.Trading) returns (bool success) {
		require(amtEthInWei > 0 && amtEthInWei <= ethPendingWithdrawal[msg.sender] && amtEthInWei < this.balance);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].sub(amtEthInWei);
		msg.sender.transfer(amtEthInWei);
		return true;
	}

	function collectFee(uint amountInWei) public only(feeCollector) inState(State.Trading) returns (bool success) {
		require(amountInWei>0);
		require(amountInWei<=feeAccumulatedInWei);
		feeCollector.transfer(amountInWei);
		return true;
	}

	function create() 
		public 
		payable 
		inState(State.Trading) 
		isDuoMember() 
		returns (uint balance) 
	{
		uint feeInWei = getFee(msg.value);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		uint tokenValueB = msg.value.sub(feeInWei)
							.mul(resetPrice.priceInWei)
							.mul(BP_DENOMINATOR)
							.div(alphaInBP.add(BP_DENOMINATOR));
		uint tokenValueA = tokenValueB.mul(alphaInBP).div(BP_DENOMINATOR);
		checkNewUser(msg.sender);
		balancesA[msg.sender] = balancesA[msg.sender].add(tokenValueA);
		balancesB[msg.sender] = balancesB[msg.sender].add(tokenValueB);
		return this.balance;
	}

	function setFeeAddress(address newAddress) public only(admin) {
		feeCollector = newAddress;
	}

	function setCommission (uint newComm) public only(admin) {
		require(newComm > 0);
		require(newComm < BP_DENOMINATOR);
		commissionRateInBP = newComm;
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
		
		TransferA(_from, _to, _tokens);
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
		TransferB(_from, _to, _tokens);
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
}



	