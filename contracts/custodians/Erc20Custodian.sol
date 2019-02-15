pragma solidity ^0.5.0;
import { Custodian } from "./Custodian.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title Erc20Custodian - every derivative contract should has basic custodian properties
/// @author duo.network
contract Erc20Custodian is Custodian {

	IERC20 collateralToken;
	address public collateralTokenAddress;

	uint tokenCollateralInWei;

	/*
     * Constructor
     */
	constructor(
		string memory code,
		address collateralTokenAddr,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint comm,
		uint pd,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint preResetWaitBlk,
		uint minimumBalance
		) 
		public 
		Custodian ( 
		code,
		maturity,
		roleManagerAddr,
		fc,
		comm,
		pd,
		preResetWaitBlk, 
		pxFetchCoolDown,
		msg.sender,
		optCoolDown,
		minimumBalance
		)
	{
		collateralTokenAddress = collateralTokenAddr;
		collateralToken = IERC20(collateralTokenAddr);
	}

	function tokenFeeBalanceInWei() public returns(uint) {
		return collateralToken.balanceOf(address(this)).sub(tokenCollateralInWei);
	}

	/*
     * Operation Functions
     */
	function collectFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint feeBalance = tokenFeeBalanceInWei().sub(amountInWei);
		collateralToken.transfer(feeCollector, amountInWei);
		emit CollectFee(feeCollector, amountInWei, feeBalance);
		return true;
	}
}