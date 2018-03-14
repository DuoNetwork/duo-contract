pragma solidity ^0.4.17;

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

contract Custodian {
	using SafeMath for uint;
	enum State {
		Trading,
		PreReset,
		InReset,
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

	uint decimals;
	mapping(address => uint256) public balancesA;
	mapping(address => uint256) public balancesB;
	mapping (address => mapping (address => uint256)) public allowanceA;
	mapping (address => mapping (address => uint256)) public allowanceB;
	address[] addressesA;
	address[] addressesB;
	mapping(address => uint256) public ethPendingWithdrawal;

	//custodian
	address admin;
	uint feeAccumulatedInWei;
	Price resetPrice; //P0
	Price lastPrice;  //Pt
	uint alphaInBP;
	uint periodCouponInBP; // r
	uint limitPeriodicInBP; // H_p
	uint limitUpperInBP; // H_u
	uint limitLowerInBP; // H_d
	uint commissionRateInBP;
	uint lastResetTimestamp;
	uint period = 1 days;
	uint navAInBP;
	uint navBInBP;  

	//priceFeeds
	uint priceTolInBP = 500; //5%
	uint priceFeedTolInBP = 100; //2%
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

	event StartTrading();
	event StartPreReset();
	event StartReset();
	event StartPostReset();

	event ResetRequired();

	event TransferA(address indexed from, address indexed to, uint256 value);
	event TransferB(address indexed from, address indexed to, uint256 value);
	
	function Custodian (uint ethPriceInWei, address feeAddress) public {
		admin = msg.sender;
		decimals = 18;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
	    resetPrice.priceInWei = ethPriceInWei;
		resetPrice.timeInSeconds = now;
		lastPrice.priceInWei = ethPriceInWei;
		lastPrice.timeInSeconds = now;
	}
    
    
    //TO DO
	// function updatePrice(uint priceInWei) 
	// 	public 
	// 	inState(State.Trading) 
	// 	among(priceFeed1, priceFeed2, priceFeed3) 
	// 	returns (bool success);
	function getNavA() internal {
		uint numOfDays = (now.sub(resetPrice.timeInSeconds)).div(period);
		navAInBP = periodCouponInBP.mul(numOfDays).add(10000);
	}

	function getNavB() internal {
		navBInBP = lastPrice.priceInWei
								.mul(alphaInBP.add(10000))
								.div(resetPrice.priceInWei)
								.sub(
									navAInBP.mul(alphaInBP)
								);
							
	}

	function checkUpReset() internal returns (bool upset) {
		if (navBInBP >= limitUpperInBP) {
			state = State.PreReset;
			StartPreReset();
			return true;
		}
		return false;
	}
	
	function checkDownReset() internal returns (bool downset) {
		if (navBInBP <= limitLowerInBP) {
			state = State.PreReset;
			StartPreReset();
			return true;
		}
		return false;
	}

	function checkPeriodicalReset() internal returns (bool upset) {
		if (navAInBP >= limitPeriodicInBP) {
			state = State.PreReset;
			StartPreReset();
			return true;
		}
		return false;
	}
	
	//TO DO
	function upReset() internal {

	}

	function downReset() internal {

	}

	//PriceFeed
	function updatePrice(uint priceInWei, uint timeInSeconds) 
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
				// take the the price and proceed
				lastPrice.priceInWei = priceInWei;
				lastPrice.timeInSeconds = timeInSeconds;
				// check resets
			} else {
				// wait for the second price
				firstPrice = Price(priceInWei, timeInSeconds);
				firstAddr = msg.sender;
				numOfPrices++;
			}
		} else if (numOfPrices == 1) {
			require(firstAddr != msg.sender);
			// if second price times out, use first one
			if (firstPrice.timeInSeconds + priceFeedTimeTol > timeInSeconds) {
				// take the the price and proceed
				lastPrice.priceInWei = firstPrice.priceInWei;
					lastPrice.timeInSeconds = firstPrice.timeInSeconds;
				numOfPrices = 0;
				// check resets
			} else {
				priceDiff = getPriceDiff(priceInWei, firstPrice.priceInWei);
				if (priceDiff.mul(10000).div(firstPrice.priceInWei) <= priceTolInBP) {
					// take the average of two prices and proceed
					lastPrice.priceInWei = firstPrice.priceInWei;
					lastPrice.timeInSeconds = firstPrice.timeInSeconds;
					numOfPrices = 0;
					// check resets
				} else {
					// wait for the third price
					secondPrice = Price(priceInWei, timeInSeconds);
					secondAddr = msg.sender;
					numOfPrices++;
				} 
			}

		} else if (numOfPrices == 2) {
			require(firstAddr != msg.sender && secondAddr != msg.sender);
			// if third price times out, use first one
			if (firstPrice.timeInSeconds + priceFeedTimeTol > timeInSeconds) {
				// take the the price and proceed
				lastPrice.priceInWei = firstPrice.priceInWei;
				lastPrice.timeInSeconds = firstPrice.timeInSeconds;
			} else {
				// take median and proceed
				// first and second price will never be equal in this part
				// if second and third price are the same, they are median
				if (secondPrice.priceInWei == priceInWei) {
					lastPrice.priceInWei = priceInWei;
				} else if (firstPrice.priceInWei
					.sub(secondPrice.priceInWei)
					.mul(priceInWei.sub(firstPrice.priceInWei)) > 0) {
					lastPrice.priceInWei = firstPrice.priceInWei;
				} else if (secondPrice.priceInWei
					.sub(firstPrice.priceInWei)
					.mul(priceInWei.sub(secondPrice.priceInWei)) > 0) {
					lastPrice.priceInWei = secondPrice.priceInWei;
				} else {
					lastPrice.priceInWei = priceInWei;
				}
				lastPrice.timeInSeconds = firstPrice.timeInSeconds;	
			}

			// check resets
				numOfPrices = 0;
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

	function create() public payable inState(State.Trading) returns (uint balance) {
		uint feeInWei = getFee(msg.value);
		feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
		uint tokenValueB = msg.value.sub(feeInWei)
							.mul(resetPrice.priceInWei)
							.mul(10000)
							.div(alphaInBP.add(10000));
		uint tokenValueA = tokenValueB.mul(alphaInBP).div(10000);
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
		// Subtract from the sender
		balancesB[_from] = balancesB[_from].sub(_tokens);
		// Add the same to the recipient
		balancesB[_to] = balancesB[_to].add(_tokens);
		TransferA(_from, _to, _tokens);
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



	