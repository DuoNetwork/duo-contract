pragma solidity ^0.4.19;

contract TokenA {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	address public custodianAddress;  //address of custodian contract

	/**
	 * Constrctor function
	 *
	 * Initializes contract with initial supply tokens to the creator of the contract
	 */
	function TokenA(
		string tokenName,
		string tokenSymbol,
		address custodianAddr
	) public 
	{
		name = tokenName;								   // Set the name for display purposes
		symbol = tokenSymbol;							   // Set the symbol for display purposes
		custodianAddress = custodianAddr;
	}

	event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
	
	function totalSupply() public constant returns(uint) {
        return 0;
	}
	
	function balanceOf(address add) public constant returns(uint balance) {
	    Custodian custodianContract = Custodian(custodianAddress);
        return custodianContract.checkBalanceA(add);
	}

	function allowance(address _user, address _spender) public constant returns(uint value) {
	    Custodian custodianContract = Custodian(custodianAddress);
        return custodianContract.checkAllowanceA(_user,_spender);
	}

	function transfer(address _to, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
        custodianContract.transferA(msg.sender,_to, _value);
		Transfer(msg.sender, _to, _value);
		return true;
	}

	function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
        custodianContract.transferAFrom(msg.sender, _from, _to, _value);
		Transfer(_from, _to, _value);
		return true;
	}

	function approve(address _spender, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
        custodianContract.approveA(msg.sender, _spender,  _value);
		Approval(msg.sender, _spender, _value);
		return true;
	}
}

contract Custodian {
    function transferA(address _from, address _to, uint _tokens) public returns (bool success);
	function transferAFrom(address _spender, address _from, address _to, uint _tokens) returns (bool success);
	function approveA(address _sender, address _spender, uint _tokens) public returns (bool success);
	function checkBalanceA(address add) public returns(uint balance);
    function checkAllowanceA(address _user, address _spender) public returns(uint value);
}