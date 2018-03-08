pragma solidity ^0.4.19;

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

	mapping(address => uint256) balancesA;
	mapping(address => uint256) balancesB;
	mapping (address => mapping (address => uint256)) public allowanceA;
	mapping (address => mapping (address => uint256)) public allowanceB;
	address[] addressesA;
	address[] addressesB;
	uint resetPriceInWei;
	uint currentPriceInWei;
	uint alpha;
	uint dailyCouponInBP;
	uint limitPeriodic;
	uint limitUpper;
	uint limitLower;


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

	function updatePrice(uint priceInWei) 
		public 
		inState(State.Trading) 
		among(priceFeed1, priceFeed2, priceFeed3) 
		returns (bool success);

	function create() public payable inState(State.Trading) returns (bool success);
	function redeem(uint amtInWeiA, uint amtInWeiB) public inState(State.Trading) returns (bool success);
	function collectFee(uint amountInWei) public only(feeCollector) returns (bool success);

	// ERC20
	function totalSupply() public constant returns (uint);
	function balanceOfA(address addr) public constant returns (uint) {
		return balancesA[addr];
	}

	function balanceOfB(address addr) public constant returns (uint) {
		return balancesB[addr];
	}

    function transferA(address to, uint tokens) public inState(State.Trading) returns (bool success);
	function transferB(address to, uint tokens) public inState(State.Trading) returns (bool success);
	function approveA(address spender, uint tokens) public returns (bool success);
	function approveB(address spender, uint tokens) public returns (bool success);
    function transferAFrom(address from, address to, uint tokens) public inState(State.Trading) returns (bool success);
	function transferBFrom(address from, address to, uint tokens) public inState(State.Trading) returns (bool success);
}