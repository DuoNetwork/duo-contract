const Stake = artifacts.require('../contracts/POS/Stake.sol');
const DUO = artifacts.require('../contracts/tokens/DUO.sol');
// const CST = require('./constants');
const util = require('./util');

const InitParas = require('../migrations/contractInitParas.json');
const DuoInit = InitParas['DUO'];
const StakeInit = InitParas['Stake'];

const EVENT_ADD_STAKE = 'AddStake';

contract.only('Stake', accounts => {
	let duoContract, stakeContract;

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

		stakeContract = await Stake.new(
			duoContract.address,
			[pf1,pf2,pf3],
			StakeInit.minStakeTs,
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
				assert.isTrue(isPf);
			}
		});

		it('non pf should be set false', async () => {
			const isPf = await stakeContract.isWhiteListCommitter.call(nonPf);
			assert.isFalse(isPf);
		});
	});

	describe('addStake', () => {
		before(initContracts);

		// it('cannot stake more than  balance', async () => {
		// 	try {
		// 		await stakeContract.stake(pf1, util.toWei(50), {
		// 			from: alice
		// 		});
		// 		assert.isTrue(false, 'can stake more than balance');
		// 	} catch (err) {
		// 		assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
		// 	}
		// });

		// it('cannot stake to not whitelisted addr', async () => {
		// 	try {
		// 		await stakeContract.stake(nonPf, util.toWei(50), {
		// 			from: creator
		// 		});
		// 		assert.isTrue(false, 'can stake to not whitelisted addr');
		// 	} catch (err) {
		// 		assert.equal(err.message, CST.VM_REVERT_MSG, 'transaction not reverted');
		// 	}
		// });

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

});
