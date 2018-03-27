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



	function getPriceFeedTolInBP() public view returns (uint256 _priceFeedTolInBP) {
		return priceFeedTolInBP;
	}

	function getFeeAccumulatedInWei() public view returns (uint256 _feeAccumulatedInWei) {
		return feeAccumulatedInWei;
	}

}