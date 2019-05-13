pragma solidity ^0.5.0;

import { Stake } from "../POS/Stake.sol";

contract StakeMock is Stake {
	uint public timestamp = now;

	constructor(
		address duoTokenAddr,
		address[] memory pfList,
		uint lockTime,
		uint minStakeAmt,
		uint maxStakePerPf,
		address roleManagerAddr,
		address opt,
		uint optCoolDown
	) Stake(
		duoTokenAddr,
		pfList,
		lockTime,
		minStakeAmt,
		maxStakePerPf,
		roleManagerAddr,
		opt,
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