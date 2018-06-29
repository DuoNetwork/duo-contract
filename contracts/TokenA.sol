pragma solidity ^0.4.24;
import { Custodian } from "./Custodian.sol";

contract TokenA {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	Custodian custodianContract;

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
		custodianContract = Custodian(custodianAddr);
	}

	event Transfer(address indexed from, address indexed to, uint tokens);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
	
	function totalSupply() public view returns(uint) {
		return custodianContract.totalSupplyA();
	}
	
	function balanceOf(address addr) public view returns(uint balance) {
		return custodianContract.balanceOf(0, addr);
	}

	function allowance(address user, address spender) public view returns(uint value) {
		return custodianContract.allowance(0, user,spender);
	}

	function transfer(address to, uint value) public returns (bool success) {
		custodianContract.transfer(0, msg.sender, to, value);
		emit Transfer(msg.sender, to, value);
		return true;
	}

	function transferFrom(address from, address to, uint value) public returns (bool success) {
		custodianContract.transferFrom(0, msg.sender, from, to, value);
		emit Transfer(from, to, value);
		return true;
	}

	function approve(address spender, uint value) public returns (bool success) {
		custodianContract.approve(0, msg.sender, spender,  value);
		emit Approval(msg.sender, spender, value);
		return true;
	}
}