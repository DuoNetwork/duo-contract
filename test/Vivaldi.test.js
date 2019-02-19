const Vivaldi = artifacts.require('../contracts/mocks/VivaldiMock.sol');
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
const PERTETUAL_NAME = 'Vivaldi perpetual';
const TERM_NAME = 'Vivaldi term6';

const EVENT_ACCEPT_PX = 'AcceptPrice';
const EVENT_START_PRE_RESET = 'StartPreReset';
const EVENT_START_TRADING = 'StartTrading';
const EVENT_MATURED = 'Matured';

const TOTAL_SUPPLY = 1000000000;
const VIVALDI_STATE = {
	LAST_OPERATION_TIME: 0,
	OPERATION_COOLDOWN: 1,
	STATE: 2,
	MIN_BALANCE: 3,
	TOTAL_SUPPLYA: 4,
	TOTAL_SUPPLYB: 5,
	TOKEN_COLLATERAL_INWEI: 6,
	LAST_PRICE_INWEI: 7,
	LAST_PRICETIME_INSECOND: 8,
	RESET_PRICE_INWEI: 9,
	RESET_PRICETIME_INSECOND: 10,
	CREATE_COMMINBP: 11,
	REDEEM_COMMINBP: 12,
	CLEAR_COMMINBP: 13,
	PERIOD: 14,
	MATURITY_IN_SECOND: 15,
	PRERESET_WAITING_BLOCKS: 16,
	PRICE_FETCH_COOLDOWN: 17,
	NEXT_RESET_ADDR_INDEX: 18,
	TOTAL_USERS: 19,
	TOKEN_FEE_BALANCE_INWEI: 20,
	ITERATION_GAS_THRESHOLD: 21,
	ROUND_STRIKE: 22
};

const assertState = async (contract, state) => {
	let _state = await util.getState(contract, VIVALDI_STATE.STATE);
	assert.isTrue(util.isEqual(_state.valueOf(), state));
};

contract('Vivaldi', accounts => {
	let vivaldiContract;
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
	const alice = accounts[5];
	const bob = accounts[6];
	const charles = accounts[7];
	const newModerator = accounts[8];
	const newModerator2 = accounts[9];

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

		vivaldiContract = await Vivaldi.new(
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
			vivaldiContract.address,
			0,
			{
				from: creator
			}
		);
		custodianTokenContractB = await CustodianToken.new(
			OptionCustodianInit.TokenB.tokenName,
			OptionCustodianInit.TokenB.tokenSymbol,
			vivaldiContract.address,
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

	describe('startRound', () => {
		beforeEach(() => initContracts(PERTETUAL_NAME, 0));
		let time;

		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;

		it('can only startRound in trading state', async () => {
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: cannot startRound if lastPriceTime < reset priceTime', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf());
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: cannot startRound if within coolDown', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.setResetPrice(util.toWei(ethInitPrice));
			const resetTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			await vivaldiContract.setTimestamp(
				Erc20CustodianInit.pxFetchCoolDown + Number(resetTime.valueOf())
			);
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: cannot startRound if magi priceTime within coolDown', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.skipPriceFetchCoolDown(1);
			await vivaldiContract.skipSecond(1);

			const currentTime = await vivaldiContract.timestamp.call();
			await oracleContract.setLastPrice(
				util.toWei(ethInitPrice),
				Number(currentTime.valueOf()) - 2,
				pf1
			);
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: cannot startRound if magi priceTime > currentTime', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.skipPriceFetchCoolDown(1);
			await vivaldiContract.skipSecond(1);

			const currentTime = await vivaldiContract.timestamp.call();
			await oracleContract.setLastPrice(
				util.toWei(ethInitPrice),
				Number(currentTime.valueOf()) + 1,
				pf1
			);
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: cannot startRound if magi priceTime === 0', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.skipPriceFetchCoolDown(1);
			await vivaldiContract.skipSecond(1);

			const currentTime = await vivaldiContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(0), Number(currentTime.valueOf()), pf1);
			try {
				await vivaldiContract.startRound.call({ from: creator });
				assert.isTrue(false, 'can startRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		// priceFetchCoolDown > 0
		it('priceFetchCoolDown > 0: should startRound', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.skipPriceFetchCoolDown(1);
			await vivaldiContract.skipSecond(10);

			const currentTime = await vivaldiContract.timestamp.call();
			await oracleContract.setLastPrice(
				util.toWei(ethInitPrice),
				Number(currentTime.valueOf()),
				pf1
			);

			let tx = await vivaldiContract.startRound({ from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_ACCEPT_PX,
				'wrong event name emission'
			);
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), ethInitPrice) &&
					util.isEqual(tx.logs[0].args.timeInSecond, Number(currentTime.valueOf())),
				'wrong event args emission'
			);

			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			assert.isTrue(
				Number(lastPriceTime.valueOf()) === Number(currentTime.valueOf()) &&
					util.isEqual(util.fromWei(lastPrice.valueOf()), ethInitPrice),
				'lastPrice updated incorrectly'
			);
		});

		// priceFetchCoolDown === 0
		it('should startRound when priceFetchCoolDown =0', async () => {
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.startRound({ from: creator });
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			assert.isTrue(
				Number(lastPriceTime.valueOf()) === Number(time.valueOf()) &&
					util.isEqual(util.fromWei(lastPrice.valueOf()), ethInitPrice),
				'lastPrice updated incorrectly'
			);
		});

		it('if strike isRelative', async () => {
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.setStrike(util.toWei(1.05), true, true);
			await vivaldiContract.startRound({ from: creator });

			const targetRoundStrikePrice = ethInitPrice * 1.05;
			const roundPrice = await util.getState(vivaldiContract, VIVALDI_STATE.ROUND_STRIKE);
			assert.isTrue(
				util.isEqual(util.fromWei(roundPrice), targetRoundStrikePrice),
				'roundStrikeprice updated incorrectly'
			);
		});

		it('if strike isRelative', async () => {
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.setStrike(util.toWei(100), true, false);
			await vivaldiContract.startRound({ from: creator });

			const roundPrice = await util.getState(vivaldiContract, VIVALDI_STATE.ROUND_STRIKE);
			assert.isTrue(
				util.isEqual(util.fromWei(roundPrice), 100),
				'roundStrikeprice updated incorrectly'
			);
		});
	});

	describe('endRound', () => {
		beforeEach(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.startRound({ from: creator });
		});
		let time;

		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;
		it('cannot endRound if currentTime < requiredTime', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime - 10);
			try {
				await vivaldiContract.endRound.call({ from: creator });
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot endRound if timeInSecond != requiredTime', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(100), requiredTime + 5, pf1);
			try {
				await vivaldiContract.endRound.call({ from: creator });
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot endRound if timeInSecond > currentTime', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime + 20);
			oracleContract.setLastPrice(util.toWei(100), requiredTime + 30, pf1);
			try {
				await vivaldiContract.endRound.call({ from: creator });
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot endRound if priceInWei = 0', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(0), requiredTime, pf1);

			try {
				await vivaldiContract.endRound.call({ from: creator });
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot endRound if lastPriceTimeinSecond <= resetPriceTimeInSecond', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(100), requiredTime, pf1);

			try {
				await vivaldiContract.endRound.call({ from: creator });
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should endRound, isCall, isNotKnockedIn', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(100), requiredTime, pf1);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);

			let tx = await vivaldiContract.endRound({ from: creator });

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_START_PRE_RESET &&
					tx.logs[1].event === EVENT_ACCEPT_PX,
				'wrong event emission'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.priceInWei), 100) &&
					util.isEqual(tx.logs[1].args.timeInSecond, requiredTime),
				'wrong event args'
			);

			const isKnockedIn = await vivaldiContract.isKnockedIn.call();
			assert.isTrue(!isKnockedIn.valueOf(), 'knockedIn');
		});

		it('should endRound, isCall, isKnockedIn', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(1000), requiredTime, pf1);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);

			let tx = await vivaldiContract.endRound({ from: creator });

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_START_PRE_RESET &&
					tx.logs[1].event === EVENT_ACCEPT_PX,
				'wrong event emission'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.priceInWei), 1000) &&
					util.isEqual(tx.logs[1].args.timeInSecond, requiredTime),
				'wrong event args'
			);

			const isKnockedIn = await vivaldiContract.isKnockedIn.call();
			assert.isTrue(isKnockedIn.valueOf(), 'knockedIn');
		});

		it('should endRound, isPut , isNotKnockedIn', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(1000), requiredTime, pf1);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);
			await vivaldiContract.setStrike(util.toWei(1.05), false, true);

			let tx = await vivaldiContract.endRound({ from: creator });

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_START_PRE_RESET &&
					tx.logs[1].event === EVENT_ACCEPT_PX,
				'wrong event emission'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.priceInWei), 1000) &&
					util.isEqual(tx.logs[1].args.timeInSecond, requiredTime),
				'wrong event args'
			);

			const isKnockedIn = await vivaldiContract.isKnockedIn.call();
			assert.isTrue(!isKnockedIn.valueOf(), 'knockedIn');
		});

		it('should endRound, isPut , isKnockedIn', async () => {
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(100), requiredTime, pf1);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);
			await vivaldiContract.setStrike(util.toWei(1.05), false, true);

			let tx = await vivaldiContract.endRound({ from: creator });

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_START_PRE_RESET &&
					tx.logs[1].event === EVENT_ACCEPT_PX,
				'wrong event emission'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[1].args.priceInWei), 100) &&
					util.isEqual(tx.logs[1].args.timeInSecond, requiredTime),
				'wrong event args'
			);

			const isKnockedIn = await vivaldiContract.isKnockedIn.call();
			assert.isTrue(isKnockedIn.valueOf(), 'knockedIn');
		});
	});

	describe('forceEndRound', () => {
		let time;
		beforeEach(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
		});

		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;

		const forcePrice = 200;
		it('can only force end in trading state', async () => {
			try {
				await vivaldiContract.forceEndRound(util.toWei(forcePrice), time.valueOf());
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can only force end when currentTime >= requiredTime', async () => {
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime - 10);
			try {
				await vivaldiContract.forceEndRound(util.toWei(forcePrice), time.valueOf());
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can only force end when magi price time equal requiredTime', async () => {
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime + 10);

			try {
				await vivaldiContract.forceEndRound(util.toWei(forcePrice), requiredTime + 1);
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can only force end when magi price more than 0', async () => {
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime + 10);

			try {
				await vivaldiContract.forceEndRound(util.toWei(0), requiredTime);
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('only cold address can forceEnd', async () => {
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime + 10);

			try {
				await vivaldiContract.forceEndRound(util.toWei(forcePrice), requiredTime);
				assert.isTrue(false, 'can endRound');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should forceEndRound', async () => {
			await roleManagerContract.addCustodian(vivaldiContract.address, {
				from: creator
			});
			await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.startManager({ from: newModerator });
			await roleManagerContract.setModerator(newModerator2);
			await roleManagerContract.skipCooldown(1);
			// await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.addAddress(
				util.toChecksumAddress(alice),
				util.toChecksumAddress(bob),
				0,
				{ from: newModerator2 }
			);
			await roleManagerContract.skipCooldown(1);
			// console.log(tx);

			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);
			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime + 10);
			await vivaldiContract.setLastPrice(util.toWei(ethInitPrice), requiredTime);
			let tx = await vivaldiContract.forceEndRound(util.toWei(forcePrice), requiredTime, {
				from: alice
			});

			assert.isTrue(
				tx.logs.length === 3 &&
					tx.logs[0].event === 'UpdateOperator' &&
					tx.logs[1].event === 'StartPreReset' &&
					tx.logs[2].event === 'AcceptPrice',
				'wrong event emission'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[2].args.priceInWei), forcePrice) &&
					util.isEqual(tx.logs[2].args.timeInSecond, requiredTime),
				'wrong event args emission'
			);
		});
	});

	describe('pre reset', () => {
		let time;
		const strike = 1.05;
		const strikeIsCall = true;
		const strikeIsRelative = true;
		before(async () => {
			await initContracts(PERTETUAL_NAME, 0);
			await collateralTokenContract.transfer(alice, util.toWei(3), {
				from: creator
			});

			await collateralTokenContract.approve(vivaldiContract.address, util.toWei(3), {
				from: alice
			});
			await vivaldiContract.setPriceFetchCoolDown(0);
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
			await vivaldiContract.startCustodian(
				custodianTokenContractA.address,
				custodianTokenContractB.address,
				oracleContract.address,
				util.toWei(strike),
				strikeIsCall,
				strikeIsRelative,
				{ from: creator }
			);

			await vivaldiContract.startRound({ from: creator });
			const resetPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.RESET_PRICETIME_INSECOND
			);
			const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
			await vivaldiContract.setTimestamp(requiredTime);
			oracleContract.setLastPrice(util.toWei(100), requiredTime, pf1);
			const lastPriceTime = await util.getState(
				vivaldiContract,
				VIVALDI_STATE.LAST_PRICETIME_INSECOND
			);
			const lastPrice = await util.getState(vivaldiContract, VIVALDI_STATE.LAST_PRICE_INWEI);
			await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);
			await vivaldiContract.endRound({ from: creator });
		});

		it('should be in state preReset', async () => {
			let state = await util.getState(vivaldiContract, VIVALDI_STATE.STATE);
			assert.equal(
				state.valueOf(),
				CST.DUAL_CUSTODIAN.STATE.STATE_PRE_RESET,
				'state is wrong'
			);
		});

		it('should not allow creation', async () => {
			try {
				await vivaldiContract.create.call(util.toWei(0.01), {
					from: alice
				});
				assert.isTrue(false, 'still can create');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can create ');
			}
		});

		it('should not allow redemption', async () => {
			try {
				await vivaldiContract.redeem.call(util.toWei(0.01), util.toWei(0.01), {
					from: alice
				});

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer of A', async () => {
			try {
				await vivaldiContract.transfer.call(
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
				await vivaldiContract.transfer.call(
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
				await vivaldiContract.setValue.call(0, 1000, { from: creator });

				assert.isTrue(false, 'still can set createCommInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can set createCommInBP');
			}
		});

		it('should not allow admin set redeemCommInBP', async () => {
			try {
				await vivaldiContract.setValue.call(1, 1000, { from: creator });

				assert.isTrue(false, 'still can set redeemCommInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can set redeemCommInBP');
			}
		});

		it('should not allow admin set clearCommInBP', async () => {
			try {
				await vivaldiContract.setValue.call(2, 1000, { from: creator });

				assert.isTrue(false, 'still can set redeemCommInBP');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still can set redeemCommInBP');
			}
		});

		it('should not allow admin set iterationGasThreshold', async () => {
			try {
				await vivaldiContract.setValue.call(3, 1000, { from: creator });
				assert.isTrue(false, 'still can set iterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still set iterationGasThreshold');
			}
		});

		it('should not allow admin set preResetWaitingBlocks', async () => {
			try {
				await vivaldiContract.setValue.call(4, 1000, { from: creator });
				assert.isTrue(false, 'still can set preResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'still set preResetWaitingBlocks');
			}
		});

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			let preResetWaitBlk = await util.getState(
				vivaldiContract,
				CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
			);

			for (let i = 0; i < preResetWaitBlk.valueOf() - 1; i++)
				await vivaldiContract.startPreReset();

			await assertState(vivaldiContract, CST.DUAL_CUSTODIAN.STATE.STATE_PRE_RESET);

			let tx = await vivaldiContract.startPreReset();
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET &&
					tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
				'wrong events emitted'
			);
			await assertState(vivaldiContract, CST.DUAL_CUSTODIAN.STATE.STATE_RESET);
		});
	});

	describe('resets', () => {
		function resetFunc(
			prevBalanceA,
			prevBalanceB,
			lastPrice,
			endPrice,
			strike,
			isCall,
			isRelative,
			clearFee
		) {
			let strikePrice;

			if (isRelative) strikePrice = lastPrice * strike;
			else strikePrice = strike;
			let isKnockedIn = false;

			if (isCall) isKnockedIn = endPrice >= strikePrice;
			else isKnockedIn = endPrice <= strikePrice;

			return isKnockedIn ? prevBalanceA * (1 - clearFee) : prevBalanceB * (1 - clearFee);
		}

		function resetTest(
			endPrice,
			transferABRequired,
			maturity,
			resetGas,
			strike,
			strikeIsCall,
			strikeIsRelative
		) {
			let time;
			let lastAcceptPrice;
			let prevBalanceAalice, prevBalanceBalice;
			let prevBalanceAbob, prevBalanceBbob;
			let prevBalanceAcharles, prevBalanceBcharles;
			before(async () => {
				if (maturity === 0) {
					await initContracts(PERTETUAL_NAME, 0);
				} else {
					await initContracts(TERM_NAME, maturity);
				}

				await vivaldiContract.setPriceFetchCoolDown(0);
				time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(util.toWei(ethInitPrice), time.valueOf(), pf1);
				await vivaldiContract.startCustodian(
					custodianTokenContractA.address,
					custodianTokenContractB.address,
					oracleContract.address,
					util.toWei(strike),
					strikeIsCall,
					strikeIsRelative,
					{ from: creator }
				);

				await vivaldiContract.startRound({ from: creator });
				const lastPriceInWei = (await util.getState(
					vivaldiContract,
					VIVALDI_STATE.LAST_PRICE_INWEI
				)).valueOf();
				lastAcceptPrice = util.fromWei(lastPriceInWei);

				await collateralTokenContract.transfer(alice, util.toWei(3), {
					from: creator
				});
				await collateralTokenContract.approve(vivaldiContract.address, util.toWei(3), {
					from: alice
				});
				await vivaldiContract.create(util.toWei(1), {
					from: alice
				});
				await collateralTokenContract.transfer(bob, util.toWei(3), {
					from: creator
				});
				await collateralTokenContract.approve(vivaldiContract.address, util.toWei(3), {
					from: bob
				});
				await vivaldiContract.create(util.toWei(1.2), {
					from: bob
				});
				await collateralTokenContract.transfer(charles, util.toWei(3), {
					from: creator
				});
				await collateralTokenContract.approve(vivaldiContract.address, util.toWei(3), {
					from: charles
				});
				await vivaldiContract.create(util.toWei(1.5), {
					from: charles
				});

				if (transferABRequired) {
					let aliceA = await vivaldiContract.balanceOf.call(0, alice);

					vivaldiContract.transfer(
						0,
						CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
						bob,
						aliceA.valueOf(),
						{
							from: alice
						}
					);
					await vivaldiContract.balanceOf.call(1, bob).then(bobB => {
						vivaldiContract.transfer(
							1,
							CST.DUAL_CUSTODIAN.ADDRESS.DUMMY_ADDR,
							alice,
							bobB.valueOf(),
							{
								from: bob
							}
						);
					});

					await vivaldiContract.balanceOf.call(1, charles).then(charlesB => {
						vivaldiContract.transfer(
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

				await vivaldiContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.valueOf() / CST.WEI_DENOMINATOR));
				let aliceB = await vivaldiContract.balanceOf.call(1, alice);
				prevBalanceBalice = aliceB.valueOf() / CST.WEI_DENOMINATOR;

				await vivaldiContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.valueOf() / CST.WEI_DENOMINATOR));
				let bobB = await vivaldiContract.balanceOf.call(1, bob);
				prevBalanceBbob = bobB.valueOf() / CST.WEI_DENOMINATOR;

				await vivaldiContract.balanceOf
					.call(0, charles)
					.then(
						charlesA => (prevBalanceAcharles = charlesA.valueOf() / CST.WEI_DENOMINATOR)
					);
				let charlesB = await vivaldiContract.balanceOf.call(1, charles);
				prevBalanceBcharles = charlesB.valueOf() / CST.WEI_DENOMINATOR;

				const resetPriceTime = await util.getState(
					vivaldiContract,
					VIVALDI_STATE.RESET_PRICETIME_INSECOND
				);
				const requiredTime = Number(resetPriceTime.valueOf()) + Erc20CustodianInit.pd;
				await vivaldiContract.setTimestamp(requiredTime);
				oracleContract.setLastPrice(util.toWei(100), requiredTime, pf1);
				const lastPriceTime = await util.getState(
					vivaldiContract,
					VIVALDI_STATE.LAST_PRICETIME_INSECOND
				);
				const lastPrice = await util.getState(
					vivaldiContract,
					VIVALDI_STATE.LAST_PRICE_INWEI
				);
				await vivaldiContract.setLastPrice(lastPrice, Number(lastPriceTime) + 10);

				await vivaldiContract.endRound({ from: creator });

				let preResetWaitBlk = await util.getState(
					vivaldiContract,
					CST.DUAL_CUSTODIAN.STATE_INDEX.PRERESET_WAITING_BLOCKS
				);

				for (let i = 0; i < preResetWaitBlk.valueOf() - 1; i++)
					await vivaldiContract.startPreReset();

				await assertState(vivaldiContract, CST.DUAL_CUSTODIAN.STATE.STATE_PRE_RESET);

				let tx = await vivaldiContract.startPreReset();
				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[1].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_TOTAL_SUPPLY,
					'wrong events emitted'
				);
				await assertState(vivaldiContract, CST.DUAL_CUSTODIAN.STATE.STATE_RESET);
			});

			it('should have three users', async () => {
				let userSize = await util.getState(vivaldiContract, VIVALDI_STATE.TOTAL_USERS);
				assert.equal(userSize.valueOf(), 3, 'num of users incorrect');
			});

			it('should have correct setup', async () => {
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

				const totalUsers = await util.getState(vivaldiContract, VIVALDI_STATE.TOTAL_USERS);
				assert.isTrue(
					util.isEqual(Number(totalUsers.valueOf()), 3),
					'totalUsers updtded wronly'
				);
			});

			it('should process reset for only one user', async () => {
				const prevColateralBalanceOfAlice = await collateralTokenContract.balanceOf.call(
					alice
				);
				let tx = await vivaldiContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET,
					'not only one user processed'
				);

				let nextIndex = await vivaldiContract.getNextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await vivaldiContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await vivaldiContract.balanceOf.call(1, alice);
				let collateralTokenAmt = resetFunc(
					prevBalanceAalice,
					prevBalanceBalice,
					lastAcceptPrice,
					endPrice,
					strike,
					strikeIsCall,
					strikeIsRelative,
					OptionCustodianInit.clearComm / CST.BP_DENOMINATOR
				);

				const currentColateralBalanceOfAlice = await collateralTokenContract.balanceOf.call(
					alice
				);

				assert.isTrue(
					util.isEqual(
						Number(util.fromWei(prevColateralBalanceOfAlice.valueOf())) +
							Number(collateralTokenAmt),
						Number(util.fromWei(currentColateralBalanceOfAlice.valueOf()))
					),
					'collateral balnace not updated correctly'
				);

				assert.isTrue(
					util.isEqual(util.fromWei(currentBalanceAalice.valueOf()), '0') &&
						util.isEqual(util.fromWei(currentBalanceBalice.valueOf()), '0'),
					'Balance A and B not updated correctly'
				);
			});

			if (!transferABRequired) {
				it('should complete reset for second user', async () => {
					const prevColateralBalanceOfBob = await collateralTokenContract.balanceOf.call(
						bob
					);
					let tx = await vivaldiContract.startReset({ gas: resetGas });
					assert.isTrue(
						tx.logs.length === 1 &&
							tx.logs[0].event === CST.DUAL_CUSTODIAN.EVENT.EVENT_START_RESET,
						'reset not completed'
					);
					let nextIndex = await vivaldiContract.getNextResetAddrIndex.call();
					assert.equal(nextIndex.valueOf(), '2', 'not moving to next user');
					let currentBalanceAbob = await vivaldiContract.balanceOf.call(0, alice);
					let currentBalanceBbob = await vivaldiContract.balanceOf.call(1, alice);
					let collateralTokenAmt = resetFunc(
						prevBalanceAbob,
						prevBalanceBbob,
						lastAcceptPrice,
						endPrice,
						strike,
						strikeIsCall,
						strikeIsRelative,
						OptionCustodianInit.clearComm / CST.BP_DENOMINATOR
					);

					const currentColateralBalanceOfBob = await collateralTokenContract.balanceOf.call(
						bob
					);

					assert.isTrue(
						util.isEqual(
							Number(util.fromWei(prevColateralBalanceOfBob.valueOf())) +
								Number(collateralTokenAmt),
							Number(util.fromWei(currentColateralBalanceOfBob.valueOf()))
						),
						'collateral balnace not updated correctly'
					);

					assert.isTrue(
						util.isEqual(util.fromWei(currentBalanceAbob.valueOf()), '0') &&
							util.isEqual(util.fromWei(currentBalanceBbob.valueOf()), '0'),
						'Balance A and B not updated correctly'
					);
				});
			}

			it('should complete reset for third user and transit to trading', async () => {
				const prevColateralBalanceOfCharles = await collateralTokenContract.balanceOf.call(
					charles
				);
				let tx = await vivaldiContract.startReset({ gas: resetGas });
				assert.isTrue(
					tx.logs.length === 1 &&
						tx.logs[0].event === (maturity === 0 ? EVENT_START_TRADING : EVENT_MATURED),
					'reset not completed'
				);
				let nextIndex = await vivaldiContract.getNextResetAddrIndex.call();
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');

				let currentBalanceACharles = await vivaldiContract.balanceOf.call(0, charles);
				let currentBalanceBCharles = await vivaldiContract.balanceOf.call(1, charles);
				let collateralTokenAmt = resetFunc(
					prevBalanceAcharles,
					prevBalanceBcharles,
					lastAcceptPrice,
					endPrice,
					strike,
					strikeIsCall,
					strikeIsRelative,
					OptionCustodianInit.clearComm / CST.BP_DENOMINATOR
				);

				const currentColateralBalanceOfCharles = await collateralTokenContract.balanceOf.call(
					charles
				);

				assert.isTrue(
					util.isEqual(
						Number(util.fromWei(prevColateralBalanceOfCharles.valueOf())) +
							Number(collateralTokenAmt),
						Number(util.fromWei(currentColateralBalanceOfCharles.valueOf()))
					),
					'collateral balnace not updated correctly'
				);

				assert.isTrue(
					util.isEqual(util.fromWei(currentBalanceACharles.valueOf()), '0') &&
						util.isEqual(util.fromWei(currentBalanceBCharles.valueOf()), '0'),
					'Balance A and B not updated correctly'
				);

				const totalUsers = await util.getState(vivaldiContract, VIVALDI_STATE.TOTAL_USERS);
				assert.isTrue(
					util.isEqual(Number(totalUsers.valueOf()), 0),
					'totalUsers updtded wronly'
				);

				const state = await util.getState(vivaldiContract, VIVALDI_STATE.STATE);
				assert.isTrue(
					util.isEqual(
						state.valueOf(),
						maturity === 0
							? CST.DUAL_CUSTODIAN.STATE.STATE_TRADING
							: CST.DUAL_CUSTODIAN.STATE.STATE_MATURITY
					),
					'totalUsers updtded wronly'
				);
			});
		}

		let resetGasAmt = process.env.SOLIDITY_COVERAGE ? 160000 : 120000;

		//case 1:
		describe('knockedIn: case 1', () => {
			resetTest(1000, false, 0, resetGasAmt, 1.05, true, true);
		});

		//case 2:
		describe('knockedOut: case 2', () => {
			resetTest(100, false, 0, resetGasAmt, 1.05, true, true);
		});

		//case 3:
		describe('knockedOut: case 3', () => {
			resetTest(100, true, 0, resetGasAmt, 1.05, true, true);
		});

		//case 4:
		describe('knockedOut: case 4', () => {
			resetTest(1000, false, 100, resetGasAmt, 1.05, true, true);
		});
	});
});
