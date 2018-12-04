pragma solidity ^0.5.1;

import { DUO } from "../tokens/DUO.sol";

contract DUOMock is DUO {

	constructor(
		uint initialSupply,
		string memory tokenName,
		string memory tokenSymbol
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