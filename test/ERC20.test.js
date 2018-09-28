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

// Event
const TRANSFER = 'Transfer';
const APPROVAL = 'Approval';

contract('ERC20Token', accounts => {
	function TOKEN_TEST(tokenName) {
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

		let tokenValueA;
		let tokenValue;
		let tokenContract;

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
				util.toWei(BeethovenInit.minimumBalance),
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
				MagiInit.pxFetchCoolDown,
				MagiInit.optCoolDown,
				{
					from: creator
				}
			);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await beethovenContract.startCustodian(
				tokenAContract.address,
				tokenBContract.address,
				oracleContract.address,
				{ from: creator }
			);
			let amtEth = 1;
			await beethovenContract.create(true, {
				from: creator,
				value: util.toWei(amtEth)
			});

			let tokenValueB =
				((1 - BeethovenInit.comm / BP_DENOMINATOR) * ethInitPrice) /
				(1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);
			tokenValueA = (BeethovenInit.alphaInBP / BP_DENOMINATOR) * tokenValueB;

			tokenValue = tokenName === 'B' ? tokenValueB : tokenValueA;
			tokenContract = tokenName === 'B' ? tokenBContract : tokenAContract;
		});

		it('total supply should be correct', async () => {
			let totalSupply = await tokenContract.totalSupply.call();
			assert.equal(util.fromWei(totalSupply), tokenValue, 'totalSupply not equal to 0');
		});

		it('should show balance', async () => {
			let balance = await tokenContract.balanceOf.call(creator);
			assert.isTrue(
				util.fromWei(balance) > 0,
				'balance of creator not equal to created amount'
			);
		});

		it('should be able to approve', async () => {
			let tx = await tokenContract.approve(alice, util.toWei(100), {
				from: creator
			});

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
			let allowance = await tokenContract.allowance.call(creator, alice);
			assert.equal(util.fromWei(allowance), 100, 'allowance of alice not equal to 100');
		});

		it('creator should be able to transfer to bob', async () => {
			let tx = await tokenContract.transfer(bob, util.toWei('10'), {
				from: creator
			});

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
			let balance = await tokenContract.balanceOf.call(bob);
			assert.equal(util.fromWei(balance), 10, 'balance of bob not equal to 10');
		});

		it('alice cannot transfer 200 from creator to bob', async () => {
			try {
				await tokenContract.transferFrom(creator, bob, util.toWei(200), {
					from: alice
				});
				assert.isTrue(false, 'can transfer of more than balance');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('alice should transfer 50 from creator to bob', async () => {
			let tx = await tokenContract.transferFrom(creator, bob, util.toWei(50), {
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
			let allowance = await tokenContract.allowance.call(creator, alice);
			assert.equal(util.fromWei(allowance), 50, 'allowance of alice not equal to 50');
		});

		it('check balance of bob equal 60', async () => {
			let balance = await tokenContract.balanceOf.call(bob);
			assert.equal(util.fromWei(balance), 60, 'balance of bob not equal to 60');
		});

		it('should not transfer more than balance', async () => {
			try {
				await tokenContract.transfer(bob, util.toWei('10000000000000000000000'), {
					from: creator
				});
				assert.isTrue(false, 'can transfer of more than balance');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});
	}

	describe('ERC20Token A', () => {
		TOKEN_TEST('A');
	});

	describe('ERC20Token B', () => {
		TOKEN_TEST('B');
	});
});
