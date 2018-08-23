pragma solidity ^0.4.24;

interface ICustodian {
	function users(uint index) external returns(address);
	function totalUser() external returns (uint);
}
