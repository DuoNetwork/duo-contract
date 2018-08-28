pragma solidity ^0.4.24;
import { IPool } from "../interfaces/IPool.sol";

contract Managed {
	IPool pool;
	address public poolAddress;
	address public operator;
	uint public lastOperationTime;
	uint public operationCoolDown = 1 hours;
	uint constant BP_DENOMINATOR = 10000;

	event UpdatePool(address newPoolAddress);
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

	function updatePool(address newPoolAddr) only(pool.poolManager()) inUpdateWindow() public returns (bool) {
		poolAddress = newPoolAddr;
		pool = IPool(poolAddress);
		require(pool.poolManager() != 0x0);
		emit UpdatePool(newPoolAddr);
		return true;
	}

	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
}