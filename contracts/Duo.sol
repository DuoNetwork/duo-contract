pragma solidity ^0.4.17;

contract Duo {
	enum State {
		Trading,
		PreReset,
		InReset,
		PostReset
	}

	State public state;
	address feeCollector;
	address priceFeed1; 
	address priceFeed2; 
	address priceFeed3;

	uint totalSupply;
	mapping(address => uint256) balancesA;
	mapping(address => uint256) balancesB;
	mapping (address => mapping (address => uint256)) public allowanceA;
	mapping (address => mapping (address => uint256)) public allowanceB;
	address[] addressesA;
	address[] addressesB;
	uint resetPriceInWei; //P0
	uint currentPriceInWei; //P1
	uint alpha;
	uint dailyCouponInBP;
	uint limitPeriodic;
	uint limitUpper;
	uint limitLower;
	uint commissionRate;   // divided by 100 by default
	uint lastResetDay;  //or Seconds ?


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

		// This generates a public event on the blockchain that will notify clients
	event TransferA(address indexed from, address indexed to, uint256 value);
	event TransferB(address indexed from, address indexed to, uint256 value);

	function updatePrice(uint priceInWei) 
		public 
		inState(State.Trading) 
		among(priceFeed1, priceFeed2, priceFeed3) 
		returns (bool success);

	function create() public payable inState(State.Trading) returns (bool success);
	function redeem(uint amtInWeiA, uint amtInWeiB) public inState(State.Trading) returns (bool success);
	function collectFee(uint amountInWei) public only(feeCollector) returns (bool success);

	// ERC20
	function _transferA(address _from, address _to, uint _value) internal {

		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balancesA[_from] >= _value);
		// Check for overflows
		require(balancesA[_to] + _value > balancesA[_to]);

		// Save this for an assertion in the future
		uint previousBalances = balancesA[_from] + balancesA[_to];
		// Subtract from the sender
		balancesA[_from] -= _value;
		// Add the same to the recipient
		balancesA[_to] += _value;
		TransferA(_from, _to, _value);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balancesA[_from] + balancesA[_to] == previousBalances);
	}

	function _transferB(address _from, address _to, uint _value) internal {

		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balancesB[_from] >= _value);
		// Check for overflows
		require(balancesB[_to] + _value > balancesB[_to]);

		// Save this for an assertion in the future
		uint previousBalances = balancesB[_from] + balancesB[_to];
		// Subtract from the sender
		balancesB[_from] -= _value;
		// Add the same to the recipient
		balancesB[_to] += _value;
		TransferB(_from, _to, _value);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balancesB[_from] + balancesB[_to] == previousBalances);
	}

    function transferA(address _from, address _to, uint _tokenValue) public inState(State.Trading) returns (bool success){
        _transferA(_from,_to,_tokenValue);
        return true;
    }
	function transferB(address _from, address _to, uint _tokenValue) public inState(State.Trading) returns (bool success){
        _transferB(_from,_to,_tokenValue);
        return true;
    }

	function approveA(address spender, uint tokens) public returns (bool success);
	function approveB(address spender, uint tokens) public returns (bool success);

    function transferAFrom(address _spender, address _from, address _to, uint _tokenValue) public inState(State.Trading) returns (bool success){
		require(_tokenValue <= allowanceA[_from][_spender]);	 // Check allowance
		allowanceA[_from][_spender] -= _tokenValue;
		_transferA(_from, _to, _tokenValue);
		return true;
	}
	
	function transferBFrom(address _spender, address _from, address _to, uint _tokenValue) public inState(State.Trading) returns (bool success){
		require(_tokenValue <= allowanceB[_from][_spender]);	 // Check allowance
		allowanceB[_from][_spender] -= _tokenValue;
		_transferB(_from, _to, _tokenValue);
		return true;
	}
}