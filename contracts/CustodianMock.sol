pragma solidity ^0.4.21;

import "./Custodian.sol";

contract CustodianMock is Custodian {

	uint public timestamp = now;

	function CustodianMock (
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

	function getFeeCollector() public view returns (address _feeCollector) {
		return feeCollector;
	}

	function getPriceFeed1() public view returns (address _priceFeed1) {
		return priceFeed1;
	}
	function getPriceFeed2() public view returns (address _priceFeed2) {
		return priceFeed2;
	}
	function getPriceFeed3() public view returns (address _priceFeed3) {
		return priceFeed3;
	}
	function getAdmin() public view returns (address _admin) {
		return admin;
	}

	function getFirstAddr() public view returns (address _firstAddr) {
		return firstAddr;
	}
	function getSecondAddr() public view returns (address _secondAddr) {
		return secondAddr;
	}
	function getFirstPrice() public view returns (uint _firstPrice, uint _priceTime) {
		return (firstPrice.priceInWei, firstPrice.timeInSecond);
	}
	function getSecondPrice() public view returns (uint _secondPrice, uint _priceTime) {
		return (secondPrice.priceInWei, secondPrice.timeInSecond);
	}

	function getPriceFeedTolInBP() public view returns (uint256 _priceFeedTolInBP) {
		return priceFeedTolInBP;
	}

	function getPreResetWaitingBlocks() public view returns (uint256 _preResetWaitingBlocks) {
		return preResetWaitingBlocks;
	}

	function getPriceTolInBP() public view returns (uint256 _priceTolInBP) {
		return priceTolInBP;
	}
	function getPriceFeedTimeTol() public view returns (uint256 _priceFeedTimeTol) {
		return priceFeedTimeTol;
	}

	function getPriceUpdateCoolDown() public view returns (uint256 _priceUpdateCoolDown) {
		return priceUpdateCoolDown;
	}

	function getNumOfPrices() public view returns (uint256 _numOfPrices) {
		return numOfPrices;
	}
	function getLastPreResetBlockNo() public view returns (uint256 _lastPreResetBlockNo) {
		return lastPreResetBlockNo;
	}

	function getNextResetAddrIndex() public view returns (uint256 _nextResetAddrIndex) {
		return nextResetAddrIndex;
	}

}