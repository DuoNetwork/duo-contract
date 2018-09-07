pragma solidity ^0.4.24;

interface IOracle {
	function getLastPrice() external returns(uint, uint);
	function started() external returns(bool);
}