pragma solidity ^0.4.24;

interface IMultiSigManager {
	function provideAddress(address origin, uint poolIndex) external returns (address);
	function passedContract(address) external returns (bool);
	function moderator() external returns(address);
}