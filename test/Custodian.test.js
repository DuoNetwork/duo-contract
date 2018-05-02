let Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];

const ACCEPT_PRICE = 'AcceptPrice';
const START_PRE_RESET = 'StartPreReset';
const START_RESET = 'StartReset';
const START_TRADING = 'StartTrading';

const STATE_INCEPT_RESET = '0';
const STATE_TRADING = '1';
const STATE_PRE_RESET = '2';
const STATE_UPWARD_RESET = '3';
const STATE_DOWNWARD_RESET = '4';
const STATE_PERIODIC_RESET = '5';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 6e-13;
const ethInitPrice = 582;

const isEqual = (a, b, log = false) => {
	if (log) {
		console.log(a);
		console.log(b);
	}
	return Math.abs(Number(a) - Number(b)) <= EPSILON;
};

contract('Custodian', accounts => {
	let custodianContract;
	let duoContract;

	const creator = accounts[0];
	const alice = accounts[1]; //duoMember
	const bob = accounts[2];
	const charles = accounts[3];
	const nonDuoMember = accounts[4];
	const pf1 = accounts[5];
	const pf2 = accounts[6];
	const pf3 = accounts[7];
	const fc = accounts[8];

	const WEI_DENOMINATOR = 1e18;
	const BP_DENOMINATOR = 10000;

	const initContracts = async () => {
		duoContract = await DUO.new(
			web3.utils.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);

		custodianContract = await Custodian.new(
			fc,
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
			CustodianInit.coolDown,
			{
				from: creator
			}
		);

		// await custodianContract.startContract('507', 1524105709, {from: pf1});
	};

	describe('constructor', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let feeCollector = await custodianContract.getFeeCollector.call();
			assert.equal(feeCollector.valueOf(), fc, 'feeCollector specified incorrect');
		});

		it('priceFeed1 should equal specified value', async () => {
			let priceFeed1 = await custodianContract.getPriceFeed1.call();
			assert.equal(priceFeed1.valueOf(), pf1, 'priceFeed1 specified incorrect');
		});

		it('priceFeed2 should equal specified value', async () => {
			let priceFeed2 = await custodianContract.getPriceFeed2.call();
			assert.equal(priceFeed2.valueOf(), pf2, 'priceFeed2 specified incorrect');
		});

		it('priceFeed3 should equal specified value', async () => {
			let priceFeed3 = await custodianContract.getPriceFeed3.call();
			assert.equal(priceFeed3.valueOf(), pf3, 'priceFeed3 specified incorrect');
		});

		it('admin should equal specified value', async () => {
			let admin = await custodianContract.getAdmin.call();
			assert.equal(admin.valueOf(), creator, 'admin specified incorrect');
		});

		it('priceTolInBP should equal 500', async () => {
			let getPriceTolInBP = await custodianContract.getPriceTolInBP.call();
			assert.equal(getPriceTolInBP.valueOf(), 500, 'priceTolInBP specified incorrect');
		});

		it('period should equal specified value', async () => {
			let period = await custodianContract.period.call();
			assert.equal(period.valueOf(), CustodianInit.period, 'period specified incorrect');
		});

		it('priceUpdateCoolDown should equal specified value', async () => {
			let priceCoolDown = await custodianContract.getPriceUpdateCoolDown.call();
			assert.equal(
				priceCoolDown.valueOf(),
				CustodianInit.coolDown,
				'priceUpdateCoolDown specified incorrect'
			);
		});
	});

	describe('start contract', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('should start contract', async () => {
			let success = await custodianContract.startContract.call(
				web3.utils.toWei('507'),
				1524105709,
				{ from: pf1 }
			);
			assert.isTrue(success, 'not able to start contract');
			await custodianContract.startContract('507', 1524105709, { from: pf1 });
		});

		it('should update lastPrice and resetPrice', async () => {
			let lastPrice = await custodianContract.lastPrice.call();
			assert.equal(lastPrice[0].valueOf(), '507', 'lastPrice price not updated correctly');
			assert.equal(
				lastPrice[1].valueOf(),
				'1524105709',
				'lastPrice time not updated correctly'
			);

			let resetPrice = await custodianContract.resetPrice.call();
			assert.equal(resetPrice[0].valueOf(), '507', 'resetPrice price not updated correctly');
			assert.equal(
				resetPrice[1].valueOf(),
				'1524105709',
				'resetPrice time not updated correctly'
			);
		});

		it('state should be trading', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading');
		});
	});

	describe('creation and fee withdrawal', () => {
		let initEthPrice = 582;
		let amtEth = 1;
		let tokenValueB =
			(1 - CustodianInit.commissionRateInBP / BP_DENOMINATOR) *
			initEthPrice /
			(1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
		let tokenValueA = CustodianInit.alphaInBP / BP_DENOMINATOR * tokenValueB;
		let prevFeeAccumulated;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(initEthPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
			await duoContract.transfer(nonDuoMember, web3.utils.toWei('2'), { from: creator });
		});

		it('should only allow duo member to create', async () => {
			try {
				await custodianContract.create({
					from: nonDuoMember,
					value: web3.utils.toWei(amtEth + '')
				});
				assert.isTrue(false, 'the transaction should revert');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can create Tranche Token'
				);
			}
		});

		it('should create token A and B', async () => {
			let success = await custodianContract.create.call({
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			// first check return value with call()
			assert.isTrue(success, 'duo member is not able to create');
			// then send transaction to check effects
			await custodianContract.create({
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
		});

		it('feeAccumulated should be updated', async () => {
			let feeAccumulated = await custodianContract.feeAccumulatedInWei.call();
			let fee = web3.utils.toWei(1 * CustodianInit.commissionRateInBP / BP_DENOMINATOR + '');
			assert.isTrue(
				isEqual(feeAccumulated.valueOf(), fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update user list if required', async () => {
			let isUser = await custodianContract.existingUsers.call(alice);
			assert.isTrue(isUser, 'new user is not updated');
		});

		it('should update balance of A correctly', async () => {
			let balanceA = await custodianContract.balanceAOf.call(alice);
			assert.isTrue(
				isEqual(balanceA.toString(), web3.utils.toWei(tokenValueA + '')),
				'balance A not updated correctly'
			);
		});

		it('should update balance of B correctly', async () => {
			let balanceB = await custodianContract.balanceBOf.call(alice);
			assert.isTrue(
				isEqual(balanceB.toString(), web3.utils.toWei(tokenValueB + '')),
				'balance B not updated correctly'
			);
		});

		it('only allowed account can withdraw fee', async () => {
			try {
				await custodianContract.collectFee.call(web3.utils.toWei('0.001'), { from: alice });

				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can create Tranche Token'
				);
			}
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await custodianContract.collectFee.call(web3.utils.toWei('1'), { from: fc });
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can create Tranche Token'
				);
			}
		});

		it('should collect fee', async () => {
			prevFeeAccumulated = await custodianContract.feeAccumulatedInWei.call();
			let success = await custodianContract.collectFee.call(web3.utils.toWei('0.0001'), {
				from: fc
			});
			assert.isTrue(success);
			await custodianContract.collectFee(web3.utils.toWei('0.0001'), { from: fc });
		});

		it('should fee pending withdrawal amount should be updated correctly', async () => {
			let currentFee = await custodianContract.feeAccumulatedInWei.call();
			assert.isTrue(
				isEqual(currentFee.toNumber(), prevFeeAccumulated.toNumber()),
				'fee not updated correctly'
			);
		});
	});

	describe('redemption and eth withdrawal', () => {
		let prevBalanceA, prevBalanceB, prevFeeAccumulated, prevPendingWithdrawalAMT;
		let amtA = 28;
		let amtB = 29;
		let adjAmtA = amtA * BP_DENOMINATOR / CustodianInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = deductAmtB * CustodianInit.alphaInBP / BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtA) / ethInitPrice;
		let fee = amtEth * CustodianInit.commissionRateInBP / BP_DENOMINATOR;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
			await duoContract.transfer(nonDuoMember, web3.utils.toWei('2'), { from: creator });
			await duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator });
			await custodianContract.create({ from: alice, value: web3.utils.toWei('1') });
			prevBalanceA = await custodianContract.balanceAOf.call(alice);
			prevBalanceB = await custodianContract.balanceBOf.call(alice);
			prevFeeAccumulated = await custodianContract.feeAccumulatedInWei.call();
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await custodianContract.redeem(web3.utils.toWei('2800'), web3.utils.toWei('2900'), {
					from: alice
				});
				assert.isTrue(false, 'duomember not able to create more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can create Tranche Token'
				);
			}
		});

		it('only duo member can redeem', async () => {
			try {
				await custodianContract.redeem.call(
					web3.utils.toWei('28'),
					web3.utils.toWei('29'),
					{ from: nonDuoMember }
				);
				assert.isTrue(false, 'the transaction should revert');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can redeem Tranche Token'
				);
			}
		});

		it('should redeem token A and B', async () => {
			let success = await custodianContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				{ from: alice }
			);
			assert.isTrue(success, 'duo member is not able to redeem');
			await custodianContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				{ from: alice }
			);
		});

		it('feeAccumulated should be updated', async () => {
			let feeAccumulated = await custodianContract.feeAccumulatedInWei.call();
			assert.isTrue(
				isEqual(feeAccumulated.minus(prevFeeAccumulated).toNumber() / WEI_DENOMINATOR, fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await custodianContract.balanceAOf.call(alice);
			assert.isTrue(
				isEqual(
					currentBalanceA.toNumber() / WEI_DENOMINATOR + deductAmtA,
					prevBalanceA.toNumber() / WEI_DENOMINATOR
				),
				'balance A not updated correctly after redeed'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await custodianContract.balanceBOf.call(alice);
			assert.isTrue(
				isEqual(
					currentBalanceB.toNumber() / WEI_DENOMINATOR + deductAmtB,
					prevBalanceB.toNumber() / WEI_DENOMINATOR
				),
				'balance B not updated correctly after redeed'
			);
		});

		it('should update pending withdraw amount correctly', async () => {
			let pendingWithdrawAMT = await custodianContract.ethPendingWithdrawal.call(alice);
			assert.isTrue(
				isEqual(amtEth - pendingWithdrawAMT.toNumber() / WEI_DENOMINATOR, fee),
				'pending withdraw not updated correctly'
			);
		});

		it('should not withdraw more than pending withdrawl amount', async () => {
			try {
				await custodianContract.withdraw.call(web3.utils.toWei('0.1'), { from: alice });
				assert.isTrue(false, 'is able to with withdaw more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					VM_REVERT_MSG,
					'non DUO member still can create Tranche Token'
				);
			}
		});

		it('should withdraw from pending withdrawal', async () => {
			prevPendingWithdrawalAMT = await custodianContract.ethPendingWithdrawal.call(alice);
			let success = await custodianContract.withdraw.call(web3.utils.toWei('0.01'), {
				from: alice
			});
			assert.isTrue(success, 'cannot withdraw fee');
			await custodianContract.withdraw(web3.utils.toWei('0.01'), { from: alice });
		});

		it('pending eth withdrawal should be updated correctly', async () => {
			let currentPendingWithdrawal = await custodianContract.ethPendingWithdrawal.call(alice);
			assert.isTrue(
				isEqual(
					(prevPendingWithdrawalAMT.toNumber() - currentPendingWithdrawal.toNumber()) /
						WEI_DENOMINATOR,
					0.01
				),
				'pending withdrawal eth not updated correctly'
			);
		});
	});

	describe('nav calculation', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		function calcNav(price, time, resetPrice, resetTime, beta) {
			let numOfPeriods = Math.floor((time - resetTime) / CustodianInit.period);
			let navParent =
				price / resetPrice / beta * (1 + CustodianInit.alphaInBP / BP_DENOMINATOR);

			let navA = 1 + numOfPeriods * Number(CustodianInit.couponRate);
			let navAAdj = navA * CustodianInit.alphaInBP / BP_DENOMINATOR;
			if (navParent <= navAAdj)
				return [navParent * BP_DENOMINATOR / CustodianInit.alphaInBP, 0];
			else return [navA, navParent - navAAdj];
		}

		function testNav(resetPrice, lastPrice, beta) {
			let resetPriceInWei = web3.utils.toWei(resetPrice + '');
			let resetPriceTimeSeconds = 1522745087;
			let lastPriceInWei = web3.utils.toWei(lastPrice + '');
			let lastPriceTimeSeconds = 1522745087 + 60 * 5 + 10;
			let betaInWei = web3.utils.toWei(beta + '');
			let [navA, navB] = calcNav(
				lastPrice,
				lastPriceTimeSeconds,
				resetPrice,
				resetPriceTimeSeconds,
				beta
			);
			return custodianContract.calculateNav
				.call(
					lastPriceInWei,
					lastPriceTimeSeconds,
					resetPriceInWei,
					resetPriceTimeSeconds,
					betaInWei
				)
				.then(res => {
					let navAInWei = res[0].valueOf();
					let navBInWei = res[1].valueOf();
					assert.isTrue(
						isEqual(web3.utils.fromWei(navAInWei), navA),
						'navA not calculated correctly'
					);
					assert.isTrue(
						isEqual(web3.utils.fromWei(navBInWei), navB),
						'navB not calculated correctly'
					);
				});
		}

		// for non reset case
		it('it should calculate nav correclty case 1', () => {
			return testNav(582, 600, 1.2);
		});

		//for upward reset case
		it('it should calculate nav correclty case 2', () => {
			return testNav(800, 1500, 1);
		});

		//for downward reset case
		it('it should calculate nav correclty case 3', () => {
			return testNav(1000, 600, 1);
		});

		//for downward reset case where navB goes to 0
		it('it should calculate nav correclty case 4', () => {
			return testNav(1000, 200, 1);
		});
	});

	describe('calculate median', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(400, 500, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(500, 600, 400, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(600, 400, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(600, 600, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(500, 600, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedian
				.call(600, 500, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});
	});

	describe('commit price', () => {
		let firstPeriod;
		let secondPeriod;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		it('non pf address cannot call commitPrice method', async () => {
			try {
				await custodianContract.commitPrice.call(web3.utils.toWei('400'), 1522745087, {
					from: alice
				});
				assert.isTrue(false, 'non pf address can commit price');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, '');
			}
		});

		it('should accept first price arrived if it is not too far away', async () => {
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			let success = await custodianContract.commitPrice.call(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.isTrue(success);
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('580')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber()),
				'last price time is not updated correctly'
			);
		});

		it('should not reset', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_TRADING, 'state is changed');
		});

		it('should not accept first price arrived if it is too far away', async () => {
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();

			await custodianContract.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
				from: pf1
			});
			let res = await custodianContract.getFirstPrice.call();
			assert.isTrue(
				isEqual(res[0].toNumber(), web3.utils.toWei('500')) &&
					isEqual(res[1].toNumber(), firstPeriod.toNumber()),
				'first price is not recorded'
			);
		});

		it('should reject price from the same sender within cool down', async () => {
			try {
				await custodianContract.commitPrice(
					web3.utils.toWei('570'),
					firstPeriod.toNumber(),
					{
						from: pf1
					}
				);

				assert.isTrue(false, 'the price is not rejected');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'the VM is not reverted');
			}
		});

		it('should accept second price arrived if second price timed out and sent by the same address as first price', async () => {
			await custodianContract.skipCooldown(1);

			secondPeriod = await custodianContract.timestamp.call();

			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('550')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
		});

		it('should not reset', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_TRADING, 'state is changed');
		});

		it('should accept first price arrived if second price timed out and sent by the different address as first price', async () => {
			// first price
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
				from: pf1
			});

			// second price
			await custodianContract.skipCooldown(1);
			secondPeriod = await custodianContract.timestamp.call();
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
		});

		it('should accept first price arrived if second price is close to it and within cool down', async () => {
			// first price
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 10,
				{
					from: pf1
				}
			);
			// second price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('555'),
				firstPeriod.toNumber() - 5,
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('550')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 10),
				'last price time is not updated correctly'
			);
		});

		it('should wait for third price if first and second do not agree', async () => {
			// first price
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('700'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			let res = await custodianContract.getSecondPrice.call();
			assert.isTrue(
				isEqual(res[0].toNumber(), web3.utils.toWei('700')) &&
					isEqual(res[1].toNumber(), firstPeriod.toNumber() - 280),
				'second price is not recorded'
			);
		});

		it('should reject price from first sender within cool down', async () => {
			// third price
			try {
				await custodianContract.commitPrice(
					web3.utils.toWei('500'),
					firstPeriod.toNumber(),
					{
						from: pf1
					}
				);

				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected');
			}
		});

		it('should reject price from second sender within cool down', async () => {
			// third price
			try {
				await custodianContract.commitPrice(
					web3.utils.toWei('500'),
					firstPeriod.toNumber(),
					{
						from: pf2
					}
				);
				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected');
			}
		});

		it('should accept first price arrived if third price timed out and within cool down', async () => {
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 300),
				'last price time is not updated correctly'
			);
		});

		it('should accept median price if third price does not time out', async () => {
			// first price
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();

			await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('540'),
				firstPeriod.toNumber() - 260,
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('540')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 300),
				'last price time is not updated correctly'
			);
		});

		it('should accept third price arrived if it is from first or second sender and is after cool down', async () => {
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();

			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			await custodianContract.skipCooldown(1);
			secondPeriod = await custodianContract.timestamp.call();

			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('520')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
		});

		it('should not reset', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_TRADING, 'state is changed');
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', async () => {
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber() - 200,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 180,
				{
					from: pf2
				}
			);
			// // //third price
			await custodianContract.skipCooldown(1);

			secondPeriod = await custodianContract.timestamp.call();
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
		});

		it('should not allow price commit during cool down period', async () => {
			try {
				await custodianContract.skipCooldown(1);

				firstPeriod = await custodianContract.timestamp.call();
				await custodianContract.commitPrice(
					web3.utils.toWei('400'),
					firstPeriod.toNumber() - 800,
					{
						from: pf1
					}
				);
				assert.isTrue(false, 'can commit price within cooldown period');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can commit price within cooldown period');
			}
		});

		it('should transit to reset state based on price accepted', async () => {
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();

			custodianContract.commitPrice(web3.utils.toWei('888'), firstPeriod.toNumber() - 200, {
				from: pf1
			});
			// second price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('898'),
				firstPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 2, 'not two events emitted');
			assert.isTrue(
				tx.logs[0].event === START_PRE_RESET,
				'no or more than one StartPreReset event was emitted'
			);
			assert.equal(tx.logs[1].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[1].args.priceInWei.toNumber(), web3.utils.toWei('888')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[1].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 200),
				'last price time is not updated correctly'
			);

			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_PRE_RESET, 'state is not pre_reset');
		});
	});

	describe('pre reset', () => {
		beforeEach(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await custodianContract.skipCooldown(1);

			let ts = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
				from: pf1
			});
			await custodianContract.commitPrice(web3.utils.toWei('898'), ts.toNumber(), {
				from: pf2
			});
		});

		it('should be in state preReset', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_PRE_RESET, 'not in state preReset');
		});

		it('should not allow price commit', async () => {
			try {
				await custodianContract.skipCooldown(1);
				let ts = await custodianContract.timestamp.call();
				await custodianContract.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
					from: pf1
				});
				assert.isTrue(false, 'still can commit price');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can commit price ');
			}
		});

		it('should not allow creation', async () => {
			try {
				await custodianContract.create({
					from: alice,
					value: web3.utils.toWei('1')
				});
				assert.isTrue(false, 'still can create');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can create ');
			}
		});

		it('should not allow redemption', async () => {
			try {
				await custodianContract.redeem(web3.utils.toWei('2800'), web3.utils.toWei('2900'), {
					from: alice
				});

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer or approve of A', async () => {
			try {
				await custodianContract.transferA(alice, bob, web3.utils.toWei('1'));

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer or approve of B', async () => {
			try {
				await custodianContract.transferB(alice, bob, web3.utils.toWei('1'));

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		it('should not allow admin setMemberThresholdInWei', async () => {
			try {
				await custodianContract.setMemberThresholdInWei(1000);

				assert.isTrue(false, 'still can setMemberThresholdInWei');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still cansetMemberThresholdInWei');
			}
		});

		it('should not allow admin setIterationGasThreshold', async () => {
			try {
				await custodianContract.setIterationGasThreshold(1000);
				assert.isTrue(false, 'still can setIterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setIterationGasThreshold');
			}
		});

		it('should not allow admin setPreResetWaitingBlocks', async () => {
			try {
				await custodianContract.setPreResetWaitingBlocks(1000);
				assert.isTrue(false, 'still can setPreResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setPreResetWaitingBlocks');
			}
		});

		it('should not allow admin setPriceTolInBP', async () => {
			try {
				await custodianContract.setPriceTolInBP(1000);

				assert.isTrue(false, 'still can setPriceTolInBP');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setPriceTolInBP');
			}
		});

		it('should not allow admin setPriceFeedTolInBP', async () => {
			try {
				await custodianContract.setPriceFeedTolInBP(1000);
				assert.isTrue(false, 'still can setPriceFeedTolInBP');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setPriceFeedTolInBP');
			}
		});

		it('should not allow admin setPriceFeedTimeTol', async () => {
			try {
				await custodianContract.setPriceFeedTimeTol(1000);
				assert.isTrue(false, 'still can setPriceFeedTimeTol');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setPriceFeedTimeTol');
			}
		});

		it('should not allow admin setPriceUpdateCoolDown', async () => {
			try {
				await custodianContract.setPriceUpdateCoolDown(1000);
				assert.isTrue(false, 'still can setPriceUpdateCoolDown');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still setPriceUpdateCoolDown');
			}
		});

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			for (let i = 0; i < 9; i++) await custodianContract.startPreReset();
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_PRE_RESET, 'not in pre reset state');

			await custodianContract.startPreReset();
			let stateAfter = await custodianContract.state.call();
			assert.equal(
				stateAfter.valueOf(),
				STATE_UPWARD_RESET,
				'not transit to upward reset state'
			);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta) {
			let alpha = CustodianInit.alphaInBP / BP_DENOMINATOR;
			let excessA = navA - 1;
			let excessB = navB - 1;
			let excessBForA = excessA / alpha;
			//if (excessB >= excessBForA) {
			let newAFromA = prevBalanceA * excessA;
			let excessBAfterA = excessB - excessBForA;
			let excessNewBFromB = prevBalanceB * excessBAfterA * beta / (1 + alpha);
			let newBFromB = prevBalanceB * excessBForA + excessNewBFromB;
			let newAFromB = excessNewBFromB * alpha;
			return [prevBalanceA + newAFromA + newAFromB, prevBalanceB + newBFromB];
			/*} else {
				let newBFromB = prevBalanceB * excessB;
				let excessAForB = excessB * alpha;
				let excessAAfterB = excessA - excessAForB;
				let newBFromA = prevBalanceA * excessAAfterB * beta / (1 + alpha);
				let newAFromA = prevBalanceA * excessAForB + newBFromA * alpha;
				return [prevBalanceA + newAFromA, prevBalanceB + newBFromA + newBFromB];
			}*/
		}

		function downwardReset(prevBalanceA, prevBalanceB, currentNavA, currentNavB, beta) {
			let newBFromA =
				(currentNavA - currentNavB) / (1 + CustodianInit.alphaInBP / BP_DENOMINATOR) * beta;
			let newAFromA = newBFromA * CustodianInit.alphaInBP / BP_DENOMINATOR;

			let newBalanceA = prevBalanceA * (currentNavB + newAFromA);
			let newBalanceB = prevBalanceB * currentNavB + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function periodicReset(prevBalanceA, prevBalanceB, currentNavA, currentNavB, beta) {
			let newBFromA =
				(currentNavA - 1) / (1 + CustodianInit.alphaInBP / BP_DENOMINATOR) * beta;
			let newAFromA = newBFromA * CustodianInit.alphaInBP / BP_DENOMINATOR;

			let newBalanceA = prevBalanceA * (1 + newAFromA);
			let newBalanceB = prevBalanceB * 1 + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function assertABalanceForAddress(addr, expected) {
			return custodianContract.balanceAOf.call(addr).then(currentBalanceA => {
				assert.isTrue(
					isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return custodianContract.balanceBOf
				.call(addr)
				.then(currentBalanceB =>
					assert.isTrue(
						isEqual(currentBalanceB.valueOf() / WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function updateBeta(prevBeta, lastPrice, lastResetPrice, currentNavA) {
			return (
				(1 + CustodianInit.alphaInBP / BP_DENOMINATOR) *
				lastPrice /
				((1 + CustodianInit.alphaInBP / BP_DENOMINATOR) * lastPrice -
					lastResetPrice *
						CustodianInit.alphaInBP /
						BP_DENOMINATOR *
						prevBeta *
						(currentNavA - 1))
			);
		}

		function resetTest(
			price,
			resetFunc,
			resetState,
			resetGas,
			isPeriodicReset,
			transferABRequired
		) {
			let prevBalanceAalice, prevBalanceBalice;
			let prevBalanceAbob, prevBalanceBbob;
			let currentNavA;
			let currentNavB;
			let newBalanceAalice, newBalanceBalice;
			let newBalanceAbob, newBalanceBbob;
			let timestamp;
			let prevBeta, beta;

			let skipNum = isPeriodicReset
				? Math.ceil((Number(CustodianInit.hp) - 1) / Number(CustodianInit.couponRate)) + 1
				: 1;

			before(async () => {
				await initContracts();
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					1524105709,
					{
						from: pf1
					}
				);
				await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator });
				await custodianContract.create({
					from: alice,
					value: web3.utils.toWei('1')
				});
				await custodianContract.create({
					from: bob,
					value: web3.utils.toWei('1')
				});

				if (transferABRequired) {
					let aliceA = await custodianContract.balanceAOf.call(alice);

					custodianContract.transferA(alice, bob, aliceA.valueOf(), {
						from: alice
					});
					await custodianContract.balanceBOf.call(bob).then(bobB => {
						custodianContract.transferB(bob, alice, bobB.valueOf(), {
							from: bob
						});
					});
				}

				await custodianContract.balanceAOf
					.call(alice)
					.then(aliceA => (prevBalanceAalice = aliceA.toNumber() / WEI_DENOMINATOR));
				let aliceB = await custodianContract.balanceBOf.call(alice);

				prevBalanceBalice = aliceB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.balanceAOf
					.call(bob)
					.then(bobA => (prevBalanceAbob = bobA.toNumber() / WEI_DENOMINATOR));
				let bobB = await custodianContract.balanceBOf.call(bob);
				prevBalanceBbob = bobB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.skipCooldown(skipNum);

				timestamp = await custodianContract.timestamp.call();

				if (isPeriodicReset) {
					await custodianContract.commitPrice(
						web3.utils.toWei(price + ''),
						timestamp.toNumber(),
						{
							from: pf1
						}
					);
				} else {
					await custodianContract.commitPrice(
						web3.utils.toWei(price + ''),
						timestamp.toNumber() - 200,
						{
							from: pf1
						}
					);
					await custodianContract.commitPrice(
						web3.utils.toWei(price + 1 + ''),
						timestamp.toNumber(),
						{
							from: pf2
						}
					);
				}
				let navAinWei = await custodianContract.navAInWei.call();
				currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;

				let navBinWei = await custodianContract.navBInWei.call();
				currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

				let betaInWei = await custodianContract.betaInWei.call();
				prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR;

				for (let i = 0; i < 10; i++) await custodianContract.startPreReset();

				let betaInWeiAfter = await custodianContract.betaInWei.call();
				beta = betaInWeiAfter.valueOf() / WEI_DENOMINATOR;
			});

			it('should update beta correctly', () => {
				if (isPeriodicReset) {
					let newBeta = updateBeta(prevBeta, price, Number(ethInitPrice), currentNavA);
					return assert.isTrue(isEqual(beta, newBeta), 'beta is not updated correctly');
				} else {
					return assert.equal(beta, 1, 'beta is not reset to 1');
				}
			});

			it('should in corect reset state', async () => {
				let state = await custodianContract.state.call();

				assert.equal(state.valueOf(), resetState, 'not in correct reset state');
			});

			it('should have two users', async () => {
				let numOfUsers = await custodianContract.getNumOfUsers.call();

				assert.equal(numOfUsers.valueOf(), 2, 'num of users incorrect');
			});

			it('should have correct setup', () => {
				if (transferABRequired)
					assert.isTrue(
						prevBalanceAalice === 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob === 0,
						'Wrong setup'
					);
				else
					assert.isTrue(
						prevBalanceAalice > 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob > 0,
						'Wrong setup'
					);
			});

			it('should process reset for only one user', async () => {
				let tx = await custodianContract.startReset({ gas: resetGas });
				console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_RESET,
					'not only one user processed'
				);
				let nextIndex = await custodianContract.nextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await custodianContract.balanceAOf.call(alice);
				let currentBalanceBalice = await custodianContract.balanceBOf.call(alice);
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAalice,
					prevBalanceBalice,
					currentNavA,
					currentNavB,
					beta
				);
				newBalanceAalice = newBalanceA;
				newBalanceBalice = newBalanceB;

				assert.isTrue(
					isEqual(currentBalanceAalice.toNumber() / WEI_DENOMINATOR, newBalanceA),
					'BalanceA not updated correctly'
				);
				assert.isTrue(
					isEqual(currentBalanceBalice.toNumber() / WEI_DENOMINATOR, newBalanceB),
					'BalanceB not updated correctly'
				);
			});

			it('should complete reset for second user and transit to trading', async () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAbob,
					prevBalanceBbob,
					currentNavA,
					currentNavB,
					beta
				);
				newBalanceAbob = newBalanceA;
				newBalanceBbob = newBalanceB;
				let tx = await custodianContract.startReset({ gas: resetGas });
				console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_TRADING,
					'reset not completed'
				);
				let nextIndex = await custodianContract.nextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(bob, newBalanceA);
				await assertBBalanceForAddress(bob, newBalanceB);
			});

			it('totalA should equal totalB', async () => {
				assert.isTrue(
					isEqual(newBalanceAbob + newBalanceAalice, newBalanceBbob + newBalanceBalice),
					'total A is not equal to total B'
				);
			});

			it('should update nav', async () => {
				let navA = await custodianContract.navAInWei.call();

				assert.equal(web3.utils.fromWei(navA.valueOf()), '1', 'nav A not reset to 1');

				let navB = await custodianContract.navBInWei.call();
				assert.isTrue(
					isPeriodicReset
						? isEqual(web3.utils.fromWei(navB.valueOf()), currentNavB)
						: web3.utils.fromWei(navB.valueOf()) === '1',
					'nav B not updated correctly'
				);
			});

			it('should update reset price', async () => {
				if (!isPeriodicReset) {
					let resetPrice = await custodianContract.resetPrice.call();

					assert.equal(
						resetPrice[0].valueOf() / WEI_DENOMINATOR,
						price,
						'resetprice not updated'
					);
				}
			});
		}

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 1', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 2', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 1', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, 90000, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 2', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, 90000, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 1', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 2', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, true);
		});
	});

	describe('A token test', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
			await custodianContract.create({ from: alice, value: web3.utils.toWei('1') });
		});

		it('should show balance', async () => {
			let balance = await custodianContract.balanceAOf.call(alice);
			assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
		});

		it('should be able to approve', async () => {
			let success = await custodianContract.approveA.call(
				alice,
				bob,
				web3.utils.toWei('100'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to approve');

			await custodianContract.approveA(alice, bob, web3.utils.toWei('100'), { from: alice });
		});

		it('should show allowance', async () => {
			let allowance = await custodianContract.allowanceA.call(alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of bob not equal to 100'
			);
		});

		it('should be able to transfer', async () => {
			let success = await custodianContract.transferA.call(
				alice,
				bob,
				web3.utils.toWei('10'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferA(alice, bob, web3.utils.toWei('10'), { from: alice });
		});

		it('should show balance of bob equal to 10', async () => {
			let balance = await custodianContract.balanceAOf.call(bob);
			assert.isTrue(balance.toNumber() === 10 * WEI_DENOMINATOR, 'balance of bob not shown');
		});

		it('should not transfer more than balance', async () => {
			try {
				await custodianContract.transferA.call(alice, bob, web3.utils.toWei('10000000'), {
					from: alice
				});

				assert.isTrue(false, 'able to transfer more than balance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should transferAFrom less than allowance', async () => {
			let success = await custodianContract.transferAFrom.call(
				bob,
				alice,
				charles,
				web3.utils.toWei('50'),
				{ form: bob }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferAFrom(bob, alice, charles, web3.utils.toWei('50'));
		});

		it('should not transferFrom more than allowance', async () => {
			try {
				await custodianContract.transferAFrom.call(
					bob,
					alice,
					bob,
					web3.utils.toWei('200'),
					{ from: bob }
				);
				assert.isTrue(false, 'can transferFrom of more than allowance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('allowance for bob should be 50', async () => {
			let allowance = await custodianContract.allowanceA.call(alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of bob not equal to 50'
			);
		});

		it('check balance of charles equal 50', async () => {
			let balance = await custodianContract.balanceAOf.call(charles);

			assert.equal(
				balance.toNumber() / WEI_DENOMINATOR,
				50,
				'balance of charles not equal to 50'
			);
		});
	});

	describe('B token test', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
			await custodianContract.create({ from: alice, value: web3.utils.toWei('1') });
		});

		it('should show balance', async () => {
			let balance = await custodianContract.balanceBOf.call(alice);
			assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
		});

		it('should be able to approve', async () => {
			let success = await custodianContract.approveB.call(
				alice,
				bob,
				web3.utils.toWei('100'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to approve');

			await custodianContract.approveB(alice, bob, web3.utils.toWei('100'), { from: alice });
		});

		it('should show allowance', async () => {
			let allowance = await custodianContract.allowanceB.call(alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of bob not equal to 100'
			);
		});

		it('should be able to transfer', async () => {
			let success = await custodianContract.transferB.call(
				alice,
				bob,
				web3.utils.toWei('10'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferB(alice, bob, web3.utils.toWei('10'), { from: alice });
		});

		it('should show balance of bob equal to 10', async () => {
			let balance = await custodianContract.balanceBOf.call(bob);
			assert.isTrue(balance.toNumber() === 10 * WEI_DENOMINATOR, 'balance of bob not shown');
		});

		it('should not transfer more than balance', async () => {
			try {
				await custodianContract.transferB.call(alice, bob, web3.utils.toWei('10000000'), {
					from: alice
				});

				assert.isTrue(false, 'able to transfer more than balance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should transferAFrom less than allowance', async () => {
			let success = await custodianContract.transferBFrom.call(
				bob,
				alice,
				charles,
				web3.utils.toWei('50'),
				{ form: bob }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferBFrom(bob, alice, charles, web3.utils.toWei('50'));
		});

		it('should not transferFrom more than allowance', async () => {
			try {
				await custodianContract.transferBFrom.call(
					bob,
					alice,
					bob,
					web3.utils.toWei('200'),
					{ from: bob }
				);
				assert.isTrue(false, 'can transferFrom of more than allowance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('allowance for bob should be 50', async () => {
			let allowance = await custodianContract.allowanceB.call(alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of bob not equal to 50'
			);
		});

		it('check balance of charles equal 50', async () => {
			let balance = await custodianContract.balanceBOf.call(charles);

			assert.equal(
				balance.toNumber() / WEI_DENOMINATOR,
				50,
				'balance of charles not equal to 50'
			);
		});
	});

	describe('only admin', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		it('admin should be able to set fee address', async () => {
			let success = await custodianContract.setFeeAddress.call(creator, { from: creator });
			assert.isTrue(success, 'not be able to set fee address');
		});

		it('non admin should not be able to set fee address', async () => {
			try {
				await custodianContract.setFeeAddress.call(creator, { from: alice });

				assert.isTrue(false, 'non admin can change fee address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set commission', async () => {
			let success = await custodianContract.setCommission.call(100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await custodianContract.setCommission.call(10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await custodianContract.setCommission.call(100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set member threshold', async () => {
			let success = await custodianContract.setMemberThresholdInWei.call(100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set member threshhold');
		});

		it('non admin should not be able to set member Threshold', async () => {
			try {
				await custodianContract.setMemberThresholdInWei.call(100, { from: alice });
				assert.isTrue(false, 'non admin can change member threshhold');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await custodianContract.setIterationGasThreshold.call(100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
		});

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await custodianContract.setIterationGasThreshold.call(100000, { from: alice });
				assert.isTrue(false, 'non admin can change gas threshhold');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set pre reset waiting blocks', async () => {
			let success = await custodianContract.setPreResetWaitingBlocks.call(100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await custodianContract.setPreResetWaitingBlocks.call(100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price tolerance', async () => {
			let success = await custodianContract.setPriceTolInBP.call(100, { from: creator });
			assert.isTrue(success, 'not be able to set price tolerance');
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setPriceTolInBP.call(100, { from: alice });
				assert.isTrue(false, 'non admin can change price tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price feed tolerance', async () => {
			let success = await custodianContract.setPriceFeedTolInBP.call(100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed tolerance');
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setPriceFeedTolInBP.call(100, { from: alice });
				assert.isTrue(false, 'non admin can change price feed tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price feed time tolerance', async () => {
			let success = await custodianContract.setPriceFeedTimeTol.call(100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed time tolerance');
		});

		it('non admin should not be able to set price feed time tolerance', async () => {
			try {
				await custodianContract.setPriceFeedTimeTol.call(100, { from: alice });
				assert.isTrue(false, 'non admin can change price feed time tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price update coolupdate', async () => {
			let success = await custodianContract.setPriceUpdateCoolDown.call(10000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set price update coolupdate');
		});

		it('non admin should not be able to set price update coolupdate', async () => {
			try {
				await custodianContract.setPriceUpdateCoolDown.call(10000, { from: alice });
				assert.isTrue(false, 'non admin can change price update coolupdate');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});
	});
});
