const web3 = require("web3");
let DUO = artifacts.require('./DUO.sol');

contract('DUO', accounts => {
	it('should be deployed', () => {
		return DUO.deployed().then(instance => assert.isTrue(!!instance));
	});

	it('total supply should be 10000', () => {
		return DUO.deployed().then(instance => {
			instance.totalSupply
				.call()
				.then(supply => {
					return assert.equal(
						supply.toNumber() / 1e18,
						10000,
						'totalSupply not equal to 10000'
					)
				}
					
				);
		});
	});

	it('should show balance', () => {
		return DUO.deployed().then(instance => {
			instance.balanceOf
				.call(accounts[0])
				.then(balance =>
					assert.equal(
						balance.toNumber() / 1e18,
						10000,
						'balance of owner not equal to 10000'
					)
				);
		});
	});

	it('should be able to approve', () => {
		return DUO.deployed().then(instance => {
			instance.approve.call(accounts[1],100,{from:accounts[0]}).then(success =>{
				assert.isTrue(success,"approve not working");
			})
		});
	});

	// it('should show allowance', () => {
	// 	return DUO.deployed().then(instance => {
	// 		instance.allowance
	// 			.call(accounts[0],accounts[1])
	// 			.then(allowance =>{
	// 				console.log(allowance.toNumber());
	// 				// assert.equal(
	// 				// 	balance.toNumber() / 1e18,
	// 				// 	10000,
	// 				// 	'balance of owner not equal to 10000'
	// 				// )

	// 			}

					
	// 			);
	// 	});
	// });


	
	// it('should be able to transfer', () => {
	// 	return DUO.deployed().then(instance => assert.isTrue(!instance));
	// });

	// it('should not transfer more than balance', () => {
	// 	return DUO.deployed().then(instance => assert.isTrue(!instance));
	// });

	
});
