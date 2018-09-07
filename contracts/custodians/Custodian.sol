pragma solidity ^0.4.24;
import { SafeMath } from "../common/SafeMath.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { Managed } from "../common/Managed.sol";

/// @title Custodian - every derivative contract should has basic custodian properties
/// @author duo.network
contract Custodian is Managed {
	using SafeMath for uint;

	/*
     * Constants
     */
	uint constant decimals = 18;
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant MIN_BALANCE = 10000000000000000;
	enum State {
		Inception,
		Trading,
		PreReset,
		Reset
	}

	/*
     * Storage
     */
	IERC20 duoToken;
	IOracle oracle;
	State public state;
	address public feeCollector;
	address public duoTokenAddress;
	address public oracleAddress;
	address public aTokenAddress;
	address public bTokenAddress;
	uint public totalSupplyA;
	uint public totalSupplyB;
	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) public existingUsers;
	uint public ethFeeBalanceInWei;
	uint public navAInWei;
	uint public navBInWei;
	uint public lastPriceInWei;
	uint public lastPriceTimeInSecond;
	uint public resetPriceInWei;
	uint public resetPriceTimeInSecond;
	uint public createCommInBP;
	uint public redeemCommInBP;
	uint public period;
	uint public preResetWaitingBlocks;
	uint public priceFetchCoolDown = 3000;
	
	// cycle state variables
	uint lastPreResetBlockNo = 0;
	uint nextResetAddrIndex;

	/*
     *  Modifiers
     */
	modifier inState(State _state) {
		require(state == _state);
		_;
	}

	/*
     *  Events
     */
	event StartTrading(uint navAInWei, uint navBInWei);
	event StartPreReset();
	event StartReset(uint nextIndex, uint total);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond, uint navAInWei, uint navBInWei);
	event Create(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event Redeem(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event TotalSupply(uint totalSupplyAInWei, uint totalSupplyBInWei);
	// token events
	event Transfer(address indexed from, address indexed to, uint value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);
	// operation events
	event CollectFee(address addr, uint ethFeeInWei, uint ethFeeBalanceInWei, uint duoFeeInWei, uint duoFeeBalanceInWei);
	event UpdateOracle(address newOracleAddress);
	event UpdateFeeCollector(address updater, address newFeeCollector);

	/*
     *  Constructor
     */
	/// @dev Contract constructor sets operation cool down and set address pool status.
	///	@param duoTokenAddr duotoken address
	///	@param roleManagerAddr roleManagerContract Address
	///	@param fc feeCollector address
	///	@param comm commission rate
	///	@param pd period
	///	@param preResetWaitBlk pre reset waiting block numbers
	///	@param pxFetchCoolDown price fetching cool down
	///	@param opt operator
	///	@param optCoolDown operation cooldown
	constructor(
		address duoTokenAddr,
		address roleManagerAddr,
		address fc,
		uint comm,
		uint pd,
		uint preResetWaitBlk, 
		uint pxFetchCoolDown,
		address opt,
		uint optCoolDown
		) 
		public
		Managed(roleManagerAddr, opt, optCoolDown) 
	{
		state = State.Inception;
		feeCollector = fc;
		createCommInBP = comm;
		redeemCommInBP = comm;
		period = pd;
		preResetWaitingBlocks = preResetWaitBlk;
		priceFetchCoolDown = pxFetchCoolDown;
		navAInWei = WEI_DENOMINATOR;
		navBInWei = WEI_DENOMINATOR;
		duoTokenAddress = duoTokenAddr;
		duoToken = IERC20(duoTokenAddr);
	}

	/*
     * Public functions
     */

	/// @dev return totalUsers in the system.
	function totalUsers() public view returns (uint) {
		return users.length;
	}

	/*
     * ERC token functions
     */
	/// @dev transferInternal function.
	/// @param index 0 is classA , 1 is class B
	/// @param from  from address
	/// @param to   to address
	/// @param tokens num of tokens transferred
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

	/*
     * Internal Functions
     */
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

	/*
     * Operation Functions
     */
	function collectEthFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		ethFeeBalanceInWei = ethFeeBalanceInWei.sub(amountInWei);
		feeCollector.transfer(amountInWei);
		emit CollectFee(msg.sender, amountInWei, ethFeeBalanceInWei, 0, duoToken.balanceOf(this));
		return true;
	}

	function collectDuoFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		duoToken.transfer(feeCollector, amountInWei);
		emit CollectFee(msg.sender, 0, ethFeeBalanceInWei, amountInWei, duoToken.balanceOf(this));
		return true;
	}

	function updateOracle(address newOracleAddr) 
		only(roleManager.moderator())
		inUpdateWindow() 
		public 
	returns (bool) {
		require(roleManager.passedContract(newOracleAddr));
		oracleAddress = newOracleAddr;
		oracle = IOracle(oracleAddress);
		(uint lastPrice, uint lastPriceTime) = oracle.getLastPrice();
		require(lastPrice > 0 && lastPriceTime > 0);
		emit UpdateOracle(newOracleAddr);
		return true;
	}

	function updateFeeCollector() 
		public 
		inUpdateWindow() 
	returns (bool) {
		address updater = msg.sender;
		feeCollector = roleManager.provideAddress(updater, 0);
		emit UpdateFeeCollector(updater, feeCollector);
		return true;
	}
}