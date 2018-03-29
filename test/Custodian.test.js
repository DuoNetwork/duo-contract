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
const STATE_POST_RESET = '4';

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
	const feeCollector = accounts[7];

	const WEI_DENOMINATOR = 1e18;
	const BP_DENOMINATOR = 10000;

	before(() =>
		DUO.new(web3.utils.toWei(DuoInit.initSupply), DuoInit.tokenName, DuoInit.tokenSymbol, {
			from: creator
		})
			.then(instance => (duoContract = instance))
			.then( () => duoContract.transfer(alice, 100 * WEI_DENOMINATOR, { from: creator }))
			.then( () => duoContract.transfer(nonDuoMember, 2 * WEI_DENOMINATOR, { from: creator }))
			.then(() =>
				Custodian.new(
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
					CustodianInit.memberThreshold,
					CustodianInit.gasThreshhold,
					{
						from: creator
					}
				).then(instance => (custodianContract = instance))
			)
	);

	describe('constructor', () => {
		it('feeCollector should equal specified value', () => {
			return custodianContract.getFeeCollector
				.call()
				.then(_feeCollector =>
					assert.equal(
						_feeCollector.valueOf(),
						feeCollector,
						'feeCollector specified incorrect'
					)
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

		it('priceFeedTolInBP should equal 100', () => {
			return custodianContract.getPriceFeedTolInBP
				.call()
				.then(priceFeedTolInBP =>
					assert.equal(
						priceFeedTolInBP.valueOf(),
						100,
						'priceFeedTolInBP not equal to 100'
					)
				);
		});

		it('feeAccumulatedInWei should equal 0', () => {
			return custodianContract.getFeeAccumulatedInWei
				.call()
				.then(feeAccumulated =>
					assert.equal(feeAccumulated.valueOf(), 0, 'feeAccumulated specified incorrect')
				);
		});

		it('preResetWaitingBlocks should equal 10', () => {
			return custodianContract.getPreResetWaitingBlocks
				.call()
				.then(preResetWaitingBlocks =>
					assert.equal(
						preResetWaitingBlocks.valueOf(),
						10,
						'preResetWaitingBlocks specified incorrect'
					)
				);
		});

		it('postResetWaitingBlocks should equal 10', () => {
			return custodianContract.getPostResetWaitingBlocks
				.call()
				.then(postResetWaitingBlocks =>
					assert.equal(
						postResetWaitingBlocks.valueOf(),
						10,
						'postResetWaitingBlocks specified incorrect'
					)
				);
		});

		it('priceTolInBP should equal 500', () => {
			return custodianContract.getPriceTolInBP
				.call()
				.then(getPriceTolInBP =>
					assert.equal(getPriceTolInBP.valueOf(), 500, 'priceTolInBP specified incorrect')
				);
		});

		it('priceFeedTimeTol should equal 60', () => {
			return custodianContract.getPriceFeedTimeTol
				.call()
				.then(priceFeedTimeTol =>
					assert.equal(
						priceFeedTimeTol.valueOf(),
						60,
						'priceFeedTimeTol specified incorrect'
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

		it('numOfPrices should equal 0', () => {
			return custodianContract.getNumOfPrices
				.call()
				.then(numOfPrices =>
					assert.equal(numOfPrices.valueOf(), 0, 'numOfPrices specified incorrect')
				);
		});

		it('lastPreResetBlockNo should equal 0', () => {
			return custodianContract.getLastPreResetBlockNo
				.call()
				.then(lastPreResetBlockNo =>
					assert.equal(
						lastPreResetBlockNo.valueOf(),
						0,
						'lastPreResetBlockNo specified incorrect'
					)
				);
		});

		it('lastPostResetBlockNo should equal 0', () => {
			return custodianContract.getLastPostResetBlockNo
				.call()
				.then(lastPostResetBlockNo =>
					assert.equal(
						lastPostResetBlockNo.valueOf(),
						0,
						'lastPostResetBlockNo specified incorrect'
					)
				);
		});

		it('nextResetAddrIndex should equal 0', () => {
			return custodianContract.getNextResetAddrIndex
				.call()
				.then(nextResetAddrIndex =>
					assert.equal(
						nextResetAddrIndex.valueOf(),
						0,
						'nextResetAddrIndex specified incorrect'
					)
				);
		});

	});

	describe('creation', () => {
		
		it('should only allow duo member to create', () => {
			return assert.isTrue(false);
		});

		it('should collect fee', () => {
			return assert.isTrue(false);
		});

		it('should update user list if required', () => {
			return assert.isTrue(false);
		});

		it('should update A and B balance correctly', () => {
			return assert.isTrue(false);
		});
	});

	// describe('redemption', () => {
	// 	it('should only allow duo member to redeem', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should collect fee', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should update user list if required', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should update A and B balance correctly', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should update pending withdraw amount correctly', () => {
	// 		return assert.isTrue(false);
	// 	});

	// 	it('should allow user to withdraw ETH', () => {
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
