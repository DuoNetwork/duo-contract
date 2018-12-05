pragma solidity ^0.5.1;
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { DualClassCustodian } from "./DualClassCustodian.sol";

/// @title Beethoven - dual class token contract
/// @author duo.network
contract Beethoven is DualClassCustodian {
	/*
     * Storage
     */
	enum ResetState {
		UpwardReset,
		DownwardReset,
		PeriodicReset
	}

	ResetState resetState;
	uint periodCouponInWei; 
	uint limitPeriodicInWei; // set to 0 to disable periodic reset


	// reset intermediate values
	uint bAdj;

	/*
     * Constructor
     */
	constructor(
		string memory code,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint comm,
		uint pd,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint iteGasTh,
		uint preResetWaitBlk,
		uint minimumBalance
		) 
		public 
		DualClassCustodian ( 
			code,
			maturity,
			roleManagerAddr,
			fc,
			alpha,
			hu,
			hd,
			comm,
			pd,
			optCoolDown,
			pxFetchCoolDown,
			iteGasTh,
			preResetWaitBlk,
			minimumBalance
		)
	{
		alphaInBP = alpha;
		periodCouponInWei = r; 
		limitPeriodicInWei = hp; 
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		iterationGasThreshold = iteGasTh; // 65000;
		betaInWei = WEI_DENOMINATOR;
		bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
	}

	// start of priceFetch funciton
	function fetchPrice() public inState(State.Trading) returns (bool) {
		uint currentTime = getNowTimestamp();
		require(currentTime > lastPriceTimeInSecond.add(priceFetchCoolDown));
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(timeInSecond > lastPriceTimeInSecond && timeInSecond <= currentTime && priceInWei > 0);
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
		(navAInWei, navBInWei) = calculateNav(
			priceInWei, 
			timeInSecond, 
			resetPriceInWei, 
			resetPriceTimeInSecond, 
			betaInWei);
		if (maturityInSecond > 0 && timeInSecond > maturityInSecond) {
			state = State.Matured;
			emit Matured(navAInWei, navBInWei);
		} else if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei || (limitPeriodicInWei > 0 && navAInWei >= limitPeriodicInWei)) {
			state = State.PreReset;
			lastPreResetBlockNo = block.number;
			emit StartPreReset();
		} 
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		return true;
	}
	
	function calculateNav(
		uint priceInWei, 
		uint timeInSecond, 
		uint rstPriceInWei, 
		uint rstTimeInSecond,
		uint bInWei) 
		public 
		view 
		returns (uint, uint) 
	{
		uint numOfPeriods = timeInSecond.sub(rstTimeInSecond).div(period);
		uint navParent = priceInWei.mul(WEI_DENOMINATOR).div(rstPriceInWei);
		navParent = navParent
			.mul(WEI_DENOMINATOR)
			.mul(alphaInBP.add(BP_DENOMINATOR))
			.div(BP_DENOMINATOR)
			.div(bInWei
		);
		uint navA = periodCouponInWei.mul(numOfPeriods).add(WEI_DENOMINATOR);
		uint navAAdj = navA.mul(alphaInBP).div(BP_DENOMINATOR);
		if (navParent <= navAAdj)
			return (navParent.mul(BP_DENOMINATOR).div(alphaInBP), 0);
		else
			return (navA, navParent.sub(navAAdj));
	}
	// end of priceFetch function

	// start of reset function
	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			uint newBFromA;
			uint newAFromA;
			if (navBInWei >= limitUpperInWei) {
				state = State.Reset;
				resetState = ResetState.UpwardReset;
				betaInWei = WEI_DENOMINATOR;
				uint excessAInWei = navAInWei.sub(WEI_DENOMINATOR);
				uint excessBInWei = navBInWei.sub(WEI_DENOMINATOR);
				// excessive B is enough to cover excessive A
				//if (excessBInWei >= excessAInWei) {
				uint excessBAfterAInWei = excessBInWei.sub(excessAInWei);
				newAFromAPerA = excessAInWei;
				newBFromAPerA = 0;
				uint newBFromExcessBPerB = excessBAfterAInWei.mul(betaInWei).div(bAdj);
				newAFromBPerB = newBFromExcessBPerB.mul(alphaInBP).div(BP_DENOMINATOR);
				newBFromBPerB = excessAInWei.add(newBFromExcessBPerB);			
				// ignore this case for now as it requires a very high coupon rate 
				// and very low upper limit for upward reset and a very high periodic limit
				/*} else {
					uint excessAForBInWei = excessBInWei.mul(alphaInBP).div(BP_DENOMINATOR);
					uint excessAAfterBInWei = excessAInWei.sub(excessAForBInWei);
					newAFromBPerB = 0;
					newBFromBPerB = excessBInWei;
					newBFromAPerA = excessAAfterBInWei.mul(betaInWei).div(bAdj);
					newAFromAPerA = excessAForBInWei.add(newBFromAPerA.mul(alphaInBP).div(BP_DENOMINATOR));
				}*/
				// adjust total supply
				totalSupplyA = totalSupplyA
					.add(totalSupplyA
						.mul(newAFromAPerA)
						.add(totalSupplyB
							.mul(newAFromBPerB))
						.div(WEI_DENOMINATOR)
				);
				totalSupplyB = totalSupplyB
					.add(totalSupplyA
						.mul(newBFromAPerA)
						.add(totalSupplyB
							.mul(newBFromBPerB))
						.div(WEI_DENOMINATOR)
				);
			} else if (navBInWei <= limitLowerInWei) {
				state = State.Reset;
				resetState = ResetState.DownwardReset;
				betaInWei = WEI_DENOMINATOR;
				newBFromAPerA = navAInWei.sub(navBInWei).mul(betaInWei).div(bAdj);
				// below are not used and set to 0
				newAFromAPerA = 0;
				newBFromBPerB = 0;
				newAFromBPerB = 0;
				// adjust total supply
				newBFromA = totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				totalSupplyA = totalSupplyA.mul(navBInWei).div(WEI_DENOMINATOR).add(newAFromA);
				totalSupplyB = totalSupplyB.mul(navBInWei).div(WEI_DENOMINATOR).add(newBFromA);
			} else { // limitPeriodicInWei > 0 && navAInWei >= limitPeriodicInWei
				state = State.Reset;
				resetState = ResetState.PeriodicReset;
				uint num = alphaInBP
					.add(BP_DENOMINATOR)
					.mul(lastPriceInWei);
				uint den = num
					.sub(
						resetPriceInWei
							.mul(alphaInBP)
							.mul(betaInWei)
							.mul(navAInWei
								.sub(WEI_DENOMINATOR))
							.div(WEI_DENOMINATOR)
							.div(WEI_DENOMINATOR)
				);
				betaInWei = betaInWei.mul(num).div(den);
				newBFromAPerA = navAInWei.sub(WEI_DENOMINATOR).mul(betaInWei).div(bAdj);
				// below are not used and set to 0
				newBFromBPerB = 0;
				newAFromAPerA = 0;
				newAFromBPerB = 0;
				// adjust total supply
				newBFromA = totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				totalSupplyA = totalSupplyA.add(newAFromA);
				totalSupplyB = totalSupplyB.add(newBFromA);
			}

			emit TotalSupply(totalSupplyA, totalSupplyB);

			emit StartReset(nextResetAddrIndex, users.length);
		} else 
			emit StartPreReset();

		return true;
	}

	function startReset() public inState(State.Reset) returns (bool success) {
		uint currentBalanceA;
		uint currentBalanceB;
		uint newBalanceA;
		uint newBalanceB;
		uint newAFromA;
		uint newBFromA;
		address currentAddress;
		uint localResetAddrIndex = nextResetAddrIndex;
		while (localResetAddrIndex < users.length && gasleft() > iterationGasThreshold) {
			currentAddress = users[localResetAddrIndex];
			currentBalanceA = balanceOf[0][currentAddress];
			currentBalanceB = balanceOf[1][currentAddress];
			if (resetState == ResetState.DownwardReset) {
				newBFromA = currentBalanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.mul(navBInWei).div(WEI_DENOMINATOR).add(newAFromA);
				newBalanceB = currentBalanceB.mul(navBInWei).div(WEI_DENOMINATOR).add(newBFromA);
			}
			else if (resetState == ResetState.UpwardReset) {
				newBalanceA = currentBalanceA
					.add(currentBalanceA
						.mul(newAFromAPerA)
						.add(currentBalanceB
							.mul(newAFromBPerB))
						.div(WEI_DENOMINATOR)
				);
				newBalanceB = currentBalanceB
					.add(currentBalanceA
						.mul(newBFromAPerA)
						.add(currentBalanceB
							.mul(newBFromBPerB))
						.div(WEI_DENOMINATOR)
				);
			} else {
				newBFromA = currentBalanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.add(newAFromA);
				newBalanceB = currentBalanceB.add(newBFromA);
			}

			balanceOf[0][currentAddress] = newBalanceA;
			balanceOf[1][currentAddress] = newBalanceB;
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			if (resetState != ResetState.PeriodicReset) {
				resetPriceInWei = lastPriceInWei;
				navBInWei = WEI_DENOMINATOR;
			}
			resetPriceTimeInSecond = lastPriceTimeInSecond;
			
			navAInWei = WEI_DENOMINATOR;
			nextResetAddrIndex = 0;

			state = State.Trading;
			emit StartTrading(navAInWei, navBInWei);
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset(localResetAddrIndex, users.length);
			return false;
		}
	}
	// end of reset function

	function getStates() public view returns (uint[30] memory) {
		return [
			// managed
			lastOperationTime,
			operationCoolDown,
			// custodian
			uint(state),
			minBalance,
			totalSupplyA,
			totalSupplyB,
			ethCollateralInWei,
			navAInWei,
			navBInWei,
			lastPriceInWei,
			lastPriceTimeInSecond,
			resetPriceInWei,
			resetPriceTimeInSecond,
			createCommInBP,
			redeemCommInBP,
			period,
			maturityInSecond,
			preResetWaitingBlocks,
			priceFetchCoolDown,
			nextResetAddrIndex,
			totalUsers(),
			feeBalanceInWei(),
			// beethoven
			uint(resetState),
			alphaInBP,
			betaInWei,
			periodCouponInWei, 
			limitPeriodicInWei, 
			limitUpperInWei, 
			limitLowerInWei,
			iterationGasThreshold
		];
	}
}
