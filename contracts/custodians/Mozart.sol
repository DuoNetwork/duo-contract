pragma solidity ^0.5.1;
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { Custodian } from "./Custodian.sol";

/// @title Mozart - short & long token contract
/// @author duo.network
contract Mozart is Custodian {
	/*
     * Storage
     */
	enum ResetState {
		UpwardReset,
		DownwardReset
	}

	ResetState resetState;
	uint alphaInBP;
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
	///	@param sAddr contract address of short Token
	///	@param LAddr contract address of long Token
	///	@param oracleAddr contract address of Oracle
	function startCustodian(
		address sAddr,
		address LAddr,
		address oracleAddr
		) 
		public 
		inState(State.Inception) 
		only(operator)
		returns (bool success) 
	{	
		aTokenAddress = sAddr;
		bTokenAddress = LAddr;
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
						.mul(BP_DENOMINATOR
		);
		uint denominator = WEI_DENOMINATOR
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
			.div(resetPriceInWei);
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
		public 
		view 
		returns (uint, uint) 
	{
		uint navEth = priceInWei.mul(WEI_DENOMINATOR).div(rstPriceInWei);
		uint navParent = navEth
			.mul(alphaInBP.add(BP_DENOMINATOR))
			.div(BP_DENOMINATOR);

		if(navEth >= 2 * WEI_DENOMINATOR) {
			return (0, navParent);
		}

		if(navEth <= WEI_DENOMINATOR/2) {
			return (navParent.mul(BP_DENOMINATOR).div(alphaInBP), 0);
		}
		uint navA = 2* WEI_DENOMINATOR.sub(navEth);
		uint navB = (2* alphaInBP.add(BP_DENOMINATOR).mul(navEth)
					.sub(2 * alphaInBP.mul(WEI_DENOMINATOR))
					).div(BP_DENOMINATOR);
		return(navA, navB);
	
	}
	// end of priceFetch function

	// start of reset function
	function startPreReset() public inState(State.PreReset) returns (bool success) {
		if (block.number - lastPreResetBlockNo >= preResetWaitingBlocks) {
			state = State.Reset;
	
			if (navBInWei >= limitUpperInWei) {
				
				resetState = ResetState.UpwardReset;
				uint excessBInWei = navBInWei.sub(navAInWei);
				newBFromBPerB = excessBInWei.mul(BP_DENOMINATOR).div(BP_DENOMINATOR + alphaInBP);
				newAFromBPerB = excessBInWei.mul(alphaInBP).div(BP_DENOMINATOR + alphaInBP);
				// adjust total supply
				totalSupplyA = totalSupplyA.add(totalSupplyB.mul(newAFromBPerB).div(WEI_DENOMINATOR));
				totalSupplyB = totalSupplyB.add(totalSupplyB.mul(newBFromBPerB).div(WEI_DENOMINATOR));
			} else {
				resetState = ResetState.DownwardReset;
				uint excessAInWei = navAInWei.sub(navBInWei);
				newBFromAPerA = excessAInWei.mul(BP_DENOMINATOR).div(BP_DENOMINATOR + alphaInBP);
				newAFromAPerA = excessAInWei.mul(alphaInBP).div(BP_DENOMINATOR + alphaInBP);
				totalSupplyA = totalSupplyA.add(totalSupplyA.mul(newAFromAPerA).div(WEI_DENOMINATOR));
				totalSupplyB = totalSupplyB.add(totalSupplyA.mul(newBFromAPerA).div(WEI_DENOMINATOR));
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
			}
			else {
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

	function getStates() public view returns (uint[27] memory) {
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
			limitUpperInWei, 
			limitLowerInWei,
			iterationGasThreshold
		];
	}

	function getAddresses() public view returns (address[6] memory) {
		return [
			// managed
			roleManagerAddress,
			operator,
			// custodian
			feeCollector,
			oracleAddress,
			aTokenAddress,
			bTokenAddress
		];
	}
}
