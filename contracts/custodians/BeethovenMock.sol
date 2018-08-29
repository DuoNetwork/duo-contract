pragma solidity ^0.4.24;

import { Beethoven } from "./Beethoven.sol";

contract BeethovenMock is Beethoven {

	uint public timestamp = now;

	constructor(
		address duoTokenAddress,
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

	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}

	// function getAddrStatus(address addr) public view returns (uint) {
	// 	return addrStatus[addr];
	// }

	// function getNextAddrIndex() internal view returns (uint) {
	// 	return 0;
	// }

	// function getMedianPublic(uint a, uint b, uint c) public pure returns (uint){
	// 	return getMedian(a, b, c);
	// }
}