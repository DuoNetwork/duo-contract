pragma solidity ^0.4.24;

interface IMultiSigManager {
	function provideAddress(address origin) external returns (address);
	function moderator() external returns(address);
}