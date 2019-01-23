pragma solidity ^0.5.0;

interface IOracle {
	function getLastPrice() external returns(uint, uint);
	function started() external returns(bool);
}