pragma solidity ^0.4.24;

import { Magi } from "./Magi.sol";

contract MagiMock is Magi {

	constructor(
		address opt,
		address pf1,
		address pf2,
		address pf3,
		address roleManagerAddr,
		uint pxCoolDown,
		uint optCoolDown
	) Magi (
		opt,
		pf1,
		pf2,
		pf3,
		roleManagerAddr,
		pxCoolDown,
		optCoolDown
	)
		public {
	}


	function setLastPrice(uint price, uint time, address sender) public returns (bool) {
		lastPrice.priceInWei = price;
		lastPrice.timeInSecond = time;
		lastPrice.source = sender;
		return true;
	}
}