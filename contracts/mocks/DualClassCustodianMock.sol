pragma solidity ^0.5.1;

import { DualClassCustodian } from "../custodians/DualClassCustodian.sol";

contract DualClassCustodianMock is DualClassCustodian {

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
	) DualClassCustodian (
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

	function getNextResetAddrIndex() public view returns (uint) {
		return nextResetAddrIndex;
	}

	function setLastPrice(uint priceInWei, uint timeInSecond) public {
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
	}

	function setNav(uint navA, uint navB, uint priceInWei, uint timeInSecond) public {
		navAInWei = navA;
		navBInWei = navB;
		if (maturityInSecond > 0 && timeInSecond > maturityInSecond) {
			state = State.Matured;
			emit Matured(navAInWei, navBInWei);
		} else if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei || (limitPeriodicInWei > 0 && navAInWei >= limitPeriodicInWei)) {
			state = State.PreReset;
			lastPreResetBlockNo = block.number;
			emit StartPreReset();
		} 
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
	}
}