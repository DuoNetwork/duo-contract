const Mozart = artifacts.require('../contracts/mocks/MozartMock');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
// const WETH = artifacts.require('../contracts/mocks/WETHMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const MozartInitPPT = InitParas['MOZART']['PPT'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const util = require('./util');
const CST = require('./constants');

const ethInitPrice = 582;

const PERTETUAL_NAME = 'mozart perpetual';
const TERM_NAME = 'mozart term6';

const assertState = async (contract, state) => {
	let _state = await util.getState(contract, CST.DUAL_CUSTODIAN.STATE_INDEX.STATE);
	assert.isTrue(util.isEqual(_state.valueOf(), state, true));
};

const assertResetState = async (contract, state) => {
	let _state = await util.getState(contract, CST.DUAL_CUSTODIAN.STATE_INDEX.RESET_STATE);
	assert.isTrue(util.isEqual(_state.valueOf(), state));
};

contract('Mozart', accounts => {
	let mozartContract;
	let roleManagerContract;
	let oracleContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const alice = accounts[6];
	const bob = accounts[7];
	const charles = accounts[8];

	const initContracts = async (alphaInBP = 0, name, maturity) => {
		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		mozartContract = await Mozart.new(
			name,
			maturity,
			roleManagerContract.address,
			fc,
			alphaInBP ? alphaInBP : MozartInitPPT.alphaInBP,
			util.toWei(MozartInitPPT.couponRate),
			util.toWei(MozartInitPPT.hp),
			util.toWei(MozartInitPPT.hu),
			util.toWei(MozartInitPPT.hd),
			MozartInitPPT.comm,
			MozartInitPPT.pd,
			MozartInitPPT.optCoolDown,
			MozartInitPPT.pxFetchCoolDown,
			process.env.SOLIDITY_COVERAGE ? MozartInitPPT.iteGasThSC : MozartInitPPT.iteGasTh,
			MozartInitPPT.preResetWaitBlk,
			util.toWei(MozartInitPPT.minimumBalance),
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

	};

	const calcNav = (price, resetPrice, alpha) => {
		let navEth = price / resetPrice;
		let navParent = navEth * (1 + alpha);

		if (navEth >= 2) {
			return [0, navParent];
		}

		if (navEth <= 0.5) {
			return [navParent / alpha, 0];
		}
		return [2 - navEth, (2 * alpha + 1) * navEth - 2 * alpha];
	};

	describe('constructor', () => {
		function constructorTest(alphaInBP, name, maturity) {
			before(() => initContracts(alphaInBP, name, maturity));

			it('contract code should be set correctly', async () => {
				let contractCode = await mozartContract.contractCode.call();
				assert.equal(contractCode.valueOf(), name, 'alpha set incorrectly');
			});

			it('maturity should be set correctly', async () => {
				let contractMaturity = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.MATURITY_IN_SECOND
				);
				assert.isTrue(
					util.isEqual(contractMaturity.valueOf(), maturity),
					'alpha set incorrectly'
				);
			});

			it('alpha should be set correctly', async () => {
				let alpha = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ALPHA_INBP
				);
				assert.isTrue(
					util.isEqual(alpha.valueOf(), alphaInBP ? alphaInBP : MozartInitPPT.alphaInBP),
					'alpha set incorrectly'
				);
			});

			it('limitUpperInWei should be set correctly', async () => {
				let limitUpperInWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.LIMIT_UPPER_INWEI
				);
				assert.isTrue(
					util.isEqual(util.fromWei(limitUpperInWei), MozartInitPPT.hu),
					'limitUpperInWei set incorrectly'
				);
			});

			it('limitLowerInWei should be set correctly', async () => {
				let limitLowerInWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.LIMIT_LOWER_INWEI
				);
				assert.equal(
					util.fromWei(limitLowerInWei),
					MozartInitPPT.hd + '',
					'limitLowerInWei set incorrectly'
				);
			});

			it('iterationGasThreshold should be set correctly', async () => {
				let iterationGasThreshold = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ITERATION_GAS_THRESHOLD
				);
				assert.equal(
					iterationGasThreshold.valueOf(),
					process.env.SOLIDITY_COVERAGE
						? MozartInitPPT.iteGasThSC
						: MozartInitPPT.iteGasTh,
					'iterationGasThreshold set incorrectly'
				);
			});

			it('createCommInBP should be set correctly', async () => {
				let createCommInBP = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.CREATE_COMMINBP
				);
				assert.equal(
					createCommInBP.valueOf(),
					MozartInitPPT.comm + '',
					'createCommInBP set incorrectly'
				);
			});

			it('redeemCommInBP should be set correctly', async () => {
				let comm = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.REDEEM_COMMINBP
				);
				assert.equal(comm.valueOf(), MozartInitPPT.comm, 'redeemCommInBP set incorrectly');
			});

			it('preResetWaitingBlocks should be set correctly', async () => {
				let preResetWaitingBlocks = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
				);
				assert.equal(
					preResetWaitingBlocks.valueOf(),
					MozartInitPPT.preResetWaitBlk + '',
					'preResetWaitingBlocks set incorrectly'
				);
			});

			it('minimumBalance should be set correctly', async () => {
				let minBalance = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.MIN_BALANCE
				);
				assert.equal(
					util.fromWei(minBalance.valueOf()),
					MozartInitPPT.minimumBalance + '',
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

	describe('fetchPrice', () => {
		function fetchPriceTest(alphaInBP, name, maturity) {
			let time;
			let initTime;
			beforeEach(async () => {
				await initContracts(alphaInBP, name, maturity);
				time = await oracleContract.timestamp.call();
				initTime = time;
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await mozartContract.startCustodian(
					CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
					CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
					oracleContract.address,
					{
						from: creator
					}
				);
			});

			it('should not fetch price 0', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(0, time.valueOf(), pf1);
				try {
					await mozartContract.fetchPrice();
					assert.isTrue(false, 'fetched price 0');
				} catch (err) {
					assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should not fetch price with future time', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(time.valueOf() - 1);
				await oracleContract.setLastPrice(100, time.valueOf(), pf1);
				try {
					await mozartContract.fetchPrice();
					assert.isTrue(false, 'fetched with future time');
				} catch (err) {
					assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should not fetch withinCoolDown', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(
					time.valueOf() - MozartInitPPT.pxFetchCoolDown / 2
				);
				await oracleContract.setLastPrice(100, time.valueOf(), pf1);
				try {
					await mozartContract.fetchPrice();
					assert.isTrue(false, 'can fetch within cool down');
				} catch (err) {
					assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should fetch price', async () => {
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				let tx = await mozartContract.fetchPrice();
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_ACCEPT_PX,
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
					await mozartContract.setTimestamp(time.valueOf());
					await oracleContract.setLastPrice(
						util.toWei(ethInitPrice),
						time.valueOf(),
						pf1
					);
					let tx = await mozartContract.fetchPrice();

					let navAinWei = await util.getState(
						mozartContract,
						CST.DUAL_CUSTODIAN.STATE_INDEX.NAVA_INWEI
					);
					let currentNavA = navAinWei.valueOf() / CST.WEI_DENOMINATOR;

					let navBinWei = await util.getState(
						mozartContract,
						CST.DUAL_CUSTODIAN.STATE_INDEX.NAVB_INWEI
					);
					let currentNavB = navBinWei.valueOf() / CST.WEI_DENOMINATOR;

					let currentTime = await oracleContract.timestamp.call();
					let numOfPeriods = Math.floor(
						(Number(currentTime.valueOf()) - Number(initTime.valueOf())) /
							Number(MozartInitPPT.pd)
					);
					let newNavA = 1 + numOfPeriods * Number(MozartInitPPT.couponRate);
					assert.isTrue(
						util.isEqual(currentNavA, newNavA, true),
						'NavA is updated wrongly'
					);

					let newNavB;
					let navParent = 1 + (alphaInBP || MozartInitPPT.alphaInBP) / CST.BP_DENOMINATOR;

					let navAAdj =
						(newNavA * (alphaInBP || MozartInitPPT.alphaInBP)) / CST.BP_DENOMINATOR;
					if (navParent <= navAAdj) newNavB = 0;
					else newNavB = navParent - navAAdj;

					assert.isTrue(util.isEqual(currentNavB, newNavB), 'NavB is updated wrongly');

					assert.isTrue(
						tx.logs.length === 2 &&
							tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_ACCEPT_PX &&
							tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_MATURIED,
						'wrong event'
					);
					assert.isTrue(
						util.isEqual(
							util.fromWei(tx.logs[1].args.priceInWei),
							ethInitPrice.toString()
						) && util.isEqual(tx.logs[1].args.timeInSecond.valueOf(), time.valueOf()),
						'wrong event args'
					);

					await assertState(mozartContract, CST.DUAL_CUSTODIAN.STATE.STATE_MATURITY);

					try {
						await mozartContract.fetchPrice();
						assert.isTrue(false, 'fetched price 0');
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
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

	describe('nav calculation', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await mozartContract.startCustodian(
				CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
				CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
				oracleContract.address,
				{
					from: creator
				}
			);
		});

		function calcNav(price, resetPrice, alpha) {
			let navEth = price / resetPrice;
			let navParent = navEth * (1 + alpha);

			if (navEth >= 2) {
				return [0, navParent];
			}

			if (navEth <= 0.5) {
				return [navParent / alpha, 0];
			}
			return [2 - navEth, (2 * alpha + 1) * navEth - 2 * alpha];
		}

		function testNav(resetPrice, lastPrice) {
			let resetPriceInWei = util.toWei(resetPrice);
			let lastPriceInWei = util.toWei(lastPrice);

			let [navA, navB] = calcNav(lastPrice, resetPrice, 0.5);
			return mozartContract.calculateNav.call(lastPriceInWei, resetPriceInWei).then(res => {
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
			return testNav(582, 600);
		});

		// //for upward reset case
		it('it should calculate nav correclty case 2', () => {
			return testNav(800, 1500);
		});

		// //for downward reset case
		it('it should calculate nav correclty case 3', () => {
			return testNav(1000, 600);
		});

		//for downward reset case where navB goes to 0
		it('it should calculate nav correclty case 4', () => {
			return testNav(1000, 200);
		});
	});

	describe('pre reset', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(400), time.valueOf(), pf1);
			await mozartContract.startCustodian(
				CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
				CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
				oracleContract.address,
				{
					from: creator
				}
			);

			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();

			await mozartContract.setTimestamp(time.valueOf());
			await oracleContract.setLastPrice(util.toWei(888), time.valueOf(), pf1);

			await mozartContract.fetchPrice();
		});

		// function CALCULATE_NEW_TOKEN() {
		// 	if (navBInWei >= limitUpperInWei) {

		// 		resetState = ResetState.UpwardReset;
		// 		uint excessBInWei = navBInWei.sub(navAInWei);
		// 		newBFromBPerB = excessBInWei.mul(CST.BP_DENOMINATOR).div(CST.BP_DENOMINATOR + alphaInBP);
		// 		newAFromBPerB = excessBInWei.mul(alphaInBP).div(CST.BP_DENOMINATOR + alphaInBP);
		// 		// adjust total supply
		// 		totalSupplyA = totalSupplyA.add(totalSupplyB.mul(newAFromBPerB).div(CST.WEI_DENOMINATOR));
		// 		totalSupplyB = totalSupplyB.add(totalSupplyB.mul(newBFromBPerB).div(CST.WEI_DENOMINATOR));
		// 	} else {
		// 		resetState = ResetState.DownwardReset;
		// 		uint excessAInWei = navAInWei.sub(navBInWei);
		// 		newBFromAPerA = excessAInWei.mul(CST.BP_DENOMINATOR).div(CST.BP_DENOMINATOR + alphaInBP);
		// 		newAFromAPerA = excessAInWei.mul(alphaInBP).div(CST.BP_DENOMINATOR + alphaInBP);
		// 		totalSupplyA = totalSupplyA.add(totalSupplyA.mul(newAFromAPerA).div(CST.WEI_DENOMINATOR));
		// 		totalSupplyB = totalSupplyB.add(totalSupplyA.mul(newBFromAPerA).div(CST.WEI_DENOMINATOR));
		// 	}
		// }

		it('should be in state preReset', async () => {
			let state = await util.getState(mozartContract, CST.DUAL_CUSTODIAN.STATE_INDEX.STATE);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_PRE_RESET,
				'state is wrong'
			);
		});

		it('should not allow creation', async () => {
			try {
				await mozartContract.create.call({
					from: alice,
					value: util.toWei(1)
				});
				assert.isTrue(false, 'still can create');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can create ');
			}
		});

		it('should not allow redemption', async () => {
			try {
				await mozartContract.redeem.call(util.toWei(2800), util.toWei(2900), {
					from: alice
				});

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer of A', async () => {
			try {
				await mozartContract.transfer.call(
					0,
					CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
					bob,
					util.toWei(1),
					{
						from: alice
					}
				);

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer of B', async () => {
			try {
				await mozartContract.transfer.call(
					1,
					CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
					bob,
					util.toWei(1),
					{
						from: alice
					}
				);

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		it('should not allow admin set createCommInBP', async () => {
			try {
				await mozartContract.setValue.call(0, 1000, { from: creator });

				assert.isTrue(false, 'still can set createCommInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can set createCommInBP');
			}
		});

		it('should not allow admin set redeemCommInBP', async () => {
			try {
				await mozartContract.setValue.call(1, 1000, { from: creator });

				assert.isTrue(false, 'still can set redeemCommInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can set redeemCommInBP');
			}
		});

		it('should not allow admin set iterationGasThreshold', async () => {
			try {
				await mozartContract.setValue.call(2, 1000, { from: creator });
				assert.isTrue(false, 'still can set iterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still set iterationGasThreshold');
			}
		});

		it('should not allow admin set preResetWaitingBlocks', async () => {
			try {
				await mozartContract.setValue.call(3, 1000, { from: creator });
				assert.isTrue(false, 'still can set preResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still set preResetWaitingBlocks');
			}
		});

		it('should not allow admin set priceTolInBP', async () => {
			try {
				await mozartContract.setValue.call(4, 1000, { from: creator });

				assert.isTrue(false, 'still can set priceTolInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still set priceTolInBP');
			}
		});

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			let preResetWaitBlk = await util.getState(
				mozartContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
			);

			for (let i = 0; i < preResetWaitBlk.valueOf() - 1; i++)
				await mozartContract.startPreReset();

			await assertState(mozartContract, CST.DUAL_CUSTODIAN.STATE.STATE_PRE_RESET);

			let tx = await mozartContract.startPreReset();
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
				'wrong events emitted'
			);

			await assertState(mozartContract, CST.DUAL_CUSTODIAN.STATE.STATE_RESET);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, alphaInBP = 0) {
			let alpha = (alphaInBP || MozartInitPPT.alphaInBP) / CST.BP_DENOMINATOR;
			let excessB = navB - navA;
			let newBFromBPerB = excessB / (1 + alpha);
			// let newAFromBPerB = (excessB * alpha) / (1 + alpha);
			let newBFromB = prevBalanceB * newBFromBPerB;
			let newAFromB = newBFromB * alpha;
			let newBalanceA = prevBalanceA * navA + newAFromB;
			let newBalanceB = prevBalanceB * navA + newBFromB;
			return [newBalanceA, newBalanceB];
		}

		function downwardReset(prevBalanceA, prevBalanceB, navA, navB, alphaInBP = 0) {
			let alpha = (alphaInBP || MozartInitPPT.alphaInBP) / CST.BP_DENOMINATOR;
			let excessA = navA - navB;
			let newBFromAPerA = excessA / (1 + alpha);
			// let newAFromAPerA = (excessA * alpha) / (1 + alpha);
			let newBFromA = prevBalanceA * newBFromAPerA;
			let newAFromA = newBFromA * alpha;
			let newBalanceA = prevBalanceA * navB + newAFromA;
			let newBalanceB = prevBalanceB * navB + newBFromA;
			return [newBalanceA, newBalanceB];
		}
		function assertABalanceForAddress(addr, expected) {
			return mozartContract.balanceOf.call(0, addr).then(currentBalanceA => {
				assert.isTrue(
					util.isEqual(currentBalanceA.valueOf() / CST.WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return mozartContract.balanceOf
				.call(1, addr)
				.then(currentBalanceB =>
					assert.isTrue(
						util.isEqual(currentBalanceB.valueOf() / CST.WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function resetTest(
			price,
			resetFunc,
			resetState,
			resetGas,
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

			before(async () => {
				await initContracts(alphaInBP, PERTETUAL_NAME, 0);
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await mozartContract.startCustodian(
					CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
					CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
					oracleContract.address,
					{
						from: creator
					}
				);
				await mozartContract.create({
					from: alice,
					value: util.toWei(1)
				});
				await mozartContract.create({
					from: bob,
					value: util.toWei(1.2)
				});
				await mozartContract.create({
					from: charles,
					value: util.toWei(1.5)
				});

				if (transferABRequired) {
					let aliceA = await mozartContract.balanceOf.call(0, alice);

					mozartContract.transfer(
						0,
						CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
						bob,
						aliceA.valueOf(),
						{
							from: alice
						}
					);
					await mozartContract.balanceOf.call(1, bob).then(bobB => {
						mozartContract.transfer(
							1,
							CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
							alice,
							bobB.valueOf(),
							{
								from: bob
							}
						);
					});

					await mozartContract.balanceOf.call(1, charles).then(charlesB => {
						mozartContract.transfer(
							1,
							CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
							alice,
							charlesB.valueOf(),
							{
								from: charles
							}
						);
					});
				}

				await mozartContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.valueOf() / CST.WEI_DENOMINATOR));
				let aliceB = await mozartContract.balanceOf.call(1, alice);

				prevBalanceBalice = aliceB.valueOf() / CST.WEI_DENOMINATOR;

				await mozartContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.valueOf() / CST.WEI_DENOMINATOR));
				let bobB = await mozartContract.balanceOf.call(1, bob);
				prevBalanceBbob = bobB.valueOf() / CST.WEI_DENOMINATOR;

				await mozartContract.balanceOf
					.call(0, charles)
					.then(
						charlesA => (prevBalanceAcharles = charlesA.valueOf() / CST.WEI_DENOMINATOR)
					);
				let charlesB = await mozartContract.balanceOf.call(1, charles);
				prevBalanceBcharles = charlesB.valueOf() / CST.WEI_DENOMINATOR;
				await oracleContract.skipCooldown(1);
				time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(time.valueOf());

				await oracleContract.setLastPrice(util.toWei(price), time.valueOf(), pf1);

				await mozartContract.fetchPrice();

				let navAinWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVA_INWEI
				);
				currentNavA = navAinWei.valueOf() / CST.WEI_DENOMINATOR;
				let navBinWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVB_INWEI
				);
				currentNavB = navBinWei.valueOf() / CST.WEI_DENOMINATOR;

				for (let i = 0; i < 10; i++) await mozartContract.startPreReset();
			});

			it('should in corect reset state', async () => {
				assertState(mozartContract, CST.DUAL_CUSTODIAN.STATE.STATE_RESET);
				assertResetState(mozartContract, resetState);
			});

			it('should have three users', async () => {
				let userSize = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_USERS
				);
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
				let tx = await mozartContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET,
					'not only one user processed'
				);

				let nextIndex = await mozartContract.getNextResetAddrIndex.call();
				assert.isTrue(
					util.isEqual(nextIndex.valueOf(), '1', true),
					'not moving to next user'

				);
				
				let currentBalanceAalice = await mozartContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await mozartContract.balanceOf.call(1, alice);
			
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAalice,
					prevBalanceBalice,
					currentNavA,
					currentNavB,
					alphaInBP
				);
				newBalanceAalice = newBalanceA;
				newBalanceBalice = newBalanceB;

				assert.isTrue(
					util.isEqual(currentBalanceAalice.valueOf() / CST.WEI_DENOMINATOR, newBalanceA, true),
					'BalanceA not updated correctly'
				);
				assert.isTrue(
					util.isEqual(currentBalanceBalice.valueOf() / CST.WEI_DENOMINATOR, newBalanceB, true),
					'BalanceB not updated correctly'
				);
			});

			it('should complete reset for second user', async () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAbob,
					prevBalanceBbob,
					currentNavA,
					currentNavB,
					alphaInBP
				);
				newBalanceAbob = newBalanceA;
				newBalanceBbob = newBalanceB;
				let tx = await mozartContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET,
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
					alphaInBP
				);
				newBalanceAcharles = newBalanceA;
				newBalanceBcharles = newBalanceB;
				let tx = await mozartContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_TRADING,
					'reset not completed'
				);
				let nextIndex = await mozartContract.getNextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(charles, newBalanceA);
				await assertBBalanceForAddress(charles, newBalanceB);
			});

			it('totalA should equal totalB times alpha', async () => {
				let totalA = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_SUPPLYA
				);
				let totalB = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_SUPPLYB
				);

				assert.isTrue(
					util.isEqual(
						totalA.valueOf() / CST.WEI_DENOMINATOR,
						newBalanceAbob + newBalanceAalice + newBalanceAcharles, 
						true
					),
					'totalSupplyA is wrong'
				);
				
				assert.isTrue(
					util.isEqual(
						totalB.valueOf() / CST.WEI_DENOMINATOR,
						newBalanceBbob + newBalanceBalice + newBalanceBcharles, 
						true
					),
					'totalSupplyB is wrong'
				);

				assert.isTrue(
					util.isEqual(
						newBalanceAbob + newBalanceAalice + newBalanceAcharles,
						((newBalanceBbob + newBalanceBalice + +newBalanceBcharles) *
							(alphaInBP || MozartInitPPT.alphaInBP)) /
							CST.BP_DENOMINATOR
						, true
					),
					'total A is not equal to total B times alpha'
				);
			});

			it('should update nav', async () => {
				let navA = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVA_INWEI
				);
				let navB = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVB_INWEI
				);

				assert.equal(util.fromWei(navA), '1', 'nav A not reset to 1');
				assert.isTrue(util.fromWei(navB) === '1', 'nav B not updated correctly');
			});

			it('should update reset price', async () => {
				let resetPriceInWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.RESET_PRICE_INWEI
				);

				assert.equal(
					resetPriceInWei.valueOf() / CST.WEI_DENOMINATOR,
					price,
					'resetprice not updated'
				);
			});

			it('should update nav correctly after price commit following a reset', async () => {
				await oracleContract.skipCooldown(1);
				let time = await oracleContract.timestamp.call();
				await mozartContract.setTimestamp(time.valueOf());
				await oracleContract.setLastPrice(
					util.toWei(price*1.02 + '', 'ether'),
					time.valueOf(),
					pf1
				);

				await mozartContract.fetchPrice();

				let navAinWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVA_INWEI
				);
				currentNavA = navAinWei.valueOf() / CST.WEI_DENOMINATOR;

				let navBinWei = await util.getState(
					mozartContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.NAVB_INWEI
				);
				currentNavB = navBinWei.valueOf() / CST.WEI_DENOMINATOR;

				const [newNavA, newNavB] = calcNav(price*1.02, price, alphaInBP/ CST.BP_DENOMINATOR);
				assert.isTrue(util.isEqual(currentNavA, newNavA), 'NavA is updated wrongly');
				assert.isTrue(util.isEqual(currentNavB, newNavB), 'NavB is updated wrongly');
			});
		}

		let resetGasAmt = process.env.SOLIDITY_COVERAGE ? 160000 : 95000;

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 1', () => {
			resetTest(
				900,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				false,
				5000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 2', () => {
			resetTest(
				900,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				true,
				5000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 3', () => {
			resetTest(
				850,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				false,
				10000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 4', () => {
			resetTest(
				850,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				true,
				10000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 5', () => {
			resetTest(
				819,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				false,
				20000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 6', () => {
			resetTest(
				810,
				upwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_UPWARD_RESET,
				resetGasAmt,
				true,
				20000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 1', () => {
			resetTest(
				350,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				false,
				5000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 2', () => {
			resetTest(
				350,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				true,
				5000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 3', () => {
			resetTest(
				435,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				false,
				10000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 4', () => {
			resetTest(
				435,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				true,
				10000
			);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 5', () => {
			resetTest(
				490,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				false,
				20000
			);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 6', () => {
			resetTest(
				490,
				downwardReset,
				CST.DUAL_CUSTODIAN.STATE.STATE_DOWNWARD_RESET,
				resetGasAmt,
				true,
				20000
			);
		});
	});
});
