const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Beethoven = artifacts.require('../contracts/mocks/BeethovenMock');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const DUO = artifacts.require('../contracts/mocks/DUOMock.sol');
const TokenA = artifacts.require('../contracts/tokens/TokenA.sol');
const TokenB = artifacts.require('../contracts/tokens/TokenB.sol');
const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const TokenAInit = InitParas['TokenA'];
const TokenBInit = InitParas['TokenB'];
const util = require('./util');
const ethInitPrice = 582;
const BP_DENOMINATOR = 10000;

contract('TokenB', accounts => {
	let tokenAContract, tokenBContract;
	let duoContract;
	let beethovenContract;
	let oracleContract;
	let roleManagerContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const alice = accounts[5];
	const bob = accounts[6];

	let tokenValueB;

	before(async () => {
		duoContract = await DUO.new(
			util.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);

		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});
		beethovenContract = await Beethoven.new(
			duoContract.address,
			roleManagerContract.address,
			fc,
			BeethovenInit.alphaInBP,
			util.toWei(BeethovenInit.couponRate),
			util.toWei(BeethovenInit.hp),
			util.toWei(BeethovenInit.hu),
			util.toWei(BeethovenInit.hd),
			BeethovenInit.comm,
			BeethovenInit.pd,
			BeethovenInit.optCoolDown,
			BeethovenInit.pxFetchCoolDown,
			BeethovenInit.iteGasTh,
			BeethovenInit.ethDuoRate,
			BeethovenInit.preResetWaitBlk,
			{
				from: creator
			}
		);

		tokenAContract = await TokenA.new(
			TokenAInit.tokenName,
			TokenAInit.tokenSymbol,
			beethovenContract.address,
			{
				from: creator
			}
		);
		tokenBContract = await TokenB.new(
			TokenBInit.tokenName,
			TokenBInit.tokenSymbol,
			beethovenContract.address,
			{
				from: creator
			}
		);

		oracleContract = await Magi.new(
			creator,
			pf1,
			pf2,
			pf3,
			roleManagerContract.address,
			MagiInit.pxCoolDown,
			MagiInit.optCoolDown,
			{
				from: creator
			}
		);
		let time = await oracleContract.timestamp.call();
		await oracleContract.setLastPrice(
			util.toWei(ethInitPrice + '', 'ether'),
			time.valueOf(),
			pf1
		);
		await beethovenContract.startCustodian(
			tokenAContract.address,
			tokenBContract.address,
			oracleContract.address,
			{ from: creator }
		);
		let amtEth = 1;
		await beethovenContract.create(true, {
			from: creator,
			value: util.toWei(amtEth + '')
		});
		tokenValueB =
			((1 - BeethovenInit.comm / BP_DENOMINATOR) * ethInitPrice) /
			(1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);
	});

	it('total supply should be correct', async () => {
		let totalSupply = await tokenBContract.totalSupply.call();
		assert.equal(
			util.fromWei(totalSupply),
			tokenValueB,
			'totalSupply not equal to correct value'
		);
	});

	it('should show balance', async () => {
		let balance = await tokenBContract.balanceOf.call(creator);
		assert.isTrue(util.fromWei(balance) > 0, 'balance of creator not equal to created amount');
	});

	it('should be able to approve', async () => {
		let success = await tokenBContract.approve(alice, util.toWei(100), {
			from: creator
		});
		assert.isTrue(!!success, 'Not able to approve');
	});

	it('should show allowance', async () => {
		let allowance = await tokenBContract.allowance.call(creator, alice);
		assert.equal(util.fromWei(allowance), 100, 'allowance of alice not equal to 100');
	});

	it('creator should be able to transfer to bob', async () => {
		let transfer = await tokenBContract.transfer(bob, util.toWei(10), {
			from: creator
		});
		assert.isTrue(!!transfer, 'Not able to approve');
	});

	it('should show balance of bob', async () => {
		let balance = await tokenBContract.balanceOf.call(bob);
		assert.equal(util.fromWei(balance), 10, 'balance of bob not equal to 10');
	});

	it('alice cannot transfer 200 from creator to bob', async () => {
		try {
			await tokenBContract.transferFrom(creator, bob, util.toWei(200), {
				from: alice
			});
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
		}
	});

	it('alice should transfer 50 from creator to bob', async () => {
		let transferFrom = await tokenBContract.transferFrom(creator, bob, util.toWei(50), {
			from: alice
		});
		assert.isTrue(!!transferFrom, 'Not able to transferFrom');
	});

	it('allowance for alice should be 50', async () => {
		let allowance = await tokenBContract.allowance.call(creator, alice);
		assert.equal(util.fromWei(allowance), 50, 'allowance of alice not equal to 50');
	});

	it('check balance of bob equal 60', async () => {
		let balance = await tokenBContract.balanceOf.call(bob);
		assert.equal(util.fromWei(balance), 60, 'balance of bob not equal to 60');
	});

	it('should not transfer more than balance', async () => {
		try {
			await tokenBContract.transfer(bob, util.toWei('10000000000000000000000'), {
				from: creator
			});
			assert.isTrue(false, 'can transfer of more than balance');
		} catch (err) {
			assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
		}
	});
});
