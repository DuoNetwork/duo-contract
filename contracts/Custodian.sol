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
	mapping(address => uint256) public balancesA;
	mapping(address => uint256) public balancesB;
	mapping (address => mapping (address => uint256)) public allowanceA;
	mapping (address => mapping (address => uint256)) public allowanceB;
	address[] users;
	mapping (address => bool) public existingUsers;
	mapping(address => uint256) public ethPendingWithdrawal;

	uint weiDenominator = 1000000000000000000;

	//custodian
	address admin;
	uint feeAccumulatedInWei;
	Price resetPrice; //P0
	Price lastPrice;  //Pt
	uint alphaInBP;
	uint periodCouponInWei; // r
	uint limitPeriodicInWei; // H_p
	uint limitUpperInWei; // H_u
	uint limitLowerInWei; // H_d
	uint commissionRateInBP;
	uint lastPreResetBlockNo;
	uint lastPostResetBlockNo;
	uint preResetWaitingBlocks;
	uint postResetWaitingBlocks;
	uint period = 1 days;
	uint public navAInWei;
	uint public navBInWei; 
	uint iterationGasThreshold;
	uint nextResetAddrIndex;

	//priceFeeds
	uint priceTolInBP = 500; //5%
	uint priceFeedTolInBP = 100; //1%
	uint priceFeedTimeTol = 1 minutes;
	uint priceUpdateCoolDown = 30 minutes;
	uint numOfPrices = 0;
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

	modifier duoMember(address addr) {
		DUO duoToken = DUO(duoTokenAddress);
        require(duoToken.balanceOf(addr) > 0);
		_;
	}

	event StartTrading();
	event StartPreReset();
	event StartReset();
	event StartPostReset();

	event TransferA(address indexed from, address indexed to, uint256 value);
	event TransferB(address indexed from, address indexed to, uint256 value);
	
	function Custodian (uint ethPriceInWei, address feeAddress, address duoAddress) public {
		admin = msg.sender;
		decimals = 18;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
	    resetPrice.priceInWei = ethPriceInWei;
		resetPrice.timeInSeconds = now;
		lastPrice.priceInWei = ethPriceInWei;
		lastPrice.timeInSeconds = now;
		priceFeed1 = msg.sender;
		priceFeed2 = msg.sender;
		priceFeed3 = msg.sender;
		duoTokenAddress = duoAddress;
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
		navAInWei = periodCouponInWei.mul(numOfDays).add(weiDenominator);
		navBInWei = lastPrice.priceInWei.mul(weiDenominator)
								.mul(alphaInBP.add(10000))
								.div(10000)
								.div(resetPrice.priceInWei)
								.sub(navAInWei.mul(alphaInBP).div(10000));
	}

	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			if (navBInWei >= limitUpperInWei || navBInWei >= weiDenominator)  // limitUpperInWei always larger than 1 ether; For upward reset, the only condition should be navBInWei >= limitUpperInWei
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
		uint bAdj = alphaInBP.add(10000).div(10000);
		uint newBFromAPerA;
		uint newBFromBPerB;
		uint existingBalanceAdj;
		if (state == State.UpwardReset) {
			newBFromAPerA = navAInWei.sub(weiDenominator).div(bAdj);
			newBFromBPerB = navBInWei.sub(weiDenominator).div(bAdj);
		} else {
			newBFromAPerA = navAInWei.sub(navBInWei).div(bAdj);
			existingBalanceAdj = navBInWei.div(weiDenominator);
		}
		uint aAdj = alphaInBP.div(10000);
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
			navAInWei = weiDenominator;
			navBInWei = weiDenominator;
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
		require(timeInSeconds > lastPrice.timeInSeconds + priceUpdateCoolDown);
		uint priceDiff;
		if (numOfPrices == 0) {
			priceDiff = getPriceDiff(priceInWei, lastPrice.priceInWei);
			if (priceDiff.mul(10000).div(lastPrice.priceInWei) <= priceTolInBP) {
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
					if (priceDiff.mul(10000).div(firstPrice.priceInWei) <= priceTolInBP) {
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
		return ethInWei.mul(commissionRateInBP).div(10000);
	}

	function redeem(uint amtInWeiA, uint amtInWeiB) public inState(State.Trading) returns (bool success) {
		require(amtInWeiA > 0 && amtInWeiB > 0);
		uint adjAmtInWeiA = amtInWeiA.mul(10000).div(alphaInBP);
		uint deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
		uint deductAmtInWeiA = deductAmtInWeiB.mul(alphaInBP).div(10000);
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

	function create() public payable inState(State.Trading) duoMember(msg.sender) returns (uint balance) {
		uint feeInWei = getFee(msg.value);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		uint tokenValueB = msg.value.sub(feeInWei)
							.mul(resetPrice.priceInWei)
							.mul(10000)
							.div(alphaInBP.add(10000));
		uint tokenValueA = tokenValueB.mul(alphaInBP).div(10000);
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
		require(newComm < 10000);
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
}



	