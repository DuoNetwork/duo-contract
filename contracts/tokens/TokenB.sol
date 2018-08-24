pragma solidity ^0.4.24;
import { ICustodian } from "../interfaces/ICustodian.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

contract TokenB is IERC20 {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	ICustodian custodianContract;

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
		custodianContract = ICustodian(custodianAddr);
	}

	event Transfer(address indexed from, address indexed to, uint tokens);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens);
	
	function totalSupply() public returns(uint) {
		return custodianContract.totalSupplyB();
	}
	
	function balanceOf(address addr) public returns(uint balance) {
		return custodianContract.balanceOf(1, addr);
	}

	function allowance(address user, address spender) public returns(uint value) {
		return custodianContract.allowance(1, user,spender);
	}

	function transfer(address to, uint value) public returns (bool success) {
		custodianContract.transfer(1, msg.sender,to, value);
		emit Transfer(msg.sender, to, value);
		return true;
	}

	function transferFrom(address from, address to, uint value) public returns (bool success) {
		custodianContract.transferFrom(1, msg.sender, from, to, value);
		emit Transfer(from, to, value);
		return true;
	}

	function approve(address spender, uint value) public returns (bool success) {
		custodianContract.approve(1, msg.sender, spender,  value);
		emit Approval(msg.sender, spender, value);
		return true;
	}
}