pragma solidity ^0.4.17;



contract TokenA{
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	uint256 public totalSupply;
	address public duoAdd;  //address of DUO contract

	// This creates an array with all balances
	mapping (address => uint256) public balanceOf;
	mapping (address => mapping (address => uint256)) public allowance;


	/**
	 * Constrctor function
	 *
	 * Initializes contract with initial supply tokens to the creator of the contract
	 */
	function TokenA(

		string tokenName,
		string tokenSymbol,
		address duoAddress
		
	) public 
	{

		totalSupply = 0;
		// balanceOf[msg.sender] = totalSupply;				// Give the creator all initial tokens
		name = tokenName;								   // Set the name for display purposes
		symbol = tokenSymbol;							   // Set the symbol for display purposes
		duoAdd=duoAddress;
	}



	function transfer(address _to, uint256 _value) public {
		//call to DUO contract transferA
		DUO duoContract = DUO(duoAdd);
        duoContract.transferA(msg.sender,_to, _value);
	
	}

	function transferFrom(address _from, address _to, uint256 _value) public returns (bool success) {
		//call to DUO contract transferAFrom
		DUO duoContract = DUO(duoAdd);
        duoContract.transferAFrom(msg.sender,_from, _to, _value);
		return true;
	}

	function approve(address _spender, uint256 _value) public returns (bool success) {
		//call to DUO contract approveA
		return true;
	}

}

contract DUO{
    function transferA(address _from, address to, uint _tokenValue) returns (bool success);
	function transferAFrom(address _spender, address _from, address _to, uint _tokenValue) returns (bool success);
}