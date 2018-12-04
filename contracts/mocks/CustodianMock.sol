pragma solidity ^0.5.1;

import { Custodian } from "../custodians/Custodian.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract CustodianMock is Custodian {
	uint public timestamp = now;
	address public roleManagerAddr;

	constructor(
		string memory name,
		uint maturity,
		address poolAddr,
		address payable fc,
		uint comm,
		uint pd,
		uint preResetWaitBlk, 
		uint pxFetchCoolDown,
		address opt,
		uint optCoolDown,
		uint minimumBalance
	) Custodian (
		name,
		maturity,
		poolAddr,
		fc,
		comm,
		pd,
		preResetWaitBlk, 
		pxFetchCoolDown,
		opt,
		optCoolDown,
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

	function() external payable {}

	function mintTokens(address addr, uint index, uint amount) public {
		balanceOf[index][addr] += amount;
		checkUser(addr, balanceOf[0][addr], balanceOf[1][addr]);
	}

	function addUsers(address addr) public {
		users.push(addr);
	}

	function batchAddUsers(address[] memory addrs) public {
		for(uint i = 0; i < addrs.length; i ++) {
			users.push(addrs[i]);
		}
	}

	function getExistingUser(address addr) public view returns (uint) {
		return existingUsers[addr];
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

	function setRoleManager(address rm) public returns(bool){
		roleManagerAddr = rm;
		return true;
	}

	function triggerProvideAddr(uint poolIndex) public returns (address) {
		return IMultiSigManager(roleManagerAddr).provideAddress(msg.sender, poolIndex);
	}

	function getStates() public view returns (uint[20] memory) {
		return [
			// managed
			lastOperationTime,
			operationCoolDown,
			// custodian
			uint(state),
			minBalance,
			ethCollateralInWei,
			navAInWei,
			navBInWei,
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
			feeBalanceInWei()
		];
	}

	function getAddresses() public view returns (address[6] memory) {
		return [
			// managed
			roleManagerAddress,
			operator,
			// custodian
			feeCollector,
			oracleAddress,
			aTokenAddress,
			bTokenAddress
		];
	}
}