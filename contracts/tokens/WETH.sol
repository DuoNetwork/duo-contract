pragma solidity ^0.4.24;

/// @title WETH - Wrap of ETH, issue WETH 1:1 to ETH
/// @author duo.network
contract WETH {
    string public name     = "Wrapped Ether";
    string public symbol   = "WETH";
    uint8  public decimals = 18;

    event  Approval(address indexed tokenOwner, address indexed spender, uint tokens);
    event  Transfer(address indexed src, address indexed dst, uint wad);
    event  Deposit(address indexed sender, uint value);
    event  Withdrawal(address indexed sender, uint value);

    mapping (address => uint)                       public  balanceOf;
    mapping (address => mapping (address => uint))  public  allowance;

	/**
	 * Fall back funciton, deposit with ETH
	 */
    function() public payable {
        deposit();
    }

	/**
	 * Public Function
	 */

	// deposit()
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

	// withdraw
    function withdraw(uint value) public {
        require(balanceOf[msg.sender] >= value);
        balanceOf[msg.sender] -= value;
        msg.sender.transfer(value);
        emit Withdrawal(msg.sender, value);
    }

    function totalSupply() public view returns (uint) {
        return address(this).balance;
    }

	/**
	 * Internal transfer, only can be called by this contract
	 */
	function transfer(address from, address to, uint value) internal {
		// Prevent transfer to 0x0 address. Use burn() instead
		require(to != 0x0);
		// Check if the sender has enough
		require(balanceOf[from] >= value);
		// Check for overflows
		require(balanceOf[to] + value > balanceOf[to]);
		// Save this for an assertion in the future
		uint previousBalances = balanceOf[from] + balanceOf[to];
		// Subtract from the sender
		balanceOf[from] -= value;
		// Add the same to the recipient
		balanceOf[to] += value;
		emit Transfer(from, to, value);
		// Asserts are used to use static analysis to find bugs in your code. They should never fail
		assert(balanceOf[from] + balanceOf[to] == previousBalances);
	}

	/**
	 * Transfer tokens
	 *
	 * Send `value` tokens to `to` from your account
	 *
	 * @param to The address of the recipient
	 * @param value the amount to send
	 */
	function transfer(address to, uint value) public returns (bool success) {
		transfer(msg.sender, to, value);
		return true;
	}

	/**
	 * Transfer tokens from other address
	 *
	 * Send `value` tokens to `to` in behalf of `from`
	 *
	 * @param from The address of the sender
	 * @param to The address of the recipient
	 * @param value the amount to send
	 */
	function transferFrom(address from, address to, uint value) public returns (bool success) {
		require(value <= allowance[from][msg.sender]);	 // Check allowance
		allowance[from][msg.sender] -= value;
		transfer(from, to, value);
		return true;
	}

	/**
	 * Set allowance for other address
	 *
	 * Allows `spender` to spend no more than `value` tokens in your behalf
	 *
	 * @param spender The address authorized to spend
	 * @param value the max amount they can spend
	 */
	function approve(address spender, uint value) public returns (bool success) {
		allowance[msg.sender][spender] = value;
		emit Approval(msg.sender, spender, value);
		return true;
	}
}
