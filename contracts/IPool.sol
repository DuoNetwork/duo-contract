pragma solidity ^0.4.24;

interface IPool {
	function provideAddress(address origin) external returns (address);
	function poolManager() external returns(address);
}