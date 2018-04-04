pragma solidity ^0.4.21;
import { Custodian } from "./Custodian.sol";

contract TokenB {
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
	function TokenB(
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
		return custodianContract.checkBalanceB(add);
	}

	function allowance(address _user, address _spender) public constant returns(uint value) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.checkAllowanceB(_user,_spender);
	}

	function transfer(address _to, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transferB(msg.sender,_to, _value);
		emit Transfer(msg.sender, _to, _value);
		return true;
	}

	function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transferBFrom(msg.sender, _from, _to, _value);
		emit Transfer(_from, _to, _value);
		return true;
	}

	function approve(address _spender, uint256 _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.approveB(msg.sender, _spender,  _value);
		emit Approval(msg.sender, _spender, _value);
		return true;
	}
}