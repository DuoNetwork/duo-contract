pragma solidity ^0.4.24;

interface ICustodian {
	function users(uint) external returns(address);
	function totalUser() external returns (uint);
	function totalSupplyA() external returns (uint);
	function totalSupplyB() external returns (uint);
	function balanceOf(uint, address) external returns (uint);
	function allowance(uint, address, address) external returns (uint);
	function transfer(uint, address, address, uint) external returns (bool);
	function transferFrom(uint, address, address, address, uint) external returns (bool);
	function approve(uint, address, address, uint) external returns (bool);
}
