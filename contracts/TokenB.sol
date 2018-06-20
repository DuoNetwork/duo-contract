pragma solidity ^0.4.24;
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
		return custodianContract.totalSupplyB();
	}
	
	function balanceOf(address addr) public view returns(uint balance) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.balanceOf(1, addr);
	}

	function allowance(address user, address spender) public view returns(uint value) {
		Custodian custodianContract = Custodian(custodianAddress);
		return custodianContract.allowance(1, user,spender);
	}

	function transfer(address to, uint value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transfer(1, msg.sender,to, value);
		emit Transfer(msg.sender, to, value);
		return true;
	}

	function transferFrom(address from, address to, uint value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.transferFrom(1, msg.sender, from, to, value);
		emit Transfer(from, to, value);
		return true;
	}

	function approve(address spender, uint value) public returns (bool success) {
		Custodian custodianContract = Custodian(custodianAddress);
		custodianContract.approve(1, msg.sender, spender,  value);
		emit Approval(msg.sender, spender, value);
		return true;
	}
}