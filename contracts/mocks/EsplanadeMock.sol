pragma solidity ^0.5.0;

import { Esplanade } from "../common/Esplanade.sol";


contract EsplanadeMock is Esplanade {

	uint public timestamp = now;

	constructor(
		uint optCoolDown
	) Esplanade (
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

	function setVotingStage(uint index) public returns (bool) {
		if(index == 0) votingStage = VotingStage.NotStarted;
		else if(index == 1) votingStage = VotingStage.Moderator;
		else if(index == 2) votingStage = VotingStage.Contract;
		return true;
	}

	function setLastOperationTime() public returns(bool) {
		lastOperationTime = getNowTimestamp();
		return true;
	}

	function setModerator(address addr) public returns(bool) {
		moderator = addr;
		addrStatus[addr] = 3;
		return true;
	}

	function setPool(uint i, uint j, address addr) public returns(bool) {
		addrPool[i][j] = addr;
		addrStatus[addr] = i + 1;
		voted[addr] = false;
		return true; 
	}

	function setPoolLength(uint index, uint length) public returns (bool) {
		addrPool[index].length = length;
	}
}