pragma solidity ^0.5.0;

import { Erc20Custodian } from "../custodians/Erc20Custodian.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract Erc20CustodianMock is Erc20Custodian {
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
	) Erc20Custodian (
		code,
		collateralTokenAddr,
		maturity,
		roleManagerAddr,
		fc,
		comm,
		pd,
		optCoolDown,
		pxFetchCoolDown,
		preResetWaitBlk,
		minimumBalance
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

	function getStates() public returns (uint[18] memory) {
		return [
			// managed
			lastOperationTime,
			operationCoolDown,
			// custodian
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
			tokenFeeBalanceInWei()
		];
	}

	function getAddresses() public view returns (address[7] memory) {
		return [
			// managed
			roleManagerAddress,
			operator,
			// custodian
			feeCollector,
			oracleAddress,
			aTokenAddress,
			bTokenAddress,
			collateralTokenAddress
		];
	}
}