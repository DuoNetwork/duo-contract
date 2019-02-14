pragma solidity ^0.5.0;
import { ICustodianToken } from "../interfaces/ICustodianToken.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { SafeMath } from "../common/SafeMath.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { Managed } from "../common/Managed.sol";

/// @title Vivaldi  - binary option token contract
/// @author duo.network
contract Vivaldi is Managed {
	using SafeMath for uint;

	/*
	 * Constants
	 */
	uint constant WEI_DENOMINATOR = 1000000000000000000;
	uint constant BP_DENOMINATOR = 10000;

	/*
     * Storage
     */
	address collateralTokenAddress;
	IWETH collateralToken;
	uint dailyTargetDiffInBP;
	bool dailyTargetDirection; 
	uint roundPeriod;
	address operator;
	address feeCollector;
	address aTokenAddress;
	address bTokenAddress;
	address oracleAddress;
	uint gameStartTime;
	uint gameStartPriceInWei;
	uint roundPeriodTolInSecond;

	uint creationFeeInBP;
	uint redemptionFeeInBP;
	uint clearanceFeeInBP;
	uint tokenCollateralInWei;

	uint totalSupplyA;
	uint totalSupplyB;
	uint minBalance = 10000000000000000; // set at constructor
	mapping(address => uint)[2] public balanceOf;
	mapping (address => mapping (address => uint))[2] public allowance;
	address[] public users;
	mapping (address => uint) public existingUsers;

	uint nextResetAddrIndex;
	uint iterationGasThreshold;

	ICustodianToken aToken;
	ICustodianToken bToken;
	IMultiSigManager roleManager;
	IOracle oracle;

	enum State {
		Inception,
		Trading,
		NonTrading
	}

	enum Result {
		None,
		In,
		Out
	}

	State state;
	Result result;

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
	event StartGame(uint indexed gameStartPriceInWei, uint indexed gameStartTime);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond);
	event Create(address indexed sender, uint collateralTokenAmtInWei, uint tokenAInWei, uint tokenBInWei, uint feeInWei);
	event TotalSupply(uint totalSupplyAInWei, uint totalSupplyBInWei);
	event Redeem(address indexed sender, uint collateralTokenAmtInWei, uint tokenAInWei, uint tokenBInWei, uint feeInWei);
	event StartSettling(uint nextIndex, uint total);
	// token events
	event Transfer(address indexed from, address indexed to, uint value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);
	// operation events
	event CollectFee(address addr, uint feeInWei, uint feeBalanceInWei);
	event UpdateOracle(address newOracleAddress);
	event UpdateFeeCollector(address updater, address newFeeCollector);

	/*
     *  Constructor
     */
	/// @dev 
	///	@param dailyDiff 
	///	@param direction 
	///	@param period
	constructor(
		uint dailyDiff,
		bool direction,
		uint period,
		uint creationFee,
		uint redemptionFee,
		uint clearanceFee,
		uint minimumBalance,
		uint roundPeriodTol,
		uint iteGasTh,
		address roleManagerAddr,
		uint optCoolDown
	) public Managed(roleManagerAddr, msg.sender, optCoolDown)  {
		dailyTargetDiffInBP = dailyDiff;
		dailyTargetDirection = direction;
		roundPeriod = period;
		creationFeeInBP = creationFee;
		redemptionFeeInBP = redemptionFee;
		clearanceFeeInBP = clearanceFee;
		minBalance = minimumBalance;
		roundPeriodTolInSecond = roundPeriodTol;
		iterationGasThreshold = iteGasTh;
		state = State.NonTrading;
	}


	/*
     *  Public Function
     */
	/// @dev 
	///	@param aAddr 
	///	@param bAddr 
	///	@param oracleAddr
	function startOption(
		address aAddr,
		address bAddr,
		address oracleAddr,
		address collateralTokenAddr
		) 
		public 
		inState(State.Inception) 
		only(operator)
		returns (bool success) 
	{
		collateralTokenAddress = collateralTokenAddr;
		aTokenAddress = aAddr;
		aToken = ICustodianToken(aTokenAddress);
		bTokenAddress = bAddr;
		bToken = ICustodianToken(bTokenAddress);
		oracleAddress = oracleAddr;
		oracle = IOracle(oracleAddress);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(priceInWei > 0 && timeInSecond > 0);
		gameStartTime = timeInSecond;
		gameStartPriceInWei = getNewTargetPrice(priceInWei);
		roleManager = IMultiSigManager(roleManagerAddress);
		state = State.Trading;
		result = Result.None;
		emit AcceptPrice(priceInWei, timeInSecond);
		emit StartGame(gameStartPriceInWei, gameStartTime);
		return true;
	}

	/// @dev create with WETH
	///	@param amount amount of WETH to create
	///	@param wethAddr wrapEth contract address
	function createWithWETH(uint amount)
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amount > 0);
		collateralToken.transferFrom(msg.sender, address(this), amount);
		uint wethBalance = collateralToken.balanceOf(address(this));
		require(wethBalance >= amount);
		return createInternal(msg.sender, amount);
	}

	/// @dev
	///	@param amount
	///	@param wethAddr
	function redeem(uint amtInWeiA, uint amtInWeiB) 
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint deductAmtInWeiB = amtInWeiA < amtInWeiB ? amtInWeiA : amtInWeiB;
		address sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWeiB && balanceOf[1][sender] >= deductAmtInWeiB);
		return redeemInternal(sender, deductAmtInWeiB);
	}

	/// @dev
	function closeRound() public inState(State.Trading) returns (bool) {
		uint currentTime = getNowTimestamp();
		require(currentTime >= gameStartTime.add(roundPeriod));
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(
			timeInSecond > gameStartTime.add(roundPeriod).sub(roundPeriodTolInSecond) && 
			timeInSecond < gameStartTime.add(roundPeriod).add(roundPeriodTolInSecond) &&
			timeInSecond <= currentTime && 
			priceInWei > 0
		);
		state = State.NonTrading;
		if (priceInWei > gameStartPriceInWei) {
			result = Result.In;
		} else {
			result = Result.Out;
		}
		gameStartTime = gameStartTime.add(roundPeriod);
		gameStartPriceInWei = getNewTargetPrice(priceInWei);
		emit StartSettling(0, users.length);
		emit AcceptPrice(priceInWei, timeInSecond);
		return true;
	}

	/// @dev
	function startSettling() public inState(State.NonTrading) returns (bool success) {
		address currentAddress;
		uint currentBalanceA;
		uint currentBalanceB;
		uint localResetAddrIndex = nextResetAddrIndex;
		while (localResetAddrIndex < users.length && gasleft() > iterationGasThreshold) {
			currentAddress = users[localResetAddrIndex];
			uint collateralTokenAmtInWei;
			uint feeInWei;
			if (result == Result.In) {
				(collateralTokenAmtInWei,  feeInWei) = deductFee(balanceOf[0][currentAddress], clearanceFeeInBP);
			} else {
				(collateralTokenAmtInWei,  feeInWei) = deductFee(balanceOf[1][currentAddress], clearanceFeeInBP);
			} 
			collateralToken.transferFrom(address(this), currentAddress, collateralTokenAmtInWei);
			tokenCollateralInWei = tokenCollateralInWei.sub(collateralTokenAmtInWei);
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			nextResetAddrIndex = 0;
			state = State.Trading;
			result = Result.None;
			emit StartGame(gameStartPriceInWei, gameStartTime);
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartSettling(localResetAddrIndex, users.length);
			return false;
		}
	}

	/// @dev return totalUsers in the system.
	function totalUsers() public view returns (uint) {
		return users.length;
	}

	function feeBalanceInWei() public view returns(uint) {
		return collateralToken.balanceOf(address(this)).sub(tokenCollateralInWei);
	}

	/*
     *  Internal Function
     */
	/// @dev 
	///	@param priceInWei 
	function getNewTargetPrice(uint priceInWei) internal returns(uint newTargetPriceInWei) {
		uint offSetAmtInWei = priceInWei.mul(dailyTargetDiffInBP).div(BP_DENOMINATOR);
		require(priceInWei >offSetAmtInWei);
		return dailyTargetDirection ? priceInWei.add(offSetAmtInWei) : priceInWei.sub(offSetAmtInWei);
	}

	/// @dev 
	///	@param collateralTokenAmtInWei 
	///	@param commInBP 
	function deductFee(
		uint collateralTokenAmtInWei, 
		uint commInBP
	) 
		internal pure
		returns (
			uint collateralTokenAmtAfterFeeInWei, 
			uint feeInWei) 
	{
		require(collateralTokenAmtInWei > 0);
		feeInWei = collateralTokenAmtInWei.mul(commInBP).div(BP_DENOMINATOR);
		collateralTokenAmtAfterFeeInWei = collateralTokenAmtInWei.sub(feeInWei);
	}

	/// @dev 
	///	@param sender 
	///	@param collateralTokenAmtInWei 
	function createInternal(address sender, uint collateralTokenAmtInWei) 
		internal 
		returns(bool)
	{
		require(collateralTokenAmtInWei > 0);
		uint feeInWei;
		(collateralTokenAmtInWei, feeInWei) = deductFee(collateralTokenAmtInWei, creationFeeInBP);
		tokenCollateralInWei = tokenCollateralInWei.add(collateralTokenAmtInWei);
		uint bTokenValue = collateralTokenAmtInWei;
		uint aTokenValue = bTokenValue;
		balanceOf[0][sender] = balanceOf[0][sender].add(aTokenValue);
		balanceOf[1][sender] = balanceOf[1][sender].add(bTokenValue);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.add(aTokenValue);
		totalSupplyB = totalSupplyB.add(bTokenValue);

		emit Create(
			sender, 
			collateralTokenAmtInWei, 
			aTokenValue, 
			bTokenValue, 
			feeInWei
			);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		aToken.emitTransfer(address(0), sender, aTokenValue);
		bToken.emitTransfer(address(0), sender, bTokenValue);
		return true;
	}

	/// @dev 
	///	@param sender 
	///	@param collateralTokenAmtInWei 
	function redeemInternal(address sender, uint deductAmtInWeiB) 
		internal 
		returns(bool)
	{
		require(deductAmtInWeiB > 0);
		tokenCollateralInWei = tokenCollateralInWei.sub(deductAmtInWeiB);
		uint collateralTokenAmtInWei;
		uint feeInWei;
		(collateralTokenAmtInWei,  feeInWei) = deductFee(deductAmtInWeiB, redemptionFeeInBP);
		balanceOf[0][sender] = balanceOf[0][sender].sub(deductAmtInWeiB);
		balanceOf[1][sender] = balanceOf[1][sender].sub(deductAmtInWeiB);

		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.sub(deductAmtInWeiB);
		totalSupplyB = totalSupplyB.sub(deductAmtInWeiB);
		collateralToken.transferFrom(address(this), msg.sender,  collateralTokenAmtInWei);

		emit Redeem(
			sender, 
			collateralTokenAmtInWei, 
			deductAmtInWeiB, 
			deductAmtInWeiB, 
			feeInWei
		);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		aToken.emitTransfer(sender, address(0), deductAmtInWeiB);
		bToken.emitTransfer(sender, address(0), deductAmtInWeiB);
		return true;
	}

	/// @dev 
	///	@param user 
	///	@param balanceA 
	///	@param balanceB 
	function checkUser(address user, uint256 balanceA, uint256 balanceB) internal {
		uint userIdx = existingUsers[user];
		if ( userIdx > 0) {
			if (balanceA < minBalance && balanceB < minBalance) {
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
		} else if (balanceA >= minBalance || balanceB >= minBalance) {
			users.push(user);
			existingUsers[user] = users.length;
		}
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
		require(to != address(0));
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
     * Operation Functions
     */
	function collectFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint feeBalance = feeBalanceInWei().sub(amountInWei);
		collateralToken.transfer(feeCollector, amountInWei);
		emit CollectFee(feeCollector, amountInWei, feeBalance);
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