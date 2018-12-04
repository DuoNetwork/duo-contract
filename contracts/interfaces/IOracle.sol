pragma solidity ^0.5.1;

interface IOracle {
	function getLastPrice() external returns(uint, uint);
	function started() external returns(bool);
}