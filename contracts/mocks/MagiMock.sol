pragma solidity ^0.5.1;

import { Magi } from "../oracles/Magi.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract MagiMock is Magi {
	uint public timestamp = now;

	constructor(
		address opt,
		address pf1,
		address pf2,
		address pf3,
		address roleManagerAddr,
		uint pxCoolDown,
		uint optCoolDown
	) Magi (
		opt,
		pf1,
		pf2,
		pf3,
		roleManagerAddr,
		pxCoolDown,
		optCoolDown
	)
		public {
	}


	function setLastPrice(uint price, uint time, address sender) public returns (bool) {
		lastPrice.priceInWei = price;
		lastPrice.timeInSecond = time;
		lastPrice.source = sender;
		return true;
	}

	
	function setRoleManager(address rm) public returns(bool){
		roleManagerAddress = rm;
		return true;
	}

	function triggerProvideAddr(uint poolIndex) public returns (address) {
		return IMultiSigManager(roleManagerAddress).provideAddress(msg.sender, poolIndex);
	}

	function setTimestamp(uint ts) public {
		timestamp = ts;
	}
	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}

	function skipCooldown(uint numOfPeriods) public {
		timestamp = timestamp + (1 hours * numOfPeriods);
	}

	
	function getMedianPublic(uint a, uint b, uint c) public pure returns (uint){
		return getMedian(a, b, c);
	}
}