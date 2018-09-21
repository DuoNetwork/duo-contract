pragma solidity ^0.4.24;

import { Beethoven } from "./Beethoven.sol";

contract BeethovenMock is Beethoven {

	uint public timestamp = now;

	constructor(
		address duoTokenAddress,
		address poolAddress,
		address fc,
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint iteGasTh,
		uint ethDuoRate,
		uint preResetWaitBlk
	) Beethoven (
		duoTokenAddress,
		poolAddress,
		fc,
		alpha,
		r,
		hp,
		hu,
		hd,
		c,
		p,
		optCoolDown,
		pxFetchCoolDown,
		iteGasTh,
		ethDuoRate,
		preResetWaitBlk
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

	function setCollatarization(uint number) public {
		ethCollateralInWei = number;
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