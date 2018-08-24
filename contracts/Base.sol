pragma solidity ^0.4.24;

contract Base {

	uint constant decimals = 18;
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;

	uint lastOperationTime;
	uint operationCoolDown = 1 hours;
	

	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) existingUsers;

	
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

	function getNowTimestamp() internal view returns (uint) {
		return now;
	}

	function totalUsers() public view returns (uint) {
		return users.length;
	}

}