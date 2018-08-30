pragma solidity ^0.4.24;
import { ICustodian } from "../interfaces/ICustodian.sol";


/// @title MultiSigRoleManager - coordinate multiple custodians, oracles and other contracs.
/// @author duo.network
contract MultiSigRoleManager {

	/*
     * Constants
     */
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	uint constant MIN_POOL_SIZE = 5;
	
	/*
     * Storage
     */
	VotingStatus votingStatus;
	address public moderator;
	address public proposedNewRoleManagerAddrdess;
	address[][] public hotColdPool =[   // 0 is hotPool; 1 is ColdPool
		[
			0x415DE7Edfe2c9bBF8449e33Ff88c9be698483CC0,
			0xd066FbAc54838c1d3c3113fc4390B9F99fEb7678,
			0xB0f396d1fba9a5C699695B69337635Fad6547B13,
			0x290FC07db2BF4b385987059E919B78898941102e,
			0x06C59e1aD2299EA99631850291021eda772715eb,
			0xd34d743B5bfDF21e0D8829f0eEA52cC493628610
		],
		[
			0xF4463762f1F00E91Bd58619dB6C9EAC470182886,
			0x9A5510a050f6148391F7Df357506A929723e74cE,
			0xEbaBD24F323dCE0B94E094A43b698ED1F43A618D,
			0x4871c7A6bD3545762c4b1b9edefE40Cf3901DC67,
			0x7640CeD84F07FAF1C1b972Ea4bb7caCBa0bC7D1f,
			0xbC71F5Fb6434b18ED98FBbEdd4FE34658775ccC9
		]
	];
	mapping(address => uint) public addrStatus; // 1 in pool; 2 is used address; 0 is new address
	address[] public custodianPool;
	mapping(address => bool) public existingCustodians;
	address[] public otherContractPool;
	uint public operatorCoolDown = 1 hours;
	uint public lastOperationTime;
	bool public started;

	enum VotingStatus {
        NotInVoting,
		VotingInProcess,
		VotingCompleted
    }
	mapping(address => bool) public existingOtherContracts;
	mapping(address => uint) public votingCounts;
	mapping(address => mapping(address => bool)) hasVoted;
	// mapping(address => VotingState) public votingStatus;
	mapping(address => mapping(address=> bool)) hasProposed;

	/*
     *  Modifiers
     */
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

	modifier inVotingStatus(VotingStatus _status) {
		require(votingStatus == _status);
		_;
	}

	modifier allowedToVote(address candidateAddr, address voterAddr) {
		require(voterAddr != moderator && !hasVoted[candidateAddr][voterAddr]);
		_;
	}

	modifier inColdPool(address addr) {
		bool inPool = false;
		for(uint i = 0; i < hotColdPool[1].length; i++ ){
			if(addr == hotColdPool[1][i]) {
				inPool = true;
			}
		}
		require(inPool);
		_;
	}

	/*
     *  Events
     */
	event AddAddress(address added1, address added2, uint indexColdHot, address newPoolManager);
	event ProvideAddress(address requestor, address origin, address addr, uint indexColdHot);
	event RemoveAddress(address addr, uint indexColdHot, address newPoolManager);
	event AddCustodian(address newCustodianAddr, address newPoolManager);
	event AddOtherContract(address newContractAddr, address newPoolManager);
	
	/*
     * Constructor
     */
	/// @dev Contract constructor sets operation cool down and set address pool status.
	/// @param optCoolDown operation cool down time.
	constructor(
		uint optCoolDown
	) public 
	{	
		votingStatus = VotingStatus.NotInVoting;
		moderator = msg.sender;
		for (uint i = 0; i < hotColdPool.length; i++) {
			for (uint j = 0; j < hotColdPool[i].length; j++) {
				hotColdPool[i][j] = 1;
			}
		}
		addrStatus[moderator] = 2;
		operatorCoolDown = optCoolDown;
	}

	/*
     * MultiSig Management
     */
	/// @dev proposeNewManagerContract function.
	/// @param addr new manager contract address proposed.
	function proposeNewManagerContract(address addr) public only(moderator) 
	inVotingStatus(VotingStatus.NotInVoting) 
	returns (bool) {
		require(addrStatus[addr] == 0);
		proposedNewRoleManagerAddrdess = addr;
		votingStatus = VotingStatus.VotingInProcess;
		addrStatus[addr] =2;
		return true;
	}

	/// @dev terminateVoting function.
	function terminateVoting() public only(moderator) inVotingStatus(VotingStatus.VotingInProcess) 
	returns (bool) {
		votingStatus = VotingStatus.NotInVoting;
		votingCounts[proposedNewRoleManagerAddrdess] = 0;
		proposedNewRoleManagerAddrdess = 0x0;
		return true;
	}

	/// @dev voteNewManagerContract function.
	function voteNewManagerContract() public only(moderator) 
	inVotingStatus(VotingStatus.VotingInProcess) 
	allowedToVote(proposedNewRoleManagerAddrdess, msg.sender)
	inColdPool(msg.sender)
	returns (bool) {
		votingCounts[proposedNewRoleManagerAddrdess] += 1;
		hasVoted[proposedNewRoleManagerAddrdess][msg.sender] = true;
		if(votingCounts[proposedNewRoleManagerAddrdess] > hotColdPool[1].length / 2){
			votingStatus = VotingStatus.VotingCompleted;
		}
		return true;
	}

	/// @dev proposeNewModerator function.
	/// @param addr new moderator address proposed.
	function proposeNewModerator(address addr) public inColdPool(msg.sender) inColdPool(addr) returns (bool) {
		require(addr != msg.sender);
		for (uint i = 0; i < hotColdPool[1].length; i++) {
			if (hotColdPool[1][i] == addr) {
				removeFromPool(1, i);
				break;
            }
		}
		addrStatus[addr] =2;
		return true;
	}

	/// @dev proposeNewModerator function.
	/// @param addr new moderator address proposed.
	function voteForModerator(address addr) public allowedToVote(addr, msg.sender) 
	inColdPool(msg.sender) returns (bool) {
		address voter = msg.sender;
		require(addr != voter);
		votingCounts[addr] += 1;
		hasVoted[addr][voter] = true;
		if(votingCounts[addr] > hotColdPool[1].length / 2){
			moderator = addr;
		}
		return true;
	}

	/*
     * Moderator Public functions
     */
	/// @dev start roleManagerContract.
	function startRoleManagerContract() public only(moderator) returns (bool) {
		require(!started);
		started = true;
		return true;
	}

	/// @dev addCustodian function.
	/// @param custodianAddr custodian address to add.
	function addCustodian(address custodianAddr) public only(moderator) inUpdateWindow() returns (bool success) {
		require(!existingCustodians[custodianAddr]);
		uint custodianLength = custodianPool.length;
		uint index = 0;
		if (custodianLength > 0) {
			index = getNextAddrIndex(1, custodianPool[custodianLength - 1]);
		} else 
			index = getNextAddrIndex(1, custodianAddr);
		existingCustodians[custodianAddr] = true;
		custodianPool.push(custodianAddr);
		moderator = hotColdPool[1][index];
		removeFromPool(1, index);
		emit AddCustodian(custodianAddr, moderator);
		return true;
	}

	/// @dev addOtherContracts function.
	/// @param contractAddr other contract address to add.
	function addOtherContracts(address contractAddr) public only(moderator) inUpdateWindow() returns (bool success) {
		uint custodianLength = custodianPool.length;
		require(!existingOtherContracts[contractAddr] && custodianLength > 0);
		uint index = getNextAddrIndex(1, custodianPool[custodianLength - 1]);
		existingOtherContracts[contractAddr] = true;
		otherContractPool.push(contractAddr);
		moderator = hotColdPool[1][index];
		removeFromPool(1, index);
		emit AddOtherContract(contractAddr, moderator);
		return true;
	}

	/// @dev add two addreess into pool function.
	/// @param addr1 the first address
	/// @param addr2 the second address.
	/// @param indexColdHot indicate adding to hot or cold.
	function addAddress(address addr1, address addr2, uint indexColdHot) public only(moderator) inUpdateWindow() returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2 && custodianPool.length > 0);
		uint custodianLength = custodianPool.length;
		uint index = getNextAddrIndex(1, custodianPool[custodianLength - 1]);
		moderator = hotColdPool[1][index];
		removeFromPool(1, index);
		hotColdPool[indexColdHot].push(addr1);
		addrStatus[addr1] = 1;
		hotColdPool[indexColdHot].push(addr2);
		addrStatus[addr2] = 1;
		emit AddAddress(addr1, addr2, indexColdHot, moderator);
		return true;
	}

	/// @dev removeAddress function.
	/// @param addr the address to remove from
	/// @param indexColdHot the pool to remove from.
	function removeAddress(address addr, uint indexColdHot) public only(moderator) inUpdateWindow() returns (bool success) {
		require(hotColdPool[indexColdHot].length > MIN_POOL_SIZE && addrStatus[addr] == 1 && custodianPool.length > 0);
		for (uint i = 0; i < hotColdPool[indexColdHot].length; i++) {
			if (hotColdPool[indexColdHot][i] == addr) {
				removeFromPool(indexColdHot, i);
				break;
            }
		}
		uint custodianLength = custodianPool.length;
		uint index = getNextAddrIndex(1, custodianPool[custodianLength - 1]);
		moderator = hotColdPool[1][index];
		removeFromPool(1, index);
		emit RemoveAddress(addr, indexColdHot, moderator);
		return true;
	}

	/// @dev provide address to other contracts, such as custodian, oracle and others.
	/// @param origin the origin who makes request
	/// @param indexColdHot the pool to request address from.
	function provideAddress(address origin, uint indexColdHot) public isValidRequestor(origin) inUpdateWindow() returns (address) {
		require(hotColdPool[indexColdHot].length > MIN_POOL_SIZE && custodianPool.length > 0);
		for (uint i = 0; i < hotColdPool[indexColdHot].length; i++) {
			if (hotColdPool[indexColdHot][i] == origin) {
				removeFromPool(indexColdHot, i);
				break;
            }
		}
		address requestor = msg.sender;
		uint index = 0;
		// is custodian
		if (existingCustodians[requestor])
			index = getNextAddrIndex(indexColdHot, requestor);
		// is other contract;
		else 
			index = getNextAddrIndex(indexColdHot, custodianPool[custodianPool.length - 1]);
		address addr = hotColdPool[indexColdHot][index];
		removeFromPool(indexColdHot, index);

		emit ProvideAddress(requestor, origin, addr, indexColdHot);
		return addr;
	}

	/*
     * Internal functions
     */
	/// @dev removeFromPool Function.
	/// @param indexColdHot the pool to request from removal.
	/// @param idx the index of address to remove
	function removeFromPool(uint indexColdHot, uint idx) internal {
	 	address[] memory subPool = hotColdPool[indexColdHot];
		addrStatus[subPool[idx]] = 2;
		if (idx < subPool.length - 1)
			hotColdPool[indexColdHot][idx] = hotColdPool[indexColdHot][subPool.length-1];
		delete hotColdPool[indexColdHot][subPool.length - 1];
		hotColdPool[indexColdHot].length--;
	}

	/// @dev getNextAddrIndex Function.
	/// @param indexColdHot the pool to request address from.
	/// @param custodianAddr the index of custodian contract address for randomeness generation
	function getNextAddrIndex(uint indexColdHot, address custodianAddr) internal returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		ICustodian custodian = ICustodian(custodianAddr);
		uint userLength = custodian.totalUser();
		if(userLength > 255) {
			address randomUserAddress = custodian.users(prevHashNumber % userLength);
			return uint256(keccak256(abi.encodePacked(randomUserAddress))) % hotColdPool[indexColdHot].length;
		} else {
			return prevHashNumber % hotColdPool[indexColdHot].length;
		}
	}

	/// @dev get Ethereum blockchain current timestamp
	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
}