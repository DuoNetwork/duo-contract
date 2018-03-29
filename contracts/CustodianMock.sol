pragma solidity ^0.4.19;

import "./Custodian.sol";

contract CustodianMock is Custodian {

	function CustodianMock (
		uint ethPriceInWei, 
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
		uint gasThreshold
	) Custodian (
		ethPriceInWei, 
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
		gasThreshold

	) public {

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
	function getFirstPrice() public view returns (Price _firstPrice) {
		return firstPrice;
	}
	function getSecondPrice() public view returns (Price _secondPrice) {
		return secondPrice;
	}

	function getPriceFeedTolInBP() public view returns (uint256 _priceFeedTolInBP) {
		return priceFeedTolInBP;
	}

	function getPreResetWaitingBlocks() public view returns (uint256 _preResetWaitingBlocks) {
		return preResetWaitingBlocks;
	}

	function getPostResetWaitingBlocks() public view returns (uint256 _postResetWaitingBlocks) {
		return postResetWaitingBlocks;
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

	function getLastPostResetBlockNo() public view returns (uint256 _lastPostResetBlockNo) {
		return lastPostResetBlockNo;
	}

	function getNextResetAddrIndex() public view returns (uint256 _nextResetAddrIndex) {
		return nextResetAddrIndex;
	}

}