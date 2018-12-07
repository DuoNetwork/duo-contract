pragma solidity ^0.5.1;
import { DualClassCustodian } from "./DualClassCustodian.sol";

/// @title Mozart - short & long token contract
/// @author duo.network
contract Mozart is DualClassCustodian {
	/*
     * Constructor
     */
	constructor(
		string memory code,
		uint maturity,
		address roleManagerAddr,
		address payable fc,
		uint alpha,
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
			0,
			0,
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
			resetPriceInWei 
			);
		if (maturityInSecond > 0 && timeInSecond > maturityInSecond) {
			state = State.Matured;
			emit Matured(navAInWei, navBInWei);
		} else if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei) {
			state = State.PreReset;
			lastPreResetBlockNo = block.number;
			emit StartPreReset();
		} 
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		return true;
	}
	
	function calculateNav(
		uint priceInWei, 
		uint rstPriceInWei
		) 
		internal 
		view 
		returns (uint, uint) 
	{
		uint navEthInWei = priceInWei.mul(WEI_DENOMINATOR).div(rstPriceInWei);
		
		uint navParentInWei = navEthInWei
			.mul(alphaInBP
				.add(BP_DENOMINATOR))
			.div(BP_DENOMINATOR);
		
		if(navEthInWei >= WEI_DENOMINATOR.mul(2)) {
			return (0, navParentInWei);
		}

		if(navEthInWei <= WEI_DENOMINATOR
			.mul(2)
			.mul(alphaInBP)
			.div(alphaInBP
				.mul(2)
				.add(BP_DENOMINATOR)
			)
		) {
			return (navParentInWei.mul(BP_DENOMINATOR).div(alphaInBP), 0);
		}
		uint navA = WEI_DENOMINATOR.mul(2).sub(navEthInWei);
		uint navB = navEthInWei
			.mul(alphaInBP
				.mul(2)
				.add(BP_DENOMINATOR))
			.sub(WEI_DENOMINATOR
				.mul(alphaInBP)
				.mul(2))
			.div(BP_DENOMINATOR);
		return (navA, navB);
	}
	// end of priceFetch function

	// start of reset function
	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			state = State.Reset;
			if (navBInWei >= limitUpperInWei) {
				resetState = ResetState.UpwardReset;
				newAFromAPerA = 0;
				newBFromAPerA = 0;
				uint excessBInWei = navBInWei.sub(navAInWei);
				newBFromBPerB = excessBInWei.mul(BP_DENOMINATOR).div(BP_DENOMINATOR.add(alphaInBP));
				newAFromBPerB = newBFromBPerB.mul(alphaInBP).div(BP_DENOMINATOR);
				// adjust total supply
				totalSupplyA = totalSupplyA.mul(navAInWei).div(WEI_DENOMINATOR).add(totalSupplyB.mul(newAFromBPerB).div(WEI_DENOMINATOR));
				totalSupplyB = totalSupplyB.mul(navAInWei).div(WEI_DENOMINATOR).add(totalSupplyB.mul(newBFromBPerB).div(WEI_DENOMINATOR));
			} else {
				resetState = ResetState.DownwardReset;
				newAFromBPerB = 0;
				newBFromBPerB = 0;
				uint excessAInWei = navAInWei.sub(navBInWei);
				newBFromAPerA = excessAInWei.mul(BP_DENOMINATOR).div(BP_DENOMINATOR.add(alphaInBP));
				newAFromAPerA = newBFromAPerA.mul(alphaInBP).div(BP_DENOMINATOR);
				totalSupplyB = totalSupplyB.mul(navBInWei).div(WEI_DENOMINATOR).add(totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR));
				totalSupplyA = totalSupplyA.mul(navBInWei).div(WEI_DENOMINATOR).add(totalSupplyA.mul(newAFromAPerA).div(WEI_DENOMINATOR));
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
		uint newBFromB;
		uint newAFromB;
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
			} else {
				newBFromB = currentBalanceB.mul(newBFromBPerB).div(WEI_DENOMINATOR);
				newAFromB = newBFromB.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.mul(navAInWei).div(WEI_DENOMINATOR).add(newAFromB);
				newBalanceB = currentBalanceB.mul(navAInWei).div(WEI_DENOMINATOR).add(newBFromB);
			}

			balanceOf[0][currentAddress] = newBalanceA;
			balanceOf[1][currentAddress] = newBalanceB;
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			
			resetPriceInWei = lastPriceInWei;
			resetPriceTimeInSecond = lastPriceTimeInSecond;
			navAInWei = WEI_DENOMINATOR;
			navBInWei = WEI_DENOMINATOR;
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
}
