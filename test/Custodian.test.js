const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/common/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/oracles/MagiMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:' + process.env.GANACHE_PORT || '8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const MagiInit = InitParas['Magi'];
const PoolInit = InitParas['Pool'];

// Event
const TRANSFER = 'Transfer';
const APPROVAL = 'Approval';
const UPDATE_ORACLE = 'UpdateOracle';
const COLLECT_FEE = 'CollectFee';

const STATE_INCEPT_RESET = '0';
const STATE_TRADING = '1';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const DUMMY_ADDR = '0xc';


contract('Custodian', accounts => {
	let custodianContract, duoContract, roleManagerContract, oracleContract;

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
		duoContract = await DUO.new(
			web3.utils.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);

		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		custodianContract = await Custodian.new(
			duoContract.address,
			roleManagerContract.address,
			fc,
			BeethovenInit.comm,
			BeethovenInit.pd,
			BeethovenInit.preResetWaitBlk,
			BeethovenInit.pxFetchCoolDown,
			creator,
			BeethovenInit.optCoolDown,
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
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let fc = await custodianContract.feeCollector.call();
			assert.equal(fc.valueOf(), fc, 'feeCollector specified incorrect');
		});

		it('createCommInBP should equal specified value', async () => {
			let comm = await custodianContract.createCommInBP.call();
			assert.equal(comm.toNumber(), BeethovenInit.comm, 'createCommInBP specified incorrect');
		});

		it('redeemCommInBP should equal specified value', async () => {
			let comm = await custodianContract.redeemCommInBP.call();
			assert.equal(comm.toNumber(), BeethovenInit.comm, 'redeemCommInBP specified incorrect');
		});

		it('period should equal specified value', async () => {
			let pd = await custodianContract.period.call();
			assert.equal(pd.toNumber(), BeethovenInit.pd, 'period specified incorrect');
		});

		it('preResetWaitingBlks should equal specified value', async () => {
			let preResetWaitBlk = await custodianContract.preResetWaitingBlocks.call();
			assert.equal(
				preResetWaitBlk.toNumber(),
				BeethovenInit.preResetWaitBlk,
				'preResetWaitingBlks specified incorrect'
			);
		});

		it('priceFetchCoolDown should equal specified value', async () => {
			let pxFetchCoolDown = await custodianContract.priceFetchCoolDown.call();
			assert.equal(
				pxFetchCoolDown.toNumber(),
				BeethovenInit.pxFetchCoolDown,
				'pxFetchCoolDown specified incorrect'
			);
		});

		it('navA should equal specified value', async () => {
			let navAInWei = await custodianContract.navAInWei.call();
			assert.equal(
				web3.utils.fromWei(navAInWei.valueOf(), 'ether'),
				'1',
				'navAInWei specified incorrect'
			);
		});

		it('navB should equal specified value', async () => {
			let navBInWei = await custodianContract.navBInWei.call();
			assert.equal(
				web3.utils.fromWei(navBInWei.valueOf(), 'ether'),
				'1',
				'navBInWei specified incorrect'
			);
		});
	});

	describe('totalUsers', () => {
		before(initContracts);

		it('userLenght should be 0', async () => {
			let userSize = await custodianContract.totalUsers.call();
			assert.equal(userSize.toNumber(), 0, 'userLenght wrong');
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
				await custodianContract.mintTokens(
					alice,
					index,
					web3.utils.toWei(initialBalance, 'ether'),
					{
						from: creator
					}
				);
			});

			it('should in state trading', async () => {
				let state = await custodianContract.state.call();
				assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading');
			});

			it('should show balance', async () => {
				let balance = await custodianContract.balanceOf.call(index, alice);
				assert.isTrue(
					web3.utils.fromWei(balance.valueOf(), 'ether') === initialBalance,
					'balance of alice not shown'
				);
			});

			it('alice userIdx should be updated', async () => {
				let userIdx = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdx.toNumber() === 1, 'alice is not updated');
				let userSize = await custodianContract.totalUsers.call();
				assert.equal(userSize.toNumber(), 1, 'user size not updated correctly');
			});

			it('should be able to approve', async () => {
				let success = await custodianContract.approve.call(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei(approvalAmt + ''),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to approve');

				let tx = await custodianContract.approve(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei(approvalAmt, 'ether'),
					{
						from: alice
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === APPROVAL,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.tokenOwner.valueOf() === alice &&
						tx.logs[0].args.spender.valueOf() === bob &&
						tx.logs[0].args.tokens.valueOf() === web3.utils.toWei(approvalAmt + '') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('should show allowance', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.equal(
					web3.utils.fromWei(allowance.valueOf(), 'ether'),
					approvalAmt,
					'allowance of bob not equal to approvalAmt'
				);
			});

			it('dummy from address should not be used for approval', async () => {
				let dummyAllowance = await custodianContract.allowance.call(index, DUMMY_ADDR, bob);
				assert.equal(dummyAllowance.toNumber(), 0, 'dummy from address is used');
			});

			it('should be able to transfer', async () => {
				let success = await custodianContract.transfer.call(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei(transferAmt, 'ether'),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transfer(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei(transferAmt, 'ether'),
					{
						from: alice
					}
				);

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from.valueOf() === alice &&
						tx.logs[0].args.to.valueOf() === bob &&
						tx.logs[0].args.value.valueOf() ===
							web3.utils.toWei(transferAmt, 'ether') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('bob userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob userIdx is not updated');
				let userSize = await custodianContract.totalUsers.call();
				assert.equal(userSize.toNumber(), 2, 'user size not updated correctly');
			});

			it('should show balance of bob equal to transferAmt', async () => {
				let balance = await custodianContract.balanceOf.call(index, bob);
				assert.isTrue(
					web3.utils.fromWei(balance.valueOf(), 'ether') === transferAmt,
					'balance of bob not shown'
				);
			});

			it('dummy from address should not be used for transfer', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(balance.toNumber() === 0, 'dummy from address is used');
			});

			it('should not transfer more than balance', async () => {
				try {
					await custodianContract.transfer.call(
						index,
						DUMMY_ADDR,
						bob,
						web3.utils.toWei('10000000'),
						{
							from: alice
						}
					);

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
					index,
					DUMMY_ADDR,
					alice,
					charles,
					web3.utils.toWei(transferFromAmt),
					{ from: bob }
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transferFrom(
					index,
					DUMMY_ADDR,
					alice,
					charles,
					web3.utils.toWei(transferFromAmt, 'ether'),
					{
						from: bob
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from.valueOf() === alice &&
						tx.logs[0].args.to.valueOf() === charles &&
						tx.logs[0].args.value.valueOf() ===
							web3.utils.toWei(transferFromAmt, 'ether') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('charles userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob userIdx is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.isTrue(userIdxCharles.toNumber() === 3, 'charles userIdx is not updated');
				let userSize = await custodianContract.totalUsers.call();
				assert.equal(userSize.toNumber(), 3, 'user size not updated correctly');
			});

			it('dummy from address should not be used for transferFrom', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(balance.toNumber() === 0, 'dummy from address is used');
			});

			it('should not transferFrom more than allowance', async () => {
				try {
					await custodianContract.transferFrom.call(
						index,
						DUMMY_ADDR,
						alice,
						charles,
						web3.utils.toWei(transferFromAmt),
						{
							from: bob
						}
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

			it('allowance for bob should be updated', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.equal(
					Number(web3.utils.fromWei(allowance.valueOf(), 'ether')),
					Number(approvalAmt) - Number(transferFromAmt),
					'allowance of bob not correct'
				);
			});

			it('check balance of charles equal transferFromAmt', async () => {
				let balance = await custodianContract.balanceOf.call(index, charles);
				assert.equal(
					web3.utils.fromWei(balance.valueOf(), 'ether'),
					transferFromAmt,
					'balance of charles not correct'
				);
			});

			it('alice transfer all balance to david and update userIdx correctly', async () => {
				await custodianContract.mintTokens(
					alice,
					1 - index,
					web3.utils.toWei(initialBalance, 'ether')
				);
				let balanceA = await custodianContract.balanceOf.call(index, alice);
				let balanceB = await custodianContract.balanceOf.call(1 - index, alice);
				let userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 0, 'david is not updated');
				await custodianContract.transfer(index, alice, david, balanceA, {
					from: alice
				});
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 4, 'david is not updated');
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				await custodianContract.transfer(1 - index, alice, david, balanceB, {
					from: alice
				});

				userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 0, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.isTrue(userIdxCharles.toNumber() === 3, 'charles is not updated');
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 1, 'david is not updated');

				let userSize = await custodianContract.totalUsers.call();
				assert.equal(userSize.toNumber(), 3, 'user size not updated correctly');
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
		const initEthFee = '10';
		const ethFeeCollectAmtMore = '20';
		const ethFeeCollectAmtLess = '1';

		const initDuoFee = '10';
		const duoFeeCollectAmtMore = '20';
		const duoFeeCollectAmtLess = '1';
		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
			// await custodianContract.addEthFeeBalance(web3.utils.toWei(initEthFee, 'ether'), {
			// 	from: creator,
			// 	value: web3.utils.toWei(initEthFee, 'ether')
			// });
			await web3.eth.sendTransaction({from: creator, to: custodianContract.address, value: web3.utils.toWei(initEthFee, 'ether')});

			await duoContract.mintTokens(
				custodianContract.address,
				web3.utils.toWei(initDuoFee, 'ether')
			);
		});

		it('balance and fee should be set correct', async () => {
			let balance = await web3.eth.getBalance(custodianContract.address);
			let ethFee = await custodianContract.ethFeeBalanceInWei.call();
			let duoBalance = await duoContract.balanceOf(custodianContract.address);
			// console.log(balance.valueOf(), ethFee.valueOf(), duoBalance.valueOf());
			assert.isTrue(
				web3.utils.fromWei(balance.valueOf(), 'ether') === initEthFee &&
					web3.utils.fromWei(ethFee.valueOf(), 'ether') === initEthFee &&
					web3.utils.fromWei(duoBalance.valueOf(), 'ether') === initDuoFee,
				'balance not correct'
			);
		});

		it('only feeCollector is allowed to coolectFee', async () => {
			try {
				await custodianContract.collectEthFee.call(web3.utils.toWei('1'), { from: alice });
				assert.isTrue(false, 'non fc can withDrawFee');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'non fc can withdraw');
			}
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await custodianContract.collectEthFee.call(web3.utils.toWei(ethFeeCollectAmtMore), {
					from: fc
				});
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(
					err.message,
					VM_INVALID_OPCODE_MSG,
					'can collect fee more than allowed'
				);
			}
		});

		it('should collect eth fee', async () => {
			let success = await custodianContract.collectEthFee.call(
				web3.utils.toWei(ethFeeCollectAmtLess),
				{
					from: fc
				}
			);

			assert.isTrue(success);
			let tx = await custodianContract.collectEthFee(web3.utils.toWei(ethFeeCollectAmtLess), {
				from: fc
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COLLECT_FEE,
				'worng event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.addr.valueOf() === fc &&
					tx.logs[0].args.ethFeeInWei.valueOf() ===
						web3.utils.toWei(ethFeeCollectAmtLess) &&
					tx.logs[0].args.ethFeeBalanceInWei.valueOf() ===
						web3.utils.toWei((initEthFee - ethFeeCollectAmtLess).toString()) &&
					tx.logs[0].args.duoFeeInWei.toNumber() === 0 &&
					tx.logs[0].args.duoFeeBalanceInWei.valueOf() === web3.utils.toWei(initDuoFee),
				'worng fee parameter'
			);
		});

		it('only feeCollector is allowed to coolecDuotFee', async () => {
			try {
				await custodianContract.collectDuoFee.call(web3.utils.toWei('1'), { from: alice });
				assert.isTrue(false, 'non fc can withDrawFee');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'non fc can withdraw');
			}
		});

		it('should only collect duo fee less than allowed', async () => {
			try {
				await custodianContract.collectDuoFee.call(web3.utils.toWei(duoFeeCollectAmtMore), {
					from: fc
				});
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can collect fee more than allowed');
			}
		});

		it('should collect eth fee', async () => {
			let success = await custodianContract.collectDuoFee.call(
				web3.utils.toWei(duoFeeCollectAmtLess),
				{
					from: fc
				}
			);

			assert.isTrue(success);
			let tx = await custodianContract.collectDuoFee(web3.utils.toWei(duoFeeCollectAmtLess), {
				from: fc
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COLLECT_FEE,
				'worng event emitted'
			);

			assert.isTrue(
				tx.logs[0].args.addr.valueOf() === fc &&
					tx.logs[0].args.ethFeeInWei.valueOf() === '0' &&
					tx.logs[0].args.ethFeeBalanceInWei.valueOf() ===
						web3.utils.toWei((initEthFee - ethFeeCollectAmtLess).toString()) &&
					web3.utils.fromWei(tx.logs[0].args.duoFeeInWei.valueOf()) ===
						duoFeeCollectAmtLess &&
					tx.logs[0].args.duoFeeBalanceInWei.valueOf() ===
						web3.utils.toWei((initDuoFee - duoFeeCollectAmtLess).toString()),
				'worng fee parameter'
			);
		});
	});

	describe('updateOracle', () => {
		let newOracleAddr = '0x1111';
		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
		});

		it('none operator cannot update oracle', async () => {
			try {
				await custodianContract.updateOracle.call(newOracleAddr, { from: alice });
				assert.isTrue(false, 'non operator can update address');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator cannot update non passed contract', async () => {
			try {
				await custodianContract.updateOracle.call(oracleContract.address, {
					from: creator
				});
				assert.isTrue(false, 'can update non passed contract');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator cannot update oracle whose lastPrice is not set', async () => {
			try {
				await roleManagerContract.setPassedContract(oracleContract.address);
				assert.isTrue(
					await roleManagerContract.setPassedContract.call(oracleContract.address),
					'cannot set passedContract'
				);
				await custodianContract.updateOracle.call(oracleContract.address, {
					from: creator
				});

				assert.isTrue(false, 'can update non passed contract');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('operator can update Oracle', async () => {
			await roleManagerContract.setPassedContract(oracleContract.address);
			assert.isTrue(
				await roleManagerContract.setPassedContract.call(oracleContract.address),
				'cannot set passedContract'
			);
			await oracleContract.setLastPrice(100, 100, pf1);
			let tx = await custodianContract.updateOracle(oracleContract.address, {
				from: creator
			});

			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === UPDATE_ORACLE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.newOracleAddress.valueOf() === oracleContract.address,
				'worng fee parameter'
			);
		});
	});

	describe('updateFeeCollector', () => {
		before(async () => {
			await initContracts();
			await custodianContract.setState(1);
		});

		it('non allowed cold updator cannot update fc', async () => {
			try {
				await custodianContract.updateFeeCollector.call({ from: alice });
				assert.isTrue(false, 'non operator can update address');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cold updator can update fc', async () => {
			let tx = await roleManagerContract.addCustodian(custodianContract.address, { from: creator });
			await roleManagerContract.skipCooldown(1);
			await custodianContract.skipCooldown(1);
			let firstColdAddr = PoolInit[0][0];
			// console.log(tx.logs[0].args.currentModerator.valueOf().toLowerCase());
			let updator = tx.logs[0].args.newModerator.valueOf().toLowerCase() === firstColdAddr.toLowerCase() ? PoolInit[0][1]: firstColdAddr;
			let status = await custodianContract.updateFeeCollector.call({ from: updator });
			assert.isTrue(status, 'not be able to update');
		});
	});
});
