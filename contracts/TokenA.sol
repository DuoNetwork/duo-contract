pragma solidity ^0.4.17;

contract TokenA {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	address public duoAddress;  //address of DUO contract

	/**
	 * Constrctor function
	 *
	 * Initializes contract with initial supply tokens to the creator of the contract
	 */
	function TokenA(
		string tokenName,
		string tokenSymbol,
		address duoAddr
	) public 
	{
		name = tokenName;								   // Set the name for display purposes
		symbol = tokenSymbol;							   // Set the symbol for display purposes
		duoAddress = duoAddr;
	}

	event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
	
	function totalSupply() public constant returns(uint) {
        return 0;
	}
	
	function balanceOf(address add) public constant returns(uint balance) {
	    DUO duoContract = DUO(duoAddress);
        return duoContract.checkBalanceA(add);
	}

	function allowance(address _user, address _spender) public constant returns(uint value) {
	    DUO duoContract = DUO(duoAddress);
        return duoContract.checkAllowanceA(_user,_spender);
	}

	function transfer(address _to, uint256 _value) public returns (bool success) {
		DUO duoContract = DUO(duoAddress);
        duoContract.transferA(msg.sender,_to, _value);
		Transfer(msg.sender, _to, _value);
		return true;
	}

	function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
		DUO duoContract = DUO(duoAddress);
        duoContract.transferAFrom(msg.sender, _from, _to, _value);
		Transfer(_from, _to, _value);
		return true;
	}

	function approve(address _spender, uint256 _value) public returns (bool success) {
		DUO duoContract = DUO(duoAddress);
        duoContract.approveA(msg.sender, _spender,  _value);
		Approval(msg.sender, _spender, _value);
		return true;
	}
}

contract DUO {
    function transferA(address _from, address to, uint _tokenValue) returns (bool success);
	function transferAFrom(address _spender, address _from, address _to, uint _tokenValue) returns (bool success);
	function approveA(address _sender, address _spender, uint _tokenValue) public returns (bool success);
	function checkBalanceA(address add) public returns(uint balance);
    function checkAllowanceA(address _user, address _spender) public returns(uint value);
    function checkTotalSupplyA() public returns(uint total);
}