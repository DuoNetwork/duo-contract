pragma solidity ^0.5.1;
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { Custodian } from "./Custodian.sol";

/// @title DualClassCustodian - dual class token contract
/// @author duo.network
contract DualClassCustodian is Custodian {
	/*
     * Storage
     */

	uint alphaInBP;
	uint betaInWei;
	uint limitUpperInWei; 
	uint limitLowerInWei;
	uint iterationGasThreshold;

	// reset intermediate values
	uint newAFromAPerA;
	uint newAFromBPerB;
	uint newBFromAPerA;
	uint newBFromBPerB;

	/*
     * Events
     */
	event SetValue(uint index, uint oldValue, uint newValue);

	function() external payable {}
	
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
		Custodian ( 
		code,
		maturity,
		roleManagerAddr,
		fc,
		comm,
		pd,
		preResetWaitBlk, 
		pxFetchCoolDown,
		msg.sender,
		optCoolDown,
		minimumBalance
		)
	{
		alphaInBP = alpha;
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		iterationGasThreshold = iteGasTh; // 65000;
	}


	/*
     * Public Functions
     */
	/// @dev startCustodian
	///	@param aAddr contract address of Class A
	///	@param bAddr contract address of Class B
	///	@param oracleAddr contract address of Oracle
	function startCustodian(
		address aAddr,
		address bAddr,
		address oracleAddr
		) 
		public 
		inState(State.Inception) 
		only(operator)
		returns (bool success) 
	{	
		aTokenAddress = aAddr;
		bTokenAddress = bAddr;
		oracleAddress = oracleAddr;
		oracle = IOracle(oracleAddress);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(priceInWei > 0 && timeInSecond > 0);
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
		resetPriceInWei = priceInWei;
		resetPriceTimeInSecond = timeInSecond;
		roleManager = IMultiSigManager(roleManagerAddress);
		state = State.Trading;
		emit AcceptPrice(priceInWei, timeInSecond, WEI_DENOMINATOR, WEI_DENOMINATOR);
		emit StartTrading(navAInWei, navBInWei);
		return true;
	}

	/// @dev create with ETH
	function create() 
		public 
		payable 
		inState(State.Trading) 
		returns (bool) 
	{	
		return createInternal(msg.sender, msg.value);
	}

	/// @dev create with ETH
	///	@param amount amount of WETH to create
	///	@param wethAddr wrapEth contract address
	function createWithWETH(uint amount, address wethAddr)
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amount > 0 && wethAddr != address(0));
		IWETH wethToken = IWETH(wethAddr);
		wethToken.transferFrom(msg.sender, address(this), amount);
		uint wethBalance = wethToken.balanceOf(address(this));
		require(wethBalance >= amount);
		uint beforeEthBalance = address(this).balance;
        wethToken.withdraw(wethBalance);
		uint ethIncrement = address(this).balance.sub(beforeEthBalance);
		require(ethIncrement >= wethBalance);
		return createInternal(msg.sender, amount);
	}

	function createInternal(address sender, uint ethAmtInWei) 
		internal 
		returns(bool)
	{
		require(ethAmtInWei > 0);
		uint feeInWei;
		(ethAmtInWei, feeInWei) = deductFee(ethAmtInWei, createCommInBP);
		ethCollateralInWei = ethCollateralInWei.add(ethAmtInWei);
		uint numeritor = ethAmtInWei
						.mul(resetPriceInWei)
						.mul(betaInWei)
						.mul(BP_DENOMINATOR
		);
		uint denominator = WEI_DENOMINATOR
						.mul(WEI_DENOMINATOR)
						.mul(alphaInBP
							.add(BP_DENOMINATOR)
		);
		uint tokenValueB = numeritor.div(denominator);
		uint tokenValueA = tokenValueB.mul(alphaInBP).div(BP_DENOMINATOR);
		balanceOf[0][sender] = balanceOf[0][sender].add(tokenValueA);
		balanceOf[1][sender] = balanceOf[1][sender].add(tokenValueB);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.add(tokenValueA);
		totalSupplyB = totalSupplyB.add(tokenValueB);

		emit Create(
			sender, 
			ethAmtInWei, 
			tokenValueA, 
			tokenValueB, 
			feeInWei
			);
		emit TotalSupply(totalSupplyA, totalSupplyB);	
		return true;

	}

	function redeem(uint amtInWeiA, uint amtInWeiB) 
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint adjAmtInWeiA = amtInWeiA.mul(BP_DENOMINATOR).div(alphaInBP);
		uint deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
		uint deductAmtInWeiA = deductAmtInWeiB.mul(alphaInBP).div(BP_DENOMINATOR);
		address payable sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWeiA && balanceOf[1][sender] >= deductAmtInWeiB);
		uint ethAmtInWei = deductAmtInWeiA
			.add(deductAmtInWeiB)
			.mul(WEI_DENOMINATOR)
			.mul(WEI_DENOMINATOR)
			.div(resetPriceInWei)
			.div(betaInWei);
		return redeemInternal(sender, ethAmtInWei, deductAmtInWeiA, deductAmtInWeiB);
	}

	function redeemAll() public inState(State.Matured) returns (bool success) {
		address payable sender = msg.sender;
		uint balanceAInWei = balanceOf[0][sender];
		uint balanceBInWei = balanceOf[1][sender];
		require(balanceAInWei > 0 || balanceBInWei > 0);
		uint ethAmtInWei = balanceAInWei
			.mul(navAInWei)
			.add(balanceBInWei
				.mul(navBInWei))
			.div(lastPriceInWei);
		return redeemInternal(sender, ethAmtInWei, balanceAInWei, balanceBInWei);
	}

	function redeemInternal(
		address payable sender, 
		uint ethAmtInWei, 
		uint deductAmtInWeiA, 
		uint deductAmtInWeiB) 
		internal 
		returns(bool) 
	{
		require(ethAmtInWei > 0);
		ethCollateralInWei = ethCollateralInWei.sub(ethAmtInWei);
		uint feeInWei;
		(ethAmtInWei,  feeInWei) = deductFee(ethAmtInWei, redeemCommInBP);

		balanceOf[0][sender] = balanceOf[0][sender].sub(deductAmtInWeiA);
		balanceOf[1][sender] = balanceOf[1][sender].sub(deductAmtInWeiB);
		checkUser(sender, balanceOf[0][sender], balanceOf[1][sender]);
		totalSupplyA = totalSupplyA.sub(deductAmtInWeiA);
		totalSupplyB = totalSupplyB.sub(deductAmtInWeiB);
		sender.transfer(ethAmtInWei);
		emit Redeem(
			sender, 
			ethAmtInWei, 
			deductAmtInWeiA, 
			deductAmtInWeiB, 
			feeInWei
		);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		return true;
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
	// end of conversion

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
			oldValue = iterationGasThreshold;
			iterationGasThreshold = newValue;
		} else if (idx == 3) {
			oldValue = preResetWaitingBlocks;
			preResetWaitingBlocks = newValue;
		} else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}
	// end of operator functions

	function getAddresses() public view returns (address[6] memory) {
		return [
			roleManagerAddress,
			operator,
			feeCollector,
			oracleAddress,
			aTokenAddress,
			bTokenAddress
		];
	}
}
