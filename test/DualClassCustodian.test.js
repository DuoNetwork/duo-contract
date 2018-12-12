const DualClassCustodian = artifacts.require('../contracts/mocks/DualClassCustodianMock');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const WETH = artifacts.require('../contracts/mocks/WETHMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const CustodianToken = artifacts.require('../contracts/tokens/CustodianToken.sol');
const dualClassCustodianInit = InitParas['BTV']['PPT'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const util = require('./util');
const CST = require('./constants');

const ethInitPrice = 582;
const PERTETUAL_NAME = 'DualClassCustodian perpetual';
const TERM_NAME = 'DualClassCustodian term6';

contract('DualClassCustodian', accounts => {
	let dualClassCustodianContract;
	let roleManagerContract;
	let oracleContract;
	let wethContract;
	let custodianTokenContractA;
	let custodianTokenContractB;

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

		dualClassCustodianContract = await DualClassCustodian.new(
			name,
			maturity,
			roleManagerContract.address,
			fc,
			alphaInBP ? alphaInBP : dualClassCustodianInit.alphaInBP,
			util.toWei(dualClassCustodianInit.couponRate),
			util.toWei(dualClassCustodianInit.hp),
			util.toWei(dualClassCustodianInit.hu),
			util.toWei(dualClassCustodianInit.hd),
			dualClassCustodianInit.comm,
			dualClassCustodianInit.pd,
			dualClassCustodianInit.optCoolDown,
			dualClassCustodianInit.pxFetchCoolDown,
			process.env.SOLIDITY_COVERAGE
				? dualClassCustodianInit.iteGasThSC
				: dualClassCustodianInit.iteGasTh,
			dualClassCustodianInit.preResetWaitBlk,
			util.toWei(dualClassCustodianInit.minimumBalance),
			{
				from: creator
			}
		);

		custodianTokenContractA = await CustodianToken.new(
			dualClassCustodianInit.TokenA.tokenName,
			dualClassCustodianInit.TokenA.tokenSymbol,
			dualClassCustodianContract.address,
			0,
			{
				from: creator
			}
		);
		custodianTokenContractB = await CustodianToken.new(
			dualClassCustodianInit.TokenB.tokenName,
			dualClassCustodianInit.TokenB.tokenSymbol,
			dualClassCustodianContract.address,
			1,
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
				let contractCode = await dualClassCustodianContract.contractCode.call();
				assert.equal(contractCode.valueOf(), name, 'alpha set incorrectly');
			});

			it('maturity should be set correctly', async () => {
				let contractMaturity = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.MATURITY_IN_SECOND
				);
				assert.isTrue(
					util.isEqual(contractMaturity.valueOf(), maturity),
					'alpha set incorrectly'
				);
			});

			it('alpha should be set correctly', async () => {
				let alpha = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ALPHA_INBP
				);
				assert.isTrue(
					util.isEqual(
						alpha.valueOf(),
						alphaInBP ? alphaInBP : dualClassCustodianInit.alphaInBP
					),
					'alpha set incorrectly'
				);
			});

			it('period should be set correctly', async () => {
				let pd = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.PERIOD
				);
				assert.equal(pd.valueOf(), dualClassCustodianInit.pd, 'period set incorrectly');
			});

			it('limitPeriodicInWei should be set correctly', async () => {
				let limitPeriodicInWei = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.LIMIT_PERIODIC_INWEI
				);
				assert.equal(
					util.fromWei(limitPeriodicInWei),
					dualClassCustodianInit.hp + '',
					'limitPeriodicInWei set incorrectly'
				);
			});

			it('limitUpperInWei should be set correctly', async () => {
				let limitUpperInWei = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.LIMIT_UPPER_INWEI
				);
				assert.isTrue(
					util.isEqual(util.fromWei(limitUpperInWei), dualClassCustodianInit.hu),
					'limitUpperInWei set incorrectly'
				);
			});

			it('limitLowerInWei should be set correctly', async () => {
				let limitLowerInWei = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.LIMIT_LOWER_INWEI
				);
				assert.equal(
					util.fromWei(limitLowerInWei),
					dualClassCustodianInit.hd + '',
					'limitLowerInWei set incorrectly'
				);
			});

			it('iterationGasThreshold should be set correctly', async () => {
				let iterationGasThreshold = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ITERATION_GAS_THRESHOLD
				);
				assert.equal(
					iterationGasThreshold.valueOf(),
					process.env.SOLIDITY_COVERAGE
						? dualClassCustodianInit.iteGasThSC
						: dualClassCustodianInit.iteGasTh,
					'iterationGasThreshold set incorrectly'
				);
			});

			it('createCommInBP should be set correctly', async () => {
				let createCommInBP = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.CREATE_COMMINBP
				);
				assert.equal(
					createCommInBP.valueOf(),
					dualClassCustodianInit.comm + '',
					'createCommInBP set incorrectly'
				);
			});

			it('redeemCommInBP should be set correctly', async () => {
				let comm = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.REDEEM_COMMINBP
				);
				assert.equal(
					comm.valueOf(),
					dualClassCustodianInit.comm,
					'redeemCommInBP set incorrectly'
				);
			});

			it('preResetWaitingBlocks should be set correctly', async () => {
				let preResetWaitingBlocks = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
				);
				assert.equal(
					preResetWaitingBlocks.valueOf(),
					dualClassCustodianInit.preResetWaitBlk + '',
					'preResetWaitingBlocks set incorrectly'
				);
			});

			it('minimumBalance should be set correctly', async () => {
				let minBalance = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.MIN_BALANCE
				);
				assert.equal(
					util.fromWei(minBalance.valueOf()),
					dualClassCustodianInit.minimumBalance + '',
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
			let state = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.STATE
			);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_INCEPTION,
				'state is not inception'
			);
		});

		it('non operator cannot start', async () => {
			try {
				await dualClassCustodianContract.startCustodian.call(
					CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
					CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
					oracleContract.address,
					{ from: alice }
				);
				assert.isTrue(false, 'can start');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should not start with oracle not ready', async () => {
			try {
				await dualClassCustodianContract.startCustodian.call(
					CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
					CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
					oracleContract.address,
					{ from: creator }
				);
				assert.isTrue(false, 'can start with oracle not ready');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should start contract', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);

			let tx = await dualClassCustodianContract.startCustodian(
				CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
				CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
				oracleContract.address,
				{ from: creator }
			);

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_ACCEPT_PX &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_TRADING,
				'worng event emitted'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), ethInitPrice) &&
					tx.logs[0].args.timeInSecond.valueOf() / CST.WEI_DENOMINATOR ===
						time.valueOf() / CST.WEI_DENOMINATOR &&
					util.isEqual(util.fromWei(tx.logs[0].args.navAInWei), '1') &&
					util.isEqual(util.fromWei(tx.logs[0].args.navBInWei), '1'),
				'worng event parameter emitted'
			);
		});

		it('should update lastPrice and resetPrice', async () => {
			let lastPrice = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.LAST_PRICE_INWEI
			);
			let lastPriceTime = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.LAST_PRICETIME_INSECOND
			);
			assert.isTrue(
				util.isEqual(util.fromWei(lastPrice), ethInitPrice),

				'lastPrice price not updated correctly'
			);

			assert.isTrue(
				util.isEqual(lastPriceTime.valueOf(), time.valueOf()),

				'lastPrice time not updated correctly'
			);

			let resetPrice = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.RESET_PRICE_INWEI
			);
			let resetPriceTime = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.RESET_PRICETIME_INSECOND
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
			let state = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.STATE
			);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_TRADING,
				'state is not trading'
			);
		});
	});

	describe('creation', () => {
		function createTest(isWithWETH) {
			let amtEth = 1;
			let tokenValueB =
				((1 - dualClassCustodianInit.comm / CST.BP_DENOMINATOR) * ethInitPrice) /
				(1 + dualClassCustodianInit.alphaInBP / CST.BP_DENOMINATOR);
			let tokenValueA = (dualClassCustodianInit.alphaInBP / CST.BP_DENOMINATOR) * tokenValueB;

			let accumulatedFeeAfterWithdrawal;
			let totalSupplyA, totalSupplyB;
			before(async () => {
				await initContracts(0, PERTETUAL_NAME, 0);
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await dualClassCustodianContract.startCustodian(
					custodianTokenContractA.address,
					custodianTokenContractB.address,
					oracleContract.address,
					{
						from: creator
					}
				);
				if (isWithWETH) {
					await wethContract.deposit({
						from: alice,
						value: util.toWei(amtEth * 3)
					});
				}
			});

			it('cannot create with 0', async () => {
				if (isWithWETH) {
					await wethContract.approve(
						dualClassCustodianContract.address,
						util.toWei(amtEth),
						{
							from: alice
						}
					);
					try {
						await dualClassCustodianContract.createWithWETH.call(
							util.toWei(0),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with 0');
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
					}
				} else {
					try {
						await dualClassCustodianContract.create.call({ from: alice, value: 0 });
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
					}
				}
			});

			if (isWithWETH) {
				it('cannot create with insufficient allowance', async () => {
					try {
						await dualClassCustodianContract.createWithWETH.call(
							util.toWei(amtEth * 2),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with insufficient allowance');
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
					}
				});

				it('cannot create more than balance', async () => {
					await wethContract.approve(
						dualClassCustodianContract.address,
						util.toWei(amtEth * 4),
						{
							from: alice
						}
					);
					try {
						await dualClassCustodianContract.createWithWETH.call(
							util.toWei(amtEth * 4),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create more than allowance');
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
					}
				});

				it('cannot create with wrong weth addr', async () => {
					await wethContract.approve(bob, util.toWei(amtEth), {
						from: alice
					});
					try {
						await dualClassCustodianContract.createWithWETH.call(
							util.toWei(0),
							wethContract.address,
							{ from: alice }
						);
						assert.isTrue(false, 'can create with 0x0');
					} catch (err) {
						assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
					}
				});
			}

			it('should create', async () => {
				let tx;
				let preBalance = await util.getBalance(dualClassCustodianContract.address);
				if (isWithWETH) {
					await wethContract.approve(
						dualClassCustodianContract.address,
						util.toWei(amtEth),
						{
							from: alice
						}
					);
					tx = await dualClassCustodianContract.createWithWETH(
						util.toWei(amtEth),

						wethContract.address,
						{ from: alice }
					);
				} else {
					tx = await dualClassCustodianContract.create({
						from: alice,
						value: util.toWei(amtEth)
					});
				}
				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_CREATE &&
						tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
					'incorrect event emitted'
				);

				assert.isTrue(
					tx.logs[0].args.sender === alice &&
						util.isEqual(util.fromWei(tx.logs[0].args.tokenAInWei), tokenValueA + '') &&
						util.isEqual(util.fromWei(tx.logs[0].args.tokenBInWei), tokenValueB + '') &&
						util.isEqual(
							util.fromWei(tx.logs[0].args.ethAmtInWei),
							amtEth * (1 - dualClassCustodianInit.comm / CST.BP_DENOMINATOR) + ''
						) &&
						util.isEqual(
							util.fromWei(tx.logs[0].args.feeInWei),
							(amtEth * dualClassCustodianInit.comm) / CST.BP_DENOMINATOR + ''
						),
					'incorrect event arguments emitted'
				);

				let afterBalance = await util.getBalance(dualClassCustodianContract.address);

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
				let ethFee = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.FEE_BALANCE_INWEI
				);
				let fee = (1 * dualClassCustodianInit.comm) / CST.BP_DENOMINATOR;
				assert.isTrue(
					util.fromWei(ethFee) === fee.toString(),
					'feeAccumulated not updated correctly'
				);
			});

			it('should update user list if required', async () => {
				let userFlag = await dualClassCustodianContract.existingUsers.call(alice);
				assert.isTrue(util.isEqual(userFlag.valueOf(), 1), 'new user is not updated');
			});

			it('should update balance of A correctly', async () => {
				let balanceA = await dualClassCustodianContract.balanceOf.call(0, alice);
				assert.isTrue(
					util.isEqual(util.fromWei(balanceA), tokenValueA.toString()),
					'balance A not updated correctly'
				);
			});

			it('should update balance of B correctly', async () => {
				let balanceB = await dualClassCustodianContract.balanceOf.call(1, alice);
				assert.isTrue(
					util.isEqual(util.fromWei(balanceB), tokenValueB.toString()),
					'balance B not updated correctly'
				);
			});

			it('should not be added into userList with small creation amt', async () => {
				await dualClassCustodianContract.create({
					from: charles,
					value: util.toWei(0.00003)
				});
				let userFlag = await dualClassCustodianContract.existingUsers.call(charles);
				assert.isTrue(
					util.isEqual(userFlag.valueOf(), '0'),
					'new user is included in userList'
				);
			});

			it('should only collect fee less than allowed', async () => {
				try {
					await dualClassCustodianContract.collectFee.call(util.toWei(1), { from: fc });
					assert.isTrue(false, 'can collect fee more than allowed');
				} catch (err) {
					assert.equal(err.message, CST.VM_INVALID_OPCODE_MSG, 'not reverted');
				}
			});

			it('should collect fee', async () => {
				let feeBalanceInWei = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.FEE_BALANCE_INWEI
				);
				accumulatedFeeAfterWithdrawal = Number(util.fromWei(feeBalanceInWei)) - 0.0001;
				let success = await dualClassCustodianContract.collectFee.call(util.toWei(0.0001), {
					from: fc
				});
				assert.isTrue(success);
				let tx = await dualClassCustodianContract.collectFee(util.toWei(0.0001), {
					from: fc
				});

				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_COLLECT_FEE,
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
				let feeBalanceInWei = await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.FEE_BALANCE_INWEI
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
		let adjAmtA = (amtA * CST.BP_DENOMINATOR) / dualClassCustodianInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = (deductAmtB * dualClassCustodianInit.alphaInBP) / CST.BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtB) / ethInitPrice;
		let fee = (amtEth * dualClassCustodianInit.comm) / CST.BP_DENOMINATOR;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await dualClassCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				{
					from: creator
				}
			);
			await dualClassCustodianContract.create({ from: alice, value: util.toWei(1) });
			prevBalanceA = await dualClassCustodianContract.balanceOf.call(0, alice);
			prevBalanceB = await dualClassCustodianContract.balanceOf.call(1, alice);
			let ethFee = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.FEE_BALANCE_INWEI
			);
			prevFeeAccumulated = ethFee.valueOf();
			prevCollateral =
				(await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ETH_COLLATERAL_INWEI
				)).valueOf() / CST.WEI_DENOMINATOR;
			totalSupplyA = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_SUPPLYA
			);
			totalSupplyA = totalSupplyA.valueOf() / CST.WEI_DENOMINATOR;
			totalSupplyB = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_SUPPLYB
			);
			totalSupplyB = totalSupplyB.valueOf() / CST.WEI_DENOMINATOR;
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await dualClassCustodianContract.redeem(util.toWei(2800), util.toWei(2900), {
					from: alice
				});
				assert.isTrue(false, 'able to redeem more than balance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'able to redeem more than allowed');
			}
		});

		it('should redeem token A and B fee paying with eth', async () => {
			let success = await dualClassCustodianContract.redeem.call(
				util.toWei(amtA),
				util.toWei(amtB),

				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await dualClassCustodianContract.redeem(util.toWei(amtA), util.toWei(amtB), {
				from: alice
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_REDEEM &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
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
				(await util.getState(
					dualClassCustodianContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.ETH_COLLATERAL_INWEI
				)).valueOf() / CST.WEI_DENOMINATOR;
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
			let feeAccumulated = await dualClassCustodianContract.feeBalanceInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(feeAccumulated.valueOf() - prevFeeAccumulated + ''), fee),
				'fee balance not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await dualClassCustodianContract.balanceOf.call(0, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceA.valueOf() / CST.WEI_DENOMINATOR + deductAmtA,
					prevBalanceA.valueOf() / CST.WEI_DENOMINATOR
				),
				'balance A not updated correctly after redemption'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await dualClassCustodianContract.balanceOf.call(1, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceB.valueOf() / CST.WEI_DENOMINATOR + deductAmtB,
					prevBalanceB.valueOf() / CST.WEI_DENOMINATOR
				),
				'balance B not updated correctly after redemption'
			);
		});

		it('should be in user list', async () => {
			let userFlag = await dualClassCustodianContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), '1'), 'user not in the user list');
			let userSize = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_USERS
			);
			assert.isTrue(util.isEqual(userSize.valueOf(), 1), 'user size not updated correctly');
		});

		it('should be in user list', async () => {
			let userFlag = await dualClassCustodianContract.existingUsers.call(alice);
			assert.isTrue(userFlag.valueOf() == '1', 'user not in the user list');
			let userSize = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_USERS
			);
			assert.equal(userSize.valueOf(), 1, 'user size not updated correctly');
		});

		it('should be removed from user list if all tokens are redeemed', async () => {
			let currentBalanceA = await dualClassCustodianContract.balanceOf.call(0, alice);
			let currentBalanceB = await dualClassCustodianContract.balanceOf.call(1, alice);
			await dualClassCustodianContract.redeem(
				currentBalanceA.valueOf(),
				currentBalanceB.valueOf(),

				{ from: alice }
			);
			let userFlag = await dualClassCustodianContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), 0), 'user still in the userList');
			let userSize = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.TOTAL_USERS
			);
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
			await dualClassCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				{
					from: creator
				}
			);
			await dualClassCustodianContract.create({ from: alice, value: util.toWei(1) });
			prevBalanceA = await dualClassCustodianContract.balanceOf.call(0, alice);
			prevBalanceB = await dualClassCustodianContract.balanceOf.call(1, alice);
		});

		it('should not redeemAll in non maturity state', async () => {
			try {
				await dualClassCustodianContract.redeemAll({
					from: alice
				});
				assert.isTrue(false, 'able to redeem in trading state');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'able to redeem in trading state');
			}
		});

		it('should not redeemAll in balance is 0 state', async () => {
			await oracleContract.skipCooldown(6 * 30 * 24 + 1);
			let time = await oracleContract.timestamp.call();
			await dualClassCustodianContract.setTimestamp(time.valueOf());
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await dualClassCustodianContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf());
			navA = 1.2;
			navB = 0.8;
			await dualClassCustodianContract.setNav(
				util.toWei(navA + '', 'ethere'),
				util.toWei(navB + '', 'ethere'),
				util.toWei(ethInitPrice),
				time.valueOf()
			);

			try {
				await dualClassCustodianContract.redeemAll({
					from: bob
				});
				assert.isTrue(false, 'able to redeemAll with 0 balance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'able to redeemAll with 0 balance');
			}
		});

		it('should redeemAll', async () => {
			let tx = await dualClassCustodianContract.redeemAll({
				from: alice
			});

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_REDEEM &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
				'wrong event'
			);

			let ethAmt =
				(util.fromWei(prevBalanceA) * navA + util.fromWei(prevBalanceB) * navB) /
				ethInitPrice;
			let redeemedAmt = ethAmt * (1 - dualClassCustodianInit.comm / 10000);
			let fee = (ethAmt * dualClassCustodianInit.comm) / 10000;
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.ethAmtInWei), redeemedAmt) &&
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

	describe('setValue', () => {
		before(async () => {
			await initContracts(0, PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(400), time.valueOf(), pf1);
			await dualClassCustodianContract.startCustodian(
				CST.DUAL_CUSTODIAN.ADDRESS.A_ADDR,
				CST.DUAL_CUSTODIAN.ADDRESS.B_ADDR,
				oracleContract.address,
				{
					from: creator
				}
			);
		});

		beforeEach(async () => {
			await dualClassCustodianContract.skipCooldown(25);
		});

		it('admin should be able to set createCommission', async () => {
			let success = await dualClassCustodianContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let createCommInBP = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.CREATE_COMMINBP
			);
			let preValue = createCommInBP.valueOf();
			let tx = await dualClassCustodianContract.setValue(0, 50, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_SET_VALUE,
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
				await dualClassCustodianContract.setValue.call(0, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await dualClassCustodianContract.setValue.call(0, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set redeemCommInBP', async () => {
			let success = await dualClassCustodianContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set redeemCommInBP');
			let redeemCommInBP = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.REDEEM_COMMINBP
			);
			let preValue = redeemCommInBP.valueOf();
			let tx = await dualClassCustodianContract.setValue(1, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_SET_VALUE,
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
				await dualClassCustodianContract.setValue.call(1, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await dualClassCustodianContract.setValue.call(1, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await dualClassCustodianContract.setValue.call(2, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
			let iterationGasThreshold = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.ITERATION_GAS_THRESHOLD
			);
			let preValue = iterationGasThreshold.valueOf();
			let tx = await dualClassCustodianContract.setValue(2, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_SET_VALUE,
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
				await dualClassCustodianContract.setValue.call(2, 100000, { from: alice });
				assert.isTrue(false, 'non admin can change gas threshhold');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set pre reset waiting blocks', async () => {
			let success = await dualClassCustodianContract.setValue.call(3, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
			let preResetWaitingBlocks = await util.getState(
				dualClassCustodianContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
			);
			let preValue = preResetWaitingBlocks.valueOf();
			let tx = await dualClassCustodianContract.setValue(3, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_SET_VALUE,
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
				await dualClassCustodianContract.setValue.call(3, 100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should not be able to set with idx 4 and bigger index', async () => {
			try {
				await dualClassCustodianContract.setValue.call(4, 100, {
					from: creator
				});
				assert.isTrue(false, 'can set value with invalid index');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});
	});
});
