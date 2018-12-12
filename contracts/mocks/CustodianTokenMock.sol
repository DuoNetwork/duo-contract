pragma solidity ^0.5.1;
import { CustodianToken } from "../tokens/CustodianToken.sol";
import { ICustodian } from "../interfaces/ICustodian.sol";

contract CustodianTokenMock is CustodianToken {

	constructor(
		string memory tokenName,
		string memory tokenSymbol,
		address custodianAddr,
		uint index
	) CustodianToken (
		tokenName,
		tokenSymbol,
		custodianAddr,
		index
	) public {
	}

	function setCustodianAddress(address addr) public returns(bool){
		custodianAddress = addr;
		custodianContract = ICustodian(addr);
		return true;
	}

}