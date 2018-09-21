pragma solidity ^0.4.24;

import { Custodian } from "./Custodian.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract CustodianMock is Custodian {
	uint public timestamp = now;
	address public roleManagerAddr;
	// uint public ethFeeBalanceInWei;

	constructor(
		address duoTokenAddr,
		address poolAddr,
		address fc,
		uint comm,
		uint pd,
		uint preResetWaitBlk, 
		uint pxFetchCoolDown,
		address opt,
		uint optCoolDown
	) Custodian (
		duoTokenAddr,
		poolAddr,
		fc,
		comm,
		pd,
		preResetWaitBlk, 
		pxFetchCoolDown,
		opt,
		optCoolDown
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

	function() public payable {}

	function mintTokens(address addr, uint index, uint amount) public {
		balanceOf[index][addr] += amount;
		checkUser(addr, balanceOf[0][addr], balanceOf[1][addr]);
	}

	function addUsers(address addr) public {
		users.push(addr);
	}

	function getExistingUser(address addr) public view returns (uint) {
		return existingUsers[addr];
	}

	// function addEthFeeBalance(uint amtInWei) public payable returns (bool) {
	// 	// ethFeeBalanceInWei = address(this).balance.sub(ethCollateralInWei) + amtInWei;
	// 	address(this).balance = address(this).balance.add(amtInWei);
	// 	return true;
	// }

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

}