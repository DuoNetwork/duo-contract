const Stake = artifacts.require('../contracts/mocks/StakeMock.sol');
const DUO = artifacts.require('../contracts/tokens/DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
// const CST = require('./constants');
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
	// const alice = accounts[5];


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
			creator,
			roleManagerContract.address,
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

		it('roleManagerAddress should be set correctly', async () => {
			// TODO
		});

		it('operator address should be set correctly', async () => {
			// TODO
		});

		it('operation cooldown should be set correctly', async () => {
			// TODO
		});
	});

	describe('addStake', () => {
		before(initContracts);

		it('cannot stake for non pf address', async () => {
			// TODO
		// 	try {
		// 		await stakeContract.stake(pf1, util.toWei(50), {
		// 			from: alice
		// 		});
		// 		assert.isTrue(false, 'can stake more than balance');
		// 	} catch (err) {
		// 		assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
		// 	}
		});

		it('cannot stake less than minStakeAmt', async () => {
			// TODO
		// 	try {
		// 		await stakeContract.stake(nonPf, util.toWei(50), {
		// 			from: creator
		// 		});
		// 		assert.isTrue(false, 'can stake to not whitelisted addr');
		// 	} catch (err) {
		// 		assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
		// 	}
		});

		it('each pf address cannot receive stake more than maxStakePerPf', async () => {
			// TODO
		});

		it('cannot stake without approving for DUO token trafer', async () => {
			// TODO
		});

		it('cannot stake more than DUO token balance', async () => {
			// TODO
		});

		it('can addStake', async () => {
			await duoContract.approve(stakeContract.address, util.toWei(1000));
			
			let tx = await stakeContract.addStake(pf1, util.toWei(500), {
				from: creator
			});
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_ADD_STAKE, 'log events incorrect');


			const queIdx = await stakeContract.userQueueIdx.call(creator);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 0) && 
				util.isEqual(queIdx.last.valueOf(), 1),
				"queueIndex not updated correctly"
			);
			
		});

	});

	describe('unStake', () => {
		before(initContracts);

		it('cannot unStake without previously staking', async () => {
			// TODO
		});

		it('cannot unstake within locking period', async () => {
			// TODO
		});


		it('can unStake', async () => {
			// TODO
			// update first correctly
			// totalStakereceivedFor Pf is updated correctly
			// DUO token balance should be updated correctly
			// event should be emitted correctly
		});

	});

});
