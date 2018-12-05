// const Mozart = artifacts.require('../contracts/mocks/MozartMock');
// const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
// const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
// const WETH = artifacts.require('../contracts/mocks/WETHMock.sol');
// const InitParas = require('../migrations/contractInitParas.json');
// const MozartInitPPT = InitParas['MOZART']['PPT'];
// const RoleManagerInit = InitParas['RoleManager'];
// const MagiInit = InitParas['Magi'];
// const util = require('./util');

// const CST = {
// 	MOZART_STATE: {
// 		LAST_OPERATION_TIME: 0,
// 		OPERATION_COOLDOWN: 1,
// 		STATE: 2,
// 		MIN_BALANCE: 3,
// 		TOTAL_SUPPLYA: 4,
// 		TOTAL_SUPPLYB: 5,
// 		ETH_COLLATERAL_INWEI: 6,
// 		NAVA_INWEI: 7,
// 		NAVB_INWEI: 8,
// 		LAST_PRICE_INWEI: 9,
// 		LAST_PRICETIME_INSECOND: 10,
// 		RESET_PRICE_INWEI: 11,
// 		RESET_PRICETIME_INSECOND: 12,
// 		CREATE_COMMINBP: 13,
// 		REDEEM_COMMINBP: 14,
// 		PERIOD: 15,
// 		MATURITY_IN_SECOND: 16,
// 		PRERESET_WAITING_BLOCKS: 17,
// 		PRICE_FETCH_COOLDOWN: 18,
// 		NEXT_RESET_ADDR_INDEX: 19,
// 		TOTAL_USERS: 20,
// 		FEE_BALANCE_INWEI: 21,
// 		RESET_STATE: 22,
// 		ALPHA_INBP: 23,
// 		LIMIT_UPPER_INWEI: 24,
// 		LIMIT_LOWER_INWEI: 25,
// 		ITERATION_GAS_THRESHOLD: 26
// 	}
// };

// // Event
// const EVENT_ACCEPT_PX = 'AcceptPrice';
// const EVENT_MATURIED = 'Matured';
// const EVENT_START_TRADING = 'StartTrading';
// const EVENT_CREATE = 'Create';
// const EVENT_REDEEM = 'Redeem';
// const EVENT_TOTAL_SUPPLY = 'TotalSupply';
// const EVENT_START_RESET = 'StartReset';
// const EVENT_SET_VALUE = 'SetValue';
// const EVENT_COLLECT_FEE = 'CollectFee';

// const STATE_INCEPTION = '0';
// const STATE_TRADING = '1';
// const STATE_PRE_RESET = '2';
// const STATE_RESET = '3';
// const STATE_MATURITY = '4';

// const STATE_UPWARD_RESET = '0';
// const STATE_DOWNWARD_RESET = '1';

// const ethInitPrice = 582;

// const DUMMY_ADDR = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
// const A_ADDR = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
// const B_ADDR = '0x424325334C3537A6248E09E1Dc392C003d8706Db';

// const PERTETUAL_NAME = 'mozart perpetual';
// const TERM_NAME = 'beethoven term6';


// const assertState = async (contract, state) => {
// 	let _state = await util.getState(contract, CST.MOZART_STATE.STATE);
// 	assert.isTrue(util.isEqual(_state.valueOf(), state, true));
// };

// const assertResetState = async (mozartContract, state) => {
// 	let _state = await util.getState(mozartContract, CST.MOZART_STATE.RESET_STATE);
// 	assert.isTrue(util.isEqual(_state.valueOf(), state));
// };

// contract.only('Mozart', accounts => {
// 	let mozartContract;
// 	let roleManagerContract;
// 	let oracleContract;
// 	let wethContract;

// 	const creator = accounts[0];
// 	const pf1 = accounts[1];
// 	const pf2 = accounts[2];
// 	const pf3 = accounts[3];
// 	const fc = accounts[4];
// 	const alice = accounts[6];
// 	const bob = accounts[7];
// 	const charles = accounts[8];

// 	const WEI_DENOMINATOR = 1e18;
// 	const BP_DENOMINATOR = 10000;

