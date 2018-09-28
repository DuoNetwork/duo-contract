pragma solidity ^0.4.24;
import { IMultiSigManager } from "../interfaces/IMultiSigManager.sol";
import { IWETH } from "../interfaces/IWETH.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { Custodian } from "./Custodian.sol";
// import { SafeMath } from "../common/SafeMath.sol";

/// @title Beethoven - dual class token contract
/// @author duo.network
contract Beethoven is Custodian {
	// using SafeMath for uint;

	/*
     * Storage
     */
	enum ResetState {
		UpwardReset,
		DownwardReset,
		PeriodicReset
	}

	ResetState resetState;
	uint public alphaInBP;
	uint public betaInWei = WEI_DENOMINATOR;
	uint public periodCouponInWei; 
	uint public limitPeriodicInWei; 
	uint public limitUpperInWei; 
	uint public limitLowerInWei;
	uint public iterationGasThreshold;
	uint public ethDuoFeeRatio;

	// reset intermediate values
	uint bAdj;
	uint newAFromAPerA;
	uint newAFromBPerB;
	uint newBFromAPerA;
	uint newBFromBPerB;

	/*
     * Events
     */
	event SetValue(uint index, uint oldValue, uint newValue);

	function() public payable {}
	
	/*
     * Constructor
     */
	constructor(
		address duoTokenAddr,
		address roleManagerAddr,
		address fc,
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
		uint ethDuoRate,
		uint preResetWaitBlk,
		uint minimumBalance
		) 
		public 
		Custodian ( 
		duoTokenAddr,
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
		periodCouponInWei = r; 
		limitPeriodicInWei = hp; 
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		iterationGasThreshold = iteGasTh; // 65000;
		ethDuoFeeRatio = ethDuoRate; // 800;
		bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
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
	///	@param payFeeInEth pay fee in ETH or DUO token
	function create(bool payFeeInEth) 
		public 
		payable 
		inState(State.Trading) 
		returns (bool) 
	{	
		return createInternal(msg.sender, msg.value, payFeeInEth);
	}

	/// @dev create with ETH
	///	@param amount amount of WETH to create
	///	@param payFeeInEth pay fee in ETH or DUO token
	///	@param wethAddr wrapEth contract address
	function createWithWETH(uint amount, bool payFeeInEth, address wethAddr)
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		require(amount > 0 && wethAddr != 0x0);
		IWETH wethToken = IWETH(wethAddr);
		wethToken.transferFrom(msg.sender, address(this), amount);
		uint wethBalance = wethToken.balanceOf(address(this));
		require(wethBalance >= amount);
		uint beforeEthBalance = address(this).balance;
        wethToken.withdraw(wethBalance);
		uint ethIncrement = address(this).balance.sub(beforeEthBalance);
		require(ethIncrement >= wethBalance);
		return createInternal(msg.sender, amount, payFeeInEth);
	}

	function createInternal(address sender, uint ethAmtInWei, bool payFeeInEth) 
		internal 
		returns(bool)
	{
		require(ethAmtInWei > 0);
		uint feeInWei;
		(ethAmtInWei, feeInWei) = deductFee(ethAmtInWei, createCommInBP, payFeeInEth);
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
		uint ethFeeInWei = payFeeInEth ? feeInWei : 0;
		uint duoFeeInWei = payFeeInEth ? 0 : feeInWei;

		emit Create(
			sender, 
			ethAmtInWei, 
			tokenValueA, 
			tokenValueB, 
			ethFeeInWei,
			duoFeeInWei
			);
		emit TotalSupply(totalSupplyA, totalSupplyB);	
		return true;

	}

	function redeem(uint amtInWeiA, uint amtInWeiB, bool payFeeInEth) 
		public 
		inState(State.Trading) 
		returns (bool success) 
	{
		uint adjAmtInWeiA = amtInWeiA.mul(BP_DENOMINATOR).div(alphaInBP);
		uint deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
		uint deductAmtInWeiA = deductAmtInWeiB.mul(alphaInBP).div(BP_DENOMINATOR);
		address sender = msg.sender;
		require(balanceOf[0][sender] >= deductAmtInWeiA && balanceOf[1][sender] >= deductAmtInWeiB);
		uint ethAmtInWei = deductAmtInWeiA
			.add(deductAmtInWeiB)
			.mul(WEI_DENOMINATOR)
			.mul(WEI_DENOMINATOR)
			.div(resetPriceInWei)
			.div(betaInWei);
		ethCollateralInWei = ethCollateralInWei.sub(ethAmtInWei);
		uint feeInWei;
		(ethAmtInWei,  feeInWei) = deductFee(ethAmtInWei, redeemCommInBP, payFeeInEth);

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
			payFeeInEth ? feeInWei : 0, 
			payFeeInEth ? 0 : feeInWei);
		emit TotalSupply(totalSupplyA, totalSupplyB);
		return true;
	}

	function deductFee(
		uint ethAmtInWei, 
		uint commInBP,
		bool payFeeInEth) 
		internal 
		returns (
			uint ethAmtAfterFeeInWei, 
			uint feeInWei) 
	{
		require(ethAmtInWei > 0);
		feeInWei = ethAmtInWei.mul(commInBP).div(BP_DENOMINATOR);
		if (payFeeInEth) {
			ethAmtAfterFeeInWei = ethAmtInWei.sub(feeInWei);
		} else {
			feeInWei = feeInWei.mul(ethDuoFeeRatio);
			require(duoToken.transferFrom(msg.sender, this, feeInWei));
			ethAmtAfterFeeInWei = ethAmtInWei;
		}
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
			timeInSecond, 
			resetPriceInWei, 
			resetPriceTimeInSecond, 
			betaInWei);
		if (navBInWei >= limitUpperInWei || navBInWei <= limitLowerInWei || navAInWei >= limitPeriodicInWei) {
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
			} else if(navBInWei <= limitLowerInWei) {
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
			} else { // navAInWei >= limitPeriodicInWei
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
				resetPriceTimeInSecond = lastPriceTimeInSecond;
				navBInWei = WEI_DENOMINATOR;
			}
			
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
			oldValue = ethDuoFeeRatio;
			ethDuoFeeRatio = newValue;
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
	// end of operator functions	

	function getUserSize() public view returns (uint) {
		return users.length;
	}
}
