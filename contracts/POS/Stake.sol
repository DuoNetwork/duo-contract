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
	address public duoTokenAddress;
	IERC20 duoTokenContract;
	bool public openForStake;
	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 500 * 1e18; // dynamiclly tunable
	uint public maxStakePerPfInWei = 200000 * 1e18;  // dynamiclly tunable
	uint public totalAwardsToDistribute = 0;

	mapping (address => bool) public isWhiteListCommitter;
	mapping (address => QueueIdx) public userQueueIdx;
	mapping (address => mapping (uint => StakeLot)) public userStakeQueue;
	mapping (address => uint) totalStakAmtInWei;
	mapping (address => uint) public awards;

	/*
     * Modifier
     */
	modifier isPriceFeed(address addr) {
		require(isWhiteListCommitter[addr]);
		_;
	}

	modifier isOpenForStake() {
		require(openForStake);
		_;
	}

	/*
     * Events
     */
	event AddStake(address indexed from, address indexed pf, uint amtInWei);
	event UnStake(address indexed from, address indexed pf, uint amtInWei);
	event SetValue(uint index, uint oldValue, uint newValue);
	event AddAward(address staker, uint awardAmtInWei);
	event ReduceAward(address staker, uint awardAmtInWei);
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
		}
		lockMinTimeInSecond = lockTime;
		openForStake = false;
		minStakeAmtInWei = minStakeAmt;
		maxStakePerPfInWei = maxStakePerPf;
	}


	/*
     * Public Functions
     */
	function addStake(address addr, uint amtInWei) public isPriceFeed(addr) isOpenForStake() returns(bool){
		address sender = msg.sender;
		require(amtInWei >= minStakeAmtInWei);
		require(totalStakAmtInWei[addr].add(amtInWei) <= maxStakePerPfInWei);
		require(duoTokenContract.transferFrom(sender, address(this), amtInWei));
		userQueueIdx[sender].last +=1;
		if(userQueueIdx[sender].first == 0) 
			userQueueIdx[sender].first +=1;
		userStakeQueue[sender][userQueueIdx[sender].last] = StakeLot(addr, block.timestamp, amtInWei);
		totalStakAmtInWei[addr] = totalStakAmtInWei[addr].add(amtInWei);
		emit AddStake(sender, addr, amtInWei);
		return true;
	}

	function unStake() public isOpenForStake() returns(bool) {
		address sender = msg.sender;
		require(userQueueIdx[sender].last >= userQueueIdx[sender].first && userQueueIdx[sender].last > 0);  // non-empty queue
		StakeLot memory stake = userStakeQueue[sender][userQueueIdx[sender].first];
		require(block.timestamp.sub(stake.timestamp).sub(lockMinTimeInSecond) > 0); 
		delete userStakeQueue[sender][userQueueIdx[sender].first];
		userQueueIdx[sender].first += 1;
		totalStakAmtInWei[stake.pf] = totalStakAmtInWei[stake.pf].sub(stake.amtInWei);
		require(duoTokenContract.transfer(sender, stake.amtInWei));
		emit UnStake(sender, stake.pf, stake.amtInWei);
		return true;
	}

	function batchAddAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(!openForStake);
		for(uint i = 0;i<addrsList.length; i++) {
			awards[addrsList[i]] = awards[addrsList[i]].add(amtInWeiList[i]);
			totalAwardsToDistribute= totalAwardsToDistribute.add(amtInWeiList[i]);
			emit AddAward(addrsList[i], amtInWeiList[i]);
		}
		require(duoTokenContract.balanceOf(address(this)) >= totalAwardsToDistribute);
		return true;
	}

	function batchReduceAward(address[] memory addrsList, uint[] memory amtInWeiList) public only(operator) returns(bool){
		require(!openForStake);
		for(uint i = 0;i<addrsList.length; i++) {
			awards[addrsList[i]] = awards[addrsList[i]].sub(amtInWeiList[i]);
			totalAwardsToDistribute= totalAwardsToDistribute.sub(amtInWeiList[i]);
			emit ReduceAward(addrsList[i], amtInWeiList[i]);
		}
		return true;
	}

	function claimAward(bool isAll, uint amtInWei) public isOpenForStake() returns(bool) {
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

	function toggleIsOpen() public only(operator) returns(bool) {
		openForStake = !openForStake;
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
			oldValue = maxStakePerPfInWei;
			maxStakePerPfInWei = newValue;
		}  else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

}
