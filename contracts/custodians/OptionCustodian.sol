pragma solidity ^0.5.0;
import { ICustodianToken } from "../interfaces/ICustodianToken.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { Erc20Custodian } from "./Erc20Custodian.sol";

/// @title OptionCustodian - option custodian contract
/// @author duo.network
contract OptionCustodian is Erc20Custodian {
	/*
     * Storage
     */
	struct Strike {
		uint strikeInWei;
		bool isCall;
		bool isRelative;
		bool isInclusive;
	}

	Strike public strike; 
	uint clearCommInBP;
	uint iterationGasThreshold;

		/*
     * Events
     */
	event SetValue(uint index, uint oldValue, uint newValue);

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
		bool strikeIsCall,
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
		strike = Strike(strikeInWei, strikeIsCall, strikeIsRelative, strikeIsInclusive);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(priceInWei > 0 && timeInSecond > 0);
		resetPriceTimeInSecond = timeInSecond;
		resetPriceInWei = priceInWei;
		roleManager = IMultiSigManager(roleManagerAddress);
		state = State.Trading;
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

	// start of operator functions
	function setValue(uint idx, uint newValue) public only(operator) inState(State.Trading) inUpdateWindow() returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			require(newValue <= BP_DENOMINATOR);
			oldValue = createCommInBP;
			createCommInBP = newValue;
		} else if (idx == 1) {
			require(newValue <= BP_DENOMINATOR);
			oldValue = redeemCommInBP;
			redeemCommInBP = newValue;
		} else if (idx == 2) {
			require(newValue <= BP_DENOMINATOR);
			oldValue = clearCommInBP;
			clearCommInBP = newValue;
		} else if (idx == 3) {
			oldValue = iterationGasThreshold;
			iterationGasThreshold = newValue;
		} else if (idx == 4) {
			oldValue = preResetWaitingBlocks;
			preResetWaitingBlocks = newValue;
		} else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}

}