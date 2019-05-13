const Stake = artifacts.require('../contracts/mocks/StakeMock.sol');
const DUO = artifacts.require('../contracts/tokens/DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const CST = require('./constants');
const util = require('./util');

const InitParas = require('../migrations/contractInitParas.json');
const DuoInit = InitParas['DUO'];
const StakeInit = InitParas['Stake'];
const RoleManagerInit = InitParas['RoleManager'];

const EVENT_ADD_STAKE = 'AddStake';

contract.only('Stake', accounts => {
	let duoContract, stakeContract, roleManagerContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const pfList = [pf1,pf2,pf3];
	const nonPf = accounts[4];
	const operator = accounts[5];
	const alice = accounts[6];


	const initContracts = async () => {
		duoContract = await DUO.new(
			util.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);

		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});

		stakeContract = await Stake.new(
			duoContract.address,
			[pf1,pf2,pf3],
			StakeInit.minStakeTs,
			util.toWei(StakeInit.minStakeAmt),
			util.toWei(StakeInit.maxStakePerPf),
			roleManagerContract.address,
			operator,
			StakeInit.optCoolDown,
			{
				from: creator
			}
		);
	};

	describe('constructor', () => {
		before(initContracts);

		it('set pf correctly', async () => {
			for(const pf of pfList){
				let isPf = await stakeContract.isWhiteListCommitter.call(pf);
				assert.isTrue(isPf, 'pf not set correctly');
			}
		});

		it('non pf should be set false', async () => {
			const isPf = await stakeContract.isWhiteListCommitter.call(nonPf);
			assert.isFalse(isPf, 'non pf address not set as false');
		});

		it('duo token address should be set correctly', async () => {
			const duoTokenAddress = await stakeContract.duoTokenAddress.call();
			assert.isTrue(duoTokenAddress.valueOf() === duoContract.address, 'duo token address not updated correctly');
			
		});

		it('lockMinTime should be set correctly', async () => {
			const lockMinTimeInSecond = await stakeContract.lockMinTimeInSecond.call();
			assert.isTrue(util.isEqual(lockMinTimeInSecond.valueOf(), StakeInit.minStakeTs), 'lockMinTime not updated correctly');
		});

		it("openForStake should be set correctly", async () => {
			const openForStake = await stakeContract.openForStake.call();
			assert.isFalse(openForStake.valueOf(), 'openForStake not updated correctly');
		});

		it('minStakeAmt should be set correctly', async () => {
			const minStakeAmtInWei = await stakeContract.minStakeAmtInWei.call();
			assert.isTrue(util.isEqual(util.fromWei(minStakeAmtInWei.valueOf()), StakeInit.minStakeAmt), 'minStakeAmt not updated correctly');
		});

		it('stakePerPf should be set correctly', async () => {
			const maxStakePerPfInWei = await stakeContract.maxStakePerPfInWei.call();
			assert.isTrue(util.isEqual(util.fromWei(maxStakePerPfInWei.valueOf()), StakeInit.maxStakePerPf), 'stakePerPf not updated correctly');
		});

		it('roleManagerAddress should be set correctly', async () => {
			const roleManagerAddress = await stakeContract.roleManagerAddress.call();
			assert.isTrue(roleManagerAddress.valueOf() === roleManagerContract.address, 'roleManagerAddress not updated correctly');		
		});

		it('operator address should be set correctly', async () => {
			const operator = await stakeContract.operator.call();
			assert.isTrue(operator.valueOf() === operator, 'operator not updated correctly');		

		});

		it('operation cooldown should be set correctly', async () => {
			const operationCoolDown = await stakeContract.operationCoolDown.call();
			assert.isTrue(util.isEqual(operationCoolDown.valueOf(), StakeInit.optCoolDown), 'operationCoolDown not updated correctly');
		});
	});

	describe.only('addStake', () => {
		beforeEach(async () => {
			await initContracts();
			await duoContract.transfer(alice, util.toWei(400000), {from: creator});
			await duoContract.approve(stakeContract.address, util.toWei(400000), {from: alice});
		});

		it('cannot stake when contract state not open', async () => {
			try {
				await stakeContract.addStake(pf1, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake when contract is not open');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cannot stake for non pf address', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			try {
				await stakeContract.addStake(nonPf, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can addStake for non pf address');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cannot stake less than minStakeAmt', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			try {
				await stakeContract.addStake(pf1, util.toWei(50), {
					from: alice
				});
				assert.isTrue(false, 'can  stake less than minStakeAmt');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cannot stake without approving for DUO token trafer', async () => {
			await duoContract.approve(stakeContract.address, 0, {from: alice});
			await stakeContract.toggleIsOpen({from: operator});
			try {
				await stakeContract.addStake(pf1, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake without approving for DUO token trafer');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('cannot stake more than DUO token balance', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			try {
				await stakeContract.addStake(pf1, util.toWei(400001), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than DUO token balance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('can addStake', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			let tx = await stakeContract.addStake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_ADD_STAKE, 'log events incorrect');

			assert.isTrue( 
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) && 
				util.isEqual(tx.logs[0].args.pf.valueOf(), pf1) && 
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				"event logs not emitted correctly"
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 1) && 
				util.isEqual(queIdx.last.valueOf(), 1),
				"queueIndex not updated correctly"
			);
			
		});

		it('each pf address cannot receive stake more than maxStakePerPf', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			await stakeContract.addStake(pf1, util.toWei(1000), {
				from: alice
			});

			try {
				await stakeContract.addStake(pf1, util.toWei(200000), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than maxStakePerPf');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
			}
		});

		it('can addStake second time', async () => {
			await stakeContract.toggleIsOpen({from: operator});
			await stakeContract.addStake(pf1, util.toWei(1000), {
				from: alice
			});
			const tx = await stakeContract.addStake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_ADD_STAKE, 'log events incorrect');

			assert.isTrue( 
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) && 
				util.isEqual(tx.logs[0].args.pf.valueOf(), pf1) && 
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				"event logs not emitted correctly"
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 1) && 
				util.isEqual(queIdx.last.valueOf(), 2),
				"queueIndex not updated correctly"
			);
			
		});


	});

	// describe('unStake', () => {
	// 	before(initContracts);

	// 	it('cannot unStake without previously staking', async () => {
	// 		// TODO
	// 	});

	// 	it('cannot unstake within locking period', async () => {
	// 		// TODO
	// 	});


	// 	it('can unStake', async () => {
	// 		// TODO
	// 		// update first correctly
	// 		// totalStakereceivedFor Pf is updated correctly
	// 		// DUO token balance should be updated correctly
	// 		// event should be emitted correctly
	// 	});

	// });

});
