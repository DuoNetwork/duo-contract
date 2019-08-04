pragma solidity ^0.5.0;
import { SafeMath } from "../common/SafeMath.sol";
import { Managed } from "../common/Managed.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title Stake
/// @author duo.network

contract Stake is Managed {
	using SafeMath for uint;

	/*
     * Struct
     */
	struct QueueIdx {
		uint first;
		uint last;
	}

	struct StakeLot {
		uint timestamp;
		uint amtInWei;
	}
	
	struct AwardLot {
		address user;
		uint amtInWei;
	}

	/*
     * State
     */
	bool public canStake;
	bool public canUnstake;
	address public duoTokenAddress;
	address public uploader;
	IERC20 duoTokenContract;

	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 500 * 1e18; // dynamiclly tunable
	uint public maxOracleStakeAmtInWei = 200000 * 1e18;  // dynamiclly tunable
	uint public totalAwardsToDistributeInWei = 0;

	AwardLot[] public stagedAddAwardList;
	AwardLot[] public stagedReduceAwardList;
	uint addAwardListFirstIdx;
	uint addAwardListLastIdx;
	uint reduceAwardListFirstIdx;
	uint reduceAwardListLastIdx;

	mapping (address => uint) public stagedUserAwardInWei;

	address[] public users;
	mapping (address => uint) public existingUsers;

	mapping (address => bool) public isWhiteListOracle;
	mapping (address => mapping(address => QueueIdx)) public userQueueIdx; // useraddress => oracle => queueIdx
	mapping (address => mapping (address => mapping(uint => StakeLot))) public userStakeQueue; // useraddress => oracle => stakeOrder => Stakelot
	mapping (address => uint) public totalStakAmtInWei;
	address[] public oracleList;
	mapping (address => uint) public awardsInWei;

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
	event StageAddAward(address user, uint awardAmtInWei);
	event StageReduceAward(address user, uint awardAmtInWei);
	event CommitAddAward(address user, uint awardAmtInWei);
	event CommitReduceAward(address user, uint awardAmtInWei);
	event ClaimAward(address claimer, uint awardAmtInWei);
	event UpdateUploader(address updater, address newUploader);


	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
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
		uploader = upl;
		duoTokenAddress = duoTokenAddr;
		duoTokenContract = IERC20(duoTokenAddr);
		for(uint i = 0; i<oracleAddrList.length; i++) {
			isWhiteListOracle[oracleAddrList[i]] = true;
			oracleList.push(oracleAddrList[i]);
		}
		lockMinTimeInSecond = lockTime;
		minStakeAmtInWei = minStakeAmt;
		maxOracleStakeAmtInWei = maxStakePerOracle;
		canStake = false;
		canUnstake = false;
	}


	/*
     * Public Functions
     */
	function stake(address oracleAddr, uint amtInWei) public isOracle(oracleAddr) returns(bool){
		require(canStake, "canStake is not set");
		require(amtInWei >= minStakeAmtInWei, "staking amt less than min amt required");
		address sender = msg.sender;
		stakeInternal(sender, oracleAddr, amtInWei);
		return true;
	}

	function stakeInternal(address sender, address oracleAddr, uint amtInWei) internal returns(bool) {
		require(totalStakAmtInWei[oracleAddr].add(amtInWei) <= maxOracleStakeAmtInWei, "exceeding the maximum amt allowed");
		require(duoTokenContract.transferFrom(sender, duoTokenAddress, amtInWei), "failed burining duo");
		userQueueIdx[sender][oracleAddr].last += 1;
		if(userQueueIdx[sender][oracleAddr].first == 0)
			userQueueIdx[sender][oracleAddr].first += 1;
		userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].last] = StakeLot(getNowTimestamp(), amtInWei);
		totalStakAmtInWei[oracleAddr] = totalStakAmtInWei[oracleAddr].add(amtInWei);
		checkUser(sender);
		emit AddStake(sender, oracleAddr, amtInWei);
	}

	function unstake(address oracleAddr) public returns(bool) {
		require(canUnstake, "canUnstake is not set");
		address sender = msg.sender;
		require(
			userQueueIdx[sender][oracleAddr].last >= userQueueIdx[sender][oracleAddr].first && userQueueIdx[sender][oracleAddr].first > 0, "empty queue"
		);  // non-empty queue
		StakeLot memory stake = userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].first];
		require(getNowTimestamp().sub(stake.timestamp).sub(lockMinTimeInSecond) > 0, "staking period not passed");
		delete userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].first];
		userQueueIdx[sender][oracleAddr].first += 1;
		totalStakAmtInWei[oracleAddr] = totalStakAmtInWei[oracleAddr].sub(stake.amtInWei);
		emit Unstake(sender, oracleAddr, stake.amtInWei);
		require(duoTokenContract.transfer(sender, stake.amtInWei), "token transfer failure");
		checkUser(sender);
		return true;
	}

	function stageAddAwards(address[] memory addrsList, uint[] memory amtInWeiList) public only(uploader) returns(bool) {
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");

		if(addAwardListFirstIdx == 0)
			addAwardListFirstIdx += 1;

		for(uint i = 0;i<addrsList.length; i++) {
			address user = addrsList[i];
			uint awardInWei = amtInWeiList[i];
			addAwardListLastIdx += 1;
			stagedUserAwardInWei[user]= stagedUserAwardInWei[user].add(awardInWei);
			stagedAddAwardList[addAwardListLastIdx] = AwardLot(user, awardInWei);
			emit StageAddAward(user, awardInWei);
		}
		return true;
	}

	function stageReduceAwards(address[] memory addrsList, uint[] memory amtInWeiList) public only(uploader) returns(bool) {
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");

		if(reduceAwardListFirstIdx == 0)
			reduceAwardListFirstIdx += 1;

		for(uint i = 0;i<addrsList.length; i++) {
			address user = addrsList[i];
			uint awardInWei = amtInWeiList[i];
			reduceAwardListLastIdx += 1;
			stagedUserAwardInWei[user]= stagedUserAwardInWei[user].sub(awardInWei);
			stagedReduceAwardList[reduceAwardListLastIdx] = AwardLot(user, awardInWei);
			emit StageReduceAward(user, awardInWei);
		}
		return true;
	}

	function commitAward(uint numOfAwards) public only(operator) returns(bool) {
		require(!canStake && !canUnstake, "staking is not frozen");
		uint numOfAwardsToAdd = addAwardListLastIdx - addAwardListFirstIdx + 1;
		uint numOfAwardsToReduce = reduceAwardListLastIdx - reduceAwardListFirstIdx + 1;
		if (numOfAwards == 0 || numOfAwards >= (numOfAwardsToAdd + numOfAwardsToReduce)) { //commit all staged awards
			commitAddAwards(addAwardListLastIdx);
			commitReduceAwards(reduceAwardListLastIdx);
		} else if (numOfAwards <= numOfAwardsToAdd) {
			commitAddAwards(addAwardListFirstIdx + numOfAwards - 1);
		} else if (numOfAwards > numOfAwardsToAdd && numOfAwards <(numOfAwardsToAdd + numOfAwardsToReduce) ){
			commitAddAwards(addAwardListLastIdx);
			commitReduceAwards(numOfAwards - numOfAwardsToAdd + reduceAwardListFirstIdx - 1);
		}
		require(duoTokenContract.balanceOf(address(this)) >= totalAwardsToDistributeInWei, "not enough balance to give awards");
		return true;

	}

	function commitAddAwards(uint endIdx) internal {
		uint lastIdx = endIdx >addAwardListLastIdx? addAwardListLastIdx :endIdx;
		for(uint i = addAwardListFirstIdx;i<=lastIdx; i++) {
			AwardLot memory award = stagedAddAwardList[i];
			address user = award.user;
			uint awardInWei= award.amtInWei;
			awardsInWei[user] = awardsInWei[user].add(awardInWei);
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.add(awardInWei);
			addAwardListFirstIdx += 1;
			delete stagedAddAwardList[i];
			emit CommitAddAward(user, awardInWei);
			if (addAwardListFirstIdx >addAwardListLastIdx){
				addAwardListFirstIdx = 0;
				addAwardListLastIdx = 0;
				break;
			}
		}

	}

	function commitReduceAwards(uint endIdx) internal {
		uint lastIdx = endIdx >reduceAwardListLastIdx? reduceAwardListLastIdx :endIdx;
		for(uint i = reduceAwardListLastIdx;i<=lastIdx; i++) {
			AwardLot memory award = stagedReduceAwardList[i];
			address user = award.user;
			uint awardInWei= award.amtInWei;
			awardsInWei[user] = awardsInWei[user].sub(awardInWei);
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.sub(awardInWei);
			reduceAwardListLastIdx += 1;
			delete stagedReduceAwardList[i];
			emit CommitReduceAward(user, awardInWei);
			if (reduceAwardListLastIdx >reduceAwardListLastIdx){
				reduceAwardListLastIdx = 0;
				reduceAwardListLastIdx = 0;
				break;
			}
		}

	}

	function autoRoll(address oracleAddress, uint amtInWei) public returns(bool) {
		require(canStake, "canStake is not set");
		address sender = msg.sender;
		uint amtToStakeInWei = amtInWei> awardsInWei[sender]? awardsInWei[sender]:amtInWei;
		stakeInternal(sender, oracleAddress, amtToStakeInWei);
		return true;
	}


	function claimAward(bool isAll, uint amtInWei) public returns(bool) {
		require(canUnstake, "canUnstake is not set");
		address sender = msg.sender;
		if(isAll && awardsInWei[sender] > 0) {
			uint awardToClaim = awardsInWei[sender];
			awardsInWei[sender] = 0;
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.sub(awardToClaim);
			duoTokenContract.transfer(sender, awardToClaim);
			emit ClaimAward(sender, awardToClaim);
			return true;
		} else if (!isAll && amtInWei > 0 && amtInWei <= awardsInWei[sender]){
			awardsInWei[sender] = awardsInWei[sender].sub(amtInWei);
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.sub(amtInWei);
			duoTokenContract.transfer(sender, amtInWei);
			emit ClaimAward(sender, amtInWei);
			return true;
		} else {
			revert();
		}
	}

	function setStakeFlag(bool stake, bool unstake) public only(operator) returns(bool) {
		canStake = stake;
		canUnstake = unstake;
		return true;
	}

	function checkUser(address user) internal {

		bool isUser = false;
		for(uint i = 0; i < oracleList.length; i ++){
			QueueIdx memory queueIdx = userQueueIdx[user][oracleList[i]];

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

	function updateUploaderByOperator(address newUploader) 
		public
		only(operator)
		inUpdateWindow() 
	returns (bool) {
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

	function setValue(
		uint idx,
		uint newValue
	)
		public
		only(operator)
		inUpdateWindow()
	returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			oldValue = minStakeAmtInWei;
			minStakeAmtInWei = newValue;
		} else if (idx == 1) {
			oldValue = maxOracleStakeAmtInWei;
			maxOracleStakeAmtInWei = newValue;
		}  else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

}
