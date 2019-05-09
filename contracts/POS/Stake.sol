pragma solidity ^0.5.0;
import { SafeMath } from "../common/SafeMath.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title POS
/// @author duo.network

contract Stake {
	using SafeMath for uint;

	struct QueueIdx {
		uint first;
		uint last;
	}

	struct Stake {
		address pf;
		uint timestamp;
		uint amtInWei;
	}

	/*
     * Storage
     */
	address public duoTokenAddress;
	IERC20 duoTokenContract;
	uint lockMinTimeInSecond;

	// uint public totalFeeders;
	// committers
	mapping (address => bool) public isWhiteListCommitter;
	
	mapping (address => QueueIdx) public userQueueIdx;
	mapping (address => mapping (uint => Stake)) public userStakeQueue;

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
	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address[] memory pfList,
		uint lockTime
		) 
		public
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
		require(duoTokenContract.transferFrom(sender, address(this), amtInWei));
		userQueueIdx[sender].last +=1;
		userStakeQueue[sender][userQueueIdx[sender].last] = Stake(addr, block.timestamp, amtInWei);
		emit AddStake(sender, addr, amtInWei);
		return true;
	}

	function unStake(address addr) public returns(bool) {
		address sender = msg.sender;
		require(userQueueIdx[sender].last >= userQueueIdx[sender].first);  // non-empty queue
		Stake memory stake = userStakeQueue[sender][userQueueIdx[sender].first];
		require(block.timestamp.sub(stake.timestamp).sub(lockMinTimeInSecond) > 0); 
		delete userStakeQueue[sender][userQueueIdx[sender].first];
		userQueueIdx[sender].first += 1;
		emit UnStake(sender, stake.pf, stake.amtInWei);
		return true;
	}

}