// 	const initContracts = async (alphaInBP = 0, name, maturity) => {
// 		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
// 			from: creator
// 		});

// 		mozartContract = await Mozart.new(
// 			name,
// 			maturity,
// 			roleManagerContract.address,
// 			fc,
// 			alphaInBP ? alphaInBP : MozartInitPPT.alphaInBP,
// 			util.toWei(MozartInitPPT.hu),
// 			util.toWei(MozartInitPPT.hd),
// 			MozartInitPPT.comm,
// 			MozartInitPPT.pd,
// 			MozartInitPPT.optCoolDown,
// 			MozartInitPPT.pxFetchCoolDown,
// 			process.env.SOLIDITY_COVERAGE ? MozartInitPPT.iteGasThSC : MozartInitPPT.iteGasTh,
// 			MozartInitPPT.preResetWaitBlk,
// 			util.toWei(MozartInitPPT.minimumBalance),
// 			{
// 				from: creator
// 			}
// 		);

// 		oracleContract = await Magi.new(
// 			creator,
// 			pf1,
// 			pf2,
// 			pf3,
// 			roleManagerContract.address,
// 			MagiInit.pxFetchCoolDown,
// 			MagiInit.optCoolDown,
// 			{
// 				from: creator
// 			}
// 		);

// 		wethContract = await WETH.new();
// 	};

// 	describe('constructor', () => {
// 		function constructorTest(alphaInBP, name, maturity) {
// 			before(() => initContracts(alphaInBP, name, maturity));

// 			it('contract code should be set correctly', async () => {
// 				let contractCode = await mozartContract.contractCode.call();
// 				assert.equal(contractCode.valueOf(), name, 'alpha set incorrectly');
// 			});

// 			it('maturity should be set correctly', async () => {
// 				let contractMaturity = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.MATURITY_IN_SECOND
// 				);
// 				assert.isTrue(
// 					util.isEqual(contractMaturity.valueOf(), maturity),
// 					'alpha set incorrectly'
// 				);
// 			});

// 			it('alpha should be set correctly', async () => {
// 				let alpha = await util.getState(mozartContract, CST.MOZART_STATE.ALPHA_INBP);
// 				assert.isTrue(
// 					util.isEqual(alpha.valueOf(), alphaInBP ? alphaInBP : MozartInitPPT.alphaInBP),
// 					'alpha set incorrectly'
// 				);
// 			});

// 			it('limitUpperInWei should be set correctly', async () => {
// 				let limitUpperInWei = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.LIMIT_UPPER_INWEI
// 				);
// 				assert.isTrue(
// 					util.isEqual(util.fromWei(limitUpperInWei), MozartInitPPT.hu),
// 					'limitUpperInWei set incorrectly'
// 				);
// 			});

// 			it('limitLowerInWei should be set correctly', async () => {
// 				let limitLowerInWei = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.LIMIT_LOWER_INWEI
// 				);
// 				assert.equal(
// 					util.fromWei(limitLowerInWei),
// 					MozartInitPPT.hd + '',
// 					'limitLowerInWei set incorrectly'
// 				);
// 			});

// 			it('iterationGasThreshold should be set correctly', async () => {
// 				let iterationGasThreshold = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.ITERATION_GAS_THRESHOLD
// 				);
// 				assert.equal(
// 					iterationGasThreshold.valueOf(),
// 					process.env.SOLIDITY_COVERAGE
// 						? MozartInitPPT.iteGasThSC
// 						: MozartInitPPT.iteGasTh,
// 					'iterationGasThreshold set incorrectly'
// 				);
// 			});

// 			it('createCommInBP should be set correctly', async () => {
// 				let createCommInBP = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.CREATE_COMMINBP
// 				);
// 				assert.equal(
// 					createCommInBP.valueOf(),
// 					MozartInitPPT.comm + '',
// 					'createCommInBP set incorrectly'
// 				);
// 			});

// 			it('redeemCommInBP should be set correctly', async () => {
// 				let comm = await util.getState(mozartContract, CST.MOZART_STATE.REDEEM_COMMINBP);
// 				assert.equal(comm.valueOf(), MozartInitPPT.comm, 'redeemCommInBP set incorrectly');
// 			});

