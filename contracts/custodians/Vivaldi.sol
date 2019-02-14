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
	uint dailyTargetDiffInBP = 500;
	bool dailyTargetDirection = true; 
	uint roundPeriod;
	uint roundPeriodTolInSecond;
	uint clearCommInBP;
	uint iterationGasThreshold;

	enum Result {
		None,
		In,
		Out
	}

	Result result;

	/*
     *  Constructor
     */
	constructor(
		uint roundPd,
		uint roundPeriodTol,
		uint iteGasTh,
		string memory code,
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
		address collateralTokenAddr

	) public Erc20Custodian(
		code,
		maturity,
		roleManagerAddr,
		fc,
		createFee,
		pd,
		optCoolDown,
		pxFetchCoolDown,
		preResetWaitBlk,
		minimumBalance,
		collateralTokenAddr
		
	)  {
		roundPeriod = roundPd;
		createCommInBP = createFee;
		redeemCommInBP = redeemFee;
		clearCommInBP = clearFee;
		minBalance = minimumBalance;
		roundPeriodTolInSecond = roundPeriodTol;
		iterationGasThreshold = iteGasTh;
		state = State.Inception;
	}


	/*
     *  Public Function
     */
	/// @dev start option contract
	///	@param aAddr token a address
	///	@param bAddr token b address
	///	@param oracleAddr oracle contract address
	///	@param dailyDiff daily target price relative diff
	///	@param direction daily target price direction
	function startCustodian(
		address aAddr,
		address bAddr,
		address oracleAddr,
		uint dailyDiff,
		bool direction
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
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(priceInWei > 0 && timeInSecond > 0);
		resetPriceTimeInSecond = timeInSecond;
		resetPriceInWei = getNewTargetPrice(priceInWei);
		roleManager = IMultiSigManager(roleManagerAddress);
		state = State.Trading;
		result = Result.None;
		dailyTargetDiffInBP = dailyDiff;
		dailyTargetDirection = direction;
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
		collateralToken.transferFrom(msg.sender, address(this), amount);
		uint collateralTokenBalance = collateralToken.balanceOf(address(this));
		require(collateralTokenBalance >= amount);
		uint feeInWei;
		address sender = msg.sender;
		(amount, feeInWei) = deductFee(amount, createCommInBP);
		tokenCollateralInWei = tokenCollateralInWei.add(amount);
		uint bTokenValue = amount;
		uint aTokenValue = bTokenValue;
		balanceOf[0][sender] = balanceOf[0][sender].add(aTokenValue);
		balanceOf[1][sender] = balanceOf[1][sender].add(bTokenValue);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.add(aTokenValue);
		totalSupplyB = totalSupplyB.add(bTokenValue);

		emit Create(
			sender, 
			amount, 
			aTokenValue, 
			bTokenValue, 
			feeInWei
			);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		aToken.emitTransfer(address(0), sender, aTokenValue);
		bToken.emitTransfer(address(0), sender, bTokenValue);
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
		uint deductAmtInWeiB = amtInWeiA < amtInWeiB ? amtInWeiA : amtInWeiB;
		address sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWeiB && balanceOf[1][sender] >= deductAmtInWeiB);
		tokenCollateralInWei = tokenCollateralInWei.sub(deductAmtInWeiB);
		uint collateralTokenAmtInWei;
		uint feeInWei;
		(collateralTokenAmtInWei,  feeInWei) = deductFee(deductAmtInWeiB, redeemCommInBP);
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

	/// @dev close game round
	function closeRound() public inState(State.Trading) returns (bool) {
		uint currentTime = getNowTimestamp();
		require(currentTime >= resetPriceTimeInSecond.add(roundPeriod));
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(
			timeInSecond > resetPriceTimeInSecond.add(roundPeriod).sub(roundPeriodTolInSecond) && 
			timeInSecond < resetPriceTimeInSecond.add(roundPeriod).add(roundPeriodTolInSecond) &&
			timeInSecond <= currentTime && 
			priceInWei > 0
		);
		state = State.PreReset;
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
		
		emit StartPreReset();
		emit AcceptPrice(priceInWei, timeInSecond, navAInWei, navBInWei);
		return true;
	}

	// start of reset function
	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			if (lastPriceInWei > resetPriceInWei) {
				result = Result.In;
			} else {
				result = Result.Out;
			}
			resetPriceTimeInSecond = resetPriceTimeInSecond.add(roundPeriod);
			resetPriceInWei = getNewTargetPrice(lastPriceInWei);
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
			if (result == Result.In) {
				(collateralTokenAmtInWei,  feeInWei) = deductFee(balanceOf[0][currentAddress], clearCommInBP);
			} else {
				(collateralTokenAmtInWei,  feeInWei) = deductFee(balanceOf[1][currentAddress], clearCommInBP);
			} 
			collateralToken.transferFrom(address(this), currentAddress, collateralTokenAmtInWei);
			tokenCollateralInWei = tokenCollateralInWei.sub(collateralTokenAmtInWei);
			localResetAddrIndex++;
		}

		if (localResetAddrIndex >= users.length) {
			nextResetAddrIndex = 0;
			state = State.Trading;
			result = Result.None;
			emit StartTrading(navAInWei, navBInWei);
			return true;
		} else {
			nextResetAddrIndex = localResetAddrIndex;
			emit StartReset(localResetAddrIndex, users.length);
			return false;
		}
	}

	/*
     *  Internal Function
     */
	/// @dev get target price
	///	@param priceInWei collateral price
	function getNewTargetPrice(uint priceInWei) internal view returns(uint newTargetPriceInWei) {
		uint offSetAmtInWei = priceInWei.mul(dailyTargetDiffInBP).div(BP_DENOMINATOR);
		require(priceInWei >offSetAmtInWei);
		return dailyTargetDirection ? priceInWei.add(offSetAmtInWei) : priceInWei.sub(offSetAmtInWei);
	}

	function deductFee(
		uint ethAmtInWei, 
		uint commInBP
	) 
		internal pure
		returns (
			uint ethAmtAfterFeeInWei, 
			uint feeInWei) 
	{
		require(ethAmtInWei > 0);
		feeInWei = ethAmtInWei.mul(commInBP).div(BP_DENOMINATOR);
		ethAmtAfterFeeInWei = ethAmtInWei.sub(feeInWei);
	}

}