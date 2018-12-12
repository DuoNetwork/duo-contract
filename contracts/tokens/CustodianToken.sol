pragma solidity ^0.5.1;
import { ICustodian } from "../interfaces/ICustodian.sol";

contract CustodianToken {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	address public custodianAddress;
	uint public index;
	ICustodian custodianContract;

	/**
	 * Constrctor function
	 *
	 * Initializes contract with initial supply tokens to the creator of the contract
	 */
	constructor(
		string memory tokenName,
		string memory tokenSymbol,
		address custodianAddr,
		uint idx
	) public 
	{
		require(custodianAddr != address(0));
		name = tokenName;								   // Set the name for display purposes
		symbol = tokenSymbol;							   // Set the symbol for display purposes
		custodianAddress = custodianAddr;
		custodianContract = ICustodian(custodianAddr);
		index = idx;
	}

	event Transfer(address indexed from, address indexed to, uint tokens);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens);

	function emitTransfer(address from, address to, uint value) public returns (bool success) {
		require(msg.sender == custodianAddress);
		emit Transfer(from, to, value);
		return true;
	}
	
	function totalSupply() public returns(uint) {
		return custodianContract.totalSupplyA();
	}
	
	function balanceOf(address addr) public returns(uint balance) {
		return custodianContract.balanceOf(index, addr);
	}

	function allowance(address user, address spender) public returns(uint value) {
		return custodianContract.allowance(index, user,spender);
	}

	function transfer(address to, uint value) public returns (bool success) {
		custodianContract.transfer(index, msg.sender, to, value);
		emit Transfer(msg.sender, to, value);
		return true;
	}

	function transferFrom(address from, address to, uint value) public returns (bool success) {
		custodianContract.transferFrom(index, msg.sender, from, to, value);
		emit Transfer(from, to, value);
		return true;
	}

	function approve(address spender, uint value) public returns (bool success) {
		custodianContract.approve(index, msg.sender, spender,  value);
		emit Approval(msg.sender, spender, value);
		return true;
	}
}