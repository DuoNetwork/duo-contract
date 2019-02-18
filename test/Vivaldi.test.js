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
// const TERM_NAME = 'Vivaldi term6';

const EVENT_ACCEPT_PX = 'AcceptPrice';
const EVENT_START_PRE_RESET = 'StartPreReset';

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
	// const alice = accounts[6];

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
});
