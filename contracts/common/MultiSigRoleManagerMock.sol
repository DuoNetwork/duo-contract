pragma solidity ^0.4.24;

import { MultiSigRoleManager } from "./MultiSigRoleManager.sol";

contract MultiSigRoleManagerMock is MultiSigRoleManager {

	uint public timestamp = now;

	constructor(
		uint optCoolDown
	) MultiSigRoleManager (
		optCoolDown
	) public {
	}

	function setPassedContract(address addr) public returns(bool) {
		passedContract[addr] = true;
		return true;
	}

	function setTimestamp(uint ts) public {
		timestamp = ts;
	}

	function skipCooldown(uint numOfPeriods) public {
		timestamp = timestamp + (operatorCoolDown * numOfPeriods);
	}

	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}
}