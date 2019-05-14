pragma solidity ^0.5.0;
import { SafeMath } from "../common/SafeMath.sol";
import { Managed } from "../common/Managed.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title POS
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
		address pf;
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
	bool public openForStake;
	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 500 * 1e18; // dynamiclly tunable
	uint public maxStakePerPfInWei = 200000 * 1e18;  // dynamiclly tunable
	uint public totalAwardsToDistribute = 0;

	mapping (address => bool) public isWhiteListCommitter;
	mapping (address => mapping(address => QueueIdx)) public userQueueIdx; // useraddress => pf => queueIdx
	mapping (address => mapping (address => mapping(uint => StakeLot))) public userStakeQueue; // useraddress => pf => stakeOrder => Stakelot
	mapping (address => uint) public totalStakAmtInWei;
	// mapping (address => uint) public priceFeedIndex;
	address[] public priceFeedList;
	mapping (address => uint) public awards;

	/*
     * Modifier
     */
	modifier isPriceFeed(address addr) {
		require(isWhiteListCommitter[addr]);
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
		
	event CurrentTime(uint ts);
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
		for(uint i= 0; i <pfList.length; i++){
			isWhiteListCommitter[pfList[i]] = true;
			priceFeedList.push(pfList[i]);
		}
		lockMinTimeInSecond = lockTime;
		minStakeAmtInWei = minStakeAmt;
		maxStakePerPfInWei = maxStakePerPf;
		canStake = false;
		canUnstake = false;
	}


	/*
     * Public Functions
     */
	function stake(address pfAddr, uint amtInWei) public isPriceFeed(pfAddr) returns(bool){
		require(canStake);
		address sender = msg.sender;
		require(amtInWei >= minStakeAmtInWei);
		require(totalStakAmtInWei[pfAddr].add(amtInWei) <= maxStakePerPfInWei);
		duoTokenContract.transferFrom(sender, address(this), amtInWei);
		userQueueIdx[sender][pfAddr].last +=1;


		if(userQueueIdx[sender][pfAddr].first == 0) 
			userQueueIdx[sender][pfAddr].first +=1;
		userStakeQueue[sender][pfAddr][userQueueIdx[sender][pfAddr].last] = StakeLot(pfAddr, getNowTimestamp(), amtInWei);
		totalStakAmtInWei[pfAddr] = totalStakAmtInWei[pfAddr].add(amtInWei);
		emit AddStake(sender, pfAddr, amtInWei);
		return true;
	}

	function unstake(address pfAddr) public returns(bool) {
		require(canUnstake);
		address sender = msg.sender;
		require(userQueueIdx[sender][pfAddr].last >= userQueueIdx[sender][pfAddr].first && userQueueIdx[sender][pfAddr].last > 0);  // non-empty queue
		StakeLot memory stake = userStakeQueue[sender][pfAddr][userQueueIdx[sender][pfAddr].first];
		require(getNowTimestamp().sub(stake.timestamp).sub(lockMinTimeInSecond) > 0); 
		delete userStakeQueue[sender][pfAddr][userQueueIdx[sender][pfAddr].first];
		userQueueIdx[sender][pfAddr].first += 1;
		totalStakAmtInWei[stake.pf] = totalStakAmtInWei[stake.pf].sub(stake.amtInWei);
		emit Unstake(sender, stake.pf, stake.amtInWei);
		require(duoTokenContract.transfer(sender, stake.amtInWei));
		return true;
	}

	function batchAddAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(!canStake && !canUnstake);
		for(uint i = 0;i<addrsList.length; i++) {
			awards[addrsList[i]] = awards[addrsList[i]].add(amtInWeiList[i]);
			totalAwardsToDistribute= totalAwardsToDistribute.add(amtInWeiList[i]);
			emit AddAward(addrsList[i], amtInWeiList[i]);
		}
		require(duoTokenContract.balanceOf(address(this)) >= totalAwardsToDistribute);
		return true;
	}

	function batchReduceAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(!canStake && !canUnstake);
		for(uint i = 0;i<addrsList.length; i++) {
			awards[addrsList[i]] = awards[addrsList[i]].sub(amtInWeiList[i]);
			totalAwardsToDistribute= totalAwardsToDistribute.sub(amtInWeiList[i]);
			emit ReduceAward(addrsList[i], amtInWeiList[i]);
		}
		return true;
	}

	function claimAward(bool isAll, uint amtInWei) public returns(bool) {
		require(canUnstake);
		address sender = msg.sender;
		if(isAll && awards[sender] > 0) {
			duoTokenContract.transfer(sender, awards[sender]);
			awards[sender] = 0;
			totalAwardsToDistribute= totalAwardsToDistribute.sub(awards[sender]);
			return true;
		} else if (!isAll && amtInWei> 0 && amtInWei<=awards[sender] ){
			duoTokenContract.transfer(sender, amtInWei);
			awards[sender] = awards[sender].sub(amtInWei);
			totalAwardsToDistribute= totalAwardsToDistribute.sub(amtInWei);
			return true;
		} else {
			revert();
		}
	}

	function toggleIsOpen(bool isEnabled) public only(operator) returns(bool) {
		if(isEnabled){
			canStake = true;
			canUnstake = true;
		} else {
			canStake = false;
			canUnstake = false;
		}
		return true;
	}

	function getPfSize() public returns(uint size) {
		return priceFeedList.length;
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
			oldValue = maxStakePerPfInWei;
			maxStakePerPfInWei = newValue;
		}  else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

	function getNowTimestamp() internal view returns (uint) {
		return now;
	}

}
