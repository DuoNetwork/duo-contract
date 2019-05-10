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
	uint public lockMinTimeInSecond;
	uint public minStakeAmtInWei = 500 * 1e18; // dynamiclly tunable
	uint public maxStakePerPf = 200000 * 1e18;  // dynamiclly tunable

	mapping (address => bool) public isWhiteListCommitter;
	mapping (address => QueueIdx) public userQueueIdx;
	mapping (address => mapping (uint => StakeLot)) public userStakeQueue;
	mapping (address => uint) totalStakAmtInWei;

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
	event UnStake(address indexed from, address indexed pf, uint amtInWei);
	event SetValue(uint index, uint oldValue, uint newValue);
	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address[] memory pfList,
		uint lockTime,
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

	}


	/*
     * Public Functions
     */
	function addStake(address addr, uint amtInWei) public isPriceFeed(addr) returns(bool){
		address sender = msg.sender;
		require(amtInWei >= minStakeAmtInWei);
		require(totalStakAmtInWei[addr].add(amtInWei) <= maxStakePerPf);
		require(duoTokenContract.transferFrom(sender, address(this), amtInWei));
		userQueueIdx[sender].last +=1;
		userStakeQueue[sender][userQueueIdx[sender].last] = StakeLot(addr, block.timestamp, amtInWei);
		totalStakAmtInWei[addr] = totalStakAmtInWei[addr].add(amtInWei);
		emit AddStake(sender, addr, amtInWei);
		return true;
	}

	function unStake() public returns(bool) {
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
			oldValue = maxStakePerPf;
			maxStakePerPf = newValue;
		}  else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

}
