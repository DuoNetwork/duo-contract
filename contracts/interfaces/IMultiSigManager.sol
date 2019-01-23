pragma solidity ^0.5.0;

interface IMultiSigManager {
	function provideAddress(address origin, uint poolIndex) external returns (address payable);
	function passedContract(address) external returns (bool);
	function moderator() external returns(address);
}