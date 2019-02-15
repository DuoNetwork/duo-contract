pragma solidity ^0.5.0;
import { ICustodianToken } from "../interfaces/ICustodianToken.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { SafeMath } from "../common/SafeMath.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { Erc20Custodian } from "./Erc20Custodian.sol";

/// @title Vivaldi  - binary option token contract
/// @author duo.network
contract Vivaldi is Erc20Custodian {
	/*
     * Storage
     */
	struct Strike {
		uint strikeInWei;
		bool isPositive;
		bool isRelative;
		bool isInclusive;
	}

	Strike strike; 
	uint clearCommInBP;
	uint iterationGasThreshold;

	uint roundStrikeInWei;
	bool isKnockedIn;

	/*
     *  Constructor
     */
	constructor(
		string memory code,
		address collateralTokenAddr,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint createFee,
		uint redeemFee,
		uint clearFee,
		uint pd,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint preResetWaitBlk,
		uint minimumBalance,
		uint iteGasTh
	) public Erc20Custodian(
		code,
		collateralTokenAddr,
		maturity,
		roleManagerAddr,
		fc,
		createFee,
		pd,
		optCoolDown,
		pxFetchCoolDown,
		preResetWaitBlk,
		minimumBalance
	)  {
		redeemCommInBP = redeemFee;
		clearCommInBP = clearFee;
		iterationGasThreshold = iteGasTh;
	}


	/*
     *  Public Function
     */
	/// @dev start option contract
	///	@param aAddr token a address
	///	@param bAddr token b address
	///	@param oracleAddr oracle contract address
	function startCustodian(
		address aAddr,
		address bAddr,
		address oracleAddr,
		uint strikeInWei,
		bool strikeIsPositive,
		bool strikeIsRelative,
		bool strikeIsInclusive
		) 
		public 
		inState(State.Inception) 
		only(operator)
		returns (bool success) 
	{
		aTokenAddress = aAddr;
		aToken = ICustodianToken(aTokenAddress);
		bTokenAddress = bAddr;
		bToken = ICustodianToken(bTokenAddress);
		oracleAddress = oracleAddr;
		oracle = IOracle(oracleAddress);
		strike = Strike(strikeInWei, strikeIsPositive, strikeIsRelative, strikeIsInclusive);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(priceInWei > 0 && timeInSecond > 0);
		resetPriceTimeInSecond = timeInSecond;
		resetPriceInWei = priceInWei;
		roleManager = IMultiSigManager(roleManagerAddress);
		state = State.Trading;
		isKnockedIn = false;
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		emit StartTrading(navAInWei, navBInWei);
		return true;
	}

	/// @dev create
	///	@param amount amount of collateral token to create
	function create(uint amount)
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amount > 0);
		address sender = msg.sender;
		collateralToken.transferFrom(sender, address(this), amount);
		uint collateralTokenBalance = collateralToken.balanceOf(address(this));
		require(collateralTokenBalance >= amount);
		uint feeInWei;
		(amount, feeInWei) = deductFee(amount, createCommInBP);
		tokenCollateralInWei = tokenCollateralInWei.add(amount);
		balanceOf[0][sender] = balanceOf[0][sender].add(amount);
		balanceOf[1][sender] = balanceOf[1][sender].add(amount);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.add(amount);
		totalSupplyB = totalSupplyB.add(amount);

		emit Create(
			sender, 
			amount, 
			amount, 
			amount, 
			feeInWei
			);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		aToken.emitTransfer(address(0), sender, amount);
		bToken.emitTransfer(address(0), sender, amount);
		return true;
	}

	/// @dev redeem
	///	@param amtInWeiA token A amt
	///	@param amtInWeiB token B amt
	function redeem(uint amtInWeiA, uint amtInWeiB) 
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint deductAmtInWei = amtInWeiA < amtInWeiB ? amtInWeiA : amtInWeiB;
		address sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWei && balanceOf[1][sender] >= deductAmtInWei);
		tokenCollateralInWei = tokenCollateralInWei.sub(deductAmtInWei);
		uint collateralTokenAmtInWei;
		uint feeInWei;
		(collateralTokenAmtInWei,  feeInWei) = deductFee(deductAmtInWei, redeemCommInBP);
		balanceOf[0][sender] = balanceOf[0][sender].sub(deductAmtInWei);
		balanceOf[1][sender] = balanceOf[1][sender].sub(deductAmtInWei);

		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.sub(deductAmtInWei);
		totalSupplyB = totalSupplyB.sub(deductAmtInWei);
		collateralToken.transfer(sender,  collateralTokenAmtInWei);

		emit Redeem(
			sender, 
			collateralTokenAmtInWei, 
			deductAmtInWei, 
			deductAmtInWei, 
			feeInWei
		);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		aToken.emitTransfer(sender, address(0), deductAmtInWei);
		bToken.emitTransfer(sender, address(0), deductAmtInWei);
		return true;
	}

	// @dev start round
	function startRound() public inState(State.Trading) returns (bool) {
		// can only start once before the round is ended
		require(lastPriceTimeInSecond < resetPriceTimeInSecond);
		uint currentTime = getNowTimestamp();
		uint minAllowedTime = resetPriceTimeInSecond.add(priceFetchCoolDown);
		require(currentTime > minAllowedTime);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(timeInSecond > minAllowedTime && timeInSecond <= currentTime && priceInWei > 0);
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		if (strike.isRelative) {
			if (strike.isPositive)
				roundStrikeInWei = priceInWei.mul(WEI_DENOMINATOR.add(strike.strikeInWei)).div(WEI_DENOMINATOR);
			else
				roundStrikeInWei = priceInWei.mul(WEI_DENOMINATOR.sub(strike.strikeInWei)).div(WEI_DENOMINATOR);
		} else
			roundStrikeInWei = strike.strikeInWei;
		return true;
	}

	/// @dev end round
	function endRound() public inState(State.Trading) returns (bool) {
		uint currentTime = getNowTimestamp();
		uint requiredTime = resetPriceTimeInSecond.add(period);
		require(currentTime >= requiredTime);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(timeInSecond == requiredTime && timeInSecond <= currentTime && priceInWei > 0);		
		return endRoundInternal(priceInWei, timeInSecond);
	}

	function forceEndRound(uint priceInWei, uint timeInSecond) 
		public 
		inState(State.Trading) 
		returns (bool) 
	{
		uint currentTime = getNowTimestamp();
		uint requiredTime = resetPriceTimeInSecond.add(period);
		require(currentTime > requiredTime && timeInSecond == requiredTime && priceInWei > 0);
		updateOperator();
		return endRoundInternal(priceInWei, timeInSecond);
	}

	function endRoundInternal(uint priceInWei, uint timeInSecond) internal returns (bool) {
		// can only end once before the next round is started
		require(lastPriceTimeInSecond > resetPriceTimeInSecond);
		state = State.PreReset;
		resetPriceInWei = priceInWei;
		resetPriceTimeInSecond = timeInSecond;
		
		if (strike.isPositive) {
			if (priceInWei > roundStrikeInWei 
			|| priceInWei == roundStrikeInWei 
			&& strike.isInclusive)
				isKnockedIn = true;
			else
				isKnockedIn = false;
		} else {
			if (priceInWei < roundStrikeInWei 
			|| priceInWei == roundStrikeInWei 
			&& strike.isInclusive)
				isKnockedIn = true;
			else
				isKnockedIn = false;
		}
		
		emit StartPreReset();
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		return true;
	}

	// start of reset function
	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			emit TotalSupply(totalSupplyA, totalSupplyB);
			emit StartReset(nextResetAddrIndex, users.length);
		} else 
			emit StartPreReset();
		return true;
	}

	/// @dev start pre reset
	function startReset() public inState(State.PreReset) returns (bool success) {
		address currentAddress;
		uint localResetAddrIndex = nextResetAddrIndex;
		while (localResetAddrIndex < users.length && gasleft() > iterationGasThreshold) {
			currentAddress = users[localResetAddrIndex];
			uint collateralTokenAmtInWei;
			uint feeInWei;
			if (isKnockedIn) {
				(collateralTokenAmtInWei, feeInWei) = deductFee(balanceOf[0][currentAddress], clearCommInBP);
			} else {
				(collateralTokenAmtInWei, feeInWei) = deductFee(balanceOf[1][currentAddress], clearCommInBP);
			} 
			balanceOf[0][currentAddress] = 0;
			balanceOf[1][currentAddress] = 0;
			delete existingUsers[currentAddress];
			collateralToken.transfer(currentAddress, collateralTokenAmtInWei);
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			tokenCollateralInWei = 0;
			nextResetAddrIndex = 0;
			state = State.Trading;
			delete users;
			emit StartTrading(navAInWei, navBInWei);
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset(localResetAddrIndex, users.length);
			return false;
		}
	}

	function deductFee(
		uint collateralAmtInWei, 
		uint commInBP
	) 
		internal pure
		returns (
			uint collateralAmtAfterFeeInWei, 
			uint feeInWei) 
	{
		require(collateralAmtInWei > 0);
		feeInWei = collateralAmtInWei.mul(commInBP).div(BP_DENOMINATOR);
		collateralAmtAfterFeeInWei = collateralAmtInWei.sub(feeInWei);
	}

}