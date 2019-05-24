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

	/*
     * State
     */
	bool public canStake;
	bool public canUnstake;
	address public duoTokenAddress;
	IERC20 duoTokenContract;
	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 500 * 1e18; // dynamiclly tunable
	uint public maxOracleStakeAmtInWei = 200000 * 1e18;  // dynamiclly tunable
	uint public totalAwardsToDistributeInWei = 0;
	address[] public users;
	mapping (address => uint) public existingUsers;

	mapping (address => bool) public isWhiteListOracle;
	mapping (address => mapping(address => QueueIdx)) public userQueueIdx; // useraddress => pf => queueIdx
	mapping (address => mapping (address => mapping(uint => StakeLot))) public userStakeQueue; // useraddress => pf => stakeOrder => Stakelot
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
	event AddStake(address indexed from, address indexed pf, uint amtInWei);
	event Unstake(address indexed from, address indexed pf, uint amtInWei);
	event SetValue(uint index, uint oldValue, uint newValue);
	event AddAward(address staker, uint awardAmtInWei);
	event ReduceAward(address staker, uint awardAmtInWei);
	event ClaimAward(address claimer, uint awardAmtInWei);

	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address[] memory pfList,
		uint lockTime,
		uint minStakeAmt,
		uint maxStakePerPf,
		address roleManagerAddr,
		address opt,
		uint optCoolDown
		)
		public
		Managed(roleManagerAddr, opt, optCoolDown)
	{
		duoTokenAddress = duoTokenAddr;
		duoTokenContract = IERC20(duoTokenAddr);
		for(uint i = 0; i<pfList.length; i++) {
			isWhiteListOracle[pfList[i]] = true;
			oracleList.push(pfList[i]);
		}
		lockMinTimeInSecond = lockTime;
		minStakeAmtInWei = minStakeAmt;
		maxOracleStakeAmtInWei = maxStakePerPf;
		canStake = false;
		canUnstake = false;
	}


	/*
     * Public Functions
     */
	function stake(address oracleAddr, uint amtInWei) public isOracle(oracleAddr) returns(bool){
		require(canStake, "canStake is not set");
		address sender = msg.sender;
		require(amtInWei >= minStakeAmtInWei, "staking amt less than min amt required");
		require(totalStakAmtInWei[oracleAddr].add(amtInWei) <= maxOracleStakeAmtInWei, "exceeding the maximum amt allowed");
		require(duoTokenContract.transferFrom(sender, address(this), amtInWei), "not enough allowance or balance");
		userQueueIdx[sender][oracleAddr].last += 1;
		if(userQueueIdx[sender][oracleAddr].first == 0)
			userQueueIdx[sender][oracleAddr].first += 1;
		userStakeQueue[sender][oracleAddr][userQueueIdx[sender][oracleAddr].last] = StakeLot(getNowTimestamp(), amtInWei);
		totalStakAmtInWei[oracleAddr] = totalStakAmtInWei[oracleAddr].add(amtInWei);
		checkUser(sender);
		emit AddStake(sender, oracleAddr, amtInWei);
		return true;
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

	function batchAddAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");
		require(!canStake && !canUnstake, "staking is not frozen");
		for(uint i = 0;i<addrsList.length; i++) {
			awardsInWei[addrsList[i]] = awardsInWei[addrsList[i]].add(amtInWeiList[i]);
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.add(amtInWeiList[i]);
			emit AddAward(addrsList[i], amtInWeiList[i]);
		}
		require(duoTokenContract.balanceOf(address(this)) >= totalAwardsToDistributeInWei, "not enough balance to give awards");
		return true;
	}

	function batchReduceAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(addrsList.length == amtInWeiList.length && addrsList.length > 0, "input parameters wrong");
		require(!canStake && !canUnstake, "staking is not frozen");
		for(uint i = 0;i<addrsList.length; i++) {
			awardsInWei[addrsList[i]] = awardsInWei[addrsList[i]].sub(amtInWeiList[i]);
			totalAwardsToDistributeInWei = totalAwardsToDistributeInWei.sub(amtInWeiList[i]);
			emit ReduceAward(addrsList[i], amtInWeiList[i]);
		}
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

	function getPfSize() public view returns(uint size) {
		return oracleList.length;
	}

	function getUserSize() public view returns (uint) {
		return users.length;
	}

	function getNowTimestamp() internal view returns (uint) {
		return now;
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
