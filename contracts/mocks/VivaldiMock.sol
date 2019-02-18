pragma solidity ^0.5.0;

import { Vivaldi } from "../custodians/Vivaldi.sol";

contract VivaldiMock is Vivaldi {

	uint public timestamp = now;

	constructor(
		string memory code,
		address collateralTokenAddr,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint createFee,
		uint redeemFee,
		uint clearFee,
		uint pd,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint preResetWaitBlk,
		uint minimumBalance,
		uint iteGasTh
	) Vivaldi (
		code,
		collateralTokenAddr,
		maturity,
		roleManagerAddr,
		fc,
		createFee,
		redeemFee,
		clearFee,
		pd,
		optCoolDown,
		pxFetchCoolDown,
		preResetWaitBlk,
		minimumBalance,
		iteGasTh
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

	function skipPriceFetchCoolDown(uint numOfCoolDown) public {
		timestamp = timestamp.add(priceFetchCoolDown * numOfCoolDown);
	}

	function skipSecond(uint numOfSecond) public {
		timestamp = timestamp.add(numOfSecond);
	}
	
	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}

	function getNextResetAddrIndex() public view returns (uint) {
		return nextResetAddrIndex;
	}

	function setLastPrice(uint price, uint time) public returns (bool) {
		lastPriceTimeInSecond = time;
		lastPriceInWei = price;
		return true;
	}

	function setResetPrice(uint price) public returns (bool) {
		resetPriceTimeInSecond = lastPriceTimeInSecond.add(period);
		resetPriceInWei = price;
		return true;
	}

	function setPriceFetchCoolDown(uint newValue) public returns (bool) {
		priceFetchCoolDown = newValue;
		return true;
	}

	function setStrike(uint strikeInWei, bool strikeIsCall, bool strikeIsRelative) public returns (bool) {
		strike = Strike(strikeInWei, strikeIsCall, strikeIsRelative);
	}
}