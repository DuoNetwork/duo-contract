pragma solidity ^0.4.24;
import { Custodian } from "./Custodian.sol";

contract Admin {
	address public operator;
	address public feeCollector;
	address public priceFeed1; 
	address public priceFeed2; 
	address public priceFeed3;
	address public poolManager;
	Custodian custodianContract;

	// address pool for allocation
	address[] public addrPool =[
		0x415DE7Edfe2c9bBF8449e33Ff88c9be698483CC0,
		0xd066FbAc54838c1d3c3113fc4390B9F99fEb7678,
		0xB0f396d1fba9a5C699695B69337635Fad6547B13,
		0x290FC07db2BF4b385987059E919B78898941102e,
		0x06C59e1aD2299EA99631850291021eda772715eb,
		0xd34d743B5bfDF21e0D8829f0eEA52cC493628610
	];
	mapping(address => uint) public addrStatus;

	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	
	uint public adminCoolDown = 1 hours;
	uint public lastAdminTime;
	bool public started = false;

	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier inAddrPool() {
		require(addrStatus[msg.sender] == 1);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		require(currentTime - lastAdminTime > adminCoolDown);
		_;
		lastAdminTime = currentTime;
	}

	// admin events
	event AddAddress(address added1, address added2, address newPoolManager);
	event UpdateAddress(address current, address newAddr);
	event RemoveAddress(address addr, address newPoolManager);
	
	constructor(
		address feeAddress, 
		address pf1,
		address pf2,
		address pf3,
		address poolMng) 
		public 
	{
		for (uint i = 0; i < addrPool.length; i++) {
			addrStatus[addrPool[i]] = 1;
		}
		poolManager = poolMng;
		addrStatus[poolManager] = 2;
		operator = msg.sender;
		addrStatus[operator] = 2;
		feeCollector = feeAddress;
		addrStatus[feeCollector] = 2;
		priceFeed1 = pf1;
		addrStatus[priceFeed1] = 2;
		priceFeed2 = pf2;
		addrStatus[priceFeed2] = 2;
		priceFeed3 = pf3;
		addrStatus[priceFeed3] = 2;
	}

	function startAdmin(address custodianAddr) public only(operator) inUpdateWindow() returns (bool success) 
	{
		require(!started);
		custodianContract = Custodian(custodianAddr);
		started = true;
		return true;
	}

	function addAddress(address addr1, address addr2) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2);
		uint index = getNextAddrIndex();
		poolManager = addrPool[index];
		removeFromPool(index);
		addrPool.push(addr1);
		addrStatus[addr1] = 1;
		addrPool.push(addr2);
		addrStatus[addr2] = 1;
		emit AddAddress(addr1, addr2, poolManager);
		return true;
	}

	function removeAddress(address addr) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(addrPool.length > 3 && addrStatus[addr] == 1);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == addr) {
				removeFromPool(i);
				break;
            }
		}
		uint index = getNextAddrIndex();
		poolManager = addrPool[index];
		removeFromPool(index);
		emit RemoveAddress(addr, poolManager);
		return true;
	}

	function updateAddress(address current) public inAddrPool() inUpdateWindow() returns (bool success) {
		require(addrPool.length > 3);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == msg.sender) {
				removeFromPool(i);
				break;
            }
		}
		uint index = getNextAddrIndex();
		address addr = addrPool[index];
		removeFromPool(index);

		if (current == priceFeed1) {
			priceFeed1 = addr;
		} else if (current == priceFeed2) {
			priceFeed2 = addr;
		} else if (current == priceFeed3) {
			priceFeed3 = addr;
		} else if (current == feeCollector) {
			feeCollector = addr;
		} else if (current == operator) {
			operator = addr;
		} else {
			revert();
		}
		emit UpdateAddress(current, addr);
		return true;
	}

	function removeFromPool(uint idx) internal {
		addrStatus[addrPool[idx]] = 2;
		if (idx < addrPool.length - 1)
			addrPool[idx] = addrPool[addrPool.length-1];
		delete addrPool[addrPool.length - 1];
		addrPool.length--;
	}

	function getNextAddrIndex() internal view returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		uint userLength = custodianContract.totalUsers();
		if(userLength > 255) {
			address randomUserAddress = custodianContract.users(prevHashNumber % userLength);
			return uint256(keccak256(abi.encodePacked(randomUserAddress))) % addrPool.length;
		} else {
			return prevHashNumber % addrPool.length;
		}
	}

	// end of admin functions
	// start of internal utility functions


	function getNowTimestamp() internal view returns (uint) {
		return now;
	}

	// end of internal utility functions
}