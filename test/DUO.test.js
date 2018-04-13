const web3 = require('web3');
let DUO = artifacts.require('./DUO.sol');

contract('DUO', accounts => {
	let duoContract;
	const creator = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];

	const WEI_DENOMINATOR = 1e18;
	const TOTAL_SUPPLY = 10000;

	before(
		async () =>
			(duoContract = await DUO.new(web3.utils.toWei(TOTAL_SUPPLY + ''), 'DUO', 'DUO', {
				from: creator
			}))
	);

	it('total supply should be 10000', async () => {
		let supply = await duoContract.totalSupply.call();
		assert.equal(
			// web3 1.0 has BN package for fromWei/toWei and only takes in string or BN object
			// but the conversion does not handle scientific notation of 1e+22
			supply.toNumber() / WEI_DENOMINATOR,
			10000,
			'totalSupply not equal to 10000'
		);
	});

	it('creator balance should be 10000', async () => {
		let balance = await duoContract.balanceOf.call(creator);
		assert.equal(
			balance.toNumber() / WEI_DENOMINATOR,
			10000,
			'balance of owner not equal to 10000'
		);
	});

	it('non creater balance should be 0', async () => {
		let balance = await duoContract.balanceOf.call(alice);
		assert.equal(balance.toNumber() / WEI_DENOMINATOR, 0, 'balance of owner not equal to 0');
	});

	it('should be able to approve', async () => {
		let success = await duoContract.approve(alice, web3.utils.toWei('100'), { from: creator });
		assert.isTrue(!!success, 'Not able to approve');
	});

	it('should show allowance', async () => {
		let allowance = await duoContract.allowance.call(creator, alice);
		assert.equal(
			allowance.toNumber() / WEI_DENOMINATOR,
			100,
			'allowance of alice not equal to 100'
		);
	});

	it('creator should be able to transfer to bob', async () => {
		let transfer = await duoContract.transfer(bob, web3.utils.toWei('10'), { from: creator });
		assert.isTrue(!!transfer, 'Not able to approve');
	});

	it('should show balance of bob', async () => {
		let balance = await duoContract.balanceOf.call(bob);
		assert.equal(balance.toNumber() / WEI_DENOMINATOR, 10, 'balance of bob not equal to 10');
	});

	it('alice cannot transfer 200 from creator to bob', async () => {
		try {
			await duoContract.transferFrom(creator, bob, web3.utils.toWei('200'), { from: alice });
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(
				err.message,
				'VM Exception while processing transaction: revert',
				'transaction not reverted'
			);
		}
	});

	it('alice should transfer 50 from creator to bob', async () => {
		let transferFrom = await duoContract.transferFrom(creator, bob, web3.utils.toWei('50'), {
			from: alice
		});
		assert.isTrue(!!transferFrom, 'Not able to transferFrom');
	});

	it('allowance for alice should be 50', async () => {
		let allowance = await duoContract.allowance.call(creator, alice);
		assert.equal(
			allowance.toNumber() / WEI_DENOMINATOR,
			50,
			'allowance of alice not equal to 50'
		);
	});

	it('check balance of bob equal 60', async () => {
		let balance = await duoContract.balanceOf.call(bob);
		assert.equal(balance.toNumber() / WEI_DENOMINATOR, 60, 'balance of bob not equal to 60');
	});

	it('should not transfer more than balance', async () => {
		try {
			await duoContract.transfer(bob, web3.utils.toWei('10000'), { from: creator });
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(
				err.message,
				'VM Exception while processing transaction: revert',
				'transaction not reverted'
			);
		}
	});
});
