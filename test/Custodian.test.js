let Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];

const ACCEPT_PRICE = 'AcceptPrice';
const START_PRE_RESET = 'StartPreReset';
const START_RESET = 'StartReset';
const START_POST_RESET = 'StartPostReset';
const START_TRADING = 'StartTrading';

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWARD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_PERIODIC_RESET = '4';
const STATE_POST_RESET = '5';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 6e-14;

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

	const initContracts = () =>
		DUO.new(web3.utils.toWei(DuoInit.initSupply), DuoInit.tokenName, DuoInit.tokenSymbol, {
			from: creator
		})
			.then(instance => (duoContract = instance))
			.then(() =>
				Custodian.new(
					web3.utils.toWei(CustodianInit.ethInitPrice),
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
					{
						from: creator
					}
				).then(instance => (custodianContract = instance))
			);

	describe('constructor', () => {
		before(initContracts);

		it('state should be trading', () => {
			return custodianContract.state
				.call()
				.then(state =>
					assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading')
				);
		});

		it('feeCollector should equal specified value', () => {
			return custodianContract.getFeeCollector
				.call()
				.then(feeCollector =>
					assert.equal(feeCollector.valueOf(), fc, 'feeCollector specified incorrect')
				);
		});

		it('priceFeed1 should equal specified value', () => {
			return custodianContract.getPriceFeed1
				.call()
				.then(priceFeed1 =>
					assert.equal(priceFeed1.valueOf(), pf1, 'priceFeed1 specified incorrect')
				);
		});

		it('priceFeed2 should equal specified value', () => {
			return custodianContract.getPriceFeed2
				.call()
				.then(priceFeed2 =>
					assert.equal(priceFeed2.valueOf(), pf2, 'priceFeed2 specified incorrect')
				);
		});

		it('priceFeed3 should equal specified value', () => {
			return custodianContract.getPriceFeed3
				.call()
				.then(priceFeed3 =>
					assert.equal(priceFeed3.valueOf(), pf3, 'priceFeed3 specified incorrect')
				);
		});

		it('admin should equal specified value', () => {
			return custodianContract.getAdmin
				.call()
				.then(admin => assert.equal(admin.valueOf(), creator, 'admin specified incorrect'));
		});

		it('priceTolInBP should equal 500', () => {
			return custodianContract.getPriceTolInBP
				.call()
				.then(getPriceTolInBP =>
					assert.equal(getPriceTolInBP.valueOf(), 500, 'priceTolInBP specified incorrect')
				);
		});

		it('period should equal specified value', () => {
			return custodianContract.period
				.call()
				.then(period =>
					assert.equal(
						period.valueOf(),
						CustodianInit.period,
						'period specified incorrect'
					)
				);
		});

		it('priceUpdateCoolDown should equal period minus 600', () => {
			return custodianContract.getPriceUpdateCoolDown
				.call()
				.then(priceUpdateCoolDown =>
					assert.equal(
						priceUpdateCoolDown.valueOf(),
						CustodianInit.period - 600,
						'priceUpdateCoolDown specified incorrect'
					)
				);
		});
	});

	describe('creation and fee withdrawal', () => {
		let amtEth = 1;
		let tokenValueB =
			(1 - CustodianInit.commissionRateInBP / BP_DENOMINATOR) *
			CustodianInit.ethInitPrice /
			(1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
		let tokenValueA = CustodianInit.alphaInBP / BP_DENOMINATOR * tokenValueB;
		let prevFeeAccumulated;

		before(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() =>
					duoContract.transfer(nonDuoMember, web3.utils.toWei('2'), { from: creator })
				)
		);

		it('should only allow duo member to create', () => {
			return custodianContract
				.create({ from: nonDuoMember, value: web3.utils.toWei(amtEth + '') })
				.then(() => {
					assert.isTrue(false, 'the transaction should revert');
				})
				.catch(err => {
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can create Tranche Token'
					);
				});
		});

		it('should create token A and B', () => {
			return custodianContract.create
				.call({ from: alice, value: web3.utils.toWei(amtEth + '') })
				.then(success => {
					// first check return value with call()
					assert.isTrue(success, 'duo member is not able to create');
					// then send transaction to check effects
					return custodianContract.create({
						from: alice,
						value: web3.utils.toWei(amtEth + '')
					});
				});
		});

		it('feeAccumulated should be updated', () => {
			return custodianContract.feeAccumulatedInWei.call().then(feeAccumulated => {
				let fee = web3.utils.toWei(
					1 * CustodianInit.commissionRateInBP / BP_DENOMINATOR + ''
				);
				assert.isTrue(
					isEqual(feeAccumulated.valueOf(), fee),
					'feeAccumulated not updated correctly'
				);
			});
		});

		it('should update user list if required', () => {
			return custodianContract.existingUsers
				.call(alice)
				.then(isUser => assert.isTrue(isUser, 'new user is not updated'));
		});

		it('should update balance of A correctly', () => {
			return custodianContract.balancesA.call(alice).then(balanceA => {
				assert.isTrue(
					isEqual(balanceA.toString(), web3.utils.toWei(tokenValueA + '')),
					'balance A not updated correctly'
				);
			});
		});

		it('should update balance of B correctly', () => {
			return custodianContract.balancesB.call(alice).then(balanceB => {
				assert.isTrue(
					isEqual(balanceB.toString(), web3.utils.toWei(tokenValueB + '')),
					'balance B not updated correctly'
				);
			});
		});

		it('only allowed account can withdraw fee', () => {
			return custodianContract.collectFee
				.call(web3.utils.toWei('0.001'), { from: alice })
				.then(() => assert.isTrue(false, 'can collect fee more than allowed'))
				.catch(err =>
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can create Tranche Token'
					)
				);
		});

		it('should only collect fee less than allowed', () => {
			return custodianContract.collectFee
				.call(web3.utils.toWei('1'), { from: fc })
				.then(() => assert.isTrue(false, 'can collect fee more than allowed'))
				.catch(err =>
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can create Tranche Token'
					)
				);
		});

		it('should collect fee', () => {
			return custodianContract.feeAccumulatedInWei
				.call()
				.then(prevFee => (prevFeeAccumulated = prevFee))
				.then(() =>
					custodianContract.collectFee.call(web3.utils.toWei('0.0001'), { from: fc })
				)
				.then(success => assert.isTrue(success))
				.then(() => custodianContract.collectFee(web3.utils.toWei('0.0001'), { from: fc }));
		});

		it('should fee pending withdrawal amount should be updated correctly', () => {
			return custodianContract.feeAccumulatedInWei.call().then(currentFee => {
				assert.isTrue(
					isEqual(currentFee.toNumber(), prevFeeAccumulated.toNumber()),
					'fee not updated correctly'
				);
			});
		});
	});

	describe('redemption and eth withdrawal', () => {
		let prevBalanceA, prevBalanceB, prevFeeAccumulated, prevPendingWithdrawalAMT;
		let amtA = 28;
		let amtB = 29;
		let adjAmtA = amtA * BP_DENOMINATOR / CustodianInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = deductAmtB * CustodianInit.alphaInBP / BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtA) / CustodianInit.ethInitPrice;
		let fee = amtEth * CustodianInit.commissionRateInBP / BP_DENOMINATOR;

		before(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() =>
					duoContract.transfer(nonDuoMember, web3.utils.toWei('2'), { from: creator })
				)
				.then(() => duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator }))
				.then(() => custodianContract.create({ from: alice, value: web3.utils.toWei('1') }))
				.then(() => custodianContract.balancesA.call(alice))
				.then(prevA => (prevBalanceA = prevA))
				.then(() => custodianContract.balancesB.call(alice))
				.then(prevB => (prevBalanceB = prevB))
				.then(() => custodianContract.feeAccumulatedInWei.call())
				.then(prevFee => (prevFeeAccumulated = prevFee))
		);

		it('should only redeem token value less than balance', () => {
			return custodianContract
				.redeem(web3.utils.toWei('2800'), web3.utils.toWei('2900'), { from: alice })
				.then(() => {
					assert.isTrue(false, 'duomember not able to create more than allowed');
					// console.log(redeem);
				})
				.catch(err => {
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can create Tranche Token'
					);
				});
		});

		it('only duo member can redeem', () => {
			return custodianContract.redeem
				.call(web3.utils.toWei('28'), web3.utils.toWei('29'), { from: nonDuoMember })
				.then(() => {
					assert.isTrue(false, 'the transaction should revert');
				})
				.catch(err => {
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can redeem Tranche Token'
					);
				});
		});

		it('should redeem token A and B', () => {
			return custodianContract.redeem
				.call(web3.utils.toWei(amtA + ''), web3.utils.toWei(amtB + ''), { from: alice })
				.then(success => {
					// first check return value with call()
					assert.isTrue(success, 'duo member is not able to redeem');
					// then send transaction to check effects
					return custodianContract.redeem(
						web3.utils.toWei(amtA + ''),
						web3.utils.toWei(amtB + ''),
						{ from: alice }
					);
				});
		});

		it('feeAccumulated should be updated', () => {
			return custodianContract.feeAccumulatedInWei.call().then(feeAccumulated => {
				assert.isTrue(
					isEqual(
						feeAccumulated.minus(prevFeeAccumulated).toNumber() / WEI_DENOMINATOR,
						fee
					),
					'feeAccumulated not updated correctly'
				);
			});
		});

		it('should update balance of A correctly', () => {
			return custodianContract.balancesA
				.call(alice)
				.then(currentBalanceA =>
					assert.isTrue(
						isEqual(
							currentBalanceA.toNumber() / WEI_DENOMINATOR + deductAmtA,
							prevBalanceA.toNumber() / WEI_DENOMINATOR
						),
						'balance A not updated correctly after redeed'
					)
				);
		});

		it('should update balance of B correctly', () => {
			return custodianContract.balancesB
				.call(alice)
				.then(currentBalanceB =>
					assert.isTrue(
						isEqual(
							currentBalanceB.toNumber() / WEI_DENOMINATOR + deductAmtB,
							prevBalanceB.toNumber() / WEI_DENOMINATOR
						),
						'balance B not updated correctly after redeed'
					)
				);
		});

		it('should update pending withdraw amount correctly', () => {
			return custodianContract.ethPendingWithdrawal.call(alice).then(pendingWithdrawAMT => {
				assert.isTrue(
					isEqual(amtEth - pendingWithdrawAMT.toNumber() / WEI_DENOMINATOR, fee),
					'pending withdraw not updated correctly'
				);
			});
		});

		it('should not withdraw more than pending withdrawl amount', () => {
			return custodianContract.withdraw
				.call(web3.utils.toWei('0.1'), { from: alice })
				.then(() => assert.isTrue(false, 'is able to with withdaw more than allowed'))
				.catch(err =>
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'non DUO member still can create Tranche Token'
					)
				);
		});

		it('should withdraw from pending withdrawal', () => {
			return custodianContract.ethPendingWithdrawal
				.call(alice)
				.then(prePendingWithdrawal => (prevPendingWithdrawalAMT = prePendingWithdrawal))
				.then(() =>
					custodianContract.withdraw.call(web3.utils.toWei('0.01'), { from: alice })
				)
				.then(success => assert.isTrue(success, 'cannot withdraw fee'))
				.then(() => custodianContract.withdraw(web3.utils.toWei('0.01'), { from: alice }));
		});

		it('pending eth withdrawal should be updated correctly', () => {
			return custodianContract.ethPendingWithdrawal
				.call(alice)
				.then(currentPendingWithdrawal =>
					assert.isTrue(
						isEqual(
							(prevPendingWithdrawalAMT.toNumber() -
								currentPendingWithdrawal.toNumber()) /
								WEI_DENOMINATOR,
							0.01
						),
						'pending withdrawal eth not updated correctly'
					)
				);
		});
	});

	describe('nav calculation', () => {
		before(initContracts);

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
		before(initContracts);

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

		before(initContracts);

		it('non pf address cannot call commitPrice method', () => {
			return custodianContract.commitPrice
				.call(web3.utils.toWei('400'), 1522745087, { from: alice })
				.then(() => assert.isTrue(false, 'non pf address can commit price'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, ''));
		});

		it('should accept first price arrived if it is not too far away', () => {
			return custodianContract
				.skipCooldown(1)
				.then(() => custodianContract.timestamp.call())
				.then(ts => (firstPeriod = ts))
				.then(() =>
					custodianContract.commitPrice.call(
						web3.utils.toWei('580'),
						firstPeriod.toNumber(),
						{
							from: pf1
						}
					)
				)
				.then(success => assert.isTrue(success))
				.then(() =>
					custodianContract.commitPrice(web3.utils.toWei('580'), firstPeriod.toNumber(), {
						from: pf1
					})
				)
				.then(tx => {
					assert.equal(tx.logs.length, 1, 'more than one event emitted');
					assert.equal(
						tx.logs[0].event,
						ACCEPT_PRICE,
						'AcceptPrice Event is not emitted'
					);
					assert.isTrue(
						isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('580')),
						'last price is not updated correctly'
					);
					assert.isTrue(
						isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber()),
						'last price time is not updated correctly'
					);
				});
		});

		it('should not reset', () => {
			return custodianContract.state
				.call()
				.then(state => assert.equal(state.valueOf(), STATE_TRADING, 'state is changed'));
		});

		it('should not accept first price arrived if it is too far away', () => {
			return custodianContract
				.skipCooldown(1)
				.then(() => custodianContract.timestamp.call())
				.then(ts => (firstPeriod = ts))
				.then(() =>
					custodianContract.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
						from: pf1
					})
				)
				.then(() => custodianContract.getFirstPrice.call())
				.then(res =>
					assert.isTrue(
						isEqual(res[0].toNumber(), web3.utils.toWei('500')) &&
							isEqual(res[1].toNumber(), firstPeriod.toNumber()),
						'first price is not recorded'
					)
				);
		});

		it('should reject price from the same sender within cool down', () => {
			return custodianContract
				.commitPrice(web3.utils.toWei('570'), firstPeriod.toNumber(), {
					from: pf1
				})
				.then(() => assert.isTrue(false, 'the price is not rejected'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'the VM is not reverted'));
		});

		it('should accept second price arrived if second price timed out and sent by the same address as first price', () => {
			return custodianContract
				.skipCooldown(1)
				.then(() => custodianContract.timestamp.call())
				.then(ts => (secondPeriod = ts))
				.then(() =>
					custodianContract.commitPrice(
						web3.utils.toWei('550'),
						secondPeriod.toNumber(),
						{
							from: pf1
						}
					)
				)
				.then(tx => {
					assert.equal(tx.logs.length, 1, 'more than one event emitted');
					assert.equal(
						tx.logs[0].event,
						ACCEPT_PRICE,
						'AcceptPrice Event is not emitted'
					);
					assert.isTrue(
						isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('550')),
						'last price is not updated correctly'
					);
					assert.isTrue(
						isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
						'last price time is not updated correctly'
					);
				});
		});

		it('should not reset', () => {
			return custodianContract.state
				.call()
				.then(state => assert.equal(state.valueOf(), STATE_TRADING, 'state is changed'));
		});

		it('should accept first price arrived if second price timed out and sent by the different address as first price', () => {
			// first price
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							firstPeriod.toNumber(),
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() => custodianContract.skipCooldown(1))
					.then(() => custodianContract.timestamp.call())
					.then(ts => (secondPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('550'),
							secondPeriod.toNumber(),
							{
								from: pf2
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 1, 'more than one event emitted');
						assert.equal(
							tx.logs[0].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[0].args.timeInSecond.toNumber(),
								secondPeriod.toNumber()
							),
							'last price time is not updated correctly'
						);
					})
			);
		});

		it('should accept first price arrived if second price is close to it and within cool down', () => {
			// first price
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('550'),
							firstPeriod.toNumber() - 10,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('555'),
							firstPeriod.toNumber() - 5,
							{
								from: pf2
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 1, 'more than one event emitted');
						assert.equal(
							tx.logs[0].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('550')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[0].args.timeInSecond.toNumber(),
								firstPeriod.toNumber() - 10
							),
							'last price time is not updated correctly'
						);
					})
			);
		});

		it('should wait for third price if first and second do not agree', () => {
			// first price
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							firstPeriod.toNumber() - 300,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('700'),
							firstPeriod.toNumber() - 280,
							{
								from: pf2
							}
						)
					)
					.then(() => custodianContract.getSecondPrice.call())
					.then(res => {
						assert.isTrue(
							isEqual(res[0].toNumber(), web3.utils.toWei('700')) &&
								isEqual(res[1].toNumber(), firstPeriod.toNumber() - 280),
							'second price is not recorded'
						);
					})
			);
		});

		it('should reject price from first sender within cool down', () => {
			// third price
			return custodianContract
				.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
					from: pf1
				})
				.then(() => assert.isTrue(false, 'third price is not rejected'))
				.catch(err =>
					assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected')
				);
		});

		it('should reject price from second sender within cool down', () => {
			// third price
			return custodianContract
				.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
					from: pf2
				})
				.then(() => assert.isTrue(false, 'third price is not rejected'))
				.catch(err =>
					assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected')
				);
		});

		it('should accept first price arrived if third price timed out and within cool down', () => {
			return custodianContract
				.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
					from: pf3
				})
				.then(tx => {
					assert.equal(tx.logs.length, 1, 'more than one event emitted');
					assert.equal(
						tx.logs[0].event,
						ACCEPT_PRICE,
						'AcceptPrice Event is not emitted'
					);
					assert.isTrue(
						isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
						'last price is not updated correctly'
					);
					assert.isTrue(
						isEqual(
							tx.logs[0].args.timeInSecond.toNumber(),
							firstPeriod.toNumber() - 300
						),
						'last price time is not updated correctly'
					);
				});
		});

		it('should accept median price if third price does not time out', () => {
			// first price
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('550'),
							firstPeriod.toNumber() - 300,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('400'),
							firstPeriod.toNumber() - 280,
							{
								from: pf2
							}
						)
					)
					// //third price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('540'),
							firstPeriod.toNumber() - 260,
							{
								from: pf3
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 1, 'more than one event emitted');
						assert.equal(
							tx.logs[0].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('540')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[0].args.timeInSecond.toNumber(),
								firstPeriod.toNumber() - 300
							),
							'last price time is not updated correctly'
						);
					})
			);
		});

		it('should accept third price arrived if it is from first or second sender and is after cool down', () => {
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							firstPeriod.toNumber() - 300,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('400'),
							firstPeriod.toNumber() - 280,
							{
								from: pf2
							}
						)
					)
					// //third price
					.then(() => custodianContract.skipCooldown(1))
					.then(() => custodianContract.timestamp.call())
					.then(ts => (secondPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('520'),
							secondPeriod.toNumber(),
							{
								from: pf2
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 1, 'more than one event emitted');
						assert.equal(
							tx.logs[0].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('520')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[0].args.timeInSecond.toNumber(),
								secondPeriod.toNumber()
							),
							'last price time is not updated correctly'
						);
					})
			);
		});

		it('should not reset', () => {
			return custodianContract.state
				.call()
				.then(state => assert.equal(state.valueOf(), STATE_TRADING, 'state is changed'));
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', () => {
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('580'),
							firstPeriod.toNumber() - 200,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							firstPeriod.toNumber() - 180,
							{
								from: pf2
							}
						)
					)
					// // //third price
					.then(() => custodianContract.skipCooldown(1))
					.then(() => custodianContract.timestamp.call())
					.then(ts => (secondPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('520'),
							secondPeriod.toNumber(),
							{
								from: pf3
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 1, 'more than one event emitted');
						assert.equal(
							tx.logs[0].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[0].args.timeInSecond.toNumber(),
								secondPeriod.toNumber()
							),
							'last price time is not updated correctly'
						);
					})
			);
		});

		it('should not allow price commit during cool down period', () => {
			return custodianContract
				.skipCooldown(1)
				.then(() => custodianContract.timestamp.call())
				.then(ts => (firstPeriod = ts))
				.then(() =>
					custodianContract.commitPrice(
						web3.utils.toWei('400'),
						firstPeriod.toNumber() - 800,
						{
							from: pf1
						}
					)
				)
				.then(() => assert.isTrue(false, 'can commit price within cooldown period'))
				.catch(err =>
					assert.equal(
						err.message,
						VM_REVERT_MSG,
						'can commit price within cooldown period'
					)
				);
		});

		it('should transit to reset state based on price accepted', () => {
			return (
				custodianContract
					.skipCooldown(1)
					.then(() => custodianContract.timestamp.call())
					.then(ts => (firstPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('888'),
							firstPeriod.toNumber() - 200,
							{
								from: pf1
							}
						)
					)
					// second price
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('898'),
							firstPeriod.toNumber(),
							{
								from: pf2
							}
						)
					)
					.then(tx => {
						assert.equal(tx.logs.length, 2, 'not two events emitted');
						assert.isTrue(
							tx.logs[0].event === START_PRE_RESET,
							'no or more than one StartPreReset event was emitted'
						);
						assert.equal(
							tx.logs[1].event,
							ACCEPT_PRICE,
							'AcceptPrice Event is not emitted'
						);
						assert.isTrue(
							isEqual(tx.logs[1].args.priceInWei.toNumber(), web3.utils.toWei('888')),
							'last price is not updated correctly'
						);
						assert.isTrue(
							isEqual(
								tx.logs[1].args.timeInSecond.toNumber(),
								firstPeriod.toNumber() - 200
							),
							'last price time is not updated correctly'
						);

						return custodianContract.state.call();
					})
					.then(state =>
						assert.equal(state.valueOf(), STATE_PRE_RESET, 'state is not pre_reset')
					)
			);
		});
	});

	function shouldNotAdminAndTrading() {
		it('should not allow price commit', () => {
			return custodianContract
				.skipCooldown(1)
				.then(() => custodianContract.timestamp.call())
				.then(ts =>
					custodianContract.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
						from: pf1
					})
				)
				.then(() => assert.isTrue(false, 'still can commit price'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'still can commit price '));
		});

		it('should not allow creation', () => {
			return custodianContract
				.create({
					from: alice,
					value: web3.utils.toWei('1')
				})

				.then(() => assert.isTrue(false, 'still can create'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'still can create '));
		});

		it('should not allow redemption', () => {
			return custodianContract
				.redeem(web3.utils.toWei('2800'), web3.utils.toWei('2900'), { from: alice })
				.then(() => assert.isTrue(false, 'still can redeem'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'still can redeem '));
		});

		it('should not allow any transfer or approve of A', () => {
			return custodianContract
				.transferA(alice, bob, web3.utils.toWei('1'))
				.then(() => assert.isTrue(false, 'still can transfer A token'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still can transfer A token')
				);
		});

		it('should not allow any transfer or approve of B', () => {
			return custodianContract
				.transferB(alice, bob, web3.utils.toWei('1'))
				.then(() => assert.isTrue(false, 'still can transfer B token'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still can transfer B token')
				);
		});

		it('should not allow admin setMemberThresholdInWei', () => {
			return custodianContract
				.setMemberThresholdInWei(1000)
				.then(() => assert.isTrue(false, 'still can setMemberThresholdInWei'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still cansetMemberThresholdInWei')
				);
		});

		it('should not allow admin setIterationGasThreshold', () => {
			return custodianContract
				.setIterationGasThreshold(1000)
				.then(() => assert.isTrue(false, 'still can setIterationGasThreshold'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setIterationGasThreshold')
				);
		});

		it('should not allow admin setPreResetWaitingBlocks', () => {
			return custodianContract
				.setPreResetWaitingBlocks(1000)
				.then(() => assert.isTrue(false, 'still can setPreResetWaitingBlocks'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setPreResetWaitingBlocks')
				);
		});

		it('should not allow admin setPostResetWaitingBlocks', () => {
			return custodianContract
				.setPostResetWaitingBlocks(1000)
				.then(() => assert.isTrue(false, 'still can setPostResetWaitingBlocks'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setPostResetWaitingBlocks')
				);
		});

		it('should not allow admin setPriceTolInBP', () => {
			return custodianContract
				.setPriceTolInBP(1000)
				.then(() => assert.isTrue(false, 'still can setPriceTolInBP'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'still setPriceTolInBP'));
		});

		it('should not allow admin setPriceFeedTolInBP', () => {
			return custodianContract
				.setPriceFeedTolInBP(1000)
				.then(() => assert.isTrue(false, 'still can setPriceFeedTolInBP'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setPriceFeedTolInBP')
				);
		});

		it('should not allow admin setPriceFeedTimeTol', () => {
			return custodianContract
				.setPriceFeedTimeTol(1000)
				.then(() => assert.isTrue(false, 'still can setPriceFeedTimeTol'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setPriceFeedTimeTol')
				);
		});

		it('should not allow admin setPriceUpdateCoolDown', () => {
			return custodianContract
				.setPriceUpdateCoolDown(1000)
				.then(() => assert.isTrue(false, 'still can setPriceUpdateCoolDown'))
				.catch(err =>
					assert.equal(err.message, VM_REVERT_MSG, 'still setPriceUpdateCoolDown')
				);
		});
	}

	describe('pre reset', () => {
		beforeEach(() =>
			initContracts()
				.then(() => custodianContract.skipCooldown(1))
				.then(() => custodianContract.timestamp.call())
				.then(ts =>
					custodianContract
						.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
							from: pf1
						})
						.then(() =>
							custodianContract.commitPrice(web3.utils.toWei('898'), ts.toNumber(), {
								from: pf2
							})
						)
				)
		);

		it('should be in state preReset', () => {
			return custodianContract.state
				.call()
				.then(state =>
					assert.equal(state.valueOf(), STATE_PRE_RESET, 'not in state preReset')
				);
		});

		shouldNotAdminAndTrading();

		it('should only transit to reset state after a given number of blocks but not before that', () => {
			let promise = Promise.resolve();
			for (let i = 0; i < 9; i++)
				promise = promise.then(() => custodianContract.startPreReset());
			return promise
				.then(() => custodianContract.state.call())
				.then(state =>
					assert.equal(state.valueOf(), STATE_PRE_RESET, 'not in pre reset state')
				)
				.then(() => custodianContract.startPreReset())
				.then(() => custodianContract.state.call())
				.then(state =>
					assert.equal(
						state.valueOf(),
						STATE_UPWARD_RESET,
						'not transit to upward reset state'
					)
				);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta) {
			let newBFromA =
				prevBalanceA * (navA - 1) * beta / (1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
			let newAFromA = newBFromA * CustodianInit.alphaInBP / BP_DENOMINATOR;
			let newBFromB =
				prevBalanceB * (navB - 1) * beta / (1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
			let newAFromB = newBFromB * CustodianInit.alphaInBP / BP_DENOMINATOR;
			return [prevBalanceA + newAFromA + newAFromB, prevBalanceB + newBFromA + newBFromB];
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
			return custodianContract.balancesA.call(addr).then(currentBalanceA => {
				assert.isTrue(
					isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return custodianContract.balancesB
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

		function resetTest(price, resetFunc, resetState, isPeriodicReset, transferABRequired) {
			let prevBalanceAalice, prevBalanceBalice;
			let prevBalanceAbob, prevBalanceBbob;
			let currentNavA;
			let currentNavB;
			let timestamp;
			let prevBeta, beta;

			let skipNum = isPeriodicReset
				? Math.ceil((Number(CustodianInit.hp) - 1) / Number(CustodianInit.couponRate)) + 1
				: 1;

			before(() =>
				initContracts()
					.then(() =>
						duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator })
					)
					.then(() =>
						duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator })
					)
					.then(() =>
						custodianContract.create({
							from: alice,
							value: web3.utils.toWei('1')
						})
					)
					.then(() =>
						custodianContract.create({
							from: bob,
							value: web3.utils.toWei('1')
						})
					)
					.then(() => {
						if (transferABRequired) {
							return custodianContract.balancesA
								.call(alice)
								.then(aliceA => {
									custodianContract.transferA(alice, bob, aliceA.valueOf(), {
										from: alice
									});
								})
								.then(() =>
									custodianContract.balancesB.call(bob).then(bobB => {
										custodianContract.transferB(bob, alice, bobB.valueOf(), {
											from: bob
										});
									})
								);
						}
					})
					.then(() =>
						custodianContract.balancesA
							.call(alice)
							.then(
								aliceA => (prevBalanceAalice = aliceA.toNumber() / WEI_DENOMINATOR)
							)
					)
					.then(() =>
						custodianContract.balancesB
							.call(alice)
							.then(
								aliceB => (prevBalanceBalice = aliceB.toNumber() / WEI_DENOMINATOR)
							)
					)
					.then(() =>
						custodianContract.balancesA
							.call(bob)
							.then(bobA => (prevBalanceAbob = bobA.toNumber() / WEI_DENOMINATOR))
					)
					.then(() =>
						custodianContract.balancesB
							.call(bob)
							.then(bobB => (prevBalanceBbob = bobB.toNumber() / WEI_DENOMINATOR))
					)
					.then(() => custodianContract.skipCooldown(skipNum))
					.then(() => custodianContract.timestamp.call())
					.then(ts => (timestamp = ts))
					.then(() => {
						if (isPeriodicReset) {
							return custodianContract.commitPrice(
								web3.utils.toWei(price + ''),
								timestamp.toNumber(),
								{
									from: pf1
								}
							);
						} else {
							return custodianContract
								.commitPrice(
									web3.utils.toWei(price + ''),
									timestamp.toNumber() - 200,
									{
										from: pf1
									}
								)
								.then(() =>
									custodianContract.commitPrice(
										web3.utils.toWei(price + 1 + ''),
										timestamp.toNumber(),
										{
											from: pf2
										}
									)
								);
						}
					})
					.then(() => custodianContract.navAInWei.call())
					.then(navAinWei => {
						currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;
					})
					.then(() => custodianContract.navBInWei.call())
					.then(navBinWei => (currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR))
					.then(() => custodianContract.betaInWei.call())
					.then(betaInWei => (prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR))
					.then(() => {
						let promise = Promise.resolve();
						for (let i = 0; i < 10; i++)
							promise = promise.then(() => custodianContract.startPreReset());
						return promise;
					})
					.then(() => custodianContract.betaInWei.call())
					.then(betaInWei => (beta = betaInWei.valueOf() / WEI_DENOMINATOR))
			);

			it('should update beta correctly', () => {
				if (isPeriodicReset) {
					let newBeta = updateBeta(
						prevBeta,
						price,
						Number(CustodianInit.ethInitPrice),
						currentNavA
					);
					return assert.isTrue(isEqual(beta, newBeta), 'beta is not updated correctly');
				} else {
					return assert.equal(beta, 1, 'beta is not reset to 1');
				}
			});

			it('should in corect reset state', () => {
				return custodianContract.state.call().then(state => {
					assert.equal(state.valueOf(), resetState, 'not in correct reset state');
				});
			});

			it('should have two users', () => {
				return custodianContract.getNumOfUsers
					.call()
					.then(numOfUsers =>
						assert.equal(numOfUsers.valueOf(), 2, 'num of users incorrect')
					);
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

			it('should process reset for only one user', () => {
				return custodianContract.startReset({ gas: 120000 }).then(tx => {
					assert.isTrue(
						tx.logs.length === 1 && tx.logs[0].event === START_RESET,
						'not only one user processed'
					);
					return custodianContract.nextResetAddrIndex
						.call()
						.then(nextIndex =>
							assert.equal(nextIndex.valueOf(), '1', 'not moving to next user')
						)
						.then(() => {
							custodianContract.balancesA.call(alice).then(currentBalanceAalice =>
								custodianContract.balancesB
									.call(alice)
									.then(currentBalanceBalice => {
										let [newBalanceA, newBalanceB] = resetFunc(
											prevBalanceAalice,
											prevBalanceBalice,
											currentNavA,
											currentNavB,
											beta
										);
										assert.isTrue(
											isEqual(
												currentBalanceAalice.toNumber() / WEI_DENOMINATOR,
												newBalanceA
											),
											'BalanceA not updated correctly'
										);
										assert.isTrue(
											isEqual(
												currentBalanceBalice.toNumber() / WEI_DENOMINATOR,
												newBalanceB
											),
											'BalanceB not updated correctly'
										);
									})
							);
						});
				});
			});

			it('should complete reset for second user and transit to postReset', () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAbob,
					prevBalanceBbob,
					currentNavA,
					currentNavB,
					beta
				);
				return custodianContract
					.startReset({ gas: 120000 })
					.then(tx => {
						assert.isTrue(
							tx.logs.length === 1 && tx.logs[0].event === START_POST_RESET,
							'reset not completed'
						);
					})
					.then(() =>
						custodianContract.nextResetAddrIndex.call().then(nextIndex => {
							assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
						})
					)
					.then(() => assertABalanceForAddress(bob, newBalanceA))
					.then(() => assertBBalanceForAddress(bob, newBalanceB));
			});

			it('should update nav', () => {
				return custodianContract.navAInWei
					.call()
					.then(navA =>
						assert.equal(
							web3.utils.fromWei(navA.valueOf()),
							'1',
							'nav A not reset to 1'
						)
					)
					.then(() => custodianContract.navBInWei.call())
					.then(navB =>
						assert.isTrue(
							isPeriodicReset
								? isEqual(web3.utils.fromWei(navB.valueOf()), currentNavB)
								: web3.utils.fromWei(navB.valueOf()) === '1',
							'nav B not updated correctly'
						)
					);
			});

			it('should update reset price', () => {
				if (!isPeriodicReset) {
					return custodianContract.resetPrice
						.call()
						.then(resetPrice =>
							assert.equal(
								resetPrice[0].valueOf() / WEI_DENOMINATOR,
								price,
								'resetprice not updated'
							)
						);
				}
			});
		}

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 1', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 2', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 1', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 2', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 1', () => {
			resetTest(
				Number(CustodianInit.ethInitPrice),
				periodicReset,
				STATE_PERIODIC_RESET,
				true,
				false
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 2', () => {
			resetTest(
				Number(CustodianInit.ethInitPrice),
				periodicReset,
				STATE_PERIODIC_RESET,
				true,
				true
			);
		});
	});

	describe('post reset', () => {
		let timestamp;
		beforeEach(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() =>
					custodianContract.create({
						from: alice,
						value: web3.utils.toWei('1')
					})
				)
				.then(() => custodianContract.skipCooldown(1))
				.then(() => custodianContract.timestamp.call())
				.then(ts => (timestamp = ts))
				.then(() =>
					custodianContract
						.commitPrice(web3.utils.toWei('900'), timestamp.toNumber() - 200, {
							from: pf1
						})
						.then(() =>
							custodianContract.commitPrice(
								web3.utils.toWei('901'),
								timestamp.toNumber(),
								{
									from: pf2
								}
							)
						)
				)
				.then(() => {
					let promise = Promise.resolve();
					for (let i = 0; i < 10; i++)
						promise = promise.then(() => custodianContract.startPreReset());
					return promise;
				})
				.then(() => custodianContract.startReset())
		);

		it('should in state post reset', () => {
			return custodianContract.state
				.call()
				.then(state =>
					assert.equal(state.valueOf(), STATE_POST_RESET, 'not in state postReset')
				);
		});

		shouldNotAdminAndTrading();

		it('should transit to trading state after a given number of blocks but not before that case 1', () => {
			let promise = Promise.resolve();
			for (let i = 0; i < 9; i++)
				promise = promise.then(() =>
					custodianContract.startPostReset().then(tx => console.log(tx))
				);
			return promise
				.then(() => custodianContract.state.call())
				.then(state => {
					return assert.equal(
						state.valueOf(),
						STATE_POST_RESET,
						'not in post reset state'
					);
				})
				.then(() => custodianContract.startPostReset())
				.then(() => custodianContract.state.call())
				.then(state =>
					assert.equal(state.valueOf(), STATE_TRADING, 'not transit to trading state')
				);
		});

	});

	describe('A token test', () => {
		before(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() => custodianContract.create({ from: alice, value: web3.utils.toWei('1') }))
		);

		it('should show balance', () => {
			return custodianContract.balancesA.call(alice).then(balance => {
				return assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
			});
		});

		it('should be able to approve', () => {
			return custodianContract.approveA
				.call(alice, bob, web3.utils.toWei('100'), { from: alice })
				.then(success => assert.isTrue(success, 'Not able to approve'))
				.then(() =>
					custodianContract.approveA(alice, bob, web3.utils.toWei('100'), { from: alice })
				);
		});

		it('should show allowance', () => {
			return custodianContract.allowanceA.call(alice, bob).then(allowance => {
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					100,
					'allowance of bob not equal to 100'
				);
			});
		});

		it('should be able to transfer', () => {
			return custodianContract.transferA
				.call(alice, bob, web3.utils.toWei('10'), { from: alice })
				.then(success => assert.isTrue(success, 'Not able to transfer'))
				.then(() =>
					custodianContract.transferA(alice, bob, web3.utils.toWei('10'), { from: alice })
				);
		});

		it('should balance of bob equal to 10', () => {
			return custodianContract.balancesA.call(bob).then(balance => {
				return assert.isTrue(balance.toNumber() === 10*WEI_DENOMINATOR, 'balance of bob not shown');
			});
		});

		it('should not transfer more than balance', () => {
			return custodianContract.transferA
				.call(alice, bob, web3.utils.toWei('10000000'), { from: alice })
				.then(() => assert.isTrue(false, 'able to transfer more than balance'))
				.catch(err =>
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					)
				);
		});

		it('should transferAFrom less than allowance', () => {
			return custodianContract.transferAFrom
				.call(bob, alice, charles, web3.utils.toWei('50'), { form: bob })
				.then(success => assert.isTrue(success, 'Not able to transfer'))
				.then(() =>
					custodianContract.transferAFrom(bob, alice, charles, web3.utils.toWei('50'))
				);
		});

		it('should not transferFrom more than allowance', () => {
			return custodianContract.transferAFrom
				.call(bob, alice, bob, web3.utils.toWei('200'), { from: bob })
				.then(() => assert.isTrue(false, 'can transferFrom of more than allowance'))
				.catch(err =>
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					)
				);
		});

		it('allowance for bob should be 50', () => {
			return custodianContract.allowanceA.call(alice, bob).then(allowance => {
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					50,
					'allowance of bob not equal to 50'
				);
			});
		});

		it('check balance of charles equal 50', () => {
			return custodianContract.balancesA
				.call(charles)
				.then(balance =>
					assert.equal(
						balance.toNumber() / WEI_DENOMINATOR,
						50,
						'balance of charles not equal to 50'
					)
				);
		});
	});

	describe('B token test', () => {
		before(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() => custodianContract.create({ from: alice, value: web3.utils.toWei('1') }))
		);

		it('should show balance', () => {
			return custodianContract.balancesB.call(alice).then(balance => {
				return assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
			});
		});

		it('should be able to approve', () => {
			return custodianContract.approveB
				.call(alice, bob, web3.utils.toWei('100'), { from: alice })
				.then(success => assert.isTrue(success, 'Not able to approve'))
				.then(() =>
					custodianContract.approveB(alice, bob, web3.utils.toWei('100'), { from: alice })
				);
		});

		it('should show allowance', () => {
			return custodianContract.allowanceB.call(alice, bob).then(allowance => {
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					100,
					'allowance of bob not equal to 100'
				);
			});
		});

		it('should be able to transfer', () => {
			return custodianContract.transferB
				.call(alice, bob, web3.utils.toWei('10'), { from: alice })
				.then(success => assert.isTrue(success, 'Not able to transfer'))
				.then(() =>
					custodianContract.transferB(alice, bob, web3.utils.toWei('10'), { from: alice })
				);
		});

		it('should balance of bob equal to 10', () => {
			return custodianContract.balancesB.call(bob).then(balance => {
				return assert.isTrue(balance.toNumber() === 10*WEI_DENOMINATOR, 'balance of bob not shown');
			});
		});

		it('should not transfer more than balance', () => {
			return custodianContract.transferB
				.call(alice, bob, web3.utils.toWei('10000000'), { from: alice })
				.then(() => assert.isTrue(false, 'able to transfer more than balance'))
				.catch(err =>
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					)
				);
		});

		it('should transferAFrom less than allowance', () => {
			return custodianContract.transferBFrom
				.call(bob, alice, charles, web3.utils.toWei('50'), { form: bob })
				.then(success => assert.isTrue(success, 'Not able to transfer'))
				.then(() =>
					custodianContract.transferBFrom(bob, alice, charles, web3.utils.toWei('50'))
				);
		});

		it('should not transferFrom more than allowance', () => {
			return custodianContract.transferBFrom
				.call(bob, alice, bob, web3.utils.toWei('200'), { from: bob })
				.then(() => assert.isTrue(false, 'can transferFrom of more than allowance'))
				.catch(err =>
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					)
				);
		});

		it('allowance for bob should be 50', () => {
			return custodianContract.allowanceB.call(alice, bob).then(allowance => {
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					50,
					'allowance of bob not equal to 50'
				);
			});
		});

		it('check balance of charles equal 50', () => {
			return custodianContract.balancesB
				.call(charles)
				.then(balance =>
					assert.equal(
						balance.toNumber() / WEI_DENOMINATOR,
						50,
						'balance of charles not equal to 50'
					)
				);
		});
	});
	// describe('only admin', () => {
	// 	it('should be able to set fee address', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set commission', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set member threshold', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set iteration gas threshold', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set pre reset waiting blocks', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set post reset waiting blocks', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set price tolerance', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set price feed time tolerance', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to set price update cool down', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });
});
