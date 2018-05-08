pragma solidity ^0.4.17;

contract Owned {
	address public owner;

	function Owned() public {
		owner = msg.sender;
	}

	modifier onlyOwner {
		require(msg.sender == owner);
		_;
	}

	function transferOwnership(address newOwner) onlyOwner public {
		owner = newOwner;
	}
}

interface tokenRecipient { function receiveApproval(address _from, uint _value, address _token, bytes _extraData) public; }

contract TokenA is Owned {
	// Public variables of the token
	string public name;
	string public symbol;
	uint8 public decimals = 18;
	uint public sellPrice;
	uint public buyPrice;
	// 18 decimals is the strongly suggested default, avoid changing it
	uint public totalSupply;
	bool public transferable=true;

	// This creates an array with all balances
	mapping (address => uint) public balanceOf;
	mapping (address => mapping (address => uint)) public allowance;
	mapping (address => bool) public frozenAccount;

	/* This generates a public event on the blockchain that will notify clients */
	event FrozenFunds(address target, bool frozen);

	// This generates a public event on the blockchain that will notify clients
	event Transfer(address indexed from, address indexed to, uint value);

	// This notifies clients about the amount burnt
	event Burn(address indexed from, uint value);

	// This generates a public event on the blockchain that will lock or unlock token transfer
	event Lock(bool locking);


	/**
	 * Constrctor function
	 *
	 * Initializes contract with initial supply tokens to the creator of the contract
	 */
	function TokenA(
		uint initialSupply,
		string tokenName,
		string tokenSymbol,
		address centralMinter
	) public 
	{
		if (centralMinter != 0) 
			owner = centralMinter;
		totalSupply = initialSupply * 10 ** uint(decimals);  // Update total supply with the decimal amount
		balanceOf[msg.sender] = totalSupply;				// Give the creator all initial tokens
		name = tokenName;								   // Set the name for display purposes
		symbol = tokenSymbol;							   // Set the symbol for display purposes
	}

	/**
	 * Internal transfer, only can be called by this contract
	 */
	function _transfer(address _from, address _to, uint _value) internal {
		// check whether token transfer is allowed
		require(transferable);
		// Prevent transfer to 0x0 address. Use burn() instead
		require(_to != 0x0);
		// Check if the sender has enough
		require(balanceOf[_from] >= _value);
		// Check for overflows
		require(balanceOf[_to] + _value > balanceOf[_to]);
		//check if sender account is frozen
		require(!frozenAccount[_from]);
		//check if receiver account is frozen
		require(!frozenAccount[_to]);
		// Save this for an assertion in the future
		uint previousBalances = balanceOf[_from] + balanceOf[_to];
		// Subtract from the sender
		balanceOf[_from] -= _value;
		// Add the same to the recipient
		balanceOf[_to] += _value;
		Transfer(_from, _to, _value);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balanceOf[_from] + balanceOf[_to] == previousBalances);
	}

	/**
	 * Transfer tokens
	 *
	 * Send `_value` tokens to `_to` from your account
	 *
	 * @param _to The address of the recipient
	 * @param _value the amount to send
	 */
	function transfer(address _to, uint _value) public {
		_transfer(msg.sender, _to, _value);
	}

	/**
	 * Transfer tokens from other address
	 *
	 * Send `_value` tokens to `_to` in behalf of `_from`
	 *
	 * @param _from The address of the sender
	 * @param _to The address of the recipient
	 * @param _value the amount to send
	 */
	function transferFrom(address _from, address _to, uint _value) public returns (bool success) {
		require(_value <= allowance[_from][msg.sender]);	 // Check allowance
		allowance[_from][msg.sender] -= _value;
		_transfer(_from, _to, _value);
		return true;
	}

	/**
	 * Set allowance for other address
	 *
	 * Allows `_spender` to spend no more than `_value` tokens in your behalf
	 *
	 * @param _spender The address authorized to spend
	 * @param _value the max amount they can spend
	 */
	function approve(address _spender, uint _value) public returns (bool success) {
		allowance[msg.sender][_spender] = _value;
		return true;
	}

	/**
	 * Set allowance for other address and notify
	 *
	 * Allows `_spender` to spend no more than `_value` tokens in your behalf, and then ping the contract about it
	 *
	 * @param _spender The address authorized to spend
	 * @param _value the max amount they can spend
	 * @param _extraData some extra information to send to the approved contract
	 */
	function approveAndCall(address _spender, uint _value, bytes _extraData)
		public
		returns (bool success) 
	{
		tokenRecipient spender = tokenRecipient(_spender);
		if (approve(_spender, _value)) {
			spender.receiveApproval(msg.sender, _value, this, _extraData);
			return true;
		}
	}

	/**
	 * Destroy tokens
	 *
	 * Remove `_value` tokens from the system irreversibly
	 *
	 * @param _value the amount of money to burn
	 */
	function burn(uint _value) public returns (bool success) {
		require(balanceOf[msg.sender] >= _value);   // Check if the sender has enough
		balanceOf[msg.sender] -= _value;			// Subtract from the sender
		totalSupply -= _value;					  // Updates totalSupply
		Burn(msg.sender, _value);
		return true;
	}

	/**
	 * Destroy tokens from other account
	 *
	 * Remove `_value` tokens from the system irreversibly on behalf of `_from`.
	 *
	 * @param _from the address of the sender
	 * @param _value the amount of money to burn
	 */
	function burnFrom(address _from, uint _value) public returns (bool success) {
		require(balanceOf[_from] >= _value);				// Check if the targeted balance is enough
		require(_value <= allowance[_from][msg.sender]);	// Check allowance
		balanceOf[_from] -= _value;						 // Subtract from the targeted balance
		allowance[_from][msg.sender] -= _value;			 // Subtract from the sender's allowance
		totalSupply -= _value;							  // Update totalSupply
		Burn(_from, _value);
		return true;
	}
	
	/// @notice Create `mintedAmount` tokens and send it to `target`
	/// @param target Address to receive the tokens
	/// @param mintedAmount the amount of tokens it will receive
	function mintToken(address target, uint mintedAmount) onlyOwner public {
		balanceOf[target] += mintedAmount;
		totalSupply += mintedAmount;
		Transfer(0, this, mintedAmount);
		Transfer(this, target, mintedAmount);
	}

	/// @notice `freeze? Prevent | Allow` `target` from sending & receiving tokens
	/// @param target Address to be frozen
	/// @param freeze either to freeze it or not
	function freezeAccount(address target, bool freeze) onlyOwner public {
		frozenAccount[target] = freeze;
		FrozenFunds(target, freeze);
	}

	/// @notice Lock and Unlock token transfer
	/// @param a bool type to indicate lock or unlock
	function lockToken(bool locking) onlyOwner public {
		transferable = locking;
		Lock(locking);
	}

	/// @notice Allow users to buy tokens for `newBuyPrice` eth and sell tokens for `newSellPrice` eth
	/// @param newSellPrice Price the users can sell to the contract
	/// @param newBuyPrice Price users can buy from the contract
	function setPrices(uint newSellPrice, uint newBuyPrice) onlyOwner public {
		sellPrice = newSellPrice;
		buyPrice = newBuyPrice;
	}

	function buy() public payable returns (uint amount) {
		amount = msg.value / buyPrice;					// calculates the amount
		require(balanceOf[this] >= amount);			   // checks if it has enough to sell
		balanceOf[msg.sender] += amount;				  // adds the amount to buyer's balance
		balanceOf[this] -= amount;						// subtracts amount from seller's balance
		Transfer(this, msg.sender, amount);			   // execute an event reflecting the change
		return amount;									// ends function and returns
	}

	function sell(uint amount) public returns (uint revenue) {
		require(balanceOf[msg.sender] >= amount);		 // checks if the sender has enough to sell
		balanceOf[this] += amount;						// adds the amount to owner's balance
		balanceOf[msg.sender] -= amount;				  // subtracts the amount from seller's balance
		revenue = amount * sellPrice;
		require(msg.sender.send(revenue));				// sends ether to the seller: it's important to do this last to prevent recursion attacks
		Transfer(msg.sender, this, amount);			   // executes an event reflecting on the change
		return revenue;								   // ends function and returns
	}
}