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

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWARD_RESET = '2';
//const STATE_DOWNWARD_RESET = '3';
//const STATE_PERIODIC_RESET = '4';
const STATE_POST_RESET = '5';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 15e-17;

const isEqual = (a, b, log = false) => {
	if (log) {
		console.log(a);
		console.log(b);
	}
	return Math.abs(Number(a) - Number(b)) <= EPSILON;
};

const upwardReset = (preBalanceA, preBalanceB, newBFromAPerA, newBFromBPerB, aAdj) => {
	let newBFromA = preBalanceA * newBFromAPerA;
	let newAFromA = newBFromA * aAdj;
	let newBFromB = preBalanceB * newBFromBPerB;
	let newAFromB = newBFromB * aAdj;
	let newBalanceA = preBalanceA + newAFromA + newAFromB;
	let newBalanceB = preBalanceB + newBFromA + newBFromB;
	return [newBalanceA, newBalanceB];
};

contract('Custodian', accounts => {
	let custodianContract;
	let duoContract;

	const creator = accounts[0];
	const alice = accounts[1]; //duoMember
	const bob = accounts[2];
	const nonDuoMember = accounts[3];
	const pf1 = accounts[4];
	const pf2 = accounts[5];
	const pf3 = accounts[6];
	const fc = accounts[7];

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
			let navA = 1 + numOfPeriods * Number(CustodianInit.couponRate);
			let navB =
				price / resetPrice / beta * (1 + CustodianInit.alphaInBP / BP_DENOMINATOR) -
				navA * CustodianInit.alphaInBP / BP_DENOMINATOR;

			return [navA, navB];
		}

		it('it should calculate nav correclty', () => {
			let resetPriceInWei = web3.utils.toWei('582');
			let resetPriceTimeSeconds = 1522745087;
			let lastPriceInWei = web3.utils.toWei('600');
			let lastPriceTimeSeconds = 1522745087 + 60 * 5 + 10;
			let betaInWei = web3.utils.toWei('1.2');
			let [navA, navB] = calcNav(600, lastPriceTimeSeconds, 582, resetPriceTimeSeconds, 1.2);
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
				.skipCooldown()
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
				.skipCooldown()
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
				.skipCooldown()
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
					.skipCooldown()
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
					.then(() => custodianContract.skipCooldown())
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
					.skipCooldown()
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
					.skipCooldown()
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
					.skipCooldown()
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
					.skipCooldown()
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
					.then(() => custodianContract.skipCooldown())
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
					.skipCooldown()
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
					.then(() => custodianContract.skipCooldown())
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
				.skipCooldown()
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
					.skipCooldown()
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

	describe('pre reset', () => {
		beforeEach(() =>
			initContracts()
				.then(() => custodianContract.skipCooldown())
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

		it('should not allow price commit', () => {
			return custodianContract
				.skipCooldown()
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

		it('should transit to reset state after a given number of blocks but not before that', () => {
			let numBlocks = 9;
			return custodianContract.startPreReset().then(() => {
				let count = 0;
				let loop = () => {
					return custodianContract.startPreReset().then(tx => {
						count = count + 1;
						if (count < numBlocks) {
							loop();
						} else {
							assert.isTrue(
								tx.logs.length === 1 && tx.logs[0].event === START_RESET,
								'not transiting to reset state'
							);
							return custodianContract.state
								.call()
								.then(state =>
									assert.equal(
										state.valueOf(),
										STATE_UPWARD_RESET,
										'not transit to upward reset state'
									)
								);
						}
					});
				};
				loop();
			});
		});
	});

	describe('upward reset', () => {
		let preBalanceAalice, preBalanceBalice;
		let preBalanceAbob, preBalanceBbob;
		let currentNavA;
		let currentNavB;
		let beta;
		let bAdj, newBFromAPerA, newBFromBPerB, aAdj;

		before(() =>
			initContracts()
				.then(() => duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator }))
				.then(() => duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator }))
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
				.then(() =>
					custodianContract.balancesA
						.call(alice)
						.then(aliceA => (preBalanceAalice = aliceA.toNumber()))
				)
				.then(() =>
					custodianContract.balancesB
						.call(alice)
						.then(aliceB => (preBalanceBalice = aliceB.toNumber()))
				)
				.then(() =>
					custodianContract.balancesA
						.call(bob)
						.then(bobA => (preBalanceAbob = bobA.toNumber()))
				)
				.then(() =>
					custodianContract.balancesB
						.call(bob)
						.then(bobB => (preBalanceBbob = bobB.toNumber()))
				)

				.then(() => custodianContract.skipCooldown())
				.then(() => custodianContract.timestamp.call())
				.then(ts =>
					custodianContract
						.commitPrice(web3.utils.toWei('900'), ts.toNumber() - 200, {
							from: pf1
						})
						.then(() =>
							custodianContract.commitPrice(web3.utils.toWei('901'), ts.toNumber(), {
								from: pf2
							})
						)
						.then(() => custodianContract.navAInWei.call())
						.then(navAinWei => (currentNavA = web3.utils.fromWei(navAinWei.valueOf())))
						.then(() => custodianContract.navBInWei.call())
						.then(naBinWei => (currentNavB = web3.utils.fromWei(naBinWei.valueOf())))
						.then(() => custodianContract.betaInWei.call())
						.then(betaInWei => {
							beta = web3.utils.fromWei(betaInWei.valueOf());
							bAdj =
								(CustodianInit.alphaInBP + BP_DENOMINATOR) / BP_DENOMINATOR / beta;
							newBFromAPerA = (currentNavA - 1) / bAdj;
							newBFromBPerB = (currentNavB - 1) / bAdj;
							aAdj = CustodianInit.alphaInBP / BP_DENOMINATOR;
						})
						.then(() => {
							let count = 0;
							let loop = () => {
								return custodianContract.startPreReset().then(() => {
									// console.log(tx);
									let numBlocks = 10;
									count = count + 1;
									if (count < numBlocks) {
										return loop();
									}
								});
							};
							return loop();
						})
				)
		);

		it('should in state upwardreset', () => {
			return custodianContract.state
				.call()
				.then(state =>
					assert.equal(state.valueOf(), STATE_UPWARD_RESET, 'not in state upward reset')
				);
		});

		it('should have two users', () => {
			return custodianContract.getNumOfUsers
				.call()
				.then(numOfUsers =>
					assert.equal(numOfUsers.valueOf(), 2, 'num of users incorrect')
				);
		});

		it('should process reset for only one user', () => {
			return custodianContract.startReset({ gas: 100000 }).then(tx => {
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
							custodianContract.balancesB.call(alice).then(currentBalanceBalice => {
								let newBalances = upwardReset(
									preBalanceAalice,
									preBalanceBalice,
									newBFromAPerA,
									newBFromBPerB,
									aAdj
								);
								let newBalanceA = newBalances[0];
								let newBalanceB = newBalances[1];
								assert.isTrue(
									isEqual(
										web3.utils.fromWei(currentBalanceAalice.valueOf()),
										newBalanceA / WEI_DENOMINATOR
									),
									'BalanceA not updated correctly'
								);
								assert.isTrue(
									isEqual(
										web3.utils.fromWei(currentBalanceBalice.valueOf()),
										newBalanceB / WEI_DENOMINATOR
									),
									'BalanceB not updated correctly'
								);
							})
						);
					});
			});
		});

		it('should complete reset for second user and transit to postReset', () => {
			return custodianContract.startReset({ gas: 100000 }).then(tx => {
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_POST_RESET,
					'not only one user processed'
				);
				return custodianContract.nextResetAddrIndex
					.call()
					.then(nextIndex => {
						assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
					})
					.then(() => {
						custodianContract.balancesA.call(bob).then(currentBalanceAbob =>
							custodianContract.balancesB.call(bob).then(currentBalanceBbob => {
								let newBalances = upwardReset(
									preBalanceAbob,
									preBalanceBbob,
									newBFromAPerA,
									newBFromBPerB,
									aAdj
								);
								let newBalanceA = newBalances[0];
								let newBalanceB = newBalances[1];
								assert.isTrue(
									isEqual(
										web3.utils.fromWei(currentBalanceAbob.valueOf()),
										newBalanceA / WEI_DENOMINATOR
									),
									'BalanceA not updated correctly'
								);
								assert.isTrue(
									isEqual(
										web3.utils.fromWei(currentBalanceBbob.valueOf()),
										newBalanceB / WEI_DENOMINATOR
									),
									'BalanceB not updated correctly'
								);
							})
						);
					});
			});
		});

		it('nav should be reset to 1', () => {
			return custodianContract.navAInWei.call().then(navA =>
				custodianContract.navBInWei.call().then(navB => {
					assert.equal(web3.utils.fromWei(navA.valueOf()), '1', 'nav A not reset to 1');
					assert.equal(web3.utils.fromWei(navB.valueOf()), '1', 'nav B not reset to 1');
				})
			);
		});
	});

	// describe('downward reset', () => {
	// 	it('should reset accounts based on remaining gas', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should move to post reset state after every account is reset', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });

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

	// describe('A', () => {
	// 	it('should be able to transfer', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to approve', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to transfer from address', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });

	// describe('B', () => {
	// 	it('should be able to transfer', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to approve', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should be able to transfer from address', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });

	// describe('post reset', () => {
	// 	it('should not allow price commit', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should not allow creation or redemption', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should not allow any transfer or approve of A or B', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should not allow any admin activity', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should transit to trading state after a given number of blocks but not before that', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });
});