// 			it('preResetWaitingBlocks should be set correctly', async () => {
// 				let preResetWaitingBlocks = await util.getState(
// 					mozartContract,
// 					CST.MOZART_STATE.PRERESET_WAITING_BLOCKS
// 				);
// 				assert.equal(
// 					preResetWaitingBlocks.valueOf(),
// 					MozartInitPPT.preResetWaitBlk + '',
// 					'preResetWaitingBlocks set incorrectly'
// 				);
// 			});

// 			it('minimumBalance should be set correctly', async () => {
// 				let minBalance = await util.getState(mozartContract, CST.MOZART_STATE.MIN_BALANCE);
// 				assert.equal(
// 					util.fromWei(minBalance.valueOf()),
// 					MozartInitPPT.minimumBalance + '',
// 					'preResetWaitingBlocks set incorrectly'
// 				);
// 			});
// 		}

// 		//case 1: Perpetual tEST
// 		describe('Perpetual case 1', () => {
// 			constructorTest(0, PERTETUAL_NAME, 0);
// 		});

// 		//case 2: Term tEST
// 		describe('Term case 2', () => {
// 			constructorTest(
// 				0,
// 				TERM_NAME,
// 				Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60
// 			);
// 		});
// 	});

// 	describe('nav calculation', () => {
// 		before(async () => {
// 			await initContracts(0, PERTETUAL_NAME, 0);
// 			let time = await oracleContract.timestamp.call();
// 			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
// 			await mozartContract.startCustodian(A_ADDR, B_ADDR, oracleContract.address, {
// 				from: creator
// 			});
// 		});

// 		function calcNav(price, resetPrice, alpha) {

// 			let navEth = price/resetPrice;
// 			let navParent = navEth * ( 1 + alpha);

// 			if(navEth >= 2) {
// 				return [0, navParent];
// 			}

// 			if(navEth <= 0.5) {
// 				return [navParent/alpha, 0];
// 			}
// 			return [2-navEth, (2*alpha + 1)*navEth - 2 *alpha];
		
// 		}

// 		function testNav(resetPrice, lastPrice) {
// 			let resetPriceInWei = util.toWei(resetPrice);
// 			let resetPriceTimeSeconds = 1522745087;
// 			let lastPriceInWei = util.toWei(lastPrice);
// 			let lastPriceTimeSeconds = 1522745087 + 60 * 5 + 10;
// 			let betaInWei = util.toWei(beta);
// 			let [navA, navB] = calcNav(
// 				lastPrice,
// 				lastPriceTimeSeconds,
// 				resetPrice,
// 				resetPriceTimeSeconds,
// 				beta
// 			);
// 			return mozartContract.calculateNav
// 				.call(
// 					lastPriceInWei,
// 					lastPriceTimeSeconds,
// 					resetPriceInWei,
// 					resetPriceTimeSeconds,
// 					betaInWei
// 				)
// 				.then(res => {
// 					let navAInWei = res[0].valueOf();
// 					let navBInWei = res[1].valueOf();
// 					assert.isTrue(
// 						util.isEqual(util.fromWei(navAInWei), navA),
// 						'navA not calculated correctly'
// 					);
// 					assert.isTrue(
// 						util.isEqual(util.fromWei(navBInWei), navB),
// 						'navB not calculated correctly'
// 					);
// 				});
// 		}

// 		// for non reset case
// 		it('it should calculate nav correclty case 1', () => {
// 			return testNav(582, 600, 1.2);
// 		});

// 		//for upward reset case
// 		it('it should calculate nav correclty case 2', () => {
// 			return testNav(800, 1500, 1);
// 		});

// 		//for downward reset case
// 		it('it should calculate nav correclty case 3', () => {
// 			return testNav(1000, 600, 1);
// 		});

// 		//for downward reset case where navB goes to 0
// 		it('it should calculate nav correclty case 4', () => {
// 			return testNav(1000, 200, 1);
// 		});
// 	});


// });
