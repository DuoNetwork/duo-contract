pragma solidity ^0.4.23;
import { Custodian } from "./Custodian.sol";

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
	constructor(
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
	
	function totalSupply() public view returns(uint) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.totalSupplyA();
	}
	
	function balanceOf(address add) public view returns(uint balance) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.balanceOf(0, add);
	}

	function allowance(address _user, address _spender) public view returns(uint value) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.allowance(0, _user,_spender);
	}

	function transfer(address _to, uint _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transfer(0, msg.sender, _to, _value);
		emit Transfer(msg.sender, _to, _value);
		return true;
	}

	function transferFrom(address _from, address _to, uint _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transferFrom(0, msg.sender, _from, _to, _value);
		emit Transfer(_from, _to, _value);
		return true;
	}

	function approve(address _spender, uint _value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.approve(0, msg.sender, _spender,  _value);
		emit Approval(msg.sender, _spender, _value);
		return true;
	}
}