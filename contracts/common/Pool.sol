pragma solidity ^0.4.24;
import { ICustodian } from "../interfaces/ICustodian.sol";
import { IPool } from "../interfaces/IPool.sol";

contract Pool {
	address public poolManager;

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
	address[] public custodianPool;
	mapping(address => bool) public existingCustodians;
	address[] public otherContractPool;
	mapping(address => bool) public existingOtherContracts;

	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	
	uint public operatorCoolDown = 1 hours;
	uint public lastOperationTime;
	bool public started;

	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier inAddrPool() {
		require(addrStatus[msg.sender] == 1);
		_;
	}

	modifier isValidRequestor(address origin) {
		require((existingCustodians[msg.sender] || existingOtherContracts[msg.sender]) && addrStatus[origin] == 1);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		if (started)
			require(currentTime - lastOperationTime > operatorCoolDown);
		_;
		lastOperationTime = currentTime;
	}

	// admin events
	event AddAddress(address added1, address added2, address newPoolManager);
	event ProvideAddress(address requestor, address origin, address addr);
	event RemoveAddress(address addr, address newPoolManager);
	event AddCustodian(address newCustodianAddr, address newPoolManager);
	event AddOtherContract(address newContractAddr, address newPoolManager);
	
	constructor(
		uint optCoolDown
	) public 
	{
		for (uint i = 0; i < addrPool.length; i++) {
			addrStatus[addrPool[i]] = 1;
		}
		poolManager = msg.sender;
		addrStatus[poolManager] = 2;
		operatorCoolDown = optCoolDown;
	}

	function startPool() public only(poolManager) returns (bool) {
		require(!started);
		started = true;
		return true;
	}


	// start of operation function
	function addCustodian(address custodianAddr) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(!existingCustodians[custodianAddr]);
		uint custodianLength = custodianPool.length;
		uint index = 0;
		if (custodianLength > 0) {
			index = getNextAddrIndex(custodianPool[custodianLength - 1]);
		} else 
			index = getNextAddrIndex(custodianAddr);
		existingCustodians[custodianAddr] = true;
		custodianPool.push(custodianAddr);
		poolManager = addrPool[index];
		removeFromPool(index);
		emit AddCustodian(custodianAddr, poolManager);
		return true;
	}

	function addOtherContracts(address contractAddr) public only(poolManager) inUpdateWindow() returns (bool success) {
		uint custodianLength = custodianPool.length;
		require(!existingOtherContracts[contractAddr] && custodianLength > 0);
		uint index = getNextAddrIndex(custodianPool[custodianLength - 1]);
		existingOtherContracts[contractAddr] = true;
		otherContractPool.push(contractAddr);
		poolManager = addrPool[index];
		removeFromPool(index);
		emit AddOtherContract(contractAddr, poolManager);
		return true;
	}

	function addAddress(address addr1, address addr2) public only(poolManager) inUpdateWindow() returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2 && custodianPool.length > 0);
		uint custodianLength = custodianPool.length;
		uint index = getNextAddrIndex(custodianPool[custodianLength - 1]);
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
		require(addrPool.length > 3 && addrStatus[addr] == 1 && custodianPool.length > 0);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == addr) {
				removeFromPool(i);
				break;
            }
		}
		uint custodianLength = custodianPool.length;
		uint index = getNextAddrIndex(custodianPool[custodianLength - 1]);
		poolManager = addrPool[index];
		removeFromPool(index);
		emit RemoveAddress(addr, poolManager);
		return true;
	}

	function provideAddress(address origin) public isValidRequestor(origin) inUpdateWindow() returns (address) {
		require(addrPool.length > 3 && custodianPool.length > 0);
		for (uint i = 0; i < addrPool.length; i++) {
			if (addrPool[i] == origin) {
				removeFromPool(i);
				break;
            }
		}
		address requestor = msg.sender;
		uint index = 0;
		// is custodian
		if (existingCustodians[requestor])
			index = getNextAddrIndex(requestor);
		// is other contract;
		else 
			index = getNextAddrIndex(custodianPool[custodianPool.length - 1]);
		address addr = addrPool[index];
		removeFromPool(index);

		emit ProvideAddress(requestor, origin, addr);
		return addr;
	}

	function removeFromPool(uint idx) internal {
		addrStatus[addrPool[idx]] = 2;
		if (idx < addrPool.length - 1)
			addrPool[idx] = addrPool[addrPool.length-1];
		delete addrPool[addrPool.length - 1];
		addrPool.length--;
	}

	function getNextAddrIndex(address custodianAddr) internal returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		ICustodian custodian = ICustodian(custodianAddr);
		uint userLength = custodian.totalUser();
		if(userLength > 255) {
			address randomUserAddress = custodian.users(prevHashNumber % userLength);
			return uint256(keccak256(abi.encodePacked(randomUserAddress))) % addrPool.length;
		} else {
			return prevHashNumber % addrPool.length;
		}
	}
	// end of operation function

	// start of internal utility functions
	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
	// end of internal utility functions
}