const TokenB = artifacts.require('./TokenB.sol');
const DUO = artifacts.require('./DUO.sol');
const Custodian = artifacts.require('./Custodian.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];
const TokenBInit = InitParas['TokenB'];

contract('TokenB', accounts => {
	let tokenBContract;
	let duoContract;
	let custodianContract;

	const creator = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];
	const pf1 = accounts[3];
	const pf2 = accounts[4];
	const pf3 = accounts[5];
	const feeCollector = accounts[6];

	const WEI_DENOMINATOR = 1e18;

	before(async () => {
		duoContract = await DUO.new(
			web3.utils.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);
		custodianContract = await Custodian.new(
			web3.utils.toWei(CustodianInit.ethInitPrice),
			feeCollector,
			duoContract.address,
			pf1,
			pf2,
			pf3,
			CustodianInit.alphaInBP,
			web3.utils.toWei(CustodianInit.couponRate),
			web3.utils.toWei(CustodianInit.hp),
			web3.utils.toWei(CustodianInit.hu),
			web3.utils.toWei(CustodianInit.hd),
			CustodianInit.commissionRateInBP,
			CustodianInit.period,
			web3.utils.toWei(CustodianInit.memberThreshold),
			CustodianInit.gasThreshhold,
			{
				from: creator
			}
		);

		await custodianContract.create({ from: creator, value: web3.utils.toWei('1') });
		tokenBContract = await TokenB.new(
			TokenBInit.tokenName,
			TokenBInit.tokenSymbol,
			custodianContract.address
		);
	});

	it('total supply should be 0', async () => {
		let totalSupply = await tokenBContract.totalSupply.call();
		assert.equal(totalSupply.valueOf(), 0, 'totalSupply not equal to 0');
	});

	it('should show balance', async () => {
		let balance = await tokenBContract.balanceOf.call(creator);
		assert.isTrue(balance.toNumber() > 0, 'balance of creator not equal to created amount');
	});

	it('should be able to approve', async () => {
		let success = await tokenBContract.approve(alice, web3.utils.toWei('100'), {
			from: creator
		});
		assert.isTrue(!!success, 'Not able to approve');
	});

	it('should show allowance', async () => {
		let allowance = await tokenBContract.allowance.call(creator, alice);
		assert.equal(
			allowance.valueOf() / WEI_DENOMINATOR,
			100,
			'allowance of alice not equal to 100'
		);
	});

	it('creator should be able to transfer to bob', async () => {
		let transfer = await tokenBContract.transfer(bob, web3.utils.toWei('10'), {
			from: creator
		});
		assert.isTrue(!!transfer, 'Not able to approve');
	});

	it('should show balance of bob', async () => {
		let balance = await tokenBContract.balanceOf.call(bob);
		assert.equal(balance.toNumber() / WEI_DENOMINATOR, 10, 'balance of bob not equal to 10');
	});

	it('alice cannot transfer 200 from creator to bob', async () => {
		try {
			await tokenBContract.transferFrom(creator, bob, web3.utils.toWei('200'), {
				from: alice
			});
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
		let transferFrom = await tokenBContract.transferFrom(creator, bob, web3.utils.toWei('50'), {
			from: alice
		});
		assert.isTrue(!!transferFrom, 'Not able to transferFrom');
	});

	it('allowance for alice should be 50', async () => {
		let allowance = await tokenBContract.allowance.call(creator, alice);
		assert.equal(
			allowance.toNumber() / WEI_DENOMINATOR,
			50,
			'allowance of alice not equal to 50'
		);
	});

	it('check balance of bob equal 60', async () => {
		let balance = await tokenBContract.balanceOf.call(bob);
		assert.equal(balance.toNumber() / WEI_DENOMINATOR, 60, 'balance of bob not equal to 60');
	});

	it('should not transfer more than balance', async () => {
		try {
			await tokenBContract.transfer(bob, web3.utils.toWei('10000000000000000000000'), {
				from: creator
			});
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
