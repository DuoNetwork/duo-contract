pragma solidity ^0.4.24;
import { ICustodian } from "../interfaces/ICustodian.sol";


/// @title Esplanade - coordinate multiple custodians, oracles and other contracts.
/// @author duo.network
contract Esplanade {

	/*
     * Constants
     */
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;
	uint constant MIN_POOL_SIZE = 5;
	uint constant VOTE_TIME_OUT = 2 hours;
	uint constant COLD_POOL_IDX = 0;
	uint constant HOT_POOL_IDX = 1;
	uint constant NEW_STATUS = 0;
	uint constant IN_COLD_POOL_STATUS = 1;
	uint constant IN_HOT_POOL_STATUS = 2;
	uint constant USED_STATUS = 3;
	enum VotingStage {
        NotStarted,
		Moderator,
		Contract
    }
	/*
     * Storage
     */
	VotingStage public votingStage;
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
			0xd34d743B5bfDF21e0D8829f0eEA52cC493628610,
			0x2B6D101F5e6b4a577e7d053C168AF2AFc883EB9c,
			0x0A4b6c73CA03762bdA89292A498d231837997F56,
			0xb2518E8d6F0601696F1BA3a826951bc3Cf6d7ef8,
			0x48da82056f5c6A1276258dDcd97E4C89640DD9e2
		],
		[
			0xF4463762f1F00E91Bd58619dB6C9EAC470182886,
			0x9A5510a050f6148391F7Df357506A929723e74cE,
			0xEbaBD24F323dCE0B94E094A43b698ED1F43A618D,
			0x4871c7A6bD3545762c4b1b9edefE40Cf3901DC67,
			0x7640CeD84F07FAF1C1b972Ea4bb7caCBa0bC7D1f,
			0xbC71F5Fb6434b18ED98FBbEdd4FE34658775ccC9,
			0x534758D6F76C7f8994f31fc921353B0c568B1f3a,
			0x7Ac3E29C0b18c8D93121ab15742228cBaF333Ff0,
			0x889615F5acFc9627e3D6508d835a0C7CaC3d2BC4,
			0x2db57203e8B6df80A15ba5df41e236a20C6Baeb8
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
		require(addrStatus[msg.sender] == IN_COLD_POOL_STATUS);
		_;
	}

	modifier inHotAddrPool() {
		require(addrStatus[msg.sender] == IN_HOT_POOL_STATUS);
		_;
	}

	modifier isValidRequestor(address origin) {
		address requestorAddr = msg.sender;
		require((existingCustodians[requestorAddr] 
		|| existingOtherContracts[requestorAddr]) 
		&& addrStatus[origin] == IN_COLD_POOL_STATUS);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		if (started)
			require(currentTime - lastOperationTime >= operatorCoolDown);
		_;
		lastOperationTime = currentTime;
	}

	modifier inVotingStage(VotingStage _stage) {
		require(votingStage == _stage);
		_;
	}

	modifier allowedToVote() {
		address voterAddr = msg.sender;
		require(!voted[voterAddr] && addrStatus[voterAddr] == 1);
		_;
	}

	/*
     *  Events
     */
	event AddAddress(uint poolIndex, address added1, address added2, address newModerator);
	event RemoveAddress(uint poolIndex, address addr, address newModerator);
	// event RemoveFromPool(uint poolIndex, address addr);
	event ProvideAddress(uint poolIndex, address requestor, address origin, address addr);
	event AddCustodian(address newCustodianAddr, address newModerator);
	event AddOtherContract(address newContractAddr, address newModerator);
	event StartContractVoting(address proposer, address newContractAddr);
	event TerminateContractVoting(address terminator, address currentCandidate);
	event StartModeratorVoting(address proposer);
	event TerminateByTimeOut(address candidate);
	event Vote(address voter, address candidate, bool voteFor, uint votedFor, uint votedAgainst);
	event CompleteVoting(bool isContractVoting, address newAddress);
	event ReplaceModerator(address preModerator, address currentModerator);

	/*
     * Constructor
     */
	/// @dev Contract constructor sets operation cool down and set address pool status.
	/// @param optCoolDown operation cool down time.
	constructor(uint optCoolDown) public 
	{	
		votingStage = VotingStage.NotStarted;
		moderator = msg.sender;
		addrStatus[moderator] = USED_STATUS;
		for (uint i = 0; i < addrPool[COLD_POOL_IDX].length; i++) 
			addrStatus[addrPool[COLD_POOL_IDX][i]] = IN_COLD_POOL_STATUS;
		for (i = 0; i < addrPool[HOT_POOL_IDX].length; i++) 
			addrStatus[addrPool[HOT_POOL_IDX][i]] = IN_HOT_POOL_STATUS;
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
		require(addrStatus[addr] == NEW_STATUS);
		candidate = addr;
		addrStatus[addr] = USED_STATUS;
		votingStage = VotingStage.Contract;
		replaceModerator();
		startVoting();
		emit StartContractVoting(moderator, addr);
		return true;
	}

	/// @dev terminateVoting function.
	function terminateContractVoting() 
		public 
		only(moderator) 
		inVotingStage(VotingStage.Contract) 
	returns (bool) {
		votingStage = VotingStage.NotStarted;
		emit TerminateContractVoting(moderator, candidate);
		replaceModerator();
		return true;
	}

	/// @dev terminateVoting voting if timeout
	function terminateByTimeout() public returns (bool) {
		require(votingStage != VotingStage.NotStarted);
		uint nowTimestamp = getNowTimestamp();
		if (nowTimestamp > voteStartTimestamp && nowTimestamp - voteStartTimestamp > VOTE_TIME_OUT) {
			votingStage = VotingStage.NotStarted;
			emit TerminateByTimeOut(candidate);
			return true;
		} else
			return false;
	}

	/// @dev proposeNewModerator function.
	function startModeratorVoting() public inColdAddrPool() returns (bool) {
		candidate = msg.sender;
		votingStage = VotingStage.Moderator;
		removeFromPoolByAddr(COLD_POOL_IDX, candidate);
		startVoting();
		emit StartModeratorVoting(candidate);
		return true;
	}

	/// @dev proposeNewModerator function.
	function vote(bool voteFor) 
		public 
		allowedToVote() 
	returns (bool) {
		address voter = msg.sender;
		if (voteFor)
			votedFor = votedFor + 1;
		else
			votedAgainst += 1;
		voted[voter] = true;
		uint threshold = addrPool[COLD_POOL_IDX].length / 2;
		emit Vote(voter, candidate, voteFor, votedFor, votedAgainst);
		if (votedFor > threshold || votedAgainst > threshold) {
			if (votingStage == VotingStage.Contract) {
				passedContract[candidate] = true;
				emit CompleteVoting(true, candidate);
			}
			else {
				emit CompleteVoting(false, candidate);
				moderator = candidate;
			}
			votingStage = VotingStage.NotStarted;
		}
		return true;
	}

	/*
     * Moderator Public functions
     */
	/// @dev start roleManagerContract.
	function startManager() public only(moderator) returns (bool) {
		require(!started && custodianPool.length > 0);
		started = true;
		return true;
	}

	/// @dev addCustodian function.
	/// @param custodianAddr custodian address to add.
	function addCustodian(address custodianAddr) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		require(!existingCustodians[custodianAddr] && !existingOtherContracts[custodianAddr]);
		ICustodian custodian = ICustodian(custodianAddr);
		require(custodian.totalUsers() >= 0);
		// custodian.users(0);
		uint custodianLength = custodianPool.length;
		if (custodianLength > 0) 
			replaceModerator();
		else if (!started) {
			uint index = getNextAddrIndex(COLD_POOL_IDX, custodianAddr);
			address preModerator = moderator;
			moderator = addrPool[COLD_POOL_IDX][index];
			emit ReplaceModerator(preModerator, moderator);
			removeFromPool(COLD_POOL_IDX, index);
		}
		existingCustodians[custodianAddr] = true;
		custodianPool.push(custodianAddr);
		addrStatus[custodianAddr] = USED_STATUS;
		emit AddCustodian(custodianAddr, moderator);
		return true;
	}

	/// @dev addOtherContracts function.
	/// @param contractAddr other contract address to add.
	function addOtherContracts(address contractAddr) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		require(!existingCustodians[contractAddr] && !existingOtherContracts[contractAddr]);		
		existingOtherContracts[contractAddr] = true;
		otherContractPool.push(contractAddr);
		addrStatus[contractAddr] = USED_STATUS;
		replaceModerator();
		emit AddOtherContract(contractAddr, moderator);
		return true;
	}

	/// @dev add two addreess into pool function.
	/// @param addr1 the first address
	/// @param addr2 the second address.
	/// @param poolIndex indicate adding to hot or cold.
	function addAddress(address addr1, address addr2, uint poolIndex) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		require(addrStatus[addr1] == NEW_STATUS 
			&& addrStatus[addr2] == NEW_STATUS 
			&& addr1 != addr2 
			&& poolIndex < 2);
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
	function removeAddress(address addr, uint poolIndex) 
		public 
		only(moderator) 
		inUpdateWindow() 
	returns (bool success) {
		require(addrPool[poolIndex].length > MIN_POOL_SIZE 
			&& addrStatus[addr] == poolIndex + 1 
			&& poolIndex < 2);
		removeFromPoolByAddr(poolIndex, addr);
		replaceModerator();
		emit RemoveAddress(poolIndex, addr, moderator);
		return true;
	}

	/// @dev provide address to other contracts, such as custodian, oracle and others.
	/// @param origin the origin who makes request
	/// @param poolIndex the pool to request address from.
	function provideAddress(address origin, uint poolIndex) 
		public 
		isValidRequestor(origin) 
		inUpdateWindow() 
	returns (address) {
		require(addrPool[poolIndex].length > MIN_POOL_SIZE 
			&& poolIndex < 2 
			&& custodianPool.length > 0);
		removeFromPoolByAddr(COLD_POOL_IDX, origin);
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
		address[] memory coldPool = addrPool[COLD_POOL_IDX];
		for (uint i = 0; i < coldPool.length; i++) 
			voted[coldPool[i]] = false;
		votedFor = 0;
		votedAgainst = 0;
		voteStartTimestamp = getNowTimestamp();
	}
	
	function replaceModerator() internal {
		require(custodianPool.length > 0);
		uint index = getNextAddrIndex(COLD_POOL_IDX, custodianPool[custodianPool.length - 1]);
		address preModerator = moderator;
		moderator = addrPool[COLD_POOL_IDX][index];
		emit ReplaceModerator(preModerator, moderator);
		removeFromPool(COLD_POOL_IDX, index);
	}

	/// @dev removeFromPool Function.
	/// @param poolIndex the pool to request from removal.
	/// @param addr the address to remove
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
		addrStatus[subPool[idx]] = USED_STATUS;
		if (idx < subPool.length - 1)
			addrPool[poolIndex][idx] = addrPool[poolIndex][subPool.length-1];
		delete addrPool[poolIndex][subPool.length - 1];
		// emit RemoveFromPool(poolIndex, addrPool[poolIndex][idx]);
		addrPool[poolIndex].length--;
	}

	/// @dev getNextAddrIndex Function.
	/// @param poolIndex the pool to request address from.
	/// @param custodianAddr the index of custodian contract address for randomeness generation
	function getNextAddrIndex(uint poolIndex, address custodianAddr) internal returns (uint) {
		uint prevHashNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1))));
		ICustodian custodian = ICustodian(custodianAddr);
		uint userLength = custodian.totalUsers();
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

	/// @dev get Pool Size
	function getPoolSize() public view returns (uint, uint) {
		return (addrPool[COLD_POOL_IDX].length, addrPool[HOT_POOL_IDX].length);
	}
}