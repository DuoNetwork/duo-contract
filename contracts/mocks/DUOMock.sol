pragma solidity ^0.4.24;

import { DUO } from "../tokens/DUO.sol";

contract DUOMock is DUO {

	constructor(
		uint initialSupply,
		string tokenName,
		string tokenSymbol
	) DUO (
		initialSupply,
		tokenName,
		tokenSymbol
	) public {
	}

	function mintTokens(address addr, uint amount) public {
		balanceOf[addr] += amount;
	}

}