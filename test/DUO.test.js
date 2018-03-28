const web3 = require('web3');
let DUO = artifacts.require('./DUO.sol');

contract('DUO', accounts => {
	const creater = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];

	const WEIDENOMINATOR = 1e18;

	it('should be deployed', () => {
		return DUO.deployed().then(instance => assert.isTrue(!!instance));
	});

	it('total supply should be 10000', () => {
		return DUO.deployed().then(instance => {
			instance.totalSupply.call().then(supply => {
				return assert.equal(
					supply.toNumber() / 1e18,
					10000,
					'totalSupply not equal to 10000'
				);
			});
		});
	});

	it('should show balance', () => {
		return DUO.deployed().then(instance => {
			instance.balanceOf
				.call(creater)
				.then(balance =>
					assert.equal(
						balance.toNumber() / WEIDENOMINATOR,
						10000,
						'balance of owner not equal to 10000'
					)
				);
		});
	});

	it('should be able to approve', () => {
		return DUO.deployed().then(instance => {
			instance.approve(alice, web3.utils.toWei('100'), { from: creater }).then(success => {
				assert.isTrue(!!success, 'Not able to approve');
			});
		});
	});

	it('should show allowance', () => {
		return DUO.deployed().then(instance => {
			instance.allowance.call(creater, alice).then(allowance => {
				assert.equal(allowance.toNumber() / WEIDENOMINATOR, 100, 'balance of owner not equal to 100');
			});
		});
	});

	it('creater should be able to transfer to bob', () => {
		return DUO.deployed().then(instance => {
			instance.transfer(bob,web3.utils.toWei("10"),{from:creater}).then(transfer => {
				assert.isTrue(!!transfer, 'Not able to approve');
			})
		});
	});

	it('should show balance of bob', () => {
		return DUO.deployed().then(instance => {
			instance.balanceOf
				.call(bob)
				.then(balance =>
					assert.equal(
						balance.toNumber() / WEIDENOMINATOR,
						10,
						'balance of bob not equal to 10'
					)
				);
		});
	});

	it('alice should transferFrom creater to bob', () => {
		return DUO.deployed().then(instance => {
			instance.transferFrom(creater,bob,web3.utils.toWei("50"),{from:alice}).then(transferFrom =>{
				assert.isTrue(!!transferFrom, 'Not able to transferFrom');
			})
		});
	});

	it('check balance of bob equal 60', () => {
		return DUO.deployed().then(instance => {
			instance.balanceOf
				.call(bob)
				.then(balance =>
					assert.equal(
						balance.toNumber() / WEIDENOMINATOR,
						60,
						'balance of bob not equal to 60'
					)
				);
		});
	});

	it('should not transfer more than balance', () => {
		return DUO.deployed().then(instance => {
			instance.transfer(bob,web3.utils.toWei("10000"),{from:creater}).then(
				() => assert.isTrue(false, "can transfer of more than balance")
			).catch(
				err => assert.equal(err.message, "VM Exception while processing transaction: revert", "transaction not reverted")

			);
		});
	});
});
