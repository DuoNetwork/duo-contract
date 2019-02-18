const OptionCustodian = artifacts.require('../contracts/mocks/OptionCustodianMock.sol');
const CustodianToken = artifacts.require('../contracts/tokens/CustodianToken.sol');
const CollateralToken = artifacts.require('./DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const RoleManagerInit = InitParas['RoleManager'];
const Erc20CustodianInit = InitParas['Erc20Custodian'];
const OptionCustodianInit = InitParas['OptionCustodian'];
const PptParas = InitParas['Vivaldi']['PPT'];
const MagiInit = InitParas['Magi'];
const util = require('./util');
const CST = require('./constants');

const ethInitPrice = 100;
const PERTETUAL_NAME = 'OptionCustodian perpetual';
const TERM_NAME = 'OptionCustodian term6';

const TOTAL_SUPPLY = 1000000000;
const CUSTODIAN_STATE = {
	LAST_OPERATION_TIME: 0,
	OPERATION_COOLDOWN: 1,
	STATE: 2,
	MIN_BALANCE: 3,
	TOKEN_COLLATERAL_INWEI: 4,
	LAST_PRICE_INWEI: 5,
	LAST_PRICETIME_INSECOND: 6,
	RESET_PRICE_INWEI: 7,
	RESET_PRICETIME_INSECOND: 8,
	CREATE_COMMINBP: 9,
	REDEEM_COMMINBP: 10,
	PERIOD: 11,
	MATURITY_IN_SECOND: 12,
	PRERESET_WAITING_BLOCKS: 13,
	PRICE_FETCH_COOLDOWN: 14,
	NEXT_RESET_ADDR_INDEX: 15,
	TOTAL_USERS: 16,
	TOKEN_FEE_BALANCE_INWEI: 17,
	CLEAR_COMMINBP: 18,
	ITERATION_GAS_THRESHOLD: 19
};

contract('OptionCustodian', accounts => {
	let optionCustodianContract;
	let roleManagerContract;
	let collateralTokenContract;
	let oracleContract;
	let custodianTokenContractA;
	let custodianTokenContractB;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const alice = accounts[6];

	const initContracts = async (contractCode, maturity) => {
		collateralTokenContract = await CollateralToken.new(
			util.toWei(TOTAL_SUPPLY),
			'COLLATERAL',
			'COLLATERAL',
			{
				from: creator
			}
		);

		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		optionCustodianContract = await OptionCustodian.new(
			contractCode,
			collateralTokenContract.address,
			maturity,
			roleManagerContract.address,
			fc,
			Erc20CustodianInit.comm,
			OptionCustodianInit.redeemComm,
			OptionCustodianInit.clearComm,
			Erc20CustodianInit.pd,
			Erc20CustodianInit.optCoolDown,
			Erc20CustodianInit.pxFetchCoolDown,
			Erc20CustodianInit.preResetWaitBlk,
			util.toWei(Erc20CustodianInit.minimumBalance),
			PptParas.iteGasTh,
			{
				from: creator
			}
		);

		custodianTokenContractA = await CustodianToken.new(
			OptionCustodianInit.TokenA.tokenName,
			OptionCustodianInit.TokenA.tokenSymbol,
			optionCustodianContract.address,
			0,
			{
				from: creator
			}
		);
		custodianTokenContractB = await CustodianToken.new(
			OptionCustodianInit.TokenB.tokenName,
			OptionCustodianInit.TokenB.tokenSymbol,
			optionCustodianContract.address,
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
	};

	describe('constructor', () => {
		function constructorTest(name, maturity) {
			before(() => initContracts(name, maturity));

			it('iterationGasThreshold should be set correctly', async () => {
				const states = await optionCustodianContract.getStates.call();
				let iterationGasThreshold = states[CUSTODIAN_STATE.ITERATION_GAS_THRESHOLD];
				assert.equal(
					Number(iterationGasThreshold.valueOf()),
					PptParas.iteGasTh,
					'iterationGasThreshold set incorrectly'
				);
			});

			it('redeemCommInBP should be set correctly', async () => {
				let comm = await util.getState(
					optionCustodianContract,
					CUSTODIAN_STATE.REDEEM_COMMINBP
				);
				assert.equal(
					Number(comm.valueOf()),
					OptionCustodianInit.redeemComm,
					'redeemCommInBP set incorrectly'
				);
			});

			it('clearCommInBP should be set correctly', async () => {
				let createCommInBP = await util.getState(
					optionCustodianContract,
					CUSTODIAN_STATE.CLEAR_COMMINBP
				);
				assert.equal(
					Number(createCommInBP.valueOf()),
					OptionCustodianInit.clearComm + '',
					'createCommInBP set incorrectly'
				);
			});
		}

		//case 1: Perpetual tEST
		describe('Perpetual case 1', () => {
			constructorTest(PERTETUAL_NAME, 0);
		});

		//case 2: Term tEST
		describe('Term case 2', () => {
			constructorTest(
				TERM_NAME,
				Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60
			);
		});
	});

	describe('startCustodian', () => {
		before(() => initContracts(PERTETUAL_NAME, 0));
		let time;

		const strike = 500;
		const strikeIsCall = true;
		const strikeIsRelative = true;

		it('state should be Inception before starting', async () => {
			let state = await util.getState(optionCustodianContract, CUSTODIAN_STATE.STATE);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_INCEPTION,
				'state is not inception'
			);
		});

		it('non operator cannot start', async () => {
			try {
				await optionCustodianContract.startCustodian.call(
					custodianTokenContractA.address,
					custodianTokenContractB.address,
					oracleContract.address,
					util.toWei(strike),
					strikeIsCall,
					strikeIsRelative,
					{ from: alice }
				);
				assert.isTrue(false, 'can start');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should not start with oracle not ready', async () => {
			try {
				await optionCustodianContract.startCustodian.call(
					custodianTokenContractA.address,
					custodianTokenContractB.address,
					oracleContract.address,
					util.toWei(strike),
					strikeIsCall,
					strikeIsRelative,
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

			let tx = await optionCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
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
				optionCustodianContract,
				CUSTODIAN_STATE.LAST_PRICE_INWEI
			);
			let lastPriceTime = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.LAST_PRICETIME_INSECOND
			);
			assert.isTrue(
				util.isEqual(util.fromWei(lastPrice), '0'),
				'lastPrice price not updated correctly'
			);

			assert.isTrue(
				util.isEqual(lastPriceTime.valueOf(), '0'),
				'lastPrice time not updated correctly'
			);

			let resetPrice = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.RESET_PRICE_INWEI
			);
			let resetPriceTime = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.RESET_PRICETIME_INSECOND
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

		it('striking parameters set correctly', async () => {
			let strikeParas = await optionCustodianContract.strike.call();
			assert.equal(
				strikeParas.strikeInWei.valueOf(),
				util.toWei(strike),
				'strikeInWei is not trading'
			);
			assert.equal(strikeParas.isCall.valueOf(), strikeIsCall, 'strikeIsCall is not trading');
			assert.equal(
				strikeParas.isRelative.valueOf(),
				strikeIsCall,
				'strikeIsCall is not trading'
			);
		});

		it('state should be trading', async () => {
			let state = await util.getState(optionCustodianContract, CUSTODIAN_STATE.STATE);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_TRADING,
				'state is not trading'
			);
		});
	});

	describe('creation', () => {
		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;

		let amtEth = 1;
		let totalSupplyA, totalSupplyB;
		before(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await optionCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{
					from: creator
				}
			);

			await collateralTokenContract.transfer(alice, util.toWei(amtEth * 3), {
				from: creator
			});
		});

		it('cannot create with 0', async () => {
			await collateralTokenContract.approve(
				optionCustodianContract.address,
				util.toWei(amtEth),
				{
					from: alice
				}
			);
			try {
				await optionCustodianContract.create.call(util.toWei(0), { from: alice });
				assert.isTrue(false, 'can create with 0');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot create with insufficient allowance', async () => {
			try {
				await optionCustodianContract.create.call(util.toWei(amtEth * 2), { from: alice });
				assert.isTrue(false, 'can create with insufficient allowance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot create more than balance', async () => {
			await collateralTokenContract.approve(
				optionCustodianContract.address,
				util.toWei(amtEth * 4),
				{
					from: alice
				}
			);
			try {
				await optionCustodianContract.create.call(util.toWei(amtEth * 4), { from: alice });
				assert.isTrue(false, 'can create more than allowance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should create', async () => {
			let tx;
			let preBalance = await collateralTokenContract.balanceOf.call(
				optionCustodianContract.address
			);

			await collateralTokenContract.approve(
				optionCustodianContract.address,
				util.toWei(amtEth),
				{
					from: alice
				}
			);
			tx = await optionCustodianContract.create(util.toWei(amtEth), { from: alice });

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_CREATE &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
				'incorrect event emitted'
			);

			const feeAmt = (amtEth * Erc20CustodianInit.comm) / CST.BP_DENOMINATOR;
			const ethAmt = amtEth - feeAmt;

			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenAInWei), ethAmt + '') &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenBInWei), ethAmt + '') &&
					util.isEqual(util.fromWei(tx.logs[0].args.ethAmtInWei), ethAmt + '') &&
					util.isEqual(util.fromWei(tx.logs[0].args.feeInWei), feeAmt + ''),
				'incorrect event arguments emitted'
			);

			let afterBalance = await collateralTokenContract.balanceOf.call(
				optionCustodianContract.address
			);

			assert.isTrue(
				util.fromWei(afterBalance + '') - util.fromWei(preBalance + '') === amtEth,
				'contract balance updated incorrectly'
			);

			totalSupplyA = ethAmt;
			totalSupplyB = ethAmt;
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyAInWei), totalSupplyA + '') &&
					util.isEqual(
						util.fromWei(tx.logs[1].args.totalSupplyBInWei),
						totalSupplyB + ''
					),
				'totalSupply not updated connectly'
			);
		});
	});

	describe('redemption', () => {
		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;

		let prevBalanceA, prevBalanceB, prevFeeAccumulated, prevCollateral;
		let deductAmt;
		let amtA = 0.5;
		let amtB = 0.6;
		let feeAmt;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await optionCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{
					from: creator
				}
			);

			await collateralTokenContract.transfer(alice, util.toWei(3), {
				from: creator
			});

			await collateralTokenContract.approve(optionCustodianContract.address, util.toWei(3), {
				from: alice
			});
			await optionCustodianContract.create(util.toWei(1), { from: alice });
			prevBalanceA = await optionCustodianContract.balanceOf.call(0, alice);
			prevBalanceB = await optionCustodianContract.balanceOf.call(1, alice);
			let collateralTokenFee = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.TOKEN_FEE_BALANCE_INWEI
			);
			prevFeeAccumulated = collateralTokenFee.valueOf() / CST.WEI_DENOMINATOR;

			prevCollateral =
				(await collateralTokenContract.balanceOf.call(
					optionCustodianContract.address
				)).valueOf() / CST.WEI_DENOMINATOR;

			totalSupplyA = await optionCustodianContract.totalSupplyA.call();
			totalSupplyA = totalSupplyA.valueOf() / CST.WEI_DENOMINATOR;
			totalSupplyB = await optionCustodianContract.totalSupplyB.call();
			totalSupplyB = totalSupplyB.valueOf() / CST.WEI_DENOMINATOR;
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await optionCustodianContract.redeem(util.toWei(2), util.toWei(2), {
					from: alice
				});
				assert.isTrue(false, 'able to redeem more than balance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'able to redeem more than allowed');
			}
		});

		it('should redeem token A and B', async () => {
			let success = await optionCustodianContract.redeem.call(
				util.toWei(amtA),
				util.toWei(amtB),
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await optionCustodianContract.redeem(util.toWei(amtA), util.toWei(amtB), {
				from: alice
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_REDEEM &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
				'incorrect event emitted'
			);

			deductAmt = amtA > amtB ? amtB : amtA;

			feeAmt = (deductAmt * OptionCustodianInit.redeemComm) / CST.BP_DENOMINATOR;
			const tokenCollateralAmt = deductAmt - feeAmt;

			totalSupplyA = totalSupplyA - deductAmt;
			totalSupplyB = totalSupplyB - deductAmt;

			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenAInWei), deductAmt) &&
					util.isEqual(util.fromWei(tx.logs[0].args.tokenBInWei), deductAmt) &&
					util.isEqual(util.fromWei(tx.logs[0].args.ethAmtInWei), tokenCollateralAmt) &&
					util.isEqual(util.fromWei(tx.logs[0].args.feeInWei), feeAmt),
				'incorrect event arguments emitted'
			);

			let tokenCollateral =
				(await collateralTokenContract.balanceOf.call(
					optionCustodianContract.address
				)).valueOf() / CST.WEI_DENOMINATOR;
			assert.isTrue(
				util.isEqual(tokenCollateral, prevCollateral - tokenCollateralAmt),
				'token collateral not set correctly'
			);
			prevCollateral = tokenCollateral;

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyAInWei), totalSupplyA) &&
					util.isEqual(util.fromWei(tx.logs[1].args.totalSupplyBInWei), totalSupplyB)
			);
		});

		it('fee balance should be updated', async () => {
			let feeAccumulated = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.TOKEN_FEE_BALANCE_INWEI
			);
			assert.isTrue(
				util.isEqual(util.fromWei(feeAccumulated.valueOf()) - prevFeeAccumulated , feeAmt),
				'fee balance not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await optionCustodianContract.balanceOf.call(0, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceA.valueOf() / CST.WEI_DENOMINATOR + deductAmt,
					prevBalanceA.valueOf() / CST.WEI_DENOMINATOR
				),
				'balance A not updated correctly after redemption'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await optionCustodianContract.balanceOf.call(1, alice);
			assert.isTrue(
				util.isEqual(
					currentBalanceB.valueOf() / CST.WEI_DENOMINATOR + deductAmt,
					prevBalanceB.valueOf() / CST.WEI_DENOMINATOR
				),
				'balance B not updated correctly after redemption'
			);
		});

		it('should be in user list', async () => {
			let userFlag = await optionCustodianContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), '1'), 'user not in the user list');
			let userSize = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.TOTAL_USERS
			);
			assert.isTrue(util.isEqual(userSize.valueOf(), 1), 'user size not updated correctly');
		});

		it('should be removed from user list if all tokens are redeemed', async () => {
			let currentBalanceA = await optionCustodianContract.balanceOf.call(0, alice);
			let currentBalanceB = await optionCustodianContract.balanceOf.call(1, alice);
			await optionCustodianContract.redeem(
				currentBalanceA.valueOf(),
				currentBalanceB.valueOf(),

				{ from: alice }
			);
			let userFlag = await optionCustodianContract.existingUsers.call(alice);
			assert.isTrue(util.isEqual(userFlag.valueOf(), 0), 'user still in the userList');
			let userSize = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.TOTAL_USERS
			);
			assert.isTrue(util.isEqual(userSize.valueOf(), 0), 'user size not updated correctly');
		});
	});

	describe('setValue', () => {
		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;
		before(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(400), time.valueOf(), pf1);
			await optionCustodianContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{
					from: creator
				}
			);
		});

		beforeEach(async () => {
			await optionCustodianContract.skipCooldown(25);
		});

		it('admin should be able to set createCommission', async () => {
			let success = await optionCustodianContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let createCommInBP = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.CREATE_COMMINBP
			);
			let preValue = createCommInBP.valueOf();
			let tx = await optionCustodianContract.setValue(0, 50, { from: creator });
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
				await optionCustodianContract.setValue.call(0, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await optionCustodianContract.setValue.call(0, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set redeemCommInBP', async () => {
			let success = await optionCustodianContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set redeemCommInBP');
			let redeemCommInBP = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.REDEEM_COMMINBP
			);
			let preValue = redeemCommInBP.valueOf();
			let tx = await optionCustodianContract.setValue(1, 100, { from: creator });
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
				await optionCustodianContract.setValue.call(1, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await optionCustodianContract.setValue.call(1, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set clearCommInBP', async () => {
			let success = await optionCustodianContract.setValue.call(2, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set clearCommInBP');
			let clearCommInBP = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.CLEAR_COMMINBP
			);
			let preValue = clearCommInBP.valueOf();
			let tx = await optionCustodianContract.setValue(2, 100, { from: creator });
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

		it('should not be able to set clear commission higher than 10000', async () => {
			try {
				await optionCustodianContract.setValue.call(2, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('non admin should not be able to set clear comm', async () => {
			try {
				await optionCustodianContract.setValue.call(2, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await optionCustodianContract.setValue.call(3, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
			let iterationGasThreshold = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.ITERATION_GAS_THRESHOLD
			);
			let preValue = iterationGasThreshold.valueOf();
			let tx = await optionCustodianContract.setValue(3, 100, { from: creator });
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

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await optionCustodianContract.setValue.call(3, 100000, { from: alice });
				assert.isTrue(false, 'non admin can change gas threshhold');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should be able to set pre reset waiting blocks', async () => {
			let success = await optionCustodianContract.setValue.call(4, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
			let preResetWaitingBlocks = await util.getState(
				optionCustodianContract,
				CUSTODIAN_STATE.PRERESET_WAITING_BLOCKS
			);
			let preValue = preResetWaitingBlocks.valueOf();
			let tx = await optionCustodianContract.setValue(4, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				Number(tx.logs[0].args.index.valueOf()) === 4 &&
					Number(tx.logs[0].args.oldValue.valueOf()) === Number(preValue) &&
					Number(tx.logs[0].args.newValue.valueOf()) === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await optionCustodianContract.setValue.call(4, 100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('admin should not be able to set with idx 5 and bigger index', async () => {
			try {
				await optionCustodianContract.setValue.call(5, 100, {
					from: creator
				});
				assert.isTrue(false, 'can set value with invalid index');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});
	});
});
