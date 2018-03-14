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

contract DUO {
	using SafeMath for uint;
	enum State {
		Trading,
		PreReset,
		InReset,
		PostReset
	}

	struct Price{
		uint price;
		uint time;
	}

	State public state = State.Trading;
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

	//DUO
	address admin;
	uint feeAccumulatedInWei;
	Price resetPriceInWei; //P0
	Price lastAcceptedPrice;  //Pt
	// uint currentPriceInWei; //Pt
	uint alpha;
	uint periodCouponInBP; // r
	uint limitPeriodic; // H_p
	uint limitUpper; // H_u
	uint limitLower; // H_d
	uint commissionRateInBP;
	uint lastResetTimestamp;  
	uint period = 1 days;

	// uint priceFedPeriod= 1 hours;
	uint priceTolerancePercentBP = 500; //5%
	uint priceFedDiffTolerancePercentBP = 100; //2%
	uint priceFedTimeTolerance = 1 minutes;
	uint numOfFedPrices=0;
	
	address[] priceFeedsAddrs;
	mapping(address => Price) public priceFeeds;

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
	
	function DUO(uint ethPriceInWei, address feeAddress) public {
		admin = msg.sender;
		decimals = 18;
		commissionRateInBP = 100;
		feeCollector = feeAddress;
	    resetPriceInWei.price = ethPriceInWei;
		resetPriceInWei.time = now;
		lastAcceptedPrice.price=ethPriceInWei;
		lastAcceptedPrice.time=now;
	}
    
    
    //TO DO
	function updatePrice(uint priceInWei, uint timeInSeconds) public inState(State.Trading) among(priceFeed1, priceFeed2, priceFeed3) returns (bool success) {
		require(timeInSeconds > lastAcceptedPrice.time);
		uint priceDifference = priceInWei > lastAcceptedPrice.price ? priceInWei.sub(lastAcceptedPrice.price) : lastAcceptedPrice.price.sub(priceInWei);
		if( numOfFedPrices == 0 && priceDifference.mul(10000).div(lastAcceptedPrice.price) <= priceTolerancePercentBP){
			// take the the price and proceed
			lastAcceptedPrice.price = priceInWei;
			lastAcceptedPrice.time = timeInSeconds;
			//***************//
			//Codes Here
			//***************//

		} else {
			//wait for the second price
			addPriceFeeds(msg.sender, priceInWei, timeInSeconds);
		}

		//Second Price Feed
		if( numOfFedPrices == 1 && priceFeedsAddrs[0] != msg.sender) {
			
			var priceDiffToFirst = getPriceDiffToPrevious(0, priceInWei, timeInSeconds);
			uint firstPriceNumber = priceFeeds[priceFeedsAddrs[0]].price;
			uint firstPriceTime = priceFeeds[priceFeedsAddrs[0]].time;
			if (priceDiffToFirst.time < priceFedTimeTolerance && priceDiffToFirst.price.mul(10000).div(firstPriceNumber) <= priceFedDiffTolerancePercentBP){
				//take the average of two prices and proceed
				lastAcceptedPrice.price = (firstPriceNumber.add(priceInWei)).div(2);
				lastAcceptedPrice.time = (firstPriceTime.add(timeInSeconds)).div(2);
				//***************//
				//Codes Here
				//***************//
				emptyPriceFeeds();

			}
		} else if(priceDiffToFirst.time < priceFedTimeTolerance && priceDiffToFirst.price.mul(10000).div(firstPriceNumber) > priceFedDiffTolerancePercentBP) {
			//wait for the third price
			addPriceFeeds(msg.sender, priceInWei, timeInSeconds);
		}

		//Third Price Feed
		if( numOfFedPrices == 2 && priceFeedsAddrs[0] != msg.sender && priceFeedsAddrs[1] != msg.sender) {
			var priceDiffToSecond = getPriceDiffToPrevious(1, priceInWei, timeInSeconds);
			if (priceDiffToSecond.time < priceFedTimeTolerance){
				//take median and proceed
				var selectedPrice = selectPriceFromThreeFeeds();
				lastAcceptedPrice.price = selectedPrice.price;
				lastAcceptedPrice.time = selectedPrice.time;
				//***************//
				//Codes Here
				//***************//
				emptyPriceFeeds();
			}

		}

	}

	function emptyPriceFeeds() internal {
		for (uint i = 0; i <numOfFedPrices; i++) {
            address priceAddr = priceFeedsAddrs[i];
            delete priceFeedsAddrs[i];
			delete priceFeeds[priceAddr];
        }
		numOfFedPrices = 0;
	}

	function addPriceFeeds(address priceFeedAddress, uint priceInWei, uint timeInSeconds) internal {
		numOfFedPrices = numOfFedPrices.add(1);
		priceFeeds[priceFeedAddress] = Price(priceInWei,timeInSeconds);
		priceFeedsAddrs.push(priceFeedAddress);

	}

	function getPriceDiffToPrevious(uint priceIndex, uint priceInWei, uint timeInSeconds) internal view returns(Price){
		uint prevPriceNumber = priceFeeds[priceFeedsAddrs[priceIndex]].price;
		uint prevPriceTime = priceFeeds[priceFeedsAddrs[priceIndex]].time;
		uint timeFedDifference = timeInSeconds > prevPriceTime ? timeInSeconds.sub(prevPriceTime) : timeInSeconds.sub(prevPriceTime).sub(timeInSeconds);
		uint priceFedDifference = priceInWei > prevPriceNumber ? priceInWei.sub(prevPriceNumber) : prevPriceNumber.sub(priceInWei);
		return Price(priceFedDifference,timeFedDifference);
	}

	function selectPriceFromThreeFeeds() internal returns(Price){
		uint price1 = priceFeeds[priceFeed1].price;
		uint price2 = priceFeeds[priceFeed2].price;
		uint price3 = priceFeeds[priceFeed3].price;
		uint selectedPriceNumber;
		uint selectedPriceTime;
		if ((price1.sub(price2)) * (price3.sub(price1)) > 0) {
			selectedPriceNumber = price1;
			selectedPriceTime = priceFeeds[priceFeed1].time;
		} else if ((price2.sub(price1)) * (price3.sub(price2)) > 0) {
			selectedPriceNumber = price2;
			selectedPriceTime = priceFeeds[priceFeed2].time;
		} else {
			selectedPriceNumber = price3;
			selectedPriceTime = priceFeeds[priceFeed3].time;
		}
		return Price(selectedPriceNumber, selectedPriceTime);
	}

	function redeem(uint amtInWeiA, uint amtInWeiB) public inState(State.Trading) returns (bool success) {
		require(amtInWeiA == amtInWeiB);
		require(amtInWeiA > 0 && balancesA[msg.sender] >= amtInWeiA && balancesB[msg.sender] >=  amtInWeiB);
		uint amountEthInWei = (amtInWeiA.add(amtInWeiB)).div(resetPriceInWei.price);
		balancesA[msg.sender] = balancesA[msg.sender].sub(amtInWeiA);
		balancesB[msg.sender] = balancesB[msg.sender].sub(amtInWeiB);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].add(amountEthInWei);
		return true;
	}

	function withdrawl(uint amtEthInWei) public inState(State.Trading) returns (bool success) {
		require(amtEthInWei > 0 && amtEthInWei < this.balance);
		require(amtEthInWei <= ethPendingWithdrawal[msg.sender]);
		ethPendingWithdrawal[msg.sender] = ethPendingWithdrawal[msg.sender].sub(amtEthInWei);
		msg.sender.transfer(amtEthInWei);
		return true;
	}

	function collectFee(uint amountInWei) public only(feeCollector) returns (bool success) {
		require(amountInWei>0);
		require(amountInWei<=feeAccumulatedInWei);
		feeCollector.transfer(amountInWei);
		return true;
	}

	function create() public payable inState(State.Trading) returns (uint balance) {
		feeAccumulatedInWei += msg.value.mul(commissionRateInBP).div(10000);
		uint tokenValueB = msg.value
							.mul(resetPriceInWei.price)
							.mul(10000 - commissionRateInBP)
							.div(10000)
							.div(alpha.add(1));
		uint tokenValueA = tokenValueB.mul(alpha);
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