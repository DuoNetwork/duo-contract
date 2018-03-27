let DUO = artifacts.require('./DUO.sol');

contract('DUO', accounts => {
	it('should be deployed', () => {
		return DUO.deployed().then(instance => assert.isTrue(!!instance));
	});

	it('total supply should be 10000', () => {
		return DUO.deployed().then(instance => {
			instance.totalSupply
				.call()
				.then(totalSupply =>
					assert.equal(
						totalSupply.valueOf() / Math.pow(10, 18),
						10000,
						'totalSupply not equal to 10000'
					)
				);
		});
	});

	it('owner should be the default account, first one', () => {
		return DUO.deployed()
			.then(instance => {
				instance.owner.call().then(
					owner => {
						console.log(owner.valueOf());
						assert.equal(owner.valueOf(), accounts[0], "owner is incorrect");
					}
				);
			});
	});
});
