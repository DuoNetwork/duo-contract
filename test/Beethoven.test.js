const Beethoven = artifacts.require('../contracts/mocks/BeethovenMock');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const WETH = artifacts.require('../contracts/mocks/WETHMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const util = require('./util');

const CST = {
	BTV_STATE: {
		LAST_OPERATION_TIME: 0,
		OPERATION_COOLDOWN: 1,
		STATE: 2,
		MIN_BALANCE: 3,
		TOTAL_SUPPLYA: 4,
		TOTAL_SUPPLYB: 5,
		ETH_COLLATERAL_INWEI: 6,
		NAVA_INWEI: 7,
		NAVB_INWEI: 8,
		LAST_PRICE_INWEI: 9,
		LAST_PRICETIME_INSECOND: 10,
		RESET_PRICE_INWEI: 11,
		RESET_PRICETIME_INSECOND: 12,
		CREATE_COMMINBP: 13,
		REDEEM_COMMINBP: 14,
		PERIOD: 15,
		MATURITY_IN_SECOND: 16,
		PRERESET_WAITING_BLOCKS: 17,
		PRICE_FETCH_COOLDOWN: 18,
		NEXT_RESET_ADDR_INDEX: 19,
		TOTAL_USERS: 20,
		FEE_BALANCE_INWEI: 21,
		RESET_STATE: 22,
		ALPHA_INBP: 23,
		BETA_INWEI: 24,
		PERIOD_COUPON_INWEI: 25,
		LIMIT_PERIODIC_INWEI: 26,
		LIMIT_UPPER_INWEI: 27,
		LIMIT_LOWER_INWEI: 28,
		ITERATION_GAS_THRESHOLD: 29
	}
};

// Event
const EVENT_ACCEPT_PX = 'AcceptPrice';
const EVENT_MATURIED = 'Matured';
const EVENT_START_TRADING = 'StartTrading';
const EVENT_CREATE = 'Create';
const EVENT_REDEEM = 'Redeem';
const EVENT_TOTAL_SUPPLY = 'TotalSupply';
const EVENT_START_RESET = 'StartReset';
const EVENT_SET_VALUE = 'SetValue';
const EVENT_COLLECT_FEE = 'CollectFee';

const STATE_INCEPTION = '0';
const STATE_TRADING = '1';
const STATE_PRE_RESET = '2';
const STATE_RESET = '3';
const STATE_MATURITY = '4';

const STATE_UPWARD_RESET = '0';
const STATE_DOWNWARD_RESET = '1';
const STATE_PERIODIC_RESET = '2';

const ethInitPrice = 582;

const DUMMY_ADDR = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
const A_ADDR = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
const B_ADDR = '0x424325334C3537A6248E09E1Dc392C003d8706Db';

const PERTETUAL_NAME = 'beethoven perpetual';
const TERM_NAME = 'beethoven term6';

const getState = async (beethovenContract, index) => {
	let _states = await beethovenContract.getStates.call();
	return _states[index];
};

const assertState = async (beethovenContract, state) => {
	let _state = await getState(beethovenContract, CST.BTV_STATE.STATE);
	assert.isTrue(util.isEqual(_state.valueOf(), state, true));
};

const assertResetState = async (beethovenContract, state) => {
	let _state = await getState(beethovenContract, CST.BTV_STATE.RESET_STATE);
	assert.isTrue(util.isEqual(_state.valueOf(), state));
};

contract('Beethoven', accounts => {
	let beethovenContract;
	let roleManagerContract;
	let oracleContract;
	let wethContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const alice = accounts[6];
	const bob = accounts[7];
	const charles = accounts[8];

	const WEI_DENOMINATOR = 1e18;
	const BP_DENOMINATOR = 10000;

	const initContracts = async (alphaInBP = 0, name, maturity) => {
		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		beethovenContract = await Beethoven.new(
			name,
			maturity,
			roleManagerContract.address,
			fc,
			alphaInBP ? alphaInBP : BeethovenInit.alphaInBP,
			util.toWei(BeethovenInit.couponRate),
			util.toWei(BeethovenInit.hp),
			util.toWei(BeethovenInit.hu),
			util.toWei(BeethovenInit.hd),
			BeethovenInit.comm,
			BeethovenInit.pd,
			BeethovenInit.optCoolDown,
			BeethovenInit.pxFetchCoolDown,
			process.env.SOLIDITY_COVERAGE ? BeethovenInit.iteGasThSC : BeethovenInit.iteGasTh,
			BeethovenInit.preResetWaitBlk,
			util.toWei(BeethovenInit.minimumBalance),
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

		wethContract = await WETH.new();
	};

	describe('constructor', () => {
		function constructorTest(alphaInBP, name, maturity) {
			before(() => initContracts(alphaInBP, name, maturity));

			it('contract code should be set correctly', async () => {
				let contractCode = await beethovenContract.contractCode.call();
				assert.equal(contractCode.valueOf(), name, 'alpha set incorrectly');
			});

			it('maturity should be set correctly', async () => {
				let contractMaturity = await getState(
					beethovenContract,
					CST.BTV_STATE.MATURITY_IN_SECOND
				);
				assert.isTrue(
					util.isEqual(contractMaturity.valueOf(), maturity),
					'alpha set incorrectly'
				);
			});

			it('alpha should be set correctly', async () => {
				let alpha = await getState(beethovenContract, CST.BTV_STATE.ALPHA_INBP);
				assert.isTrue(
					util.isEqual(alpha.valueOf(), alphaInBP ? alphaInBP : BeethovenInit.alphaInBP),
					'alpha set incorrectly'
				);
			});

			it('period should be set correctly', async () => {
				let pd = await getState(beethovenContract, CST.BTV_STATE.PERIOD);
				assert.equal(pd.valueOf(), BeethovenInit.pd, 'period set incorrectly');
			});

			it('limitPeriodicInWei should be set correctly', async () => {
				let limitPeriodicInWei = await getState(
					beethovenContract,
					CST.BTV_STATE.LIMIT_PERIODIC_INWEI
				);
				assert.equal(
					util.fromWei(limitPeriodicInWei),
					BeethovenInit.hp + '',
					'limitPeriodicInWei set incorrectly'
				);
			});

			it('limitUpperInWei should be set correctly', async () => {
				let limitUpperInWei = await getState(
					beethovenContract,
					CST.BTV_STATE.LIMIT_UPPER_INWEI
				);
				assert.isTrue(
					util.isEqual(util.fromWei(limitUpperInWei), BeethovenInit.hu),
					'limitUpperInWei set incorrectly'
				);
			});

			it('limitLowerInWei should be set correctly', async () => {
				let limitLowerInWei = await getState(
					beethovenContract,
					CST.BTV_STATE.LIMIT_LOWER_INWEI
				);
				assert.equal(
					util.fromWei(limitLowerInWei),
					BeethovenInit.hd + '',
					'limitLowerInWei set incorrectly'
				);
			});

			it('iterationGasThreshold should be set correctly', async () => {
				let iterationGasThreshold = await getState(
					beethovenContract,
					CST.BTV_STATE.ITERATION_GAS_THRESHOLD
				);
				assert.equal(
					iterationGasThreshold.valueOf(),
					process.env.SOLIDITY_COVERAGE
						? BeethovenInit.iteGasThSC
						: BeethovenInit.iteGasTh,
					'iterationGasThreshold set incorrectly'
				);
			});

			it('createCommInBP should be set correctly', async () => {
				let createCommInBP = await getState(
					beethovenContract,
					CST.BTV_STATE.CREATE_COMMINBP
				);
				assert.equal(
					createCommInBP.valueOf(),
					BeethovenInit.comm + '',
					'createCommInBP set incorrectly'
				);
			});

			it('redeemCommInBP should be set correctly', async () => {
				let comm = await getState(beethovenContract, CST.BTV_STATE.REDEEM_COMMINBP);
				assert.equal(comm.valueOf(), BeethovenInit.comm, 'redeemCommInBP set incorrectly');
			});

			it('bAdj should be set correctly', async () => {
				let bAdj = await beethovenContract.getBadj.call();
				assert.equal(util.fromWei(bAdj), '2', 'bAdj set incorrectly');
			});

			it('preResetWaitingBlocks should be set correctly', async () => {
				let preResetWaitingBlocks = await getState(
					beethovenContract,
					CST.BTV_STATE.PRERESET_WAITING_BLOCKS
				);
				assert.equal(
					preResetWaitingBlocks.valueOf(),
					BeethovenInit.preResetWaitBlk + '',
					'preResetWaitingBlocks set incorrectly'
				);
			});

			it('minimumBalance should be set correctly', async () => {
				let minBalance = await getState(beethovenContract, CST.BTV_STATE.MIN_BALANCE);
				assert.equal(
					util.fromWei(minBalance.valueOf()),
					BeethovenInit.minimumBalance + '',
					'preResetWaitingBlocks set incorrectly'
				);
			});
		}

		//case 1: Perpetual tEST
		describe('Perpetual case 1', () => {
			constructorTest(0, PERTETUAL_NAME, 0);
		});

		//case 2: Term tEST
		describe('Term case 2', () => {
			constructorTest(
				0,
				TERM_NAME,
				Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60
			);
		});
	});

	describe('startCustodian', () => {
		before(() => initContracts(0, PERTETUAL_NAME, 0));
		let time;

		it('state should be Inception before starting', async () => {
			let state = await getState(beethovenContract, CST.BTV_STATE.STATE);
			assert.equal(state.valueOf(), STATE_INCEPTION, 'state is not inception');
		});

		it('non operator cannot start', async () => {
			try {
				await beethovenContract.startCustodian.call(
					A_ADDR,
					B_ADDR,
					oracleContract.address,
					{ from: alice }
				);
				assert.isTrue(false, 'can start');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should not start with oracle not ready', async () => {
			try {
				await beethovenContract.startCustodian.call(
					A_ADDR,
					B_ADDR,
					oracleContract.address,
					{ from: creator }
				);
				assert.isTrue(false, 'can start with oracle not ready');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should start contract', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);

			let tx = await beethovenContract.startCustodian(
				A_ADDR,
				B_ADDR,
				oracleContract.address,
				{ from: creator }
			);

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_ACCEPT_PX &&
					tx.logs[1].event === EVENT_START_TRADING,
				'worng event emitted'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), ethInitPrice) &&
					tx.logs[0].args.timeInSecond.valueOf() / WEI_DENOMINATOR ===
						time.valueOf() / WEI_DENOMINATOR &&
					util.isEqual(util.fromWei(tx.logs[0].args.navAInWei), '1') &&
					util.isEqual(util.fromWei(tx.logs[0].args.navBInWei), '1'),
				'worng event parameter emitted'
			);
		});

		it('should update lastPrice and resetPrice', async () => {
			let lastPrice = await getState(beethovenContract, CST.BTV_STATE.LAST_PRICE_INWEI);
			let lastPriceTime = await getState(
				beethovenContract,
				CST.BTV_STATE.LAST_PRICETIME_INSECOND
			);
			assert.isTrue(
				util.isEqual(util.fromWei(lastPrice), ethInitPrice),

				'lastPrice price not updated correctly'
			);

			assert.isTrue(
				util.isEqual(lastPriceTime.valueOf(), time.valueOf()),

				'lastPrice time not updated correctly'
			);

			let resetPrice = await getState(beethovenContract, CST.BTV_STATE.RESET_PRICE_INWEI);
			let resetPriceTime = await getState(
				beethovenContract,
				CST.BTV_STATE.RESET_PRICETIME_INSECOND
			);
			assert.isTrue(
				util.isEqual(util.fromWei(resetPrice), ethInitPrice),

				'resetPrice price not updated correctly'
			);
			assert.isTrue(
				util.isEqual(resetPriceTime.valueOf(), time.valueOf()),

				'resetPrice time not updated correctly'
			);
		});

		it('state should be trading', async () => {
			let state = await getState(beethovenContract, CST.BTV_STATE.STATE);
			assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading');
		});
	});

	describe('fetchPrice', () => {
		function fetchPriceTest(alphaInBP, name, maturity) {
			let time;
			let initTime;
			beforeEach(async () => {
				await initContracts(alphaInBP, name, maturity);
				time = await oracleContract.timestamp.call();
				initTime = time;
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
					from: creator
				});
			});

			it('should not fetch price 0', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(0, time.valueOf(), pf1);
				try {
					await beethovenContract.fetchPrice();
					assert.isTrue(false, 'fetched price 0');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should not fetch price with future time', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf() - 1);
				await oracleContract.setLastPrice(100, time.valueOf(), pf1);
				try {
					await beethovenContract.fetchPrice();
					assert.isTrue(false, 'fetched with future time');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should not fetch withinCoolDown', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(
					time.valueOf() - BeethovenInit.pxFetchCoolDown / 2
				);
				await oracleContract.setLastPrice(100, time.valueOf(), pf1);
				try {
					await beethovenContract.fetchPrice();
					assert.isTrue(false, 'can fetch within cool down');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should fetch price', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				let tx = await beethovenContract.fetchPrice();
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_ACCEPT_PX,
					'wrong event'
				);
				assert.isTrue(
					util.isEqual(
						util.fromWei(tx.logs[0].args.priceInWei),
						ethInitPrice.toString()
					) && util.isEqual(tx.logs[0].args.timeInSecond.valueOf(), time.valueOf()),
					'wrong event args'
				);
			});

			// test for maturity
			if (maturity > 0) {
				it('should transit to maturity', async () => {
					await oracleContract.skipCooldown(6 * 30 * 24 + 1);
					time = await oracleContract.timestamp.call();
					await beethovenContract.setTimestamp(time.valueOf());
					await oracleContract.setLastPrice(
						util.toWei(ethInitPrice),
						time.valueOf(),
						pf1
					);
					let tx = await beethovenContract.fetchPrice();

					let navAinWei = await getState(beethovenContract, CST.BTV_STATE.NAVA_INWEI);
					let currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;

					let navBinWei = await getState(beethovenContract, CST.BTV_STATE.NAVB_INWEI);
					let currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

					let currentTime = await oracleContract.timestamp.call();
					let numOfPeriods = Math.floor(
						(Number(currentTime.valueOf()) - Number(initTime.valueOf())) /
							Number(BeethovenInit.pd)
					);
					let newNavA = 1 + numOfPeriods * Number(BeethovenInit.couponRate);
					assert.isTrue(
						util.isEqual(currentNavA, newNavA, true),
						'NavA is updated wrongly'
					);

					let newNavB;
					let navParent = 1 + (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;

					let navAAdj =
						(newNavA * (alphaInBP || BeethovenInit.alphaInBP)) / BP_DENOMINATOR;
					if (navParent <= navAAdj) newNavB = 0;
					else newNavB = navParent - navAAdj;

					assert.isTrue(util.isEqual(currentNavB, newNavB), 'NavB is updated wrongly');

					assert.isTrue(
						tx.logs.length === 2 &&
							tx.logs[1].event === EVENT_ACCEPT_PX &&
							tx.logs[0].event === EVENT_MATURIED,
						'wrong event'
					);
					assert.isTrue(
						util.isEqual(
							util.fromWei(tx.logs[1].args.priceInWei),
							ethInitPrice.toString()
						) && util.isEqual(tx.logs[1].args.timeInSecond.valueOf(), time.valueOf()),
						'wrong event args'
					);

					await assertState(beethovenContract, STATE_MATURITY);

					try {
						await beethovenContract.fetchPrice();
						assert.isTrue(false, 'fetched price 0');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});
			}
		}

		//case 1: Perpetual tEST
		describe('Perpetual case 1', () => {
			fetchPriceTest(0, PERTETUAL_NAME, 0);
		});

		//case 2: Term tEST
		describe('Term case 2', () => {
			fetchPriceTest(
				0,
				TERM_NAME,
				Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60
			);
		});
	});

	describe('creation', () => {
		function createTest(isWithWETH) {
			let amtEth = 1;
			let tokenValueB =
				((1 - BeethovenInit.comm / BP_DENOMINATOR) * ethInitPrice) /
				(1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);
			let tokenValueA = (BeethovenInit.alphaInBP / BP_DENOMINATOR) * tokenValueB;

			let accumulatedFeeAfterWithdrawal;
			let totalSupplyA, totalSupplyB;
			before(async () => {
				await initContracts(0, PERTETUAL_NAME, 0);
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
					from: creator
				});
				if (isWithWETH) {
					await wethContract.deposit({
						from: alice,
						value: util.toWei(amtEth * 3)
					});
				}
			});

			it('cannot create with 0', async () => {
				if (isWithWETH) {
					await wethContract.approve(beethovenContract.address, util.toWei(amtEth), {
						from: alice
					});
					try {
						await beethovenContract.createWithWETH.call(
							util.toWei(0),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with 0');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				} else {
					try {
						await beethovenContract.create.call({ from: alice, value: 0 });
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				}
			});

			if (isWithWETH) {
				it('cannot create with insufficient allowance', async () => {
					try {
						await beethovenContract.createWithWETH.call(
							util.toWei(amtEth * 2),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with insufficient allowance');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});

				it('cannot create more than balance', async () => {
					await wethContract.approve(beethovenContract.address, util.toWei(amtEth * 4), {
						from: alice
					});
					try {
						await beethovenContract.createWithWETH.call(
							util.toWei(amtEth * 4),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create more than allowance');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});

				it('cannot create with wrong weth addr', async () => {
					await wethContract.approve('0x0', util.toWei(amtEth), {
						from: alice
					});
					try {
						await beethovenContract.createWithWETH.call(
							util.toWei(0),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with 0x0');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});
			}

			it('should create', async () => {
				let tx;
				let preBalance = await util.getBalance(beethovenContract.address);
				if (isWithWETH) {
					await wethContract.approve(beethovenContract.address, util.toWei(amtEth), {
						from: alice
					});
					tx = await beethovenContract.createWithWETH(
						util.toWei(amtEth),

						wethContract.address,
						{ from: alice }
					);
				} else {
					tx = await beethovenContract.create({
						from: alice,
						value: util.toWei(amtEth)
					});
				}

				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === EVENT_CREATE &&
						tx.logs[1].event === EVENT_TOTAL_SUPPLY,
					'incorrect event emitted'
				);

				assert.isTrue(
					tx.logs[0].args.sender === alice &&
						util.isEqual(util.fromWei(tx.logs[0].args.tokenAInWei), tokenValueA + '') &&
						util.isEqual(util.fromWei(tx.logs[0].args.tokenBInWei), tokenValueB + '') &&
						util.isEqual(
							util.fromWei(tx.logs[0].args.ethAmtInWei),
							amtEth * (1 - BeethovenInit.comm / BP_DENOMINATOR) + ''
						) &&
						util.isEqual(
							util.fromWei(tx.logs[0].args.feeInWei),
							(amtEth * BeethovenInit.comm) / BP_DENOMINATOR + ''
						),
					'incorrect event arguments emitted'
				);

				let afterBalance = await util.getBalance(beethovenContract.address);

				assert.isTrue(
					util.fromWei(afterBalance + '') - util.fromWei(preBalance + '') === amtEth,
					'contract balance updated incorrectly'
				);

				totalSupplyA = tokenValueA;
				totalSupplyB = tokenValueB;
				assert.isTrue(
					util.isEqual(
						util.fromWei(tx.logs[1].args.totalSupplyAInWei),
						totalSupplyA + ''
					) &&
						util.isEqual(
							util.fromWei(tx.logs[1].args.totalSupplyBInWei),
							totalSupplyB + ''
						),
					'totalSupply not updated connectly'
				);
			});

			it('feeAccumulated should be updated', async () => {
				let ethFee = await getState(beethovenContract, CST.BTV_STATE.FEE_BALANCE_INWEI);
				let fee = (1 * BeethovenInit.comm) / BP_DENOMINATOR;
				assert.isTrue(
					util.fromWei(ethFee) === fee.toString(),
					'feeAccumulated not updated correctly'
				);
			});

			it('should update user list if required', async () => {
				let userFlag = await beethovenContract.existingUsers.call(alice);
				assert.isTrue(util.isEqual(userFlag.valueOf(), 1), 'new user is not updated');
			});

			it('should update balance of A correctly', async () => {
				let balanceA = await beethovenContract.balanceOf.call(0, alice);
				assert.isTrue(
					util.isEqual(util.fromWei(balanceA), tokenValueA.toString()),
					'balance A not updated correctly'
				);
			});

			it('should update balance of B correctly', async () => {
				let balanceB = await beethovenContract.balanceOf.call(1, alice);
				assert.isTrue(
					util.isEqual(util.fromWei(balanceB), tokenValueB.toString()),
					'balance B not updated correctly'
				);
			});

			it('should not be added into userList with small creation amt', async () => {
				await beethovenContract.create({
					from: charles,
					value: util.toWei(0.00003)
				});
				let userFlag = await beethovenContract.existingUsers.call(charles);
				assert.isTrue(
					util.isEqual(userFlag.valueOf(), '0'),
					'new user is included in userList'
				);
			});

			it('should only collect fee less than allowed', async () => {
				try {
					await beethovenContract.collectFee.call(util.toWei(1), { from: fc });
					assert.isTrue(false, 'can collect fee more than allowed');
				} catch (err) {
					assert.equal(err.message, util.VM_INVALID_OPCODE_MSG, 'not reverted');
				}
			});

			it('should collect fee', async () => {
				let feeBalanceInWei = await getState(
					beethovenContract,
					CST.BTV_STATE.FEE_BALANCE_INWEI
				);
				accumulatedFeeAfterWithdrawal = Number(util.fromWei(feeBalanceInWei)) - 0.0001;
				let success = await beethovenContract.collectFee.call(util.toWei(0.0001), {
					from: fc
				});
				assert.isTrue(success);
				let tx = await beethovenContract.collectFee(util.toWei(0.0001), {
					from: fc
				});

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_COLLECT_FEE,
					'worng event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.addr.valueOf() === fc &&
						util.isEqual(util.fromWei(tx.logs[0].args.feeInWei), 0.0001) &&
						util.isEqual(
							util.fromWei(tx.logs[0].args.feeBalanceInWei),
							accumulatedFeeAfterWithdrawal
						),
					'worng fee parameter'
				);
			});

			it('should update fee balance correctly', async () => {
				let feeBalanceInWei = await getState(
					beethovenContract,
					CST.BTV_STATE.FEE_BALANCE_INWEI
				);
				assert.isTrue(
					util.isEqual(util.fromWei(feeBalanceInWei), accumulatedFeeAfterWithdrawal),
					'fee not updated correctly'
				);
			});
		}

		describe('create with ETH', () => {
			createTest(false);
		});

		describe('create with WETH', () => {
			createTest(true);
		});
	});

	describe('redemption', () => {
		let prevBalanceA, prevBalanceB, prevFeeAccumulated, prevCollateral;
		let amtA = 28;
		let amtB = 29;
		let adjAmtA = (amtA * BP_DENOMINATOR) / BeethovenInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = (deductAmtB * BeethovenInit.alphaInBP) / BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtB) / ethInitPrice;
		let fee = (amtEth * BeethovenInit.comm) / BP_DENOMINATOR;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
				from: creator
			});
			await beethovenContract.create({ from: alice, value: util.toWei(1) });
			prevBalanceA = await beethovenContract.balanceOf.call(0, alice);
			prevBalanceB = await beethovenContract.balanceOf.call(1, alice);
			let ethFee = await getState(beethovenContract, CST.BTV_STATE.FEE_BALANCE_INWEI);
			prevFeeAccumulated = ethFee.valueOf();
			prevCollateral =
				(await getState(beethovenContract, CST.BTV_STATE.ETH_COLLATERAL_INWEI)).valueOf() /
				WEI_DENOMINATOR;
			totalSupplyA = await getState(beethovenContract, CST.BTV_STATE.TOTAL_SUPPLYA);
			totalSupplyA = totalSupplyA.valueOf() / WEI_DENOMINATOR;
			totalSupplyB = await getState(beethovenContract, CST.BTV_STATE.TOTAL_SUPPLYB);
			totalSupplyB = totalSupplyB.valueOf() / WEI_DENOMINATOR;
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await beethovenContract.redeem(util.toWei(2800), util.toWei(2900), {
					from: alice
				});
				assert.isTrue(false, 'able to redeem more than balance');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'able to redeem more than allowed');
			}
		});

		it('should redeem token A and B fee paying with eth', async () => {
			let success = await beethovenContract.redeem.call(
				util.toWei(amtA),
				util.toWei(amtB),

				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await beethovenContract.redeem(util.toWei(amtA), util.toWei(amtB), {
				from: alice
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REDEEM &&
					tx.logs[1].event === EVENT_TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			totalSupplyA = totalSupplyA - deductAmtA;
			totalSupplyB = totalSupplyB - deductAmtB;

			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenAInWei), deductAmtA) &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenBInWei), deductAmtB) &&
					util.isEqual(util.fromWei(tx.logs[0].args.ethAmtInWei), amtEth - fee) &&
					util.isEqual(util.fromWei(tx.logs[0].args.feeInWei), fee),
				'incorrect event arguments emitted'
			);

			let ethCollateral =
				(await getState(beethovenContract, CST.BTV_STATE.ETH_COLLATERAL_INWEI)).valueOf() /
				WEI_DENOMINATOR;
			assert.isTrue(
				util.isEqual(ethCollateral, prevCollateral - amtEth),
				'eth collateral not set correctly'
			);
			prevCollateral = ethCollateral;

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyAInWei), totalSupplyA) &&
					util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyBInWei), totalSupplyB)
			);
		});

		it('fee balance should be updated', async () => {
			let feeAccumulated = await beethovenContract.feeBalanceInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(feeAccumulated.valueOf() - prevFeeAccumulated + ''), fee),
				'fee balance not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await beethovenContract.balanceOf.call(0, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceA.valueOf() / WEI_DENOMINATOR + deductAmtA,
					prevBalanceA.valueOf() / WEI_DENOMINATOR
				),
				'balance A not updated correctly after redemption'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await beethovenContract.balanceOf.call(1, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceB.valueOf() / WEI_DENOMINATOR + deductAmtB,
					prevBalanceB.valueOf() / WEI_DENOMINATOR
				),
				'balance B not updated correctly after redemption'
			);
		});

		it('should be in user list', async () => {
			let userFlag = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), '1'), 'user not in the user list');
			let userSize = await getState(beethovenContract, CST.BTV_STATE.TOTAL_USERS);
			assert.isTrue(util.isEqual(userSize.valueOf(), 1), 'user size not updated correctly');
		});

		it('should be in user list', async () => {
			let userFlag = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(userFlag.valueOf() == '1', 'user not in the user list');
			let userSize = await getState(beethovenContract, CST.BTV_STATE.TOTAL_USERS);
			assert.equal(userSize.valueOf(), 1, 'user size not updated correctly');
		});

		it('should be removed from user list if all tokens are redeemed', async () => {
			let currentBalanceA = await beethovenContract.balanceOf.call(0, alice);
			let currentBalanceB = await beethovenContract.balanceOf.call(1, alice);
			await beethovenContract.redeem(
				currentBalanceA.valueOf(),
				currentBalanceB.valueOf(),

				{ from: alice }
			);
			let userFlag = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), 0), 'user still in the userList');
			let userSize = await getState(beethovenContract, CST.BTV_STATE.TOTAL_USERS);
			assert.isTrue(util.isEqual(userSize.valueOf(), 0), 'user size not updated correctly');
		});
	});

	describe('redempAll', () => {
		let prevBalanceA, prevBalanceB, navA, navB;

		before(async () => {
			await initContracts(
				0,
				TERM_NAME,
				Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60
			);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
				from: creator
			});
			await beethovenContract.create({ from: alice, value: util.toWei(1) });
			prevBalanceA = await beethovenContract.balanceOf.call(0, alice);
			prevBalanceB = await beethovenContract.balanceOf.call(1, alice);
		});

		it('should not redeemAll in non maturity state', async () => {
			try {
				await beethovenContract.redeemAll({
					from: alice
				});
				assert.isTrue(false, 'able to redeem in trading state');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'able to redeem in trading state');
			}
		});

		it('should not redeemAll in balance is 0 state', async () => {
			await oracleContract.skipCooldown(6 * 30 * 24 + 1);
			let time = await oracleContract.timestamp.call();
			await beethovenContract.setTimestamp(time.valueOf());
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await beethovenContract.fetchPrice();
			navA = util.fromWei(await getState(beethovenContract, CST.BTV_STATE.NAVA_INWEI));
			navB = util.fromWei(await getState(beethovenContract, CST.BTV_STATE.NAVB_INWEI));

			try {
				await beethovenContract.redeemAll({
					from: bob
				});
				assert.isTrue(false, 'able to redeemAll with 0 balance');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'able to redeemAll with 0 balance');
			}
		});

		it('should redeemAll', async () => {
			let tx = await beethovenContract.redeemAll({
				from: alice
			});

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REDEEM &&
					tx.logs[1].event === EVENT_TOTAL_SUPPLY,
				'wrong event'
			);

			let ethAmt =
				(util.fromWei(prevBalanceA) * navA + util.fromWei(prevBalanceB) * navB) /
				ethInitPrice;
			let redeemedAmt = ethAmt * (1 - BeethovenInit.comm / 10000);
			let fee = (ethAmt * BeethovenInit.comm) / 10000;
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.ethAmtInWei), redeemedAmt, true) &&
					util.isEqual(tx.logs[0].args.sender.valueOf(), alice) &&
					util.isEqual(tx.logs[0].args.tokenAInWei.valueOf(), prevBalanceA.valueOf()) &&
					util.isEqual(tx.logs[0].args.tokenBInWei.valueOf(), prevBalanceB.valueOf()) &&
					util.isEqual(util.fromWei(tx.logs[0].args.feeInWei.valueOf()), fee),
				'wrong event args'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyAInWei.valueOf()), 0) &&
					util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyBInWei.valueOf()), 0),
				'wrong event args'
			);
		});
	});

	describe('nav calculation', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
				from: creator
			});
		});

		function calcNav(price, time, resetPrice, resetTime, beta) {
			let numOfPeriods = Math.floor((time - resetTime) / BeethovenInit.pd);
			let navParent =
				(price / resetPrice / beta) * (1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);

			let navA = 1 + numOfPeriods * Number(BeethovenInit.couponRate);
			let navAAdj = (navA * BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			if (navParent <= navAAdj)
				return [(navParent * BP_DENOMINATOR) / BeethovenInit.alphaInBP, 0];
			else return [navA, navParent - navAAdj];
		}

		function testNav(resetPrice, lastPrice, beta) {
			let resetPriceInWei = util.toWei(resetPrice);
			let resetPriceTimeSeconds = 1522745087;
			let lastPriceInWei = util.toWei(lastPrice);
			let lastPriceTimeSeconds = 1522745087 + 60 * 5 + 10;
			let betaInWei = util.toWei(beta);
			let [navA, navB] = calcNav(
				lastPrice,
				lastPriceTimeSeconds,
				resetPrice,
				resetPriceTimeSeconds,
				beta
			);
			return beethovenContract.calculateNav
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
						util.isEqual(util.fromWei(navAInWei), navA),
						'navA not calculated correctly'
					);
					assert.isTrue(
						util.isEqual(util.fromWei(navBInWei), navB),
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

	describe('pre reset', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(400), time.valueOf(), pf1);
			await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
				from: creator
			});

			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();

			await beethovenContract.setTimestamp(time.valueOf());
			await oracleContract.setLastPrice(util.toWei(888), time.valueOf(), pf1);

			await beethovenContract.fetchPrice();
		});

		it('should be in state preReset', async () => {
			let state = await getState(beethovenContract, CST.BTV_STATE.STATE);
			assert.equal(state.valueOf(), STATE_PRE_RESET, 'state is wrong');
		});

		it('should not allow creation', async () => {
			try {
				await beethovenContract.create.call({
					from: alice,
					value: util.toWei(1)
				});
				assert.isTrue(false, 'still can create');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can create ');
			}
		});

		it('should not allow redemption', async () => {
			try {
				await beethovenContract.redeem.call(util.toWei(2800), util.toWei(2900), {
					from: alice
				});

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer of A', async () => {
			try {
				await beethovenContract.transfer.call(0, DUMMY_ADDR, bob, util.toWei(1), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer of B', async () => {
			try {
				await beethovenContract.transfer.call(1, DUMMY_ADDR, bob, util.toWei(1), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		it('should not allow admin set createCommInBP', async () => {
			try {
				await beethovenContract.setValue.call(0, 1000, { from: creator });

				assert.isTrue(false, 'still can set createCommInBP');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can set createCommInBP');
			}
		});

		it('should not allow admin set redeemCommInBP', async () => {
			try {
				await beethovenContract.setValue.call(1, 1000, { from: creator });

				assert.isTrue(false, 'still can set redeemCommInBP');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still can set redeemCommInBP');
			}
		});

		it('should not allow admin set iterationGasThreshold', async () => {
			try {
				await beethovenContract.setValue.call(2, 1000, { from: creator });
				assert.isTrue(false, 'still can set iterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still set iterationGasThreshold');
			}
		});

		it('should not allow admin set preResetWaitingBlocks', async () => {
			try {
				await beethovenContract.setValue.call(3, 1000, { from: creator });
				assert.isTrue(false, 'still can set preResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still set preResetWaitingBlocks');
			}
		});

		it('should not allow admin set priceTolInBP', async () => {
			try {
				await beethovenContract.setValue.call(4, 1000, { from: creator });

				assert.isTrue(false, 'still can set priceTolInBP');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'still set priceTolInBP');
			}
		});

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			let preResetWaitBlk = await getState(
				beethovenContract,
				CST.BTV_STATE.PRERESET_WAITING_BLOCKS
			);

			for (let i = 0; i < preResetWaitBlk.valueOf() - 1; i++)
				await beethovenContract.startPreReset();

			await assertState(beethovenContract, STATE_PRE_RESET);

			let tx = await beethovenContract.startPreReset();
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[1].event === EVENT_START_RESET &&
					tx.logs[0].event === EVENT_TOTAL_SUPPLY,
				'wrong events emitted'
			);

			await assertState(beethovenContract, STATE_RESET);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta, alphaInBP = 0) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let excessA = navA - 1;
			let excessB = navB - 1;
			//if (excessB >= excessBForA) {
			let newAFromA = prevBalanceA * excessA;
			let excessBAfterA = excessB - excessA;
			let excessNewBFromB = (prevBalanceB * excessBAfterA * beta) / (1 + alpha);
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
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = ((currentNavA - currentNavB) / (1 + alpha)) * beta;
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
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = ((currentNavA - 1) / (1 + alpha)) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (1 + newAFromA);
			let newBalanceB = prevBalanceB * 1 + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function assertABalanceForAddress(addr, expected) {
			return beethovenContract.balanceOf.call(0, addr).then(currentBalanceA => {
				assert.isTrue(
					util.isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return beethovenContract.balanceOf
				.call(1, addr)
				.then(currentBalanceB =>
					assert.isTrue(
						util.isEqual(currentBalanceB.valueOf() / WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function updateBeta(prevBeta, lastPrice, lastResetPrice, currentNavA, alphaInBP = 0) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			return (
				((1 + alpha) * lastPrice) /
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
			let prevBalanceAcharles, prevBalanceBcharles;
			let currentNavA;
			let currentNavB;
			let newBalanceAalice, newBalanceBalice;
			let newBalanceAbob, newBalanceBbob;
			let newBalanceAcharles, newBalanceBcharles;
			let prevBeta, beta;

			let skipNum = isPeriodicReset
				? Math.ceil((Number(BeethovenInit.hp) - 1) / Number(BeethovenInit.couponRate)) + 1
				: 1;
			let resetTime;
			let newBetaAfterRst;

			before(async () => {
				await initContracts(alphaInBP, PERTETUAL_NAME, 0);
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
					from: creator
				});
				await beethovenContract.create({
					from: alice,
					value: util.toWei(1)
				});
				await beethovenContract.create({
					from: bob,
					value: util.toWei(1.2)
				});
				await beethovenContract.create({
					from: charles,
					value: util.toWei(1.5)
				});

				if (transferABRequired) {
					let aliceA = await beethovenContract.balanceOf.call(0, alice);

					beethovenContract.transfer(0, DUMMY_ADDR, bob, aliceA.valueOf(), {
						from: alice
					});
					await beethovenContract.balanceOf.call(1, bob).then(bobB => {
						beethovenContract.transfer(1, DUMMY_ADDR, alice, bobB.valueOf(), {
							from: bob
						});
					});

					await beethovenContract.balanceOf.call(1, charles).then(charlesB => {
						beethovenContract.transfer(1, DUMMY_ADDR, alice, charlesB.valueOf(), {
							from: charles
						});
					});
				}

				await beethovenContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.valueOf() / WEI_DENOMINATOR));
				let aliceB = await beethovenContract.balanceOf.call(1, alice);

				prevBalanceBalice = aliceB.valueOf() / WEI_DENOMINATOR;

				await beethovenContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.valueOf() / WEI_DENOMINATOR));
				let bobB = await beethovenContract.balanceOf.call(1, bob);
				prevBalanceBbob = bobB.valueOf() / WEI_DENOMINATOR;

				await beethovenContract.balanceOf
					.call(0, charles)
					.then(charlesA => (prevBalanceAcharles = charlesA.valueOf() / WEI_DENOMINATOR));
				let charlesB = await beethovenContract.balanceOf.call(1, charles);
				prevBalanceBcharles = charlesB.valueOf() / WEI_DENOMINATOR;
				await oracleContract.skipCooldown(skipNum);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf());

				await oracleContract.setLastPrice(util.toWei(price), time.valueOf(), pf1);

				await beethovenContract.fetchPrice();

				let navAinWei = await getState(beethovenContract, CST.BTV_STATE.NAVA_INWEI);
				currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;
				let navBinWei = await getState(beethovenContract, CST.BTV_STATE.NAVB_INWEI);
				currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

				let betaInWei = await getState(beethovenContract, CST.BTV_STATE.BETA_INWEI);
				prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR;
				for (let i = 0; i < 10; i++) await beethovenContract.startPreReset();
				let betaInWeiAfter = await getState(beethovenContract, CST.BTV_STATE.BETA_INWEI);
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
					newBetaAfterRst = newBeta;
					return assert.isTrue(
						util.isEqual(beta, newBeta),
						'beta is not updated correctly'
					);
				} else {
					newBetaAfterRst = 1;
					return assert.equal(beta, 1, 'beta is not reset to 1');
				}
			});

			it('should in corect reset state', async () => {
				assertState(beethovenContract, STATE_RESET);
				assertResetState(beethovenContract, resetState);
			});

			it('should have three users', async () => {
				let userSize = await getState(beethovenContract, CST.BTV_STATE.TOTAL_USERS);
				assert.equal(userSize.valueOf(), 3, 'num of users incorrect');
			});

			it('should have correct setup', () => {
				if (transferABRequired)
					assert.isTrue(
						prevBalanceAalice === 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob === 0 &&
							prevBalanceAcharles > 0 &&
							prevBalanceBcharles === 0,
						'Wrong setup'
					);
				else
					assert.isTrue(
						prevBalanceAalice > 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob > 0 &&
							prevBalanceAcharles > 0 &&
							prevBalanceBcharles > 0,
						'Wrong setup'
					);
			});

			it('should process reset for only one user', async () => {
				let tx = await beethovenContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_RESET,
					'not only one user processed'
				);

				let nextIndex = await beethovenContract.getNextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await beethovenContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await beethovenContract.balanceOf.call(1, alice);
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
					util.isEqual(currentBalanceAalice.valueOf() / WEI_DENOMINATOR, newBalanceA),
					'BalanceA not updated correctly'
				);
				assert.isTrue(
					util.isEqual(currentBalanceBalice.valueOf() / WEI_DENOMINATOR, newBalanceB),
					'BalanceB not updated correctly'
				);
			});

			it('should complete reset for second user', async () => {
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
				let tx = await beethovenContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_RESET,
					'reset not completed'
				);
				await assertABalanceForAddress(bob, newBalanceA);
				await assertBBalanceForAddress(bob, newBalanceB);
			});

			it('should complete reset for third user and transit to trading', async () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAcharles,
					prevBalanceBcharles,
					currentNavA,
					currentNavB,
					beta,
					alphaInBP
				);
				newBalanceAcharles = newBalanceA;
				newBalanceBcharles = newBalanceB;
				let tx = await beethovenContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_TRADING,
					'reset not completed'
				);
				let nextIndex = await beethovenContract.getNextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(charles, newBalanceA);
				await assertBBalanceForAddress(charles, newBalanceB);

				let resetTimeInBN = await oracleContract.timestamp.call();
				resetTime = resetTimeInBN.valueOf();
			});

			it('totalA should equal totalB times alpha', async () => {
				let totalA = await getState(beethovenContract, CST.BTV_STATE.TOTAL_SUPPLYA);
				let totalB = await getState(beethovenContract, CST.BTV_STATE.TOTAL_SUPPLYB);
				assert.isTrue(
					util.isEqual(
						totalA.valueOf() / WEI_DENOMINATOR,
						newBalanceAbob + newBalanceAalice + newBalanceAcharles
					),
					'totalSupplyA is wrong'
				);
				assert.isTrue(
					util.isEqual(
						totalB.valueOf() / WEI_DENOMINATOR,
						newBalanceBbob + newBalanceBalice + newBalanceBcharles
					),
					'totalSupplyB is wrong'
				);
				assert.isTrue(
					util.isEqual(
						newBalanceAbob + newBalanceAalice + newBalanceAcharles,
						((newBalanceBbob + newBalanceBalice + +newBalanceBcharles) *
							(alphaInBP || BeethovenInit.alphaInBP)) /
							BP_DENOMINATOR
					),
					'total A is not equal to total B times alpha'
				);
			});

			it('should update nav', async () => {
				let navA = await getState(beethovenContract, CST.BTV_STATE.NAVA_INWEI);
				let navB = await getState(beethovenContract, CST.BTV_STATE.NAVB_INWEI);

				assert.equal(util.fromWei(navA), '1', 'nav A not reset to 1');
				assert.isTrue(
					isPeriodicReset
						? util.isEqual(util.fromWei(navB), currentNavB)
						: util.fromWei(navB) === '1',
					'nav B not updated correctly'
				);
			});

			it('should update reset price', async () => {
				if (!isPeriodicReset) {
					let resetPriceInWei = await getState(
						beethovenContract,
						CST.BTV_STATE.RESET_PRICE_INWEI
					);

					assert.equal(
						resetPriceInWei.valueOf() / WEI_DENOMINATOR,
						price,
						'resetprice not updated'
					);
				}
			});

			it('should update nav correctly after price commit following a reset', async () => {
				await oracleContract.skipCooldown(skipNum);
				let time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(
					util.toWei(price + '', 'ether'),
					time.valueOf(),
					pf1
				);

				await beethovenContract.fetchPrice();

				let navAinWei = await getState(beethovenContract, CST.BTV_STATE.NAVA_INWEI);
				currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;

				let navBinWei = await getState(beethovenContract, CST.BTV_STATE.NAVB_INWEI);
				currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

				let currentTime = await oracleContract.timestamp.call();
				let numOfPeriods = Math.floor(
					(Number(currentTime.valueOf()) - Number(resetTime)) / Number(BeethovenInit.pd)
				);
				let newNavA = 1 + numOfPeriods * Number(BeethovenInit.couponRate);
				assert.isTrue(util.isEqual(currentNavA, newNavA), 'NavA is updated wrongly');

				let newNavB;
				let navParent =
					(price / price / newBetaAfterRst) *
					(1 + (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR);

				let navAAdj = (newNavA * (alphaInBP || BeethovenInit.alphaInBP)) / BP_DENOMINATOR;
				if (navParent <= navAAdj) newNavB = 0;
				else newNavB = navParent - navAAdj;

				assert.isTrue(util.isEqual(currentNavB, newNavB), 'NavB is updated wrongly');
			});
		}

		let resetGasAmt = process.env.SOLIDITY_COVERAGE ? 160000 : 95000;

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 1', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 2', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 3', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 4', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 5', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 6', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, resetGasAmt, false, true, 5000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 1', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 2', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 3', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 4', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 5', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 6', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, resetGasAmt, false, true, 5000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 1', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, resetGasAmt, true, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 2', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, resetGasAmt, true, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 3', () => {
			resetTest(
				ethInitPrice,
				periodicReset,
				STATE_PERIODIC_RESET,
				resetGasAmt,
				true,
				false,
				20000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 4', () => {
			resetTest(
				ethInitPrice,
				periodicReset,
				STATE_PERIODIC_RESET,
				resetGasAmt,
				true,
				true,
				20000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 5', () => {
			resetTest(
				ethInitPrice,
				periodicReset,
				STATE_PERIODIC_RESET,
				resetGasAmt,
				true,
				false,
				5000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 6', () => {
			resetTest(
				ethInitPrice,
				periodicReset,
				STATE_PERIODIC_RESET,
				resetGasAmt,
				true,
				true,
				5000
			);
		});
	});

	describe('setValue', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(400), time.valueOf(), pf1);
			await beethovenContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
				from: creator
			});
		});

		beforeEach(async () => {
			await beethovenContract.skipCooldown(25);
		});

		it('admin should be able to set createCommission', async () => {
			let success = await beethovenContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let createCommInBP = await getState(beethovenContract, CST.BTV_STATE.CREATE_COMMINBP);
			let preValue = createCommInBP.valueOf();
			let tx = await beethovenContract.setValue(0, 50, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				Number(tx.logs[0].args.index.valueOf()) === 0 &&
					Number(tx.logs[0].args.oldValue.valueOf()) === Number(preValue) &&
					Number(tx.logs[0].args.newValue.valueOf()) === 50,
				'wrong argument emitted'
			);
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await beethovenContract.setValue.call(0, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await beethovenContract.setValue.call(0, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set redeemCommInBP', async () => {
			let success = await beethovenContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set redeemCommInBP');
			let redeemCommInBP = await getState(beethovenContract, CST.BTV_STATE.REDEEM_COMMINBP);
			let preValue = redeemCommInBP.valueOf();
			let tx = await beethovenContract.setValue(1, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				Number(tx.logs[0].args.index.valueOf()) === 1 &&
					Number(tx.logs[0].args.oldValue.valueOf()) === Number(preValue) &&
					Number(tx.logs[0].args.newValue.valueOf()) === 100,
				'wrong argument emitted'
			);
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await beethovenContract.setValue.call(1, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await beethovenContract.setValue.call(1, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await beethovenContract.setValue.call(2, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
			let iterationGasThreshold = await getState(
				beethovenContract,
				CST.BTV_STATE.ITERATION_GAS_THRESHOLD
			);
			let preValue = iterationGasThreshold.valueOf();
			let tx = await beethovenContract.setValue(2, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				Number(tx.logs[0].args.index.valueOf()) === 2 &&
					Number(tx.logs[0].args.oldValue.valueOf()) === Number(preValue) &&
					Number(tx.logs[0].args.newValue.valueOf()) === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await beethovenContract.setValue.call(2, 100000, { from: alice });
				assert.isTrue(false, 'non admin can change gas threshhold');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set pre reset waiting blocks', async () => {
			let success = await beethovenContract.setValue.call(3, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
			let preResetWaitingBlocks = await getState(
				beethovenContract,
				CST.BTV_STATE.PRERESET_WAITING_BLOCKS
			);
			let preValue = preResetWaitingBlocks.valueOf();
			let tx = await beethovenContract.setValue(3, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				Number(tx.logs[0].args.index.valueOf()) === 3 &&
					Number(tx.logs[0].args.oldValue.valueOf()) === Number(preValue) &&
					Number(tx.logs[0].args.newValue.valueOf()) === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await beethovenContract.setValue.call(3, 100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should not be able to set with idx 4 and bigger index', async () => {
			try {
				await beethovenContract.setValue.call(4, 100, {
					from: creator
				});
				assert.isTrue(false, 'can set value with invalid index');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});
	});
});
