pragma solidity ^0.5.0;

import { StakeV2 } from "../POS/StakeV2.sol";

contract StakeV2Mock is StakeV2 {
	uint public timestamp = now;


	constructor(
		address duoTokenAddr,
		address duoBurnAddr,
		address[] memory pfList,
		uint lockTime,
		uint minStakeAmt,
		uint maxStakePerPf,
		address roleManagerAddr,
		address opt,
		address upl,
		uint optCoolDown
	) StakeV2(
		duoTokenAddr,
		duoBurnAddr,
		pfList,
		lockTime,
		minStakeAmt,
		maxStakePerPf,
		roleManagerAddr,
		opt,
		upl,
		optCoolDown
	)
		public {
	}

	function setRoleManager(address rm) public returns(bool){
		roleManagerAddress = rm;
		return true;
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

}