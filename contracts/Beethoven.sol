pragma solidity ^0.4.24;
import { Base } from "./Base.sol";
import { DUO } from "./DUO.sol";
import { IOracle } from "./IOracle.sol";
import { IPool } from "./IPool.sol";
import { SafeMath } from "./SafeMath.sol";

contract Beethoven is Base {
	using SafeMath for uint;
	enum State {
		Inception,
		Trading,
		PreReset,
		UpwardReset,
		DownwardReset,
		PeriodicReset
	}

	uint public totalSupplyA;
	uint public totalSupplyB;

	DUO duoToken;
	IOracle oracle;
	IPool pool;
	address aTokenAddress;
	address bTokenAddress;
	address operator;
	address feeCollector;
	address oracleAddress;
	address poolAddress;

	uint constant MIN_BALANCE = 10000000000000000;

	// below 4 data are returned in getSystemPrices
	uint public lastPriceInWei;
	uint public lastPriceTimeInSecond;
	uint public resetPriceInWei;
	uint public resetPriceTimeInSecond;
	// below 19 states are returned in getSystemStates
	State state;
	uint navAInWei;
	uint navBInWei; 
	uint alphaInBP;
	uint betaInWei = WEI_DENOMINATOR;
	uint feeAccumulatedInWei;
	uint periodCouponInWei; 
	uint limitPeriodicInWei; 
	uint limitUpperInWei; 
	uint limitLowerInWei;
	uint createCommInBP;
	uint redeemCommInBP;
	uint period;
	uint iterationGasThreshold = 65000;
	uint ethDuoFeeRatio = 800;
	uint preResetWaitingBlocks = 10;
	uint numOfPrices = 0;
	uint nextResetAddrIndex = 0;
	uint priceFetchCoolDown = 3000;
	
	// cycle state variables
	uint lastPreResetBlockNo = 0;

	// reset intermediate values
	uint bAdj;
	uint newAFromAPerA;
	uint newAFromBPerB;
	uint newBFromAPerA;
	uint newBFromBPerB;

	modifier inState(State _state) {
		require(state == _state);
		_;
	}

	// state events
	event StartTrading(uint navAInWei, uint navBInWei);
	event StartPreReset();
	event StartReset(uint nextIndex, uint total);
	event Create(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event Redeem(address indexed sender, uint ethAmtInWei, uint tokenAInWei, uint tokenBInWei, uint ethFeeInWei, uint duoFeeInWei);
	event TotalSupply(uint totalSupplyA, uint totalSupplyB);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond, uint navAInWei, uint navBInWei);

	// token events
	event Transfer(address indexed from, address indexed to, uint value, uint index);
	event Approval(address indexed tokenOwner, address indexed spender, uint tokens, uint index);
	
	// admin events
	event SetValue(uint index, uint oldValue, uint newValue);
	event CollectFee(address addr, uint value, uint feeAccumulatedInWei);
	event UpdateOperator(address updater, address newOperator);
	
	constructor(
		uint alpha,
		uint r,
		uint hp,
		uint hu,
		uint hd,
		uint c,
		uint p,
		uint optCoolDown,
		uint pxFetchCoolDown,
		uint iteGasTh,
		uint ethDuoRate,
		uint preResetWaitBlk
		) 
		public 
	{
		state = State.Inception;
		operator = msg.sender;
		alphaInBP = alpha;
		periodCouponInWei = r; 
		limitPeriodicInWei = hp; 
		limitUpperInWei = hu; 
		limitLowerInWei = hd;
		createCommInBP = c;
		redeemCommInBP = c;
		period = p;
		iterationGasThreshold = iteGasTh; // 65000;
		ethDuoFeeRatio = ethDuoRate; // 800;
		preResetWaitingBlocks = preResetWaitBlk; // 10;
		navAInWei = WEI_DENOMINATOR;
		navBInWei = WEI_DENOMINATOR;
		operationCoolDown = optCoolDown;
		priceFetchCoolDown = pxFetchCoolDown;
		bAdj = alphaInBP.add(BP_DENOMINATOR).mul(WEI_DENOMINATOR).div(BP_DENOMINATOR);
	}

	function startCustodian(
		address aAddr,
		address bAddr,
		address duoAddress,
		address feeAddress, 
		address poolAddr,
		address oracleAddr
		) 
		public 
		inState(State.Inception) 
		only(operator)
		returns (bool success) 
	{	
		aTokenAddress = aAddr;
		bTokenAddress = bAddr;
		duoToken = DUO(duoAddress);
		feeCollector = feeAddress;
		oracleAddress = oracleAddr;
		oracle = IOracle(oracleAddress);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		lastPriceInWei = priceInWei;
		lastPriceTimeInSecond = timeInSecond;
		resetPriceInWei = priceInWei;
		resetPriceTimeInSecond = timeInSecond;
		poolAddress = poolAddr;
		pool = IPool(poolAddress);
		state = State.Trading;
		emit AcceptPrice(priceInWei, timeInSecond, WEI_DENOMINATOR, WEI_DENOMINATOR);
		emit StartTrading(navAInWei, navBInWei);
		return true;
	}

	// start of public conversion functions
	function create(bool payFeeInEth) 
		public 
		payable 
		inState(State.Trading) 
		returns (bool success) 
	{	
		uint ethAmtInWei; 
		uint feeInWei;
		(ethAmtInWei, feeInWei) = deductFee(msg.value, createCommInBP, payFeeInEth);
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
		address sender = msg.sender;
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
			payFeeInEth ? feeInWei : 0, 
			payFeeInEth ? 0 : feeInWei);
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
		feeInWei = ethAmtInWei.mul(commInBP).div(BP_DENOMINATOR);
		if (payFeeInEth) {
			feeAccumulatedInWei = feeAccumulatedInWei.add(feeInWei);
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
		oracle = IOracle(oracleAddress);
		(uint priceInWei, uint timeInSecond) = oracle.getLastPrice();
		require(timeInSecond > lastPriceTimeInSecond && timeInSecond <= currentTime);
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
				state = State.UpwardReset;
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
				state = State.DownwardReset;
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
				state = State.PeriodicReset;
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

	function startReset() public returns (bool success) {
		require(state == State.UpwardReset || state == State.DownwardReset || state == State.PeriodicReset);
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
			if (state == State.DownwardReset) {
				newBFromA = currentBalanceA.mul(newBFromAPerA).div(WEI_DENOMINATOR);
				newAFromA = newBFromA.mul(alphaInBP).div(BP_DENOMINATOR);
				newBalanceA = currentBalanceA.mul(navBInWei).div(WEI_DENOMINATOR).add(newAFromA);
				newBalanceB = currentBalanceB.mul(navBInWei).div(WEI_DENOMINATOR).add(newBFromA);
			}
			else if (state == State.UpwardReset) {
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
			if (state != State.PeriodicReset) {
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

	// start of public functions
	function getSystemAddresses() public view returns (address[6] sysAddr) {
		sysAddr[0] = operator;
		sysAddr[1] = feeCollector;
		sysAddr[2] = aTokenAddress;
		sysAddr[3] = bTokenAddress;
		sysAddr[4] = oracleAddress;
		sysAddr[5] = poolAddress;
	}

	function getSystemStates() public view returns (uint[23] sysState) {
		sysState[0] = uint(state);
		sysState[1] = navAInWei;
		sysState[2] = navBInWei; 
		sysState[3] = totalSupplyA;
		sysState[4] = totalSupplyB; 
		sysState[5] = address(this).balance;
		sysState[6] = alphaInBP;
		sysState[7] = betaInWei;
		sysState[8] = feeAccumulatedInWei;
		sysState[9] = periodCouponInWei; 
		sysState[10] = limitPeriodicInWei; 
		sysState[11] = limitUpperInWei; 
		sysState[12] = limitLowerInWei;
		sysState[13] = createCommInBP;
		sysState[14] = redeemCommInBP;
		sysState[15] = period;
		sysState[16] = iterationGasThreshold;
		sysState[17] = ethDuoFeeRatio;
		sysState[18] = preResetWaitingBlocks;
		sysState[19] = nextResetAddrIndex;
		sysState[20] = lastOperationTime;
		sysState[21] = operationCoolDown;
		sysState[22] = users.length;
		
	}
	// end of public functions

	// start of token functions
	function transferInternal(uint index, address from, address to, uint tokens) 
		internal 
		inState(State.Trading)
		returns (bool success) 
	{
		// Prevent transfer to 0x0 address. Use burn() instead
		require(to != 0x0);
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

	// start of operator functions
	function collectFee(uint amountInWei) 
		public 
		only(feeCollector) 
		inState(State.Trading) 
		returns (bool success) 
	{
		feeAccumulatedInWei = feeAccumulatedInWei.sub(amountInWei);
		feeCollector.transfer(amountInWei);
		emit CollectFee(msg.sender, amountInWei, feeAccumulatedInWei);
		return true;
	}

	function setValue(uint idx, uint newValue) public only(operator) inUpdateWindow() returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			require(newValue <= BP_DENOMINATOR);
			oldValue = createCommInBP;
			createCommInBP = newValue;
		} else if (idx == 1) {
			require(newValue <= BP_DENOMINATOR);
			oldValue = redeemCommInBP;
			redeemCommInBP = newValue;
		} 
		else if (idx == 2) {
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

	function updateOperator() public inUpdateWindow() returns (bool) {
		address updater = msg.sender;
		operator = pool.provideAddress(updater);
		emit UpdateOperator(updater, operator);
		return true;
	}
	// end of operator functions

	// start of internal utility functions
	function checkUser(address user, uint256 balanceA, uint256 balanceB) internal {
		uint userIdx = existingUsers[user];
		if ( userIdx > 0) {
			if (balanceA < MIN_BALANCE && balanceB < MIN_BALANCE) {
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
		} else if (balanceA >= MIN_BALANCE || balanceB >= MIN_BALANCE) {
			users.push(user);
			existingUsers[user] = users.length;
		}
	}
	// end of internal utility functions
}
