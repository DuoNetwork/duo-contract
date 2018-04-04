let Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWARD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_PERIODIC_RESET = '4';
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

	describe('commit price', () => {
		//let initTimeStamp;
		let firstPeriod;
		let secondPeriod;
		//let beta;

		before(
			//() =>
			initContracts //()
			//.then(() => custodianContract.timestamp.call())
			//.then(ts => (initTimeStamp = ts))
			//.then(() => custodianContract.betaInWei.call())
			//.then(betaInWei => (beta = web3.utils.fromWei(betaInWei.valueOf())))
		);

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
				);
		});

		it('should update the price', () => {
			return custodianContract.lastPrice
				.call()
				.then(lastPrice =>
					assert.isTrue(
						isEqual(lastPrice[0].toNumber(), web3.utils.toWei('580')),
						'last price is not updated correctly'
					)
				);
		});

		it('should not reset', () => {
			return custodianContract.state
				.call()
				.then(state => assert.equal(state.valueOf(), STATE_TRADING, 'state is changed'));
		});

		it('should not accept first price arrived if it is too far away', () => {
			return custodianContract.skipCooldown().then(() =>
				custodianContract.timestamp
					.call()
					.then(ts => (secondPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							secondPeriod.toNumber(),
							{
								from: pf1
							}
						)
					)
					.then(() => custodianContract.getFirstPrice.call())
					.then(res =>
						assert.isTrue(
							isEqual(res[0].toNumber(), web3.utils.toWei('500')) &&
								isEqual(res[1].toNumber(), secondPeriod.toNumber()),
							'first price is not recorded'
						)
					)
			);
		});

		it('should reject price from the same sender within cool down', () => {
			return custodianContract
				.commitPrice(web3.utils.toWei('570'), secondPeriod.toNumber(), {
					from: pf1
				})
				.then(() => assert.isTrue(false, 'the price is not rejected'))
				.catch(err => assert.equal(err.message, VM_REVERT_MSG, 'the VM is not reverted'));
		});

		it('should accept second price arrived if second price timed out and sent by the same address as first price', () => {
			return custodianContract.skipCooldown().then(() =>
				custodianContract.timestamp.call().then(ts =>
					custodianContract
						.commitPrice(web3.utils.toWei('550'), ts.toNumber(), {
							from: pf1
						})
						.then(() => custodianContract.lastPrice.call())
						.then(res => {
							assert.isTrue(
								isEqual(res[0].toNumber(), web3.utils.toWei('550')),
								'second price priceNumber is not accepted'
							);
							assert.isTrue(
								isEqual(res[1].toNumber(), ts.toNumber()),
								'second price timeSecond is not accepted'
							);
						})
				)
			);
		});

		it('should not reset', () => {
			return custodianContract.state
				.call()
				.then(state => assert.equal(state.valueOf(), STATE_TRADING, 'state is changed'));
		});

		it('should not accept first price arrived if it is too far away', () => {
			return custodianContract.skipCooldown().then(() =>
				custodianContract.timestamp
					.call()
					.then(ts => (secondPeriod = ts))
					.then(() =>
						custodianContract.commitPrice(
							web3.utils.toWei('500'),
							secondPeriod.toNumber(),
							{
								from: pf1
							}
						)
					)
					.then(() => custodianContract.getFirstPrice.call())
					.then(res =>
						assert.isTrue(
							isEqual(res[0].toNumber(), web3.utils.toWei('500')) &&
								isEqual(res[1].toNumber(), secondPeriod.toNumber()),
							'first price is not recorded'
						)
					)
			);
		});

		it('should accept first price arrived if second price timed out and sent by the different address as first price', () => {
			return custodianContract.skipCooldown().then(() =>
				custodianContract.timestamp.call().then(ts =>
					custodianContract
						.commitPrice(web3.utils.toWei('550'), ts.toNumber(), {
							from: pf2
						})
						.then(() => custodianContract.lastPrice.call())
						.then(res => {
							assert.isTrue(
								isEqual(res[0].toNumber(), web3.utils.toWei('500')),
								'second price priceNumber is not accepted'
							);
							assert.isTrue(
								isEqual(res[1].toNumber(), ts.toNumber()),
								'second price timeSecond is not accepted'
							);
						})
				)
			);
		});


		// it('should accept first price arrived if second price is close to it and within cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept second price arrived if it is from the same sender and is after cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept first price arrived if second price is from a different sender and is after cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should wait for third price if first and second do not agree', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should reject price from first or second sender within cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept first price arrived if third price timed out and within cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept medium price if third price does not time out', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept third price arrived if it is from first or second sender and is after cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should accept second price arrived if third price is from a different sender and is after cool down', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should update NAV for A and B after pric eis accepted', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should not allow price commit during cool down period', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should transit to reset state based on price accepted', () => {
		// 	return assert.isTrue(false);
		// });
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

	// describe('pre reset', () => {
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

	// 	it('should transit to reset state after a given number of blocks but not before that', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });

	// describe('upward reset', () => {
	// 	it('should reset accounts based on remaining gas', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should move to post reset state after every account is reset', () => {
	// 		return assert.isTrue(false);
	// 	});
	// });

	// describe('downward reset', () => {
	// 	it('should reset accounts based on remaining gas', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should move to post reset state after every account is reset', () => {
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
