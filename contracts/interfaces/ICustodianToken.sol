pragma solidity ^0.5.0;

interface ICustodianToken {
	function emitTransfer(address from, address to, uint value) external returns (bool success);
	// ERC20
	// function balanceOf(address) external returns (uint);
	// function transfer(address to, uint value) external returns (bool success);
	// function transferFrom(address from, address to, uint value) external returns (bool success);
	// function approve(address spender, uint value) external returns (bool success);
}