pragma solidity ^0.5.0;
import { OptionCustodian } from "./OptionCustodian.sol";

/// @title Vivaldi  - binary option custodian contract
/// @author duo.network
contract Vivaldi is OptionCustodian {
	/*
     * Storage
     */

	uint roundStrikeInWei;
	bool public isKnockedIn = false;

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
	) public OptionCustodian(
		code,
		collateralTokenAddr,
		maturity,
		roleManagerAddr,
		fc,
		createFee,
		redeemFee,
		clearFee,
		pd,
		optCoolDown,
		pxFetchCoolDown,
		preResetWaitBlk,
		minimumBalance,
		iteGasTh
	)  {
	}

	// @dev start round
	function startRound() public inState(State.Trading) returns (bool) {
		if (priceFetchCoolDown > 0) {
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
		} else {
			lastPriceInWei = resetPriceInWei;
			lastPriceTimeInSecond = resetPriceTimeInSecond;
		}
		
		if (strike.isRelative) 
			roundStrikeInWei = lastPriceInWei.mul(strike.strikeInWei).div(WEI_DENOMINATOR);
		else
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
		
		if (strike.isCall) {
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
			if(maturityInSecond > 0 && getNowTimestamp() >= maturityInSecond) {
				state = State.Matured;
				emit Matured(navAInWei, navBInWei);
			} else {
				state = State.Trading;
				emit StartTrading(navAInWei, navBInWei);
			}

			delete users;
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset(localResetAddrIndex, users.length);
			return false;
		}
	}

	function getStates() public returns (uint[23] memory) {
		return [
			lastOperationTime,
			operationCoolDown,
			uint(state),
			minBalance,
			totalSupplyA,
			totalSupplyB,
			tokenCollateralInWei,
			lastPriceInWei,
			lastPriceTimeInSecond,
			resetPriceInWei,
			resetPriceTimeInSecond,
			createCommInBP,
			redeemCommInBP,
			clearCommInBP,
			period,
			maturityInSecond,
			preResetWaitingBlocks,
			priceFetchCoolDown,
			nextResetAddrIndex,
			totalUsers(),
			tokenFeeBalanceInWei(),
			iterationGasThreshold,
			roundStrikeInWei
		];
	}

	function getAddresses() public view returns (address[7] memory) {
		return [
			roleManagerAddress,
			operator,
			feeCollector,
			oracleAddress,
			aTokenAddress,
			bTokenAddress,
			collateralTokenAddress
		];
	} 
}