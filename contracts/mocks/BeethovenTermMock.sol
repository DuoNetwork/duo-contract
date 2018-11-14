pragma solidity ^0.4.24;

import { BeethovenTerm } from "../custodians/BeethovenTerm.sol";

contract BeethovenTermMock is BeethovenTerm {

	uint public timestamp = now;

	constructor(
		address poolAddress,
		address fc,
		uint alpha,
		uint r,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint iteGasTh,
		uint preResetWaitBlk,
		uint minimumBalance
	) BeethovenTerm (
		poolAddress,
		fc,
		alpha,
		r,
		hu,
		hd,
		c,
		p,
		optCoolDown,
		pxFetchCoolDown,
		iteGasTh,
		preResetWaitBlk,
		minimumBalance
	) public {
	}

	function setTimestamp(uint ts) public {
		timestamp = ts;
	}

	function skipCooldown(uint numOfPeriods) public {
		timestamp = timestamp.add(period * numOfPeriods - 5 minutes);
	}

	function skipHour(uint numOfHour) public {
		timestamp = timestamp.add(period * numOfHour);
	}
	
	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}

	function getBadj() public view returns (uint) {
		return bAdj;
	}

	function getNextResetAddrIndex() public view returns (uint) {
		return nextResetAddrIndex;
	}
}