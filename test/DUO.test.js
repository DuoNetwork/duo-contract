const web3 = require('web3');
let DUO = artifacts.require('./DUO.sol');

contract('DUO', accounts => {
	let duoContract;
	const creator = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];

	const WEI_DENOMINATOR = 1e18;
	const TOTAL_SUPPLY = 10000;

	before(done => {
		DUO.new(web3.utils.toWei(TOTAL_SUPPLY + ''), 'DUO', 'DUO', { from: creator }).then(
			instance => {
				duoContract = instance;
				done();
			}
		);
	});

	it('total supply should be 10000', () => {
		return duoContract.totalSupply.call().then(supply => {
			return assert.equal(
				supply.toNumber() / WEI_DENOMINATOR,
				10000,
				'totalSupply not equal to 10000'
			);
		});
	});

	it('should show balance', () => {
		return duoContract.balanceOf
			.call(creator)
			.then(balance =>
				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					10000,
					'balance of owner not equal to 10000'
				)
			);
	});

	it('should be able to approve', () => {
		return duoContract
			.approve(alice, web3.utils.toWei('100'), { from: creator })
			.then(success => {
				assert.isTrue(!!success, 'Not able to approve');
			});
	});

	it('should show allowance', () => {
		return duoContract.allowance.call(creator, alice).then(allowance => {
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of alice not equal to 100'
			);
		});
	});

	it('creator should be able to transfer to bob', () => {
		return duoContract
			.transfer(bob, web3.utils.toWei('10'), { from: creator })
			.then(transfer => {
				assert.isTrue(!!transfer, 'Not able to approve');
			});
	});

	it('should show balance of bob', () => {
		return duoContract.balanceOf
			.call(bob)
			.then(balance =>
				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					10,
					'balance of bob not equal to 10'
				)
			);
	});

	it('alice cannot transfer 200 from creator to bob', () => {
		return duoContract
			.transferFrom(creator, bob, web3.utils.toWei('200'), { from: alice })
			.then(() => assert.isTrue(false, 'can transfer of more than balance'))
			.catch(err =>
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				)
			);
	});

	it('alice should transfer 50 from creator to bob', () => {
		return duoContract
			.transferFrom(creator, bob, web3.utils.toWei('50'), { from: alice })
			.then(transferFrom => {
				assert.isTrue(!!transferFrom, 'Not able to transferFrom');
			});
	});

	it('allowance for alice should be 50', () => {
		return duoContract.allowance.call(creator, alice).then(allowance => {
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of alice not equal to 50'
			);
		});
	});

	it('check balance of bob equal 60', () => {
		return duoContract.balanceOf
			.call(bob)
			.then(balance =>
				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					60,
					'balance of bob not equal to 60'
				)
			);
	});

	it('should not transfer more than balance', () => {
		return duoContract
			.transfer(bob, web3.utils.toWei('10000'), { from: creator })
			.then(() => assert.isTrue(false, 'can transfer of more than balance'))
			.catch(err =>
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				)
			);
	});
});
