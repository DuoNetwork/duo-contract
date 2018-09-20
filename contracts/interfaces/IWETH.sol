pragma solidity ^0.4.24;

interface IWETH {
	function balanceOf(address) external returns (uint);
	function transfer(address to, uint value) external returns (bool success);
	function transferFrom(address from, address to, uint value) external returns (bool success);
	function approve(address spender, uint value) external returns (bool success);
	function allowance(address owner, address spender) external returns (uint);
	function withdraw(uint value) external;
	function deposit() external;
}