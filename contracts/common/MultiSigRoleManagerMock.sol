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

	function getPoolSize(uint index) public view returns (uint) {
		return addrPool[index].length;
	}

	function setVotingStage(uint index) public returns (bool) {
		if(index == 0) votingStage = VotingStage.NotStarted;
		else if(index == 1) votingStage = VotingStage.Moderator;
		else if(index == 2) votingStage = VotingStage.Contract;
		return true;
	}

	function setModerator(address addr) public returns(bool) {
		moderator = addr;
		addrStatus[addr] = 3;
		return true;
	}

	function setPool(uint i, uint j, address addr) public returns(bool) {
		addrPool[i][j] = addr;
		addrStatus[addr] = 1;
		voted[addr] = false;
		return true; 
	}
}