const Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];
const PoolInit = InitParas['Pool'];

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

const IDX_ADMIN = 0;
const IDX_FEE_COLLECTOR = 1;
const IDX_PRICEFEED_1 = 2;
const IDX_PRICEFEED_2 = 3;
const IDX_PRICEFEED_3 = 4;
const IDX_POOL_MANAGER = 5;

// const alphaInBP = 0;
const IDX_BETA_IN_WEI = 1;
const IDX_FEE_IN_WEI = 2;
// const periodCouponInWei = 3;
// const limitPeriodicInWei = 4;
// const limitUpperInWei = 5;
// const limitLowerInWei = 6;
// const commissionRateInBP = 7;
const IDX_PERIOD = 8;
// const iterationGasThreshold = 9;
// const ethDuoFeeRatio = 10;
// const preResetWaitingBlocks = 11;
const IDX_PRICE_TOL = 12;
// const priceFeedTolInBP = 13;
// const priceFeedTimeTol = 14;
const IDX_PRICE_UPDATE_COOLDOWN = 15;
// const numOfPrices = 16;
const IDX_NEXT_RESET_ADDR_IDX = 17;
const IDX_USER_SIZE = 18;
const IDX_POOL_SIZE = 19;

// const firstAddr = 0;
const IDX_FIRST_PX = 1;
const IDX_FIRST_TS = 2;
// const secondAddr = 3;
const IDX_SECOND_PX = 4;
const IDX_SECOND_TS = 5;

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 5e-12;
const ethInitPrice = 582;
const ethDuoFeeRatio = 1000;

const isEqual = (a, b, log = false) => {
	if (log) {
		console.log(a);
		console.log(b);
	}
	if(Math.abs(Number(b)) > EPSILON && Math.abs(Number(b)) > EPSILON) {
		return Math.abs(Number(a) - Number(b)) / Number(b) <= EPSILON;
	} else {
		return  Math.abs(Number(a) - Number(b)) <= EPSILON;
	}
	
};

contract('Custodian', accounts => {
	let custodianContract;
	let duoContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const pm = accounts[5];
	const alice = accounts[6]; //duoMember
	const bob = accounts[7];
	const charles = accounts[8];

	const WEI_DENOMINATOR = 1e18;
	const BP_DENOMINATOR = 10000;

	const initContracts = async (alphaInBP = 0) => {
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
			pm,
			alphaInBP ? alphaInBP : CustodianInit.alphaInBP,
			web3.utils.toWei(CustodianInit.couponRate),
			web3.utils.toWei(CustodianInit.hp),
			web3.utils.toWei(CustodianInit.hu),
			web3.utils.toWei(CustodianInit.hd),
			CustodianInit.commissionRateInBP,
			CustodianInit.period,
			CustodianInit.coolDown,
			{
				from: creator
			}
		);
	};

	describe('constructor', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_FEE_COLLECTOR].valueOf(),
				fc,
				'feeCollector specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(fc);
			assert.isTrue(addrStatus.toNumber() === 2, 'fc not marked as used');
		});

		it('priceFeed1 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_1].valueOf(),
				pf1,
				'priceFeed1 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf1);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf1 not marked as used');
		});

		it('priceFeed2 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_2].valueOf(),
				pf2,
				'priceFeed2 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf2);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf2 not marked as used');
		});

		it('priceFeed3 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_3].valueOf(),
				pf3,
				'priceFeed3 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf3);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf3 not marked as used');
		});

		it('admin should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(sysAddress[IDX_ADMIN].valueOf(), creator, 'admin specified incorrect');
			let addrStatus = await custodianContract.getAddrStatus.call(creator);
			assert.isTrue(addrStatus.toNumber() === 2, 'admin not marked as used');
		});

		it('poolManager should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_POOL_MANAGER].valueOf(),
				pm,
				'poolManager specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pm);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf3 not marked as used');
		});

		it('priceTolInBP should equal 500', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PRICE_TOL].valueOf(),
				500,
				'priceTolInBP specified incorrect'
			);
		});

		it('period should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PERIOD].valueOf(),
				CustodianInit.period,
				'period specified incorrect'
			);
		});

		it('priceUpdateCoolDown should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PRICE_UPDATE_COOLDOWN].valueOf(),
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
		let preDUO = 1000000;
		let feeOfDUOinWei = amtEth * CustodianInit.commissionRateInBP / BP_DENOMINATOR * ethDuoFeeRatio;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(initEthPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
			await duoContract.approve(custodianContract.address, web3.utils.toWei('1000000'), {from: alice});
		});

		it('should create token A and B payFee with eth', async () => {
			let success = await custodianContract.create.call(true, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			// first check return value with call()
			assert.isTrue(success, 'not able to create');
			// then send transaction to check effects
			await custodianContract.create(true, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
		});

		it('feeAccumulated should be updated', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let fee = 1 * CustodianInit.commissionRateInBP / BP_DENOMINATOR;
			assert.isTrue(
				isEqual(sysStates[IDX_FEE_IN_WEI].valueOf() / WEI_DENOMINATOR, fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update user list if required', async () => {
			let isUser = await custodianContract.getExistingUser.call(alice);
			assert.isTrue(isUser, 'new user is not updated');
		});

		it('should update balance of A correctly', async () => {
			let balanceA = await custodianContract.balanceOf.call(0, alice);
			assert.isTrue(
				isEqual(balanceA.toNumber() / WEI_DENOMINATOR, tokenValueA),
				'balance A not updated correctly'
			);
		});

		it('should update balance of B correctly', async () => {
			let balanceB = await custodianContract.balanceOf.call(1, alice);
			assert.isTrue(
				isEqual(balanceB.toNumber() / WEI_DENOMINATOR, tokenValueB),
				'balance B not updated correctly'
			);
		});

		it('should create token A and B payFee with DUO', async () => {
			
			
			let success = await custodianContract.create.call(false, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			// // first check return value with call()
			assert.isTrue(success, 'not able to create');
			// then send transaction to check effects
			await custodianContract.create(false, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
		});

		it('should update DUO balance of Alice correctly', async () => {
			let balanceOfAlice = await duoContract.balanceOf.call(alice);
			assert.isTrue(preDUO - balanceOfAlice.toNumber() / WEI_DENOMINATOR === feeOfDUOinWei, "DUO balance of Alice of updated correctly");
		});

		it('should update burned DUO correctly', async () => {
			let burntDUOamt = await duoContract.balanceOf.call(custodianContract.address);
			assert.isTrue(burntDUOamt.toNumber() / WEI_DENOMINATOR === feeOfDUOinWei, "burned DUO not updated correctly");
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await custodianContract.collectFee.call(web3.utils.toWei('1'), { from: fc });
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can collect fee more than allowed');
			}
		});

		it('should collect fee', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			prevFeeAccumulated = sysStates[IDX_FEE_IN_WEI];
			let success = await custodianContract.collectFee.call(web3.utils.toWei('0.0001'), {
				from: fc
			});
			assert.isTrue(success);
			let tx = await custodianContract.collectFee(web3.utils.toWei('0.0001'), { from: fc });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === 'CollectFee',
				'worng event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.addr.valueOf() === fc &&
					tx.logs[0].args.value.valueOf() === web3.utils.toWei('0.0001'),
				'worng fee parameter'
			);
		});

		it('should fee pending withdrawal amount should be updated correctly', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let currentFee = sysStates[IDX_FEE_IN_WEI];
			assert.isTrue(
				isEqual(
					currentFee.toNumber() / WEI_DENOMINATOR,
					prevFeeAccumulated.toNumber() / WEI_DENOMINATOR
				),
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
		let amtEth = (deductAmtA + deductAmtB) / ethInitPrice;
		let fee = amtEth * CustodianInit.commissionRateInBP / BP_DENOMINATOR;
		let preDUO = 1000000;
		let feeInDUO = fee * ethDuoFeeRatio;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
			await duoContract.transfer(bob, web3.utils.toWei(preDUO + ''), { from: creator });
			await custodianContract.create(true, { from: alice, value: web3.utils.toWei('1') });
			prevBalanceA = await custodianContract.balanceOf.call(0, alice);
			prevBalanceB = await custodianContract.balanceOf.call(1, alice);
			let sysStates = await custodianContract.getSystemStates.call();
			prevFeeAccumulated = sysStates[IDX_FEE_IN_WEI];
			await duoContract.approve(custodianContract.address, web3.utils.toWei('1000000'), {from: alice});
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await custodianContract.redeem(
					web3.utils.toWei('2800'),
					web3.utils.toWei('2900'),
					true,
					{
						from: alice
					}
				);
				assert.isTrue(false, 'able to redeem more than allowed');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'able to redeem more than allowed');
			}
		});

		it('should redeem token A and B fee paying with eth', async () => {
			let success = await custodianContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			await custodianContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
		});

		it('feeAccumulated should be updated', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let feeAccumulated = sysStates[IDX_FEE_IN_WEI];
			assert.isTrue(
				isEqual(feeAccumulated.minus(prevFeeAccumulated).toNumber() / WEI_DENOMINATOR, fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await custodianContract.balanceOf.call(0, alice);
			// console.log(currentBalanceA.toNumber() / WEI_DENOMINATOR);
			assert.isTrue(
				isEqual(
					currentBalanceA.toNumber() / WEI_DENOMINATOR + deductAmtA,
					prevBalanceA.toNumber() / WEI_DENOMINATOR
				),
				'balance A not updated correctly after redeed'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await custodianContract.balanceOf.call(1, alice);
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
					'is able to with withdaw more than allowed'
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

		it('should redeem token A and B fee paying with DUO token', async () => {
			let success = await custodianContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			await custodianContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
		});

		it('should update DUO balance of Alice correctly', async () => {
			let balanceOfAlice = await duoContract.balanceOf.call(alice);
			assert.isTrue(isEqual(preDUO - balanceOfAlice.toNumber() / WEI_DENOMINATOR , feeInDUO, true), "DUO balance of Alice of updated correctly");
		});

		it('should update burned DUO correctly', async () => {
			let burntDUOamt = await duoContract.balanceOf.call(custodianContract.address);
			assert.isTrue(isEqual(burntDUOamt.toNumber() / WEI_DENOMINATOR, feeInDUO), "burned DUO not updated correctly");
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
			return custodianContract.getMedianPublic
				.call(400, 500, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(500, 600, 400, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(600, 400, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(600, 600, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(500, 600, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
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
			let stagPrice = await custodianContract.getStagingPrices.call();
			let px = stagPrice[IDX_FIRST_PX];
			let ts = stagPrice[IDX_FIRST_TS];
			assert.isTrue(
				isEqual(px.toNumber(), web3.utils.toWei('500')) &&
					isEqual(ts.toNumber(), firstPeriod.toNumber()),
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
			let stagPrice = await custodianContract.getStagingPrices.call();
			let px = stagPrice[IDX_SECOND_PX];
			let ts = stagPrice[IDX_SECOND_TS];
			assert.isTrue(
				isEqual(px.toNumber(), web3.utils.toWei('700')) &&
					isEqual(ts.toNumber(), firstPeriod.toNumber() - 280),
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
				await custodianContract.create(true, {
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
				await custodianContract.redeem(
					web3.utils.toWei('2800'),
					web3.utils.toWei('2900'),
					true,
					{
						from: alice
					}
				);

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer or approve of A', async () => {
			try {
				await custodianContract.transfer(0, alice, bob, web3.utils.toWei('1'));

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer or approve of B', async () => {
			try {
				await custodianContract.transfer(1, alice, bob, web3.utils.toWei('1'));

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		it('should not allow admin set commissionRate', async () => {
			try {
				await custodianContract.setValue(0, 1000, { from: creator });

				assert.isTrue(false, 'still can set commissionRate');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can set commissionRate');
			}
		});

		it('should not allow admin set ethDuoFeeRatio', async () => {
			try {
				await custodianContract.setValue(1, 1000, { from: creator });

				assert.isTrue(false, 'still can set ethDuoFeeRatio');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can set ethDuoFeeRatio');
			}
		});

		it('should not allow admin set iterationGasThreshold', async () => {
			try {
				await custodianContract.setValue(2, 1000, { from: creator });
				assert.isTrue(false, 'still can set iterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set iterationGasThreshold');
			}
		});

		it('should not allow admin set preResetWaitingBlocks', async () => {
			try {
				await custodianContract.setValue(3, 1000, { from: creator });
				assert.isTrue(false, 'still can set preResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set preResetWaitingBlocks');
			}
		});

		it('should not allow admin set priceTolInBP', async () => {
			try {
				await custodianContract.setValue(4, 1000, { from: creator });

				assert.isTrue(false, 'still can set priceTolInBP');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set priceTolInBP');
			}
		});

		it('should not allow admin set priceFeedTolInBP', async () => {
			try {
				await custodianContract.setValue(5, 1000, { from: creator });
				assert.isTrue(false, 'still can set priceFeedTolInBP');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set priceFeedTolInBP');
			}
		});

		it('should not allow admin set priceFeedTimeTol', async () => {
			try {
				await custodianContract.setValue(6, 1000, { from: creator });
				assert.isTrue(false, 'still can set priceFeedTimeTol');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set priceFeedTimeTol');
			}
		});

		it('should not allow admin set priceUpdateCoolDown', async () => {
			try {
				await custodianContract.setValue(7, 1000, { from: creator });
				assert.isTrue(false, 'still can set priceUpdateCoolDown');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set priceUpdateCoolDown');
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
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta, alphaInBP = 0) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
			let excessA = navA - 1;
			let excessB = navB - 1;
			//if (excessB >= excessBForA) {
			let newAFromA = prevBalanceA * excessA;
			let excessBAfterA = excessB - excessA;
			let excessNewBFromB = prevBalanceB * excessBAfterA * beta / (1 + alpha);
			let newBFromB = prevBalanceB * excessA + excessNewBFromB;
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

		function downwardReset(
			prevBalanceA,
			prevBalanceB,
			currentNavA,
			currentNavB,
			beta,
			alphaInBP = 0
		) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = (currentNavA - currentNavB) / (1 + alpha) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (currentNavB + newAFromA);
			let newBalanceB = prevBalanceB * currentNavB + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function periodicReset(
			prevBalanceA,
			prevBalanceB,
			currentNavA,
			currentNavB,
			beta,
			alphaInBP = 0
		) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = (currentNavA - 1) / (1 + alpha) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (1 + newAFromA);
			let newBalanceB = prevBalanceB * 1 + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function assertABalanceForAddress(addr, expected) {
			return custodianContract.balanceOf.call(0, addr).then(currentBalanceA => {
				assert.isTrue(
					isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return custodianContract.balanceOf
				.call(1, addr)
				.then(currentBalanceB =>
					assert.isTrue(
						isEqual(currentBalanceB.valueOf() / WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function updateBeta(prevBeta, lastPrice, lastResetPrice, currentNavA, alphaInBP = 0) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
			return (
				(1 + alpha) *
				lastPrice /
				((1 + alpha) * lastPrice - lastResetPrice * alpha * prevBeta * (currentNavA - 1))
			);
		}

		function resetTest(
			price,
			resetFunc,
			resetState,
			resetGas,
			isPeriodicReset,
			transferABRequired,
			alphaInBP = 0
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
				await initContracts(alphaInBP);
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					1524105709,
					{
						from: pf1
					}
				);
				await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator });
				await custodianContract.create(true, {
					from: alice,
					value: web3.utils.toWei('1')
				});
				await custodianContract.create(true, {
					from: bob,
					value: web3.utils.toWei('1')
				});

				if (transferABRequired) {
					let aliceA = await custodianContract.balanceOf.call(0, alice);

					custodianContract.transfer(0, alice, bob, aliceA.valueOf(), {
						from: alice
					});
					await custodianContract.balanceOf.call(1, bob).then(bobB => {
						custodianContract.transfer(1, bob, alice, bobB.valueOf(), {
							from: bob
						});
					});
				}

				await custodianContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.toNumber() / WEI_DENOMINATOR));
				let aliceB = await custodianContract.balanceOf.call(1, alice);

				prevBalanceBalice = aliceB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.toNumber() / WEI_DENOMINATOR));
				let bobB = await custodianContract.balanceOf.call(1, bob);
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
				let sysStates = await custodianContract.getSystemStates.call();
				let betaInWei = sysStates[IDX_BETA_IN_WEI];
				prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR;
				for (let i = 0; i < 10; i++) await custodianContract.startPreReset();
				let sysStatesAfter = await custodianContract.getSystemStates.call();
				let betaInWeiAfter = sysStatesAfter[IDX_BETA_IN_WEI];
				// let betaInWeiAfter = await custodianContract.betaInWei.call();
				beta = betaInWeiAfter.valueOf() / WEI_DENOMINATOR;
			});

			it('should update beta correctly', () => {
				if (isPeriodicReset) {
					let newBeta = updateBeta(
						prevBeta,
						price,
						Number(ethInitPrice),
						currentNavA,
						alphaInBP
					);
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
				let sysStates = await custodianContract.getSystemStates.call();
				let numOfUsers = sysStates[IDX_USER_SIZE];

				assert.equal(numOfUsers.toNumber(), 2, 'num of users incorrect');
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
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_RESET,
					'not only one user processed'
				);

				let sysStates = await custodianContract.getSystemStates.call();
				let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await custodianContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await custodianContract.balanceOf.call(1, alice);
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAalice,
					prevBalanceBalice,
					currentNavA,
					currentNavB,
					beta,
					alphaInBP
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
					beta,
					alphaInBP
				);
				newBalanceAbob = newBalanceA;
				newBalanceBbob = newBalanceB;
				let tx = await custodianContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_TRADING,
					'reset not completed'
				);
				let sysStates = await custodianContract.getSystemStates.call();
				let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(bob, newBalanceA);
				await assertBBalanceForAddress(bob, newBalanceB);
			});

			it('totalA should equal totalB times alpha', async () => {
				let totalA = await custodianContract.totalSupplyA.call();
				let totalB = await custodianContract.totalSupplyB.call();
				assert.isTrue(
					isEqual(totalA.toNumber() / WEI_DENOMINATOR, newBalanceAbob + newBalanceAalice),
					'totalSupplyA is wrong'
				);
				assert.isTrue(
					isEqual(totalB.toNumber() / WEI_DENOMINATOR, newBalanceBbob + newBalanceBalice),
					'totalSupplyB is wrong'
				);
				assert.isTrue(
					isEqual(
						newBalanceAbob + newBalanceAalice,
						(newBalanceBbob + newBalanceBalice) *
							(alphaInBP || CustodianInit.alphaInBP) /
							BP_DENOMINATOR
					),
					'total A is not equal to total B times alpha'
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
		describe('upward reset case 3', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 4', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 5', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 6', () => {
			resetTest(900, upwardReset, STATE_UPWARD_RESET, 90000, false, true, 5000);
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
		describe('downward reset case 3', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, 90000, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 4', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, 90000, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 5', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, 90000, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 6', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, 90000, false, true, 5000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 1', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 2', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 3', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 4', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 5', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 6', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 90000, true, true, 5000);
		});
	});

	describe('A token test', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
			await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
			await custodianContract.create(true, { from: alice, value: web3.utils.toWei('1') });
		});

		it('should show balance', async () => {
			let balance = await custodianContract.balanceOf.call(0, alice);
			assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
		});

		it('should be able to approve', async () => {
			let success = await custodianContract.approve.call(
				0,
				alice,
				bob,
				web3.utils.toWei('100'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to approve');

			await custodianContract.approve(0, alice, bob, web3.utils.toWei('100'), {
				from: alice
			});
		});

		it('should show allowance', async () => {
			let allowance = await custodianContract.allowance.call(0, alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of bob not equal to 100'
			);
		});

		it('should be able to transfer', async () => {
			let success = await custodianContract.transfer.call(
				0,
				alice,
				bob,
				web3.utils.toWei('10'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transfer(0, alice, bob, web3.utils.toWei('10'), {
				from: alice
			});
		});

		it('should show balance of bob equal to 10', async () => {
			let balance = await custodianContract.balanceOf.call(0, bob);
			assert.isTrue(balance.toNumber() === 10 * WEI_DENOMINATOR, 'balance of bob not shown');
		});

		it('should not transfer more than balance', async () => {
			try {
				await custodianContract.transfer.call(0, alice, bob, web3.utils.toWei('10000000'), {
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
			let success = await custodianContract.transferFrom.call(
				0,
				bob,
				alice,
				charles,
				web3.utils.toWei('50'),
				{ form: bob }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferFrom(0, bob, alice, charles, web3.utils.toWei('50'));
		});

		it('should not transferFrom more than allowance', async () => {
			try {
				await custodianContract.transferFrom.call(
					0,
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
			let allowance = await custodianContract.allowance.call(0, alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of bob not equal to 50'
			);
		});

		it('check balance of charles equal 50', async () => {
			let balance = await custodianContract.balanceOf.call(0, charles);

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
			await custodianContract.create(true, { from: alice, value: web3.utils.toWei('1') });
		});

		it('should show balance', async () => {
			let balance = await custodianContract.balanceOf.call(1, alice);
			assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
		});

		it('should be able to approve', async () => {
			let success = await custodianContract.approve.call(
				1,
				alice,
				bob,
				web3.utils.toWei('100'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to approve');

			await custodianContract.approve(1, alice, bob, web3.utils.toWei('100'), {
				from: alice
			});
		});

		it('should show allowance', async () => {
			let allowance = await custodianContract.allowance.call(1, alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of bob not equal to 100'
			);
		});

		it('should be able to transfer', async () => {
			let success = await custodianContract.transfer.call(
				1,
				alice,
				bob,
				web3.utils.toWei('10'),
				{ from: alice }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transfer(1, alice, bob, web3.utils.toWei('10'), {
				from: alice
			});
		});

		it('should show balance of bob equal to 10', async () => {
			let balance = await custodianContract.balanceOf.call(1, bob);
			assert.isTrue(balance.toNumber() === 10 * WEI_DENOMINATOR, 'balance of bob not shown');
		});

		it('should not transfer more than balance', async () => {
			try {
				await custodianContract.transfer.call(1, alice, bob, web3.utils.toWei('10000000'), {
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
			let success = await custodianContract.transferFrom.call(
				1,
				bob,
				alice,
				charles,
				web3.utils.toWei('50'),
				{ form: bob }
			);

			assert.isTrue(success, 'Not able to transfer');
			await custodianContract.transferFrom(1, bob, alice, charles, web3.utils.toWei('50'));
		});

		it('should not transferFrom more than allowance', async () => {
			try {
				await custodianContract.transferFrom.call(
					1,
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
			let allowance = await custodianContract.allowance.call(1, alice, bob);
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of bob not equal to 50'
			);
		});

		it('check balance of charles equal 50', async () => {
			let balance = await custodianContract.balanceOf.call(1, charles);

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

		it('admin should be able to set commission', async () => {
			let success = await custodianContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await custodianContract.setValue.call(0, 10001, { from: creator });

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
				await custodianContract.setValue.call(0, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set ethDuoRatio', async () => {
			let success = await custodianContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set ethDuoRatio');
		});

		it('non admin should not be able to set ethDuoRatio', async () => {
			try {
				await custodianContract.setValue.call(1, 100, { from: alice });
				assert.isTrue(false, 'non admin can change ethDuoRatio');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await custodianContract.setValue.call(2, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
		});

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await custodianContract.setValue.call(2, 100000, { from: alice });
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
			let success = await custodianContract.setValue.call(3, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await custodianContract.setValue.call(3, 100, { from: alice });

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
			let success = await custodianContract.setValue.call(4, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price tolerance');
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setValue.call(4, 100, { from: alice });
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
			let success = await custodianContract.setValue.call(5, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed tolerance');
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setValue.call(5, 100, { from: alice });
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
			let success = await custodianContract.setValue.call(6, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed time tolerance');
		});

		it('non admin should not be able to set price feed time tolerance', async () => {
			try {
				await custodianContract.setValue.call(6, 100, { from: alice });
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
			let success = await custodianContract.setValue.call(7, 10000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set price update coolupdate');
		});

		it('non admin should not be able to set price update coolupdate', async () => {
			try {
				await custodianContract.setValue.call(7, 10000, { from: alice });
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

	describe('poolManager add address', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		let poolManager = pm;

		it('non poolManager cannot add address', async () => {
			try {
				await custodianContract.addAddress.call(alice, bob, { from: charles });
				assert.isTrue(false, 'non adder can add address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should not add same address', async () => {
			try {
				await custodianContract.addAddress.call(alice, alice, { from: poolManager });
				assert.isTrue(false, 'can add same address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should not add used account', async () => {
			try {
				await custodianContract.addAddress(pf1, pf2, { from: poolManager });
				assert.isTrue(false, 'can add used account');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should add two different address', async () => {
			let addStatus = await custodianContract.addAddress.call(
				web3.utils.toChecksumAddress(alice),
				web3.utils.toChecksumAddress(bob),
				{ from: poolManager }
			);
			assert.isTrue(addStatus, 'cannot add address');
			let tx = await custodianContract.addAddress(
				web3.utils.toChecksumAddress(alice),
				web3.utils.toChecksumAddress(bob),
				{ from: poolManager }
			);
			assert.isTrue(tx.logs.length === 1, 'not exactly one event emitted');
			let args = tx.logs[0].args;
			let sysAddress = await custodianContract.getSystemAddresses.call();
			poolManager = sysAddress[IDX_POOL_MANAGER];
			assert.isTrue(
				args['added1'] === alice &&
					args['added2'] === bob &&
					args['newPoolManager'] === poolManager,
				'event args is wrong'
			);
		});

		it('pool size should be 7 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			// check correct poolSize
			assert.isTrue(poolSize === PoolInit.length + 1, 'cannot add address');
			let poolList = [];
			// check validatdion of address
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.checkAddressChecksum(web3.utils.toChecksumAddress(addr)),
					' invalid address'
				);
				poolList.push(addr);
			}
			// check duplication
			assert.isTrue(
				new Set(poolList).size === poolList.length,
				'pool candidate contains duplicated value'
			);
		});

		it('new poolManager should be set correctly', async () => {
			let timestamp = await custodianContract.timestamp.call({ from: creator });
			let adderAddr = PoolInit[timestamp % PoolInit.length];
			assert.isTrue(
				web3.utils.toChecksumAddress(adderAddr) ===
					web3.utils.toChecksumAddress(poolManager),
				'adder address not updated correctly'
			);
		});

		it('new poolManager should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(poolManager);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('new poolManager should be removed from the pool', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(poolManager),
					'new adder is still in the pool'
				);
			}
		});
	});

	describe('poolManger remove from pool', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(web3.utils.toWei(ethInitPrice + ''), 1524105709, {
				from: pf1
			});
		});

		let poolManager = pm;

		it('non poolManager cannot remove address', async () => {
			try {
				await custodianContract.removeAddress.call(alice, { from: bob });
				assert.isTrue(false, 'non poolManager can remove address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should not remove address not in the pool', async () => {
			try {
				await custodianContract.removeAddress.call(charles, { from: poolManager });
				assert.isTrue(false, 'non poolManager can remove address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('poolManager should remove address in the pool', async () => {
			let canRemove = await custodianContract.removeAddress.call(PoolInit[0], {
				from: poolManager
			});
			assert.isTrue(canRemove, 'poolManager cannot remove form the pool List');
			let tx = await custodianContract.removeAddress(PoolInit[0], { from: poolManager });
			assert.isTrue(tx.logs.length === 1, 'not exactly one event emitted');
			let args = tx.logs[0].args;
			let sysAddress = await custodianContract.getSystemAddresses.call();
			poolManager = sysAddress[IDX_POOL_MANAGER];
			assert.isTrue(
				web3.utils.toChecksumAddress(args['addr']) === PoolInit[0] &&
					args['newPoolManager'] === poolManager,
				'event args is wrong'
			);
		});

		it('pool size should be 4 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			// check correct poolSize
			assert.isTrue(poolSize === PoolInit.length - 2, 'cannot add address');
			let poolList = [];
			// check validatdion of address
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.checkAddressChecksum(web3.utils.toChecksumAddress(addr)),
					' invalid address'
				);
				poolList.push(addr);
			}
			// check duplication
			assert.isTrue(
				new Set(poolList).size === poolList.length,
				'pool candidate contains duplicated value'
			);
		});

		it('removed address should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(PoolInit[0]);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('removed address should be not in the poolList', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(PoolInit[0]),
					'new adder is still in the pool'
				);
			}
		});

		it('new poolManager should be set correctly', async () => {
			let timestamp = await custodianContract.timestamp.call({ from: creator });
			let adderAddr = PoolInit[timestamp % PoolInit.length];
			assert.isTrue(
				web3.utils.toChecksumAddress(adderAddr) ===
					web3.utils.toChecksumAddress(poolManager),
				'adder address not updated correctly'
			);
		});

		it('new poolManager should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(poolManager);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('new poolManager should be removed from the pool', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(poolManager),
					'new adder is still in the pool'
				);
			}
		});
	});

	describe('update role', () => {
		function updateRole(currentRole, roelIndex) {
			let newAddr;
			let poolSize;

			before(async () => {
				// poolManager = creator;
				await initContracts();
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					1524105709,
					{
						from: pf1
					}
				);
				await custodianContract.addAddress(
					web3.utils.toChecksumAddress(alice),
					web3.utils.toChecksumAddress(bob),
					{ from: pm }
				);
			});

			it('address not in the pool cannot assign', async () => {
				try {
					await custodianContract.updateAddress(currentRole, { from: charles });
					assert.isTrue(false, 'member not in the pool can assign role');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});

			it('pool account can assign another pool account as role', async () => {
				let tx = await custodianContract.updateAddress(currentRole, { from: alice });
				assert.isTrue(tx.logs.length === 1, 'not exactly one event emitted');
				let args = tx.logs[0].args;
				let sysAddress = await custodianContract.getSystemAddresses.call({ from: alice });
				newAddr = sysAddress[roelIndex];

				assert.isTrue(
					args['current'] === currentRole && args['newAddr'] === newAddr,
					'event args is wrong'
				);
				assert.isTrue(newAddr !== currentRole, 'currentRole not updated');
			});

			it('pool size should be 5 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
				let sysStates = await custodianContract.getSystemStates.call();
				poolSize = sysStates[IDX_POOL_SIZE].toNumber();
				// check correct poolSize
				assert.isTrue(poolSize === PoolInit.length - 1, 'cannot add address');
				let poolList = [];
				// check validatdion of address
				for (let i = 0; i < poolSize; i++) {
					let addr = await custodianContract.addrPool.call(i);
					assert.isTrue(
						web3.utils.checkAddressChecksum(web3.utils.toChecksumAddress(addr)),
						' invalid address'
					);
					poolList.push(addr);
				}
				// check duplication
				assert.isTrue(
					new Set(poolList).size === poolList.length,
					'pool candidate contains duplicated value'
				);
			});

			it('newAddr should be marked as used', async () => {
				let addrStatusNewPF = await custodianContract.getAddrStatus.call(newAddr);
				assert.isTrue(
					addrStatusNewPF.toNumber() === 2,
					'assigner and newPFaddr not marked as used'
				);
			});

			it('newAddr should be removed from poolList', async () => {
				for (let i = 0; i < poolSize; i++) {
					let addr = await custodianContract.addrPool.call(i);
					assert.isTrue(
						web3.utils.toChecksumAddress(addr) !==
							web3.utils.toChecksumAddress(newAddr),
						'assigner is still in the pool'
					);
				}
			});
		}

		describe('update pf1', () => {
			updateRole(pf1, IDX_PRICEFEED_1);
		});

		describe('update pf2', () => {
			updateRole(pf2, IDX_PRICEFEED_2);
		});

		describe('update pf3', () => {
			updateRole(pf3, IDX_PRICEFEED_3);
		});

		describe('update feeCollector', () => {
			updateRole(fc, IDX_FEE_COLLECTOR);
		});

		describe('update admin', () => {
			updateRole(creator, IDX_ADMIN);
		});
	});
});
