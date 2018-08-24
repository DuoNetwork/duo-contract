pragma solidity ^0.4.24;
import { SafeMath } from "../common/SafeMath.sol";
import { ICustodian } from "../interfaces/ICustodian.sol";

contract Custodian is ICustodian {
	using SafeMath for uint;
	enum State {
		Inception,
		Trading,
		PreReset,
		Reset
	}

	uint constant decimals = 18;
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant MIN_BALANCE = 10000000000000000;

	State public state;
	address public feeCollector;
	address public oracleAddress;
	address public aTokenAddress;
	address public bTokenAddress;
	uint public totalSupplyA;
	uint public totalSupplyB;
	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) existingUsers;

	uint public navAInWei;
	uint public navBInWei;
	uint public lastPriceInWei;
	uint public lastPriceTimeInSecond;
	uint public resetPriceInWei;
	uint public resetPriceTimeInSecond;
	uint createCommInBP;
	uint redeemCommInBP;
	uint period;
	uint preResetWaitingBlocks = 10;
	uint nextResetAddrIndex;
	uint priceFetchCoolDown = 3000;
	
	// cycle state variables
	uint lastPreResetBlockNo = 0;


	modifier inState(State _state) {
		require(state == _state);
		_;
	}

	event StartTrading(uint navAInWei, uint navBInWei);
	event StartPreReset();
	event StartReset(uint nextIndex, uint total);
	event Create(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event Redeem(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event TotalSupply(uint totalSupplyA, uint totalSupplyB);
	

	// token events
	event Transfer(address indexed from, address indexed to, uint value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);

	function totalUsers() public view returns (uint) {
		return users.length;
	}

	// start of token functions
	function transferInternal(uint index, address from, address to, uint tokens) 
		internal 
		inState(State.Trading)
		returns (bool success) 
	{
		// Prevent transfer to 0x0 address. Use burn() instead
		require(to != 0x0);
		// Check if the sender has enough
		require(balanceOf[index][from] >= tokens);

		// Save this for an assertion in the future
		uint previousBalances = balanceOf[index][from].add(balanceOf[index][to]);
		// Subtract from the sender
		balanceOf[index][from] = balanceOf[index][from].sub(tokens);
		// Add the same to the recipient
		balanceOf[index][to] = balanceOf[index][to].add(tokens);
	
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balanceOf[index][from].add(balanceOf[index][to]) == previousBalances);
		emit Transfer(from, to, tokens, index);
		checkUser(from, balanceOf[index][from], balanceOf[1 - index][from]);
		checkUser(to, balanceOf[index][to], balanceOf[1 - index][to]);
		return true;
	}

	function determineAddress(uint index, address from) internal view returns (address) {
		return index == 0 && msg.sender == aTokenAddress || 
			index == 1 && msg.sender == bTokenAddress 
			? from : msg.sender;
	}

	function transfer(uint index, address from, address to, uint tokens)
		public
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		return transferInternal(index, determineAddress(index, from), to, tokens);
	}

	function transferFrom(uint index, address spender, address from, address to, uint tokens) 
		public 
		inState(State.Trading)
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		address spenderToUse = determineAddress(index, spender);
		require(tokens <= allowance[index][from][spenderToUse]);	 // Check allowance
		allowance[index][from][spenderToUse] = allowance[index][from][spenderToUse].sub(tokens);
		return transferInternal(index, from, to, tokens);
	}

	function approve(uint index, address sender, address spender, uint tokens) 
		public 
		returns (bool success) 
	{
		require(index == 0 || index == 1);
		address senderToUse = determineAddress(index, sender);
		allowance[index][senderToUse][spender] = tokens;
		emit Approval(senderToUse, spender, tokens, index);
		return true;
	}
	// end of token functions

	// start of internal utility functions
	function checkUser(address user, uint256 balanceA, uint256 balanceB) internal {
		uint userIdx = existingUsers[user];
		if ( userIdx > 0) {
			if (balanceA < MIN_BALANCE && balanceB < MIN_BALANCE) {
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
		} else if (balanceA >= MIN_BALANCE || balanceB >= MIN_BALANCE) {
			users.push(user);
			existingUsers[user] = users.length;
		}
	}
	// end of internal utility functions
}