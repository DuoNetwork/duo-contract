pragma solidity ^0.4.24;
import { ICustodian } from "../interfaces/ICustodian.sol";


/// @title MultiSigRoleManager - coordinate multiple custodians, oracles and other contracts.
/// @author duo.network
contract MultiSigRoleManager {

	/*
     * Constants
     */
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	uint constant MIN_POOL_SIZE = 5;
	uint constant VOTE_TIME_OUT = 2 hours;
	enum VotingStage {
        NotStarted,
		Moderator,
		Contract
    }
	/*
     * Storage
     */
	VotingStage votingStage;
	address public moderator;
	// 0 is cold
	// 1 is hot
	address[][] public addrPool =[   
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
	// 0 is new address
	// 1 in cold pool
	// 2 in hot pool
	// 3 is used
	mapping(address => uint) public addrStatus; 
	address[] public custodianPool;
	mapping(address => bool) public existingCustodians;
	address[] public otherContractPool;
	mapping(address => bool) public existingOtherContracts;
	uint public operatorCoolDown = 1 hours;
	uint public lastOperationTime;
	bool public started;

	address public candidate;
	mapping(address => bool) public passedContract;
	mapping(address => bool) public voted;
	uint public votedFor;
	uint public votedAgainst;
	uint public voteStartTimestamp;

	/*
     *  Modifiers
     */
	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier inColdAddrPool() {
		require(addrStatus[msg.sender] == 1);
		_;
	}

	modifier inHotAddrPool() {
		require(addrStatus[msg.sender] == 2);
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

	modifier inVotingStage(VotingStage _stage) {
		require(votingStage == _stage);
		_;
	}

	modifier allowedToVote() {
		address voter = msg.sender;
		require(!voted[voter] && addrStatus[voter] == 1);
		_;
	}

	/*
     *  Events
     */
	event AddAddress(uint poolIndex, address added1, address added2, address newPoolManager);
	event ProvideAddress(uint poolIndex, address requestor, address origin, address addr);
	event RemoveAddress(uint poolIndex, address addr, address newPoolManager);
	event AddCustodian(address newCustodianAddr, address newPoolManager);
	event AddOtherContract(address newContractAddr, address newPoolManager);
	
	/*
     * Constructor
     */
	/// @dev Contract constructor sets operation cool down and set address pool status.
	/// @param optCoolDown operation cool down time.
	constructor(uint optCoolDown) public 
	{	
		votingStage = VotingStage.NotStarted;
		moderator = msg.sender;
		for (uint i = 0; i < addrPool[0].length; i++) 
			addrStatus[addrPool[0][i]] = 1;
		for (i = 0; i < addrPool[1].length; i++) 
			addrStatus[addrPool[1][i]] = 2;
		addrStatus[moderator] = 3;
		operatorCoolDown = optCoolDown;
	}

	/*
     * MultiSig Management
     */
	/// @dev proposeNewManagerContract function.
	/// @param addr new manager contract address proposed.
	function startContractVoting(address addr) 
		public 
		only(moderator) 
		inVotingStage(VotingStage.NotStarted) 
	returns (bool) {
		require(addrStatus[addr] == 0 );
		candidate = addr;
		addrStatus[addr] = 3;
		votingStage = VotingStage.Contract;
		replaceModerator();
		startVoting();
		return true;
	}

	/// @dev terminateVoting function.
	function terminateContractVoting() 
		public 
		only(moderator) 
		inVotingStage(VotingStage.Contract) 
	returns (bool) {
		votingStage = VotingStage.NotStarted;
		replaceModerator();
		return true;
	}

	function terminateByTimeout() public returns (bool) {
		require(votingStage != VotingStage.NotStarted);
		uint nowTimestamp = getNowTimestamp();
		if (nowTimestamp > voteStartTimestamp && nowTimestamp - voteStartTimestamp > VOTE_TIME_OUT) {
			votingStage = VotingStage.NotStarted;
			return true;
		} else
			return false;
	}

	/// @dev proposeNewModerator function.
	/// @param addr new moderator address proposed.
	function startModeratorVoting() public inColdAddrPool() returns (bool) {
		candidate = msg.sender;
		votingStage = VotingStage.Moderator;
		removeFromPoolByAddr(0, candidate);
		startVoting();
		return true;
	}

	/// @dev proposeNewModerator function.
	/// @param addr new moderator address proposed.
	function vote(bool voteFor) public allowedToVote() returns (bool) {
		address voter = msg.sender;
		if (voteFor)
			votedFor += 1;
		else
			votedAgainst += 1;
		voted[voter] = true;
		uint threshold = addrPool[0].length / 2;
		if (votedFor > threshold || votedAgainst > threshold) {
			if (votingStage == VotingStage.Contract) 
				passedContract[candidate] = true;
			else 
				moderator = candidate;
			votingStage = VotingStage.NotStarted;
		}
		return true;
	}

	/*
     * Moderator Public functions
     */
	/// @dev start roleManagerContract.
	function startRoleManager() public only(moderator) returns (bool) {
		require(!started);
		started = true;
		return true;
	}

	/// @dev addCustodian function.
	/// @param custodianAddr custodian address to add.
	function addCustodian(
		address custodianAddr
		) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		require(!existingCustodians[custodianAddr]);
		ICustodian custodian = ICustodian(custodianAddr);
		require(custodian.totalUser() >= 0);
		custodian.users(0);
		uint custodianLength = custodianPool.length;
		if (custodianLength > 0) 
			replaceModerator();
		else {
			uint index = getNextAddrIndex(0, custodianAddr);
			moderator = addrPool[0][index];
			removeFromPool(0, index);
		}
		
		existingCustodians[custodianAddr] = true;
		custodianPool.push(custodianAddr);
		emit AddCustodian(custodianAddr, moderator);
		return true;
	}

	/// @dev addOtherContracts function.
	/// @param contractAddr other contract address to add.
	function addOtherContracts(
		address contractAddr
		) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		uint custodianLength = custodianPool.length;
		require(!existingOtherContracts[contractAddr]);		
		existingOtherContracts[contractAddr] = true;
		otherContractPool.push(contractAddr);
		replaceModerator();
		emit AddOtherContract(contractAddr, moderator);
		return true;
	}

	/// @dev add two addreess into pool function.
	/// @param addr1 the first address
	/// @param addr2 the second address.
	/// @param poolIndex indicate adding to hot or cold.
	function addAddress(address addr1, address addr2, uint poolIndex) public only(moderator) inUpdateWindow() returns (bool success) {
		require(addrStatus[addr1] == 0 && addrStatus[addr2] == 0 && addr1 != addr2 && poolIndex < 2);
		replaceModerator();
		addrPool[poolIndex].push(addr1);
		addrStatus[addr1] = poolIndex + 1;
		addrPool[poolIndex].push(addr2);
		addrStatus[addr2] = poolIndex + 1;
		emit AddAddress(poolIndex, addr1, addr2, moderator);
		return true;
	}

	/// @dev removeAddress function.
	/// @param addr the address to remove from
	/// @param poolIndex the pool to remove from.
	function removeAddress(address addr, uint poolIndex) public only(moderator) inUpdateWindow() returns (bool success) {
		require(addrPool[poolIndex].length > MIN_POOL_SIZE && addrStatus[addr] == poolIndex + 1 && poolIndex < 2);
		removeFromPoolByAddr(poolIndex, addr);
		replaceModerator();
		emit RemoveAddress(poolIndex, addr, moderator);
		return true;
	}

	/// @dev provide address to other contracts, such as custodian, oracle and others.
	/// @param origin the origin who makes request
	/// @param poolIndex the pool to request address from.
	function provideAddress(address origin, uint poolIndex) public isValidRequestor(origin) inUpdateWindow() returns (address) {
		require(addrPool[poolIndex].length > MIN_POOL_SIZE && poolIndex < 2);
		removeFromPoolByAddr(0, origin);
		address requestor = msg.sender;
		uint index = 0;
		// is custodian
		if (existingCustodians[requestor])
			index = getNextAddrIndex(poolIndex, requestor);
		else // is other contract;
			index = getNextAddrIndex(poolIndex, custodianPool[custodianPool.length - 1]);
		address addr = addrPool[poolIndex][index];
		removeFromPool(poolIndex, index);

		emit ProvideAddress(poolIndex, requestor, origin, addr);
		return addr;
	}

	/*
     * Internal functions
     */
	 
	function startVoting() internal {
		address[] memory coldPool = addrPool[0];
		for (uint i = 0; i < coldPool.length; i++) 
			voted[coldPool[i]] = false;
		votedFor = 0;
		votedAgainst = 0;
		voteStartTimestamp = getNowTimestamp();
	}
	
	function replaceModerator() internal {
		require(custodianPool.length > 0);
		uint index = getNextAddrIndex(0, custodianPool[custodianPool.length - 1]);
		moderator = addrPool[0][index];
		removeFromPool(0, index);
	}

	 /// @dev removeFromPool Function.
	/// @param poolIndex the pool to request from removal.
	/// @param idx the index of address to remove
	function removeFromPoolByAddr(uint poolIndex, address addr) internal {
	 	address[] memory subPool = addrPool[poolIndex];
		for (uint i = 0; i < subPool.length; i++) {
			if (subPool[i] == addr) {
				removeFromPool(poolIndex, i);
				break;
            }
		}
	}

	/// @dev removeFromPool Function.
	/// @param poolIndex the pool to request from removal.
	/// @param idx the index of address to remove
	function removeFromPool(uint poolIndex, uint idx) internal {
	 	address[] memory subPool = addrPool[poolIndex];
		addrStatus[subPool[idx]] = 3;
		if (idx < subPool.length - 1)
			addrPool[poolIndex][idx] = addrPool[poolIndex][subPool.length-1];
		delete addrPool[poolIndex][subPool.length - 1];
		addrPool[poolIndex].length--;
	}

	/// @dev getNextAddrIndex Function.
	/// @param poolIndex the pool to request address from.
	/// @param custodianAddr the index of custodian contract address for randomeness generation
	function getNextAddrIndex(uint poolIndex, address custodianAddr) internal returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		ICustodian custodian = ICustodian(custodianAddr);
		uint userLength = custodian.totalUser();
		if(userLength > 255) {
			address randomUserAddress = custodian.users(prevHashNumber % userLength);
			return uint256(keccak256(abi.encodePacked(randomUserAddress))) % addrPool[poolIndex].length;
		} else 
			return prevHashNumber % addrPool[poolIndex].length;
	}

	/// @dev get Ethereum blockchain current timestamp
	function getNowTimestamp() internal view returns (uint) {
		return now;
	}
}