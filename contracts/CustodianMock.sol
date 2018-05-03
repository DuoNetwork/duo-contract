pragma solidity ^0.4.23;

import "./Custodian.sol";

contract CustodianMock is Custodian {

	uint public timestamp = now;

	constructor(
		address feeAddress, 
		address duoAddress,
		address pf1,
		address pf2,
		address pf3,
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint memberThreshold,
		uint gasThreshold,
		uint coolDown
	) Custodian (
		feeAddress, 
		duoAddress,
		pf1,
		pf2,
		pf3,
		alpha,
		r,
		hp,
		hu,
		hd,
		c,
		p,
		memberThreshold,
		gasThreshold,
		coolDown
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

	function getExistingUser(address addr) public view returns (bool) {
		return existingUsers[addr];
	}

	function getAddrStatus(address addr) public view returns (uint) {
		return addrStatus[addr];
	}

	function getMedianPublic(uint a, uint b, uint c) public pure returns (uint){
		return getMedian(a, b, c);
	}
}