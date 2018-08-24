pragma solidity ^0.4.24;
import { SafeMath } from "./SafeMath.sol";
import { IPool } from "./IPool.sol";

contract Oracle {
	using SafeMath for uint;

	struct Price {
		uint priceInWei;
		uint timeInSecond;
		address source;
	}

	IPool pool;
	address public poolAddress;
	address public operator;
	address public priceFeed1; 
	address public priceFeed2; 
	address public priceFeed3;

	uint constant BP_DENOMINATOR = 10000;

	Price public firstPrice;
	Price public secondPrice;
	Price public lastPrice;
	uint public priceTolInBP = 500; 
	uint public priceFeedTolInBP = 100;
	uint public priceFeedTimeTol = 1 minutes;
	uint public priceUpdateCoolDown;
	uint public numOfPrices = 0;
	uint lastOperationTime;
	uint operationCoolDown;
	bool public started = false;

	modifier only(address addr) {
		require(msg.sender == addr);
		_;
	}

	modifier isPriceFeed() {
		require(msg.sender == priceFeed1 || msg.sender == priceFeed2 || msg.sender == priceFeed3);
		_;
	}

	modifier inUpdateWindow() {
		uint currentTime = getNowTimestamp();
		require(currentTime - lastOperationTime > operationCoolDown);
		_;
		lastOperationTime = currentTime;
	}

	// state events
	event CommitPrice(uint indexed priceInWei, uint indexed timeInSecond, address sender, uint index);
	event AcceptPrice(uint indexed priceInWei, uint indexed timeInSecond, address sender);
	event SetValue(uint index, uint oldValue, uint newValue);
	event UpdatePool(address newPoolAddress);
	event UpdatePriceFeed(address updater, address newPriceFeed);
	event UpdateOperator(address updater, address newOperator);
	
	constructor(
		address opt,
		address pf1,
		address pf2,
		address pf3,
		uint coolDown,
		uint optColDown) 
		public 
	{
		operator = opt;
		priceFeed1 = pf1;
		priceFeed2 = pf2;
		priceFeed3 = pf3;
		priceUpdateCoolDown = coolDown;
		operationCoolDown = optColDown;
	}

	function startOracle(
		uint priceInWei, 
		uint timeInSecond,
		address poolAddr) 
		public 
		isPriceFeed() 
		returns (bool success) 
	{
		require(!started && timeInSecond <= getNowTimestamp());
		poolAddress = poolAddr;
		pool = IPool(poolAddress);
		lastPrice.timeInSecond = timeInSecond;
		lastPrice.priceInWei = priceInWei;
		lastPrice.source = msg.sender;
		started = true;
		emit AcceptPrice(priceInWei, timeInSecond, msg.sender);
		return true;
	}


	function getLastPrice() public view returns(uint, uint) {
		return (lastPrice.priceInWei, lastPrice.timeInSecond);
	}

	// start of oracle
	function commitPrice(uint priceInWei, uint timeInSecond) 
		public 
		isPriceFeed()
		returns (bool success)
	{	
		require(started && timeInSecond <= getNowTimestamp() && timeInSecond > lastPrice.timeInSecond.add(priceUpdateCoolDown));
		uint priceDiff;
		if (numOfPrices == 0) {
			priceDiff = priceInWei.diff(lastPrice.priceInWei);
			if (priceDiff.mul(BP_DENOMINATOR).div(lastPrice.priceInWei) <= priceTolInBP) {
				acceptPrice(priceInWei, timeInSecond, msg.sender);
			} else {
				// wait for the second price
				firstPrice = Price(priceInWei, timeInSecond, msg.sender);
				emit CommitPrice(priceInWei, timeInSecond, msg.sender, 0);
				numOfPrices++;
			}
		} else if (numOfPrices == 1) {
			if (timeInSecond > firstPrice.timeInSecond.add(priceUpdateCoolDown)) {
				if (firstPrice.source == msg.sender)
					acceptPrice(priceInWei, timeInSecond, msg.sender);
				else
					acceptPrice(firstPrice.priceInWei, timeInSecond, firstPrice.source);
			} else {
				require(firstPrice.source != msg.sender);
				// if second price times out, use first one
				if (firstPrice.timeInSecond.add(priceFeedTimeTol) < timeInSecond || 
					firstPrice.timeInSecond.sub(priceFeedTimeTol) > timeInSecond) {
					acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond, firstPrice.source);
				} else {
					priceDiff = priceInWei.diff(firstPrice.priceInWei);
					if (priceDiff.mul(BP_DENOMINATOR).div(firstPrice.priceInWei) <= priceTolInBP) {
						acceptPrice(firstPrice.priceInWei, firstPrice.timeInSecond, firstPrice.source);
					} else {
						// wait for the third price
						secondPrice = Price(priceInWei, timeInSecond, msg.sender);
						emit CommitPrice(priceInWei, timeInSecond, msg.sender, 1);
						numOfPrices++;
					} 
				}
			}
		} else if (numOfPrices == 2) {
			if (timeInSecond > firstPrice.timeInSecond + priceUpdateCoolDown) {
				if ((firstPrice.source == msg.sender || secondPrice.source == msg.sender))
					acceptPrice(priceInWei, timeInSecond, msg.sender);
				else
					acceptPrice(secondPrice.priceInWei, timeInSecond, secondPrice.source);
			} else {
				require(firstPrice.source != msg.sender && secondPrice.source != msg.sender);
				uint acceptedPriceInWei;
				// if third price times out, use first one
				if (firstPrice.timeInSecond.add(priceFeedTimeTol) < timeInSecond || 
					firstPrice.timeInSecond.sub(priceFeedTimeTol) > timeInSecond) {
					acceptedPriceInWei = firstPrice.priceInWei;
				} else {
					// take median and proceed
					// first and second price will never be equal in this part
					// if second and third price are the same, they are median
					if (secondPrice.priceInWei == priceInWei) {
						acceptedPriceInWei = priceInWei;
					} else {
						acceptedPriceInWei = getMedian(firstPrice.priceInWei, secondPrice.priceInWei, priceInWei);
					}
				}
				acceptPrice(acceptedPriceInWei, firstPrice.timeInSecond, firstPrice.source);
			}
		} else {
			return false;
		}

		return true;
	}

	function acceptPrice(uint priceInWei, uint timeInSecond, address source) internal {
		lastPrice.priceInWei = priceInWei;
		lastPrice.timeInSecond = timeInSecond;
		lastPrice.source = source;
		numOfPrices = 0;
		emit AcceptPrice(priceInWei, timeInSecond, source);
	}

	function getMedian(uint a, uint b, uint c) internal pure returns (uint) {
		if (a.gt(b) ^ c.gt(a) == 0x0) {
			return a;
		} else if(b.gt(a) ^ c.gt(b) == 0x0) {
			return b;
		} else {
			return c;
		}
	}
	// end of oracle

	// start of operator function
	function updatePriceFeed(uint index) inUpdateWindow() public returns (bool) {
		address updater = msg.sender;
		address newAddr = pool.provideAddress(updater);
		if(index == 0) {
			priceFeed1 = newAddr;
		} else if(index == 1){
			priceFeed2 = newAddr;
		} else if(index == 2) {
			priceFeed3 = newAddr;
		} else {
			return false;
		}
		emit UpdatePriceFeed(updater, newAddr);
		return true;
	}

	function updateOperator() inUpdateWindow() public returns (bool) {
		address updater = msg.sender;
		operator = pool.provideAddress(updater);
		emit UpdateOperator(updater, operator);
		return true;
	}

	function updatePool(address newPoolAddr) only(pool.poolManager()) inUpdateWindow() public returns (bool) {
		poolAddress = newPoolAddr;
		pool = IPool(poolAddress);
		require(pool.poolManager() != 0x0);
		emit UpdatePool(newPoolAddr);
		return true;
	}

	function setValue(uint idx, uint newValue) public only(operator) inUpdateWindow() returns (bool success) {
		uint oldValue;
		if (idx == 0) {
			oldValue = priceTolInBP;
			priceTolInBP = newValue;
		} else if (idx == 1) {
			oldValue = priceFeedTolInBP;
			priceFeedTolInBP = newValue;
		} else if (idx == 2) {
			oldValue = priceFeedTimeTol;
			priceFeedTimeTol = newValue;
		} else if (idx == 3) {
			oldValue = priceUpdateCoolDown;
			priceUpdateCoolDown = newValue;
		} else {
			revert();
		}

		emit SetValue(idx, oldValue, newValue);
		return true;
	}
	// end of operator function

	// start of internal utility functions
	function getNowTimestamp() internal view returns (uint) {
		return now;
	}

	function getSystemPrices() 
		public 
		view 
		returns (
			address firstAddr, 
			uint firstPx, 
			uint firstTs, 
			address secondAddr, 
			uint secondPx, 
			uint secondTs,
			address lastAddr,
			uint lastPx,
			uint lastTs) 
	{
		firstAddr = firstPrice.source;
		firstPx = firstPrice.priceInWei;
		firstTs = firstPrice.timeInSecond;
		secondAddr = secondPrice.source;
		secondPx = secondPrice.priceInWei;
		secondTs = secondPrice.timeInSecond;
		lastAddr = lastPrice.source;
		lastPx = lastPrice.priceInWei;
		lastTs = lastPrice.timeInSecond;
	}
	// end of internal utility functions
}
