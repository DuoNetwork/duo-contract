const Erc20Custodian = artifacts.require('./Erc20CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const util = require('./util');
const InitParas = require('../migrations/contractInitParas.json');
const RoleManagerInit = InitParas['RoleManager'];
const Erc20CustodianInit = InitParas['Erc20Custodian'];
const CustodianInit = InitParas['Custodian'];
const CST = require('./constants');

const EVENT_COLLECT_FEE = 'CollectFee';
const STATE_INCEPT_RESET = '0';

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
	TOKEN_FEE_BALANCE_INWEI: 17
};

const CUSTODIAN_ADDR = {
	ROLE_MANAGER: 0,
	OPERATOR: 1,
	FEE_COLLECTOR: 2,
	ORACLE_ADDR: 3,
	A_TOKEN_ADDR: 4,
	B_TOKEN_ADDR: 5
};

const getAddr = async (contract, index) => {
	let _addresses = await contract.getAddresses.call();
	return _addresses[index];
};

contract('Erc20Custodian', accounts => {
	let erc20CustodianContract;
	let collateralTokenContract;
	let roleManagerContract;
	const creator = accounts[0];
	const fc = accounts[1];
	const alice = accounts[2];
	const TOTAL_SUPPLY = 10000;

	const initContracts = async () => {
		collateralTokenContract = await DUO.new(util.toWei(TOTAL_SUPPLY), 'DUO', 'DUO', {
			from: creator
		});

		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		erc20CustodianContract = await Erc20Custodian.new(
			'erc20CustodianContractCode',
			collateralTokenContract.address,
			Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60,
			roleManagerContract.address,
			fc,
			Erc20CustodianInit.comm,
			CustodianInit.pd,
			Erc20CustodianInit.optCoolDown,
			CustodianInit.pxFetchCoolDown,
			Erc20CustodianInit.preResetWaitBlk,
			util.toWei(Erc20CustodianInit.minimumBalance),
			{
				from: creator
			}
		);
	};

	describe('tconstructor', async () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await util.getState(erc20CustodianContract, CUSTODIAN_STATE.STATE);
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let fc = await getAddr(erc20CustodianContract, CUSTODIAN_ADDR.FEE_COLLECTOR);
			assert.equal(fc.valueOf(), fc, 'feeCollector specified incorrect');
		});

		it('createCommInBP should equal specified value', async () => {
			let comm = await util.getState(erc20CustodianContract, CUSTODIAN_STATE.CREATE_COMMINBP);
			assert.equal(
				comm.valueOf(),
				Erc20CustodianInit.comm,
				'createCommInBP specified incorrect'
			);
		});

		it('redeemCommInBP should equal specified value', async () => {
			let comm = await util.getState(erc20CustodianContract, CUSTODIAN_STATE.REDEEM_COMMINBP);
			assert.equal(
				comm.valueOf(),
				Erc20CustodianInit.comm,
				'redeemCommInBP specified incorrect'
			);
		});

		it('period should equal specified value', async () => {
			let pd = await util.getState(erc20CustodianContract, CUSTODIAN_STATE.PERIOD);
			assert.equal(pd.valueOf(), CustodianInit.pd, 'period specified incorrect');
		});

		it('preResetWaitingBlks should equal specified value', async () => {
			let preResetWaitBlk = await util.getState(
				erc20CustodianContract,
				CUSTODIAN_STATE.PRERESET_WAITING_BLOCKS
			);
			assert.equal(
				preResetWaitBlk.valueOf(),
				Erc20CustodianInit.preResetWaitBlk,
				'preResetWaitingBlks specified incorrect'
			);
		});

		it('priceFetchCoolDown should equal specified value', async () => {
			let pxFetchCoolDown = await util.getState(
				erc20CustodianContract,
				CUSTODIAN_STATE.PRICE_FETCH_COOLDOWN
			);
			assert.equal(
				pxFetchCoolDown.valueOf(),
				CustodianInit.pxFetchCoolDown,
				'pxFetchCoolDown specified incorrect'
			);
		});
	});

	describe('tokenFeeBalanceInWei', async () => {
		before(initContracts);

		it('tokenFeeBalanceInWei should be 0', async () => {
			const tokenFee = await erc20CustodianContract.tokenFeeBalanceInWei.call();
			assert.equal(tokenFee.valueOf(), '0', 'tokenFeeBalanceInWei is not 0');
		});

		it('tokenFeeBalanceInWei should be more than 0', async () => {
			await collateralTokenContract.transfer(
				erc20CustodianContract.address,
				util.toWei(100),
				{ from: creator }
			);
			const tokenFee = await erc20CustodianContract.tokenFeeBalanceInWei.call();
			assert.equal(
				tokenFee.valueOf(),
				util.toWei(100),
				'tokenFeeBalanceInWei is not correct'
			);
		});
	});

	describe('collectFee', () => {
		const initFee = '10';
		const feeCollectAmtMore = '20';
		const feeCollectAmtLess = '1';

		before(async () => {
			await initContracts();
			await erc20CustodianContract.setState(1);
			await collateralTokenContract.transfer(
				erc20CustodianContract.address,
				util.toWei(initFee),
				{ from: creator }
			);
		});

		it('balance and fee should be set correct', async () => {
			let balance = await collateralTokenContract.balanceOf(erc20CustodianContract.address);
			const tokenFee = await erc20CustodianContract.tokenFeeBalanceInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(balance), initFee) &&
					util.isEqual(util.fromWei(tokenFee), initFee),
				'balance not correct'
			);
		});

		it('only feeCollector is allowed to coolectFee', async () => {
			try {
				await erc20CustodianContract.collectFee.call(util.toWei(1), { from: alice });
				assert.isTrue(false, 'non fc can withDrawFee');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'non fc can withdraw');
			}
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await erc20CustodianContract.collectFee.call(util.toWei(feeCollectAmtMore), {
					from: fc
				});
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_INVALID_OPCODE_MSG,
					'can collect fee more than allowed'
				);
			}
		});

		it('should collect fee', async () => {
			let success = await erc20CustodianContract.collectFee.call(
				util.toWei(feeCollectAmtLess),
				{
					from: fc
				}
			);

			assert.isTrue(success);
			let tx = await erc20CustodianContract.collectFee(util.toWei(feeCollectAmtLess), {
				from: fc
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COLLECT_FEE,
				'worng event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.addr === fc &&
					util.isEqual(util.fromWei(tx.logs[0].args.feeInWei), feeCollectAmtLess) &&
					util.isEqual(
						util.fromWei(tx.logs[0].args.feeBalanceInWei),
						initFee - feeCollectAmtLess
					),
				'worng fee parameter'
			);

			const fcTokenBalance = await collateralTokenContract.balanceOf(fc);
			assert.isTrue(
				feeCollectAmtLess === util.fromWei(fcTokenBalance.valueOf()),
				'fc fee balance not updated correctly'
			);
		});
	});
});
