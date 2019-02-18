pragma solidity ^0.5.0;

import { OptionCustodian } from "../custodians/OptionCustodian.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract OptionCustodianMock is OptionCustodian {
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
	) OptionCustodian (
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

	function setState(uint stateIdx) public {
		if(stateIdx == 0) {
			state = State.Inception;
		} else if(stateIdx == 1) {
			state = State.Trading;
		} else if(stateIdx == 2) {
			state = State.PreReset;
		} else if(stateIdx == 3) {
			state = State.Reset;
		}
	}

	function setTimestamp(uint ts) public {
		timestamp = ts;
	}

	function skipCooldown(uint numOfPeriods) public {
		timestamp = timestamp + (operationCoolDown * numOfPeriods);
	}

	function getNowTimestamp() internal view returns (uint) {
		return timestamp;
	}

	function getStates() public returns (uint[20] memory) {
		return [
			lastOperationTime,
			operationCoolDown,
			uint(state),
			minBalance,
			tokenCollateralInWei,
			lastPriceInWei,
			lastPriceTimeInSecond,
			resetPriceInWei,
			resetPriceTimeInSecond,
			createCommInBP,
			redeemCommInBP,
			period,
			maturityInSecond,
			preResetWaitingBlocks,
			priceFetchCoolDown,
			nextResetAddrIndex,
			totalUsers(),
			tokenFeeBalanceInWei(),
			clearCommInBP,
			iterationGasThreshold
		];
	}
}