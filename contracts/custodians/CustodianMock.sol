pragma solidity ^0.4.24;

import { Custodian } from "./Custodian.sol";

contract CustodianMock is Custodian {

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

	function mintTokens(address addr, uint index, uint amount) public {
		balanceOf[index][addr] += amount;
		checkUser(addr, balanceOf[0][addr], balanceOf[1][addr]);
	}

	function getExistingUser(address addr) public view returns (uint) {
		return existingUsers[addr];
	}

	function addEthFeeBalance(uint amtInWei) public payable returns (bool) {
		ethFeeBalanceInWei += amtInWei;
		// address(this).transfer(amtInWei);
		return true;
	}

}