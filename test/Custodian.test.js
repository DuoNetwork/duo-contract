let Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const web3 = require('web3');
var bigInt = require('big-integer');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWARD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_POST_RESET = '4';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

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

	describe('creation', () => {
		before(() =>
			initContracts().then(() =>
				duoContract
					.transfer(alice, 100 * WEI_DENOMINATOR, { from: creator })
					.then(() =>
						duoContract.transfer(nonDuoMember, 2 * WEI_DENOMINATOR, { from: creator })
					)
			)
		);

		it('should only allow duo member to create', () => {
			return custodianContract
				.create({ from: nonDuoMember, value: 1 * WEI_DENOMINATOR })
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
				.call({ from: alice, value: 1 * WEI_DENOMINATOR })
				.then(success => {
					// first check return value with call()
					assert.isTrue(success, 'duo member is not able to create');
					// then send transaction to check effects
					return custodianContract.create({ from: alice, value: 1 * WEI_DENOMINATOR });
				});
		});

		it('feeAccumulated should be updated', () => {
			return custodianContract.feeAccumulatedInWei.call().then(feeAccumulated => {
				let fee = 1 * WEI_DENOMINATOR * CustodianInit.commissionRateInBP / BP_DENOMINATOR;
				assert.equal(feeAccumulated.valueOf(), fee, 'feeAccumulated not updated correctly');
			});
		});

		it('should update user list if required', () => {
			return custodianContract.existingUsers
				.call(alice)
				.then(isUser => assert.isTrue(isUser, 'new user is not updated'));
		});

		it('should update balance of A and B correctly', () => {
			let feeInWei = 1 * WEI_DENOMINATOR * CustodianInit.commissionRateInBP / BP_DENOMINATOR;
			let tokenValueB =
				(1 * WEI_DENOMINATOR - feeInWei) *
				web3.utils.toWei(CustodianInit.ethInitPrice) /
				WEI_DENOMINATOR /
				(CustodianInit.alphaInBP + BP_DENOMINATOR) *
				BP_DENOMINATOR;
			let tokenValueA = CustodianInit.alphaInBP / BP_DENOMINATOR * tokenValueB;
			return custodianContract.balancesB.call(alice).then(balanceB => {
				return custodianContract.balancesA.call(alice).then(balanceA => {
					// console.log(balanceA.toNumber(), balanceB.toNumber());
					assert.isTrue(
						balanceA.toNumber() === tokenValueA && balanceB.toNumber() === tokenValueB,
						'balance not updated correctly'
					);
				});
			});
		});
	});

	describe('redemption', () => {
		before(() =>
			initContracts().then(() =>
				duoContract
					.transfer(alice, 100 * WEI_DENOMINATOR, { from: creator })
					.then(() =>
						duoContract.transfer(nonDuoMember, 2 * WEI_DENOMINATOR, { from: creator })
					)
					.then(() => duoContract.transfer(bob, 100 * WEI_DENOMINATOR, { from: creator }))
					.then(() =>
						custodianContract.create({ from: alice, value: 1 * WEI_DENOMINATOR })
					)
			)
		);

		it('nonduo member should not redeem', () => {
			return custodianContract.redeem
				.call(28000000000000000000, 29000000000000000000, { from: nonDuoMember })
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

		it('should only redeem token value leess than balance', () => {
			return custodianContract
				.redeem(2800000000000000000000, 2900000000000000000000, { from: alice })
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

		it('should only redeem token value greater than 0', () => {
			return custodianContract
				.redeem(-28000000000000000000, 29000000000000000000, { from: alice })
				.then(() => {
					assert.isTrue(false, 'duomember not able to create more than allowed');
				})
				.catch(err => {
					assert.equal(
						err.message,
						VM_INVALID_OPCODE_MSG,
						'non DUO member still can create Tranche Token'
					);
				});
		});

		it('only duo member can redeem', () => {
			let amtInWeiA = 28000000000000000000;
			let amtInWeiB = 29000000000000000000;
			let adjAmtInWeiA = amtInWeiA * BP_DENOMINATOR / CustodianInit.alphaInBP;
			let deductAmtInWeiB = adjAmtInWeiA < amtInWeiB ? adjAmtInWeiA : amtInWeiB;
			let deductAmtInWeiA = deductAmtInWeiB * CustodianInit.alphaInBP / BP_DENOMINATOR;
			let amtEthInWei =
				(deductAmtInWeiA + deductAmtInWeiB) /
				web3.utils.toWei(CustodianInit.ethInitPrice) *
				WEI_DENOMINATOR;
			let fee = bigInt(amtEthInWei).multiply(CustodianInit.commissionRateInBP).over(BP_DENOMINATOR);

			return custodianContract.balancesA.call(alice).then(prevBalanceA =>
				custodianContract.balancesB.call(alice).then(prevBalanceB =>
					custodianContract.feeAccumulatedInWei.call().then(prefeeAccumulated =>
						custodianContract.redeem
							.call(amtInWeiA, amtInWeiB, { from: alice })
							.then(success => {
								assert.isTrue(success, 'duo member is not able to redeem'); //check whether duo member can redeem
								return custodianContract
									.redeem(amtInWeiA, amtInWeiB, { from: alice })   //send transaction to actually redeem
									.then(() => {
										return custodianContract.balancesA
											.call(alice)
											.then(currentBalanceA =>
												custodianContract.balancesB
													.call(alice)
													.then(currentBalanceB => {
														assert.isTrue(
															currentBalanceA.toNumber() +
																deductAmtInWeiA ===
																prevBalanceA.toNumber() &&
																currentBalanceB.toNumber() +
																	deductAmtInWeiB ===
																	prevBalanceB.toNumber(),
															'balance not updated correctly after redeed'
														);
														return custodianContract
															.feeAccumulatedInWei.call().then(feeAccumulated => {
																assert.equal(feeAccumulated.minus(prefeeAccumulated).valueOf(),fee.valueOf(), 'feeAccumulated not updated correctly');

															});

													})
											);
									});
							})
					)
				)
			);
		});


		// it('should collect fee', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should update user list if required', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should update pending withdraw amount correctly', () => {
		// 	return assert.isTrue(false);
		// });

		// it('should allow user to withdraw ETH', () => {
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

	// describe('commit price', () => {
	// 	it('should only allow price commit from given address', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept first price arrived if it is not too far away', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should not accept first price arrived if it is too far away', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should reject price from the same sender within cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept first price arrived if second price timed out and within cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept first price arrived if second price is close to it and within cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept second price arrived if it is from the same sender and is after cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept first price arrived if second price is from a different sender and is after cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should wait for third price if first and second do not agree', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should reject price from first or second sender within cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept first price arrived if third price timed out and within cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept medium price if third price does not time out', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept third price arrived if it is from first or second sender and is after cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should accept second price arrived if third price is from a different sender and is after cool down', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should update NAV for A and B after pric eis accepted', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should not allow price commit during cool down period', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should transit to reset state based on price accepted', () => {
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
