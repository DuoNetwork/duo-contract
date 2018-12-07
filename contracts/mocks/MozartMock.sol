pragma solidity ^0.5.1;

import { Mozart } from "../custodians/Mozart.sol";

contract MozartMock is Mozart {

	uint public timestamp = now;

	constructor(
		string memory code,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint alpha,
		uint hu,
		uint hd,
		uint comm,
		uint pd,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint iteGasTh,
		uint preResetWaitBlk,
		uint minimumBalance
	) Mozart (
		code,
		maturity,
		roleManagerAddr,
		fc,
		alpha,
		hu,
		hd,
		comm,
		pd,
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

	function getNextResetAddrIndex() public view returns (uint) {
		return nextResetAddrIndex;
	}

	function calculateNavPublic(
		uint priceInWei, 
		uint rstPriceInWei 
		) 
		public 
		view 
		returns (uint, uint) 
	{
		return calculateNav(
			priceInWei, 
			rstPriceInWei
		);
	}
}