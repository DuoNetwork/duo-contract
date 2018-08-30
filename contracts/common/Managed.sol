pragma solidity ^0.4.24;
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";

contract Managed {
	IMultiSigManager roleManager;
	address public roleManagerAddress;
	address public operator;
	uint public lastOperationTime;
	uint public operationCoolDown;
	uint constant BP_DENOMINATOR = 10000;

	event UpdateRoleManager(address newManagerAddress);
	event UpdateOperator(address updater, address newOperator);

	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		require(currentTime - lastOperationTime > operationCoolDown);
		_;
		lastOperationTime = currentTime;
	}

	constructor(
		address roleManagerAddr,
		address opt, 
		uint optCoolDown
	) public {
		roleManagerAddress = roleManagerAddr;
		roleManager = IMultiSigManager(roleManagerAddr);
		operator = opt;
		operationCoolDown = optCoolDown;
	}

	function updateRoleManager(address newManagerAddr) 
		inUpdateWindow() 
		public 
	returns (bool) {
		require(roleManager.passedContract(newManagerAddr));
		roleManagerAddress = newManagerAddr;
		roleManager = IMultiSigManager(roleManagerAddress);
		require(roleManager.moderator() != 0x0);
		emit UpdateRoleManager(newManagerAddr);
		return true;
	}

	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
}