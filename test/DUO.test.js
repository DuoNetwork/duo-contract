const DUO = artifacts.require('./DUO.sol');
const util = require('./util');
const CST = require('./constants');
// Event
const TRANSFER = 'Transfer';
const APPROVAL = 'Approval';

contract('DUO', accounts => {
	let duoContract;
	const creator = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];

	const TOTAL_SUPPLY = 10000;

	before(
		async () =>
			(duoContract = await DUO.new(util.toWei(TOTAL_SUPPLY), 'DUO', 'DUO', {
				from: creator
			}))
	);

	it('total supply should be 10000', async () => {
		let supply = await duoContract.totalSupply.call();
		assert.equal(util.fromWei(supply), 10000, 'totalSupply not equal to 10000');
	});

	it('creator balance should be 10000', async () => {
		let balance = await duoContract.balanceOf.call(creator);
		assert.equal(util.fromWei(balance), 10000, 'balance of owner not equal to 10000');
	});

	it('non creater balance should be 0', async () => {
		let balance = await duoContract.balanceOf.call(alice);
		assert.equal(util.fromWei(balance), 0, 'balance of owner not equal to 0');
	});

	it('should be able to approve', async () => {
		let tx = await duoContract.approve(alice, util.toWei(100), { from: creator });
		assert.isTrue(tx.logs.length === 1, 'wdrong numof events');
		assert.isTrue(tx.logs[0].event === APPROVAL);

		assert.isTrue(
			tx.logs[0].args.tokenOwner === creator &&
				tx.logs[0].args.spender === alice &&
				util.isEqual(util.fromWei(tx.logs[0].args.tokens.valueOf()), 100),
			'wrong args'
		);
	});

	it('should show allowance', async () => {
		let allowance = await duoContract.allowance.call(creator, alice);
		assert.equal(util.fromWei(allowance), 100, 'allowance of alice not equal to 100');
	});

	it('creator should be able to transfer to bob', async () => {
		let tx = await duoContract.transfer(bob, util.toWei(10), { from: creator });

		assert.isTrue(tx.logs.length === 1, 'wdrong numof events');
		assert.isTrue(tx.logs[0].event === TRANSFER);

		assert.isTrue(
			tx.logs[0].args.from === creator &&
				tx.logs[0].args.to === bob &&
				util.isEqual(util.fromWei(tx.logs[0].args.tokens), 10),
			'wrong args'
		);
	});

	it('should show balance of bob', async () => {
		let balance = await duoContract.balanceOf.call(bob);
		assert.equal(util.fromWei(balance), 10, 'balance of bob not equal to 10');
	});

	it('alice cannot transfer 200 from creator to bob', async () => {
		try {
			await duoContract.transferFrom(creator, bob, util.toWei(200), { from: alice });
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
		}
	});

	it('alice should transfer 50 from creator to bob', async () => {
		let tx = await duoContract.transferFrom(creator, bob, util.toWei(50), {
			from: alice
		});

		assert.isTrue(tx.logs.length === 1, 'wdrong numof events');
		assert.isTrue(tx.logs[0].event === TRANSFER);

		assert.isTrue(
			tx.logs[0].args.from === creator &&
				tx.logs[0].args.to === bob &&
				util.isEqual(util.fromWei(tx.logs[0].args.tokens), 50),
			'wrong args'
		);
	});

	it('allowance for alice should be 50', async () => {
		let allowance = await duoContract.allowance.call(creator, alice);
		assert.equal(util.fromWei(allowance), 50, 'allowance of alice not equal to 50');
	});

	it('check balance of bob equal 60', async () => {
		let balance = await duoContract.balanceOf.call(bob);
		assert.equal(util.fromWei(balance), 60, 'balance of bob not equal to 60');
	});

	it('should not transfer more than balance', async () => {
		try {
			await duoContract.transfer(bob, util.toWei(10000), { from: creator });
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
		}
	});
});
