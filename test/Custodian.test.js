const Custodian = artifacts.require('../contracts/mocks/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const PoolInit = InitParas['Pool'];
const util = require('./util');
// Event
const EVENT_TRANSFER = 'Transfer';
const EVENT_APPROVAL = 'Approval';
const EVENT_UPDATE_ORACLE = 'UpdateOracle';
const EVENT_COLLECT_FEE = 'CollectFee';

const STATE_INCEPT_RESET = '0';
const STATE_TRADING = '1';

const DUMMY_ADDR = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
const CUSTODIAN_STATE = {
	LAST_OPERATION_TIME: 0,
	OPERATION_COOLDOWN: 1,
	STATE: 2,
	MIN_BALANCE: 3,
	ETH_COLLATERAL_INWEI: 4,
	NAVA_INWEI: 5,
	NAVB_INWEI: 6,
	LAST_PRICE_INWEI: 7,
	LAST_PRICETIME_INSECOND: 8,
	RESET_PRICE_INWEI: 9,
	RESET_PRICETIME_INSECOND: 10,
	CREATE_COMMINBP: 11,
	REDEEM_COMMINBP: 12,
	PERIOD: 13,
	MATURITY_IN_SECOND: 14,
	PRERESET_WAITING_BLOCKS: 15,
	PRICE_FETCH_COOLDOWN: 16,
	NEXT_RESET_ADDR_INDEX: 17,
	TOTAL_USERS: 18,
	FEE_BALANCE_INWEI: 19
};

const CUSTODIAN_ADDR = {
	ROLE_MANAGER: 0,
	OPERATOR: 1,
	FEE_COLLECTOR: 2,
	ORACLE_ADDR: 3,
	A_TOKEN_ADDR: 4,
	B_TOKEN_ADDR: 5
};

const getState = async (contract, index) => {
	let _states = await contract.getStates.call();
	return _states[index];
};

const getAddr = async (contract, index) => {
	let _addresses = await contract.getAddresses.call();
	return _addresses[index];
};

contract('Custodian', accounts => {
	let custodianContract, roleManagerContract, oracleContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const pf1 = accounts[2];
	const pf2 = accounts[3];
	const pf3 = accounts[4];
	const alice = accounts[5];
	const bob = accounts[6];
	const charles = accounts[7];
	const david = accounts[8];

	const initContracts = async () => {
		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		custodianContract = await Custodian.new(
			'contract code',
			Math.floor(new Date().valueOf() / 1000) + 6 * 30 * 24 * 60 * 60,
			roleManagerContract.address,
			fc,
			BeethovenInit.comm,
			BeethovenInit.pd,
			BeethovenInit.preResetWaitBlk,
			BeethovenInit.pxFetchCoolDown,
			creator,
			BeethovenInit.optCoolDown,
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
			MagiInit.optCoolDown
		);
	};

	describe('constructor', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await getState(custodianContract, CUSTODIAN_STATE.STATE);
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let fc = await getAddr(custodianContract, CUSTODIAN_ADDR.FEE_COLLECTOR);
			assert.equal(fc.valueOf(), fc, 'feeCollector specified incorrect');
		});

		it('createCommInBP should equal specified value', async () => {
			let comm = await getState(custodianContract, CUSTODIAN_STATE.CREATE_COMMINBP);
			assert.equal(comm.valueOf(), BeethovenInit.comm, 'createCommInBP specified incorrect');
		});

		it('redeemCommInBP should equal specified value', async () => {
			let comm = await getState(custodianContract, CUSTODIAN_STATE.REDEEM_COMMINBP);
			assert.equal(comm.valueOf(), BeethovenInit.comm, 'redeemCommInBP specified incorrect');
		});

		it('period should equal specified value', async () => {
			let pd = await getState(custodianContract, CUSTODIAN_STATE.PERIOD);
			assert.equal(pd.valueOf(), BeethovenInit.pd, 'period specified incorrect');
		});

		it('preResetWaitingBlks should equal specified value', async () => {
			let preResetWaitBlk = await getState(
				custodianContract,
				CUSTODIAN_STATE.PRERESET_WAITING_BLOCKS
			);
			assert.equal(
				preResetWaitBlk.valueOf(),
				BeethovenInit.preResetWaitBlk,
				'preResetWaitingBlks specified incorrect'
			);
		});

		it('priceFetchCoolDown should equal specified value', async () => {
			let pxFetchCoolDown = await getState(
				custodianContract,
				CUSTODIAN_STATE.PRICE_FETCH_COOLDOWN
			);
			assert.equal(
				pxFetchCoolDown.valueOf(),
				BeethovenInit.pxFetchCoolDown,
				'pxFetchCoolDown specified incorrect'
			);
		});

		it('navA should equal specified value', async () => {
			let navAInWei = await getState(custodianContract, CUSTODIAN_STATE.NAVA_INWEI);
			assert.isTrue(
				util.isEqual(util.fromWei(navAInWei), 1),
				'navAInWei specified incorrect'
			);
		});

		it('navB should equal specified value', async () => {
			let navBInWei = await await getState(custodianContract, CUSTODIAN_STATE.NAVB_INWEI);
			assert.isTrue(
				util.isEqual(util.fromWei(navBInWei), 1),
				'navBInWei specified incorrect'
			);
		});
	});

	describe('totalUsers', () => {
		before(initContracts);

		it('userLenght should be 0', async () => {
			let userSize = await getState(custodianContract, CUSTODIAN_STATE.TOTAL_USERS);
			assert.equal(userSize.valueOf(), 0, 'userLenght wrong');
		});
	});

	describe('token test', () => {
		let initialBalance = '100';
		let approvalAmt = '50';
		let transferAmt = '10';
		let transferFromAmt = '40';
		function tokenTest(index) {
			before(async () => {
				await initContracts();
				await custodianContract.setState(1);
				await custodianContract.mintTokens(alice, index, util.toWei(initialBalance), {
					from: creator
				});
			});

			it('should in state trading', async () => {
				let state = await getState(custodianContract, CUSTODIAN_STATE.STATE);
				assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading');
			});

			it('should show balance', async () => {
				let balance = await custodianContract.balanceOf.call(index, alice);
				assert.isTrue(
					util.isEqual(util.fromWei(balance), initialBalance),
					'balance of alice not shown'
				);
			});

			it('alice userIdx should be updated', async () => {
				let userIdx = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(util.isEqual(userIdx.valueOf(), 1), 'alice is not updated');
				let userSize = await getState(custodianContract, CUSTODIAN_STATE.TOTAL_USERS);
				assert.isTrue(
					util.isEqual(userSize.valueOf(), 1),
					'user size not updated correctly'
				);
			});

			it('should be able to approve', async () => {
				let success = await custodianContract.approve.call(
					index,
					DUMMY_ADDR,
					bob,
					util.toWei(approvalAmt),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to approve');

				let tx = await custodianContract.approve(
					index,
					DUMMY_ADDR,
					bob,
					util.toWei(approvalAmt),
					{
						from: alice
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_APPROVAL,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.tokenOwner === alice &&
						tx.logs[0].args.spender === bob &&
						util.isEqual(util.fromWei(tx.logs[0].args.tokens), approvalAmt) &&
						Number(tx.logs[0].args.index.valueOf()) === index,
					'incorrect event arguments emitted'
				);
			});

			it('should show allowance', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.isTrue(
					util.isEqual(util.fromWei(allowance), approvalAmt),
					'allowance of bob not equal to approvalAmt'
				);
			});

			it('dummy from address should not be used for approval', async () => {
				let dummyAllowance = await custodianContract.allowance.call(index, DUMMY_ADDR, bob);
				assert.equal(dummyAllowance.valueOf(), 0, 'dummy from address is used');
			});

			it('should be able to transfer', async () => {
				let success = await custodianContract.transfer.call(
					index,
					DUMMY_ADDR,
					bob,
					util.toWei(transferAmt),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transfer(
					index,
					DUMMY_ADDR,
					bob,
					util.toWei(transferAmt),
					{
						from: alice
					}
				);

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from === alice &&
						tx.logs[0].args.to === bob &&
						util.isEqual(util.fromWei(tx.logs[0].args.value), transferAmt) &&
						Number(tx.logs[0].args.index.valueOf()) === index,
					'incorrect event arguments emitted'
				);
			});

			it('bob userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(util.isEqual(userIdxAlice.valueOf(), 1), 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(util.isEqual(userIdxBob.valueOf(), 2), 'bob userIdx is not updated');
				let userSize = await getState(custodianContract, CUSTODIAN_STATE.TOTAL_USERS);
				assert.isTrue(
					util.isEqual(userSize.valueOf(), 2),
					'user size not updated correctly'
				);
			});

			it('should show balance of bob equal to transferAmt', async () => {
				let balance = await custodianContract.balanceOf.call(index, bob);
				assert.isTrue(
					util.isEqual(util.fromWei(balance), transferAmt),
					'balance of bob not shown'
				);
			});

			it('dummy from address should not be used for transfer', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(util.isEqual(util.fromWei(balance), 0), 'dummy from address is used');
			});

			it('should not transfer more than balance', async () => {
				try {
					await custodianContract.transfer.call(
						index,
						DUMMY_ADDR,
						bob,
						util.toWei(10000000),
						{
							from: alice
						}
					);

					assert.isTrue(false, 'able to transfer more than balance');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('should transferAFrom less than allowance', async () => {
				let success = await custodianContract.transferFrom.call(
					index,
					DUMMY_ADDR,
					alice,
					charles,
					util.toWei(transferFromAmt),
					{ from: bob }
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transferFrom(
					index,
					DUMMY_ADDR,
					alice,
					charles,
					util.toWei(transferFromAmt),
					{
						from: bob
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from === alice &&
						tx.logs[0].args.to === charles &&
						util.isEqual(util.fromWei(tx.logs[0].args.value), transferFromAmt) &&
						util.isEqual(tx.logs[0].args.index.valueOf(), index),
					'incorrect event arguments emitted'
				);
			});

			it('charles userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(util.isEqual(userIdxAlice.valueOf(), 1), 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(util.isEqual(userIdxBob.valueOf(), 2), 'bob userIdx is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.isTrue(
					util.isEqual(userIdxCharles.valueOf(), 3),
					'charles userIdx is not updated'
				);
				let userSize = await getState(custodianContract, CUSTODIAN_STATE.TOTAL_USERS);
				assert.isTrue(
					util.isEqual(userSize.valueOf(), 3),
					'user size not updated correctly'
				);
			});

			it('dummy from address should not be used for transferFrom', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(util.isEqual(balance.valueOf(), 0), 'dummy from address is used');
			});

			it('should not transferFrom more than allowance', async () => {
				try {
					await custodianContract.transferFrom.call(
						index,
						DUMMY_ADDR,
						alice,
						charles,
						util.toWei(transferFromAmt),
						{
							from: bob
						}
					);
					assert.isTrue(false, 'can transferFrom of more than allowance');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('allowance for bob should be updated', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.isTrue(
					util.isEqual(
						util.fromWei(allowance),
						Number(approvalAmt) - Number(transferFromAmt)
					),
					'allowance of bob not correct'
				);
			});

			it('check balance of charles equal transferFromAmt', async () => {
				let balance = await custodianContract.balanceOf.call(index, charles);
				assert.isTrue(
					util.isEqual(util.fromWei(balance), transferFromAmt),
					'balance of charles not correct'
				);
			});

			it('alice transfer all balance to david and update userIdx correctly', async () => {
				await custodianContract.mintTokens(alice, 1 - index, util.toWei(initialBalance));
				let balanceA = await custodianContract.balanceOf.call(index, alice);
				let balanceB = await custodianContract.balanceOf.call(1 - index, alice);
				let userIdxDavid = await custodianContract.getExistingUser.call(david);

				assert.equal(userIdxDavid.valueOf(), '0', 'david is not updated');
				await custodianContract.transfer(index, alice, david, balanceA, {
					from: alice
				});
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.equal(userIdxDavid.valueOf(), '4', 'david is not updated');
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.equal(userIdxAlice.valueOf(), '1', 'alice is not updated');
				await custodianContract.transfer(1 - index, alice, david, balanceB, {
					from: alice
				});

				userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.equal(userIdxAlice.valueOf(), '0', 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.equal(userIdxBob.valueOf(), '2', 'bob is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.equal(userIdxCharles.valueOf(), '3', 'charles is not updated');
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.equal(userIdxDavid.valueOf(), '1', 'david is not updated');

				let userSize = await getState(custodianContract, CUSTODIAN_STATE.TOTAL_USERS);
				assert.equal(userSize.valueOf(), '3', 'user size not updated correctly');
			});
		}

		describe('A', () => {
			tokenTest(0);
		});

		describe('B', () => {
			tokenTest(1);
		});
	});

	describe('collectFee', () => {
		const initFee = '10';
		const feeCollectAmtMore = '20';
		const feeCollectAmtLess = '1';

		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
			await util.sendTransaction({
				from: creator,
				to: custodianContract.address,
				value: util.toWei(initFee)
			});
		});

		it('balance and fee should be set correct', async () => {
			let balance = await util.getBalance(custodianContract.address);
			let ethFee = await getState(custodianContract, CUSTODIAN_STATE.FEE_BALANCE_INWEI);
			assert.isTrue(
				util.isEqual(util.fromWei(balance), initFee) &&
					util.isEqual(util.fromWei(ethFee), initFee),
				'balance not correct'
			);
		});

		it('only feeCollector is allowed to coolectFee', async () => {
			try {
				await custodianContract.collectFee.call(util.toWei(1), { from: alice });
				assert.isTrue(false, 'non fc can withDrawFee');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'non fc can withdraw');
			}
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await custodianContract.collectFee.call(util.toWei(feeCollectAmtMore), {
					from: fc
				});
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					util.VM_INVALID_OPCODE_MSG,
					'can collect fee more than allowed'
				);
			}
		});

		it('should collect fee', async () => {
			let success = await custodianContract.collectFee.call(util.toWei(feeCollectAmtLess), {
				from: fc
			});

			assert.isTrue(success);
			let tx = await custodianContract.collectFee(util.toWei(feeCollectAmtLess), {
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
		});
	});

	describe('updateOracle', () => {
		let newOracleAddr = '0xdE8BDd2072D736Fc377e00b8483f5959162DE317';
		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
		});

		it('non operator cannot update oracle', async () => {
			try {
				await custodianContract.updateOracle.call(newOracleAddr, { from: alice });
				assert.isTrue(false, 'non operator can update address');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator cannot update not passed contract', async () => {
			try {
				await custodianContract.updateOracle.call(oracleContract.address, {
					from: creator
				});
				assert.isTrue(false, 'can update not passed contract');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator cannot update oracle whose lastPrice is not set', async () => {
			try {
				await roleManagerContract.setPassedContract(oracleContract.address);
				await custodianContract.updateOracle.call(oracleContract.address, {
					from: creator
				});
				assert.isTrue(false, 'can update non passed contract');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator can update Oracle', async () => {
			await roleManagerContract.setPassedContract(oracleContract.address);
			await oracleContract.setLastPrice(100, 100, pf1);
			let tx = await custodianContract.updateOracle(oracleContract.address, {
				from: creator
			});

			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_UPDATE_ORACLE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.newOracleAddress === oracleContract.address,
				'worng fee parameter'
			);
		});
	});

	describe('updateFeeCollector', () => {
		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
		});

		it('address not in pool cannot update fc', async () => {
			try {
				await custodianContract.updateFeeCollector.call({ from: alice });
				assert.isTrue(false, 'address not in pool can update address');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('hot address cannot update fc', async () => {
			try {
				await custodianContract.updateFeeCollector.call({ from: PoolInit[1][0] });
				assert.isTrue(false, 'hot address can update address');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cold address can update fc', async () => {
			let tx = await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			await roleManagerContract.skipCooldown(1);
			await custodianContract.skipCooldown(1);
			let firstColdAddr = PoolInit[0][0];
			let updator =
				tx.logs[0].args.newModerator.toLowerCase() === firstColdAddr.toLowerCase()
					? PoolInit[0][1]
					: firstColdAddr;
			let status = await custodianContract.updateFeeCollector.call({ from: updator });
			assert.isTrue(status, 'not be able to update');
		});
	});
});
