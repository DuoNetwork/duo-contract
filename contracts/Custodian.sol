pragma solidity ^0.4.24;

contract Custodian {

	uint constant decimals = 18;
	uint constant WEI_DENOMINATOR = 1000000000000000000;

	address aTokenAddress;
	address bTokenAddress;
	uint public totalSupplyA;
	uint public totalSupplyB;
	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) existingUsers;

	function totalUsers() public view returns (uint) {
		return users.length;
	}
}