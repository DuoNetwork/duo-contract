pragma solidity ^0.5.1;

import { Beethoven } from "../custodians/Beethoven.sol";

contract BeethovenMock is Beethoven {

	uint public timestamp = now;

	constructor(
		string memory name,
		uint maturity,
		address poolAddress,
		address payable fc,
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
		uint preResetWaitBlk,
		uint minimumBalance
	) Beethoven (
		name,
		maturity,
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

	function calculateNavPublic(
		uint priceInWei, 
		uint timeInSecond, 
		uint rstPriceInWei, 
		uint rstTimeInSecond,
		uint bInWei
		) 
		public 
		view 
		returns (uint, uint) 
	{
		return calculateNav(
			priceInWei, 
			timeInSecond, 
			rstPriceInWei, 
			rstTimeInSecond,
			bInWei
		);
	}
}