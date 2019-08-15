pragma solidity ^0.5.0;
import { SafeMath } from "../common/SafeMath.sol";
import { Managed } from "../common/Managed.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title StakeV2
/// @author duo.network

contract StakeV2 is Managed {
	using SafeMath for uint;

	/*
     * Struct
     */
	struct QueueIndex {
		uint first;
		uint last;
	}

	struct StakeLot {
		uint timestamp;
		uint amtInWei;
	}

	struct RewardLot {
		address user;
		uint amtInWei;
	}

	/*
     * State
     */
	bool public stakingEnabled;
	address public burnAddress;
	address public duoTokenAddress;
	address public uploader;
	IERC20 duoTokenContract;

	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 1e18; // dynamiclly tunable
	uint public maxOracleStakeAmtInWei = 200000 * 1e18;  // dynamiclly tunable
	uint public totalRewardsToDistributeInWei = 0;

	mapping(uint => RewardLot) public addRewardStagingList;
	mapping(uint => RewardLot) public reduceRewardStagingList;
	QueueIndex public addRewardStagingIdx;
	QueueIndex public reduceRewardStagingIdx;

	address[] public users;
	mapping (address => uint) public existingUsers;

	mapping (address => bool) public isWhiteListOracle;
	mapping (address => mapping(address => QueueIndex)) public userQueueIdx; // useraddress => oracle => queueIdx
	mapping (address => mapping (address => mapping(uint => StakeLot))) public userStakeQueue; // useraddress => oracle => stakeOrder => Stakelot
	mapping (address => uint) public totalStakeInWei;
	address[] public oracleList;
	mapping (address => uint) public rewardsInWei;

	/*
     * Modifier
     */
	modifier isOracle(address addr) {
		require(isWhiteListOracle[addr], "not whitelist oracle");
		_;
	}

	/*
     * Events
     */
	event AddStake(address indexed from, address indexed oracle, uint amtInWei);
	event Unstake(address indexed from, address indexed oracle, uint amtInWei);
	event SetValue(uint index, uint oldValue, uint newValue);
	event CommitAddReward(uint rewardAmtInWei);
	event CommitReduceReward(uint rewardAmtInWei);
	event ClaimReward(address claimer, uint rewardAmtInWei);
	event UpdateUploader(address updater, address newUploader);

	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address duoBurnAddr,
		address[] memory oracleAddrList,
		uint lockTime,
		uint minStakeAmt,
		uint maxStakePerOracle,
		address roleManagerAddr,
		address opt,
		address upl,
		uint optCoolDown
		)
		public
		Managed(roleManagerAddr, opt, optCoolDown)
	{
		duoTokenAddress = duoTokenAddr;
		duoTokenContract = IERC20(duoTokenAddr);
		burnAddress = duoBurnAddr;
		uploader = upl;
		for(uint i = 0; i < oracleAddrList.length; i++) {
			isWhiteListOracle[oracleAddrList[i]] = true;
			oracleList.push(oracleAddrList[i]);
		}
		lockMinTimeInSecond = lockTime;
		minStakeAmtInWei = minStakeAmt;
		maxOracleStakeAmtInWei = maxStakePerOracle;
		stakingEnabled = false;
	}


	/*
     * Public Functions
     */
	function stake(address oracleAddr, uint amtInWei) public isOracle(oracleAddr) returns(bool){
		require(stakingEnabled, "staking is not enabled");
		require(amtInWei >= minStakeAmtInWei, "staking amt less than min amt required");
		address sender = msg.sender;
		stakeInternal(sender, oracleAddr, amtInWei, false);
		return true;
	}

	function stakeInternal(address sender, address oracleAddr, uint amtInWei, bool isAutoRoll) internal returns(bool) {
		require(totalStakeInWei[oracleAddr].add(amtInWei) <= maxOracleStakeAmtInWei, "exceeding the maximum amt allowed");
		if (!isAutoRoll) {
			require(duoTokenContract.transferFrom(sender, burnAddress == address(0) ? address(this) : burnAddress, amtInWei), "not enough duo balance");
		} else if(isAutoRoll && burnAddress != address(0)) {
			require(duoTokenContract.transfer(burnAddress, amtInWei), "not enough duo reward");
		}

		userQueueIdx[sender][oracleAddr].last += 1;
		if(userQueueIdx[sender][oracleAddr].first == 0)
			userQueueIdx[sender][oracleAddr].first += 1;
		userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].last] = StakeLot(getNowTimestamp(), amtInWei);
		totalStakeInWei[oracleAddr] = totalStakeInWei[oracleAddr].add(amtInWei);
		checkUser(sender);
		emit AddStake(sender, oracleAddr, amtInWei);
	}

	function unstake(address oracleAddr) public returns(bool) {
		require(stakingEnabled && burnAddress == address(0), "staking is not enabled");
		address sender = msg.sender;
		require(
			userQueueIdx[sender][oracleAddr].last >= userQueueIdx[sender][oracleAddr].first && userQueueIdx[sender][oracleAddr].first > 0, "empty queue"
		);  // non-empty queue
		StakeLot memory stakeLot = userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].first];
		require(getNowTimestamp().sub(stakeLot.timestamp).sub(lockMinTimeInSecond) > 0, "staking period not passed");
		delete userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].first];
		userQueueIdx[sender][oracleAddr].first += 1;
		totalStakeInWei[oracleAddr] = totalStakeInWei[oracleAddr].sub(stakeLot.amtInWei);
		emit Unstake(sender, oracleAddr, stakeLot.amtInWei);
		require(duoTokenContract.transfer(sender, stakeLot.amtInWei), "token transfer failure");
		checkUser(sender);
		return true;
	}

	function stageAddRewards(address[] memory addrsList, uint[] memory amtInWeiList) public only(uploader) returns(bool) {
		require(stakingEnabled, "staking is not enabled");
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");

		if(addRewardStagingIdx.first == 0)
			addRewardStagingIdx.first += 1;

		uint last = addRewardStagingIdx.last;
		for(uint i = 0;i < addrsList.length; i++) {
			address user = addrsList[i];
			uint rewardInWei = amtInWeiList[i];
			last += 1;
			addRewardStagingList[last] = RewardLot(user, rewardInWei);
		}
		addRewardStagingIdx.last = last;
		return true;
	}

	function stageReduceRewards(address[] memory addrsList, uint[] memory amtInWeiList) public only(uploader) returns(bool) {
		require(stakingEnabled, "staking is not enabled");
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");

		if(reduceRewardStagingIdx.first == 0)
			reduceRewardStagingIdx.first += 1;

		uint last = reduceRewardStagingIdx.last;
		for(uint i = 0;i < addrsList.length; i++) {
			address user = addrsList[i];
			uint rewardInWei = amtInWeiList[i];
			last += 1;
			reduceRewardStagingList[last] = RewardLot(user, rewardInWei);
		}
		reduceRewardStagingIdx.last = last;
		return true;
	}

	function commitAddRewards(uint numOfRewards) public only(operator) returns(bool) {
		require(!stakingEnabled, "staking is enabled");
		uint first = addRewardStagingIdx.first;
		uint last = addRewardStagingIdx.last;
		uint numOfRewardsToCommit = last - first + 1;
		uint endIdx = numOfRewards == 0 || numOfRewards >= numOfRewardsToCommit ? last : first + numOfRewards - 1;
		uint amtToCommitInWei = 0;
		while(first <= endIdx) {
			RewardLot memory reward = addRewardStagingList[first];
			address user = reward.user;
			uint rewardInWei = reward.amtInWei;
			rewardsInWei[user] = rewardsInWei[user].add(rewardInWei);
			amtToCommitInWei = amtToCommitInWei.add(rewardInWei);
			delete addRewardStagingList[first];
			first += 1;
		}
		if (first > last) {
			first = 0;
			addRewardStagingIdx.last = 0;
		}
		addRewardStagingIdx.first = first;
		emit CommitAddReward(amtToCommitInWei);
		totalRewardsToDistributeInWei = totalRewardsToDistributeInWei.add(amtToCommitInWei);
		require(duoTokenContract.transferFrom(msg.sender, address(this), amtToCommitInWei), "not enough duo balance to commit add rewards");
		return true;
	}

	function commitReduceRewards(uint numOfRewards) public only(operator) returns(bool) {
		require(!stakingEnabled, "staking is enabled");
		uint first = reduceRewardStagingIdx.first;
		uint last = reduceRewardStagingIdx.last;
		uint numOfRewardsToCommit = last - first + 1;
		uint endIdx = numOfRewards == 0 || numOfRewards >= numOfRewardsToCommit ? last : first + numOfRewards - 1;
		uint amtToCommitInWei = 0;
		while(first <= endIdx) {
			RewardLot memory reward = reduceRewardStagingList[first];
			address user = reward.user;
			uint rewardInWei = reward.amtInWei;
			rewardsInWei[user] = rewardsInWei[user].sub(rewardInWei);
			amtToCommitInWei = amtToCommitInWei.add(rewardInWei);
			delete reduceRewardStagingList[first];
			first += 1;
		}
		if (first > last) {
			first = 0;
			reduceRewardStagingIdx.last = 0;
		}
		reduceRewardStagingIdx.first = first;
		emit CommitReduceReward(amtToCommitInWei);
		totalRewardsToDistributeInWei = totalRewardsToDistributeInWei.sub(amtToCommitInWei);
		require(duoTokenContract.transfer(msg.sender, amtToCommitInWei), "not enough duo balance to commit add rewards");
		return true;
	}

	function resetStagingAwards() public only(operator) returns(bool) {
		addRewardStagingIdx.first = 0;
		addRewardStagingIdx.last = 0;
		reduceRewardStagingIdx.first = 0;
		reduceRewardStagingIdx.last = 0;
		return true;
	}

	function autoRoll(address oracleAddress, uint amtInWei) public returns(bool) {
		require(stakingEnabled, "staking is not enabled");
		address sender = msg.sender;
		uint amtToStakeInWei = amtInWei > rewardsInWei[sender] ? rewardsInWei[sender] : amtInWei;
		rewardsInWei[sender] = rewardsInWei[sender].sub(amtToStakeInWei);
		totalRewardsToDistributeInWei = totalRewardsToDistributeInWei.sub(amtToStakeInWei);
		stakeInternal(sender, oracleAddress, amtToStakeInWei, true);
		return true;
	}

	function claimReward(bool isAll, uint amtInWei) public returns(bool) {
		require(stakingEnabled, "staking is not enabled");
		address sender = msg.sender;
		if(isAll && rewardsInWei[sender] > 0) {
			uint rewardToClaim = rewardsInWei[sender];
			rewardsInWei[sender] = 0;
			totalRewardsToDistributeInWei = totalRewardsToDistributeInWei.sub(rewardToClaim);
			duoTokenContract.transfer(sender, rewardToClaim);
			emit ClaimReward(sender, rewardToClaim);
			return true;
		} else if (!isAll && amtInWei > 0 && amtInWei <= rewardsInWei[sender]){
			rewardsInWei[sender] = rewardsInWei[sender].sub(amtInWei);
			totalRewardsToDistributeInWei = totalRewardsToDistributeInWei.sub(amtInWei);
			duoTokenContract.transfer(sender, amtInWei);
			emit ClaimReward(sender, amtInWei);
			return true;
		} else {
			revert("no reward");
		}
	}

	function setStakeFlag(bool isEnabled) public only(operator) returns(bool) {
		stakingEnabled = isEnabled;
		return true;
	}


	function checkUser(address user) internal {
		bool isUser = false;
		for(uint i = 0; i < oracleList.length; i ++){
			QueueIndex memory queueIdx = userQueueIdx[user][oracleList[i]];

			if(queueIdx.last >= queueIdx.first && queueIdx.first > 0){
				isUser = true;
				break;
			}
		}

		uint userIdx = existingUsers[user];

		if(userIdx > 0){
			if(!isUser) {
				uint lastIdx = users.length;
				address lastUser = users[lastIdx - 1];
				if (userIdx < lastIdx) {
					users[userIdx - 1] = lastUser;
					existingUsers[lastUser] = userIdx;
				}
				delete users[lastIdx - 1];
				existingUsers[user] = 0;
				users.length--;
			}
		} else {
			if(isUser) {
				users.push(user);
				existingUsers[user] = users.length;
			}
		}
	}

	function getOracleSize() public view returns(uint size) {
		return oracleList.length;
	}

	function getUserSize() public view returns (uint) {
		return users.length;
	}

	function getNowTimestamp() internal view returns (uint) {
		return now;
	}

	function updateUploaderByOperator(address newUploader) public only(operator) inUpdateWindow() returns (bool) {
		uploader = newUploader;
		emit UpdateUploader(operator, uploader);
		return true;
	}

	function updateUploaderByRoleManager() public inUpdateWindow() returns (bool) {
		address updater = msg.sender;
		address newAddr = roleManager.provideAddress(updater, 1);
		uploader = newAddr;
		emit UpdateUploader(updater, newAddr);
		return true;
	}

	function addOracle(address oracleAddr) public only(operator) inUpdateWindow() returns (bool success) {
		require(oracleAddr != address(0), "invalid oracle address");
		isWhiteListOracle[oracleAddr] = true;
		oracleList.push(oracleAddr);
		return true;
	}

	function setValue(uint idx, uint newValue) public only(operator) inUpdateWindow() returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			oldValue = minStakeAmtInWei;
			minStakeAmtInWei = newValue;
		} else if (idx == 1) {
			oldValue = maxOracleStakeAmtInWei;
			maxOracleStakeAmtInWei = newValue;
		}  else {
			revert("invalid index");
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

}
