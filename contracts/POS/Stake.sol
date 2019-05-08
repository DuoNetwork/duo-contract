pragma solidity ^0.5.0;
import { SafeMath } from "../common/SafeMath.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/// @title POS
/// @author duo.network

contract Stake {
	using SafeMath for uint;

	/*
     * Storage
     */
	address public duoTokenAddress;
	IERC20 duoTokenContract;

	// uint public totalFeeders;
	// committers
	mapping (address => bool) public isWhiteListCommitter;
	mapping (address => mapping (address => uint)) public stakeInWei;

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
	event Stake(address indexed from, address indexed pf, uint amtInWei);

	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address[] memory pfList
		) 
		public
	{
		duoTokenAddress = duoTokenAddr;
		duoTokenContract = IERC20(duoTokenAddr);
		for(uint i= 0; i <pfList.length; i++){
			isWhiteListCommitter[pfList[i]] = true;
		}
	}


	/*
     * Public Functions
     */
	function stake(address addr, uint amtInWei) public isPriceFeed(addr) returns(bool){
		address sender = msg.sender;
		require(duoTokenContract.transferFrom(sender, address(this), amtInWei));
		stakeInWei[sender][addr] = stakeInWei[sender][addr].add(amtInWei);
		return true;
	}
}
