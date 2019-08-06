const Stake = artifacts.require('../contracts/mocks/StakeV2Mock.sol');
const DUO = artifacts.require('../contracts/tokens/DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Custodian = artifacts.require('../contracts/mocks/CustodianMock.sol');
const CST = require('./constants');
const util = require('./util');

const InitParas = require('../migrations/contractInitParas.json');
const Pool = InitParas['Pool'];
const BeethovenInit = InitParas['BTV']['PPT'];
const DuoInit = InitParas['DUO'];
const StakeInit = InitParas['Stake'];
const RoleManagerInit = InitParas['RoleManager'];

const EVENT_STAKE = 'AddStake';
const EVENT_UNSTAKE = 'Unstake';
const EVENT_CLAIM_Reward = 'ClaimReward';
const EVENT_UPDATE_UPLOADER = 'UpdateUploader';
const EVENT_COMMIT_ADD_REWARD = 'CommitAddReward';
const EVENT_COMMIT_REDUCE_REWARD = 'CommitReduceReward';

contract('StakeV2', accounts => {
	let duoContract, stakeContract, roleManagerContract, custodianContracct;
	let validHotPool = Pool[1].map(addr => util.toChecksumAddress(addr));

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const pfList = [pf1, pf2, pf3];
	const nonPf = accounts[4];
	const operator = accounts[5];
	const uploader = accounts[6];
	const alice = accounts[7];
	const bob = accounts[8];
	const fc = accounts[9];
	const newModerator = accounts[10];
	const duoBurnAddr = accounts[11];

	const initCustodian = async () => {
		custodianContracct = await Custodian.new(
			'contract code',
			0,
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
	};

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
			StakeInit.duoBurnAddr,
			[pf1, pf2, pf3],
			StakeInit.minStakeTs,
			util.toWei(StakeInit.minStakeAmt),
			util.toWei(StakeInit.maxStakePerPf),
			roleManagerContract.address,
			operator,
			uploader,
			StakeInit.optCoolDown,
			{
				from: creator
			}
		);
	};

	describe('constructor', () => {
		before(initContracts);

		it('set pf correctly', async () => {
			for (const pf of pfList) {
				const isPf = await stakeContract.isWhiteListOracle.call(pf);
				assert.isTrue(isPf, 'pf not set correctly');
			}
		});

		it('non pf should be set false', async () => {
			const isPf = await stakeContract.isWhiteListOracle.call(nonPf);
			assert.isFalse(isPf, 'non pf address not set as false');
		});

		it('duo token address should be set correctly', async () => {
			const duoTokenAddress = await stakeContract.duoTokenAddress.call();
			assert.isTrue(
				duoTokenAddress.valueOf() === duoContract.address,
				'duo token address not updated correctly'
			);
		});

		it('duoBurnAddr address should be set correctly', async () => {
			const burnAddress = await stakeContract.burnAddress.call();
			assert.isTrue(
				burnAddress.valueOf() === StakeInit.duoBurnAddr,
				'duoBurnAddr not updated correctly'
			);
		});

		it('lockMinTime should be set correctly', async () => {
			const lockMinTimeInSecond = await stakeContract.lockMinTimeInSecond.call();
			assert.isTrue(
				util.isEqual(lockMinTimeInSecond.valueOf(), StakeInit.minStakeTs),
				'lockMinTime not updated correctly'
			);
		});

		it('stakingEnabled should be set correctly', async () => {
			const stakingEnabled = await stakeContract.stakingEnabled.call();
			assert.isFalse(stakingEnabled.valueOf(), 'canUnstake not updated correctly');
		});

		it('minStakeAmt should be set correctly', async () => {
			const minStakeAmtInWei = await stakeContract.minStakeAmtInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(minStakeAmtInWei.valueOf()), StakeInit.minStakeAmt),
				'minStakeAmt not updated correctly'
			);
		});

		it('stakePerPf should be set correctly', async () => {
			const maxOracleStakeAmtInWei = await stakeContract.maxOracleStakeAmtInWei.call();
			assert.isTrue(
				util.isEqual(
					util.fromWei(maxOracleStakeAmtInWei.valueOf()),
					StakeInit.maxStakePerPf
				),
				'stakePerPf not updated correctly'
			);
		});

		it('roleManagerAddress should be set correctly', async () => {
			const roleManagerAddress = await stakeContract.roleManagerAddress.call();
			assert.isTrue(
				roleManagerAddress.valueOf() === roleManagerContract.address,
				'roleManagerAddress not updated correctly'
			);
		});

		it('operator address should be set correctly', async () => {
			const operator = await stakeContract.operator.call();
			assert.isTrue(operator.valueOf() === operator, 'operator not updated correctly');
		});

		it('uploader address should be set correctly', async () => {
			const uploader = await stakeContract.uploader.call();
			assert.isTrue(uploader.valueOf() === uploader, 'uploader not updated correctly');
		});

		it('operation cooldown should be set correctly', async () => {
			const operationCoolDown = await stakeContract.operationCoolDown.call();
			assert.isTrue(
				util.isEqual(operationCoolDown.valueOf(), StakeInit.optCoolDown),
				'operationCoolDown not updated correctly'
			);
		});
	});

	describe('stake', () => {
		beforeEach(async () => {
			await initContracts();
			await duoContract.transfer(alice, util.toWei(400000), { from: creator });
			await duoContract.approve(stakeContract.address, util.toWei(400000), { from: alice });
		});

		it('cannot stake when contract state not open', async () => {
			try {
				await stakeContract.stake(pf1, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake when contract is not open');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingNotEnabled,
					'transaction not reverted'
				);
			}
		});

		it('cannot stake for non pf address', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.stake(nonPf, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake for non pf address');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.notWhiteListOracle,
					'transaction not reverted'
				);
			}
		});

		it('cannot stake less than minStakeAmt', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.stake(pf1, util.toWei(50), {
					from: alice
				});
				assert.isTrue(false, 'can  stake less than minStakeAmt');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakeLessThanMinAmt,
					'transaction not reverted'
				);
			}
		});

		it('cannot stake without approving for DUO token trafer', async () => {
			await duoContract.approve(stakeContract.address, 0, { from: alice });
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.stake(pf1, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake without approving for DUO token trafer');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('cannot stake more than DUO token balance', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.stake(pf1, util.toWei(400001), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than DUO token balance');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.exceedingMaxStakeAmt,
					'transaction not reverted'
				);
			}
		});

		it('can stake', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			const tx = await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_STAKE,
				'log events incorrect'
			);

			assert.isTrue(
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) &&
				util.isEqual(tx.logs[0].args.oracle.valueOf(), pf1) &&
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				'event logs not emitted correctly'
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue(
				util.isEqual(queIdx.first.valueOf(), 1) && util.isEqual(queIdx.last.valueOf(), 1),
				'queueIndex not updated correctly'
			);

			const queueStake = await stakeContract.userStakeQueue.call(alice, pf1, 1);
			assert.isTrue(
				util.isEqual(util.fromWei(queueStake.amtInWei), 1000),
				'stakequeue not updated correctly'
			);

			const userSize = await stakeContract.getUserSize.call();
			assert.equal(userSize.valueOf(), 1, 'userLenght wrong');
		});

		it('each pf address cannot receive stake more than maxStakePerPf', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});

			try {
				await stakeContract.stake(pf1, util.toWei(200000), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than maxStakePerPf');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.exceedingMaxStakeAmt,
					'transaction not reverted'
				);
			}
		});

		it('can stake second time', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			const tx = await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_STAKE,
				'log events incorrect'
			);

			assert.isTrue(
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) &&
				util.isEqual(tx.logs[0].args.oracle.valueOf(), pf1) &&
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				'event logs not emitted correctly'
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue(
				util.isEqual(queIdx.first.valueOf(), 1) && util.isEqual(queIdx.last.valueOf(), 2),
				'queueIndex not updated correctly'
			);
		});
	});

	describe('unstake', () => {
		beforeEach(async () => {
			await initContracts();
			await duoContract.transfer(alice, util.toWei(StakeInit.maxStakePerPf * 2), {
				from: creator
			});
			await duoContract.approve(
				stakeContract.address,
				util.toWei(StakeInit.maxStakePerPf * 2),
				{ from: alice }
			);
			await stakeContract.setStakeFlag(true, { from: operator });
		});

		it('cannot unstake with burnAddress not set', async () => {
			await stakeContract.stake(pf1, util.toWei(StakeInit.minStakeAmt * 2), {
				from: alice
			});
			await stakeContract.setStakeFlag(false, { from: operator });
			try {
				await stakeContract.unstake(pf1, {
					from: alice
				});
				assert.isTrue(false, 'can unstake within locking period');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingNotEnabled,
					'transaction not reverted'
				);
			}
		});

		it('cannot unstake within locking period', async () => {
			await stakeContract.setBurnAddress(pf1, {
				from: operator
			});
			await stakeContract.stake(pf1, util.toWei(StakeInit.minStakeAmt * 2), {
				from: alice
			});
			await stakeContract.setStakeFlag(false, { from: operator });
			try {
				await stakeContract.unstake(pf1, {
					from: alice
				});
				assert.isTrue(false, 'can unstake within locking period');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingNotEnabled,
					'transaction not reverted'
				);
			}
		});

		it('cannot unStake without previously staking', async () => {
			await stakeContract.setBurnAddress(pf1, {
				from: operator
			});
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(
				currentTs.toNumber() + Number(StakeInit.minStakeTs) + 15 * 60
			);

			try {
				await stakeContract.unstake(pf1, {
					from: alice
				});
				assert.isTrue(false, 'can unstake without previously staking');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingNotEnabled,
					'transaction not reverted'
				);
			}
		});

		it('can unStake', async () => {
			await stakeContract.stake(pf1, util.toWei(StakeInit.minStakeAmt * 2), {
				from: alice
			});
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(
				currentTs.toNumber() + Number(StakeInit.minStakeTs) + 15 * 60
			);
			const tx = await stakeContract.unstake(pf1, {
				from: alice
			});

			assert.isTrue(tx.logs.length === 1 && tx.logs[0].event === EVENT_UNSTAKE);
			const eventArgs = tx.logs[0].args;
			assert.isTrue(
				eventArgs.from === alice &&
				eventArgs.oracle === pf1 &&
				util.isEqual(util.fromWei(eventArgs.amtInWei), StakeInit.minStakeAmt * 2),
				'event args wrong'
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue(
				util.isEqual(queIdx.first.valueOf(), 2) && util.isEqual(queIdx.last.valueOf(), 1),
				'queueIndex not updated correctly'
			);

			const totalStakeInWei = await stakeContract.totalStakeInWei.call(pf1);
			assert.isTrue(
				util.isEqual(util.fromWei(totalStakeInWei.valueOf()), 0),
				'totalStakereceived updated wrongly'
			);

			const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(
				util.isEqual(util.fromWei(contractDuoBalance.valueOf()), 0),
				'contractDuoBalance updated wrongly'
			);

			const userSize = await stakeContract.getUserSize.call();
			assert.equal(userSize.valueOf(), 0, 'userLenght wrong');
		});
	});

	describe('stageAddRewards', () => {
		beforeEach(async () => {
			await initContracts();
			await stakeContract.setStakeFlag(true, { from: operator });
		});

		it('should not add empty reward list', async () => {
			try {
				await stakeContract.stageAddRewards([], [], {
					from: uploader
				});
				assert.isTrue(false, 'can add empty reward list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.inputParasWrong,
					'transaction not reverted'
				);
			}
		});

		it('should not non equal reward and addr list', async () => {
			try {
				await stakeContract.stageAddRewards([alice, bob], [util.toWei(20)], {
					from: uploader
				});
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.inputParasWrong,
					'transaction not reverted'
				);
			}
		});

		it('non uploader cannot batchAddReward', async () => {
			try {
				await stakeContract.stageAddRewards(
					[alice, bob],
					[util.toWei(20), util.toWei(30)],
					{
						from: alice
					}
				);
				assert.isTrue(false, 'non uploader can batchAddReward');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should stageAddRewards', async () => {
			const addrList = [alice, bob];
			const RewardList = [util.toWei(100), util.toWei(200)];
			await stakeContract.stageAddRewards(addrList, RewardList, {
				from: uploader
			});

			const addRewardStagingIdx = await stakeContract.addRewardStagingIdx.call();

			assert.isTrue(
				util.isEqual(addRewardStagingIdx.first, 1) &&
				util.isEqual(addRewardStagingIdx.last, 2),
				'staging add reward pointer not set correctly'
			);

			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = RewardList[i];
				const userReward = await stakeContract.addRewardStagingList.call(
					Number(addRewardStagingIdx.first) + i
				);

				assert.isTrue(
					userReward.user === addr &&
					util.isEqual(
						util.fromWei(userReward.amtInWei.valueOf()),
						util.fromWei(reward)
					),

					'reward updated wrongly'
				);
			}
		});
	});

	describe('stageReduceRewards', () => {
		beforeEach(async () => {
			await initContracts();
			await stakeContract.setStakeFlag(true, { from: operator });
		});

		it('should not add empty reward list', async () => {
			try {
				await stakeContract.stageReduceRewards([], [], {
					from: uploader
				});
				assert.isTrue(false, 'can add empty reward list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.inputParasWrong,
					'transaction not reverted'
				);
			}
		});

		it('should not non equal reward and addr list', async () => {
			try {
				await stakeContract.stageReduceRewards([alice, bob], [util.toWei(20)], {
					from: uploader
				});
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.inputParasWrong,
					'transaction not reverted'
				);
			}
		});

		it('non uploader cannot batchAddReward', async () => {
			try {
				await stakeContract.stageReduceRewards(
					[alice, bob],
					[util.toWei(20), util.toWei(30)],
					{
						from: alice
					}
				);
				assert.isTrue(false, 'non uploader can batchAddReward');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should stageReduceRewards', async () => {
			const addrList = [alice, bob];
			const RewardList = [util.toWei(100), util.toWei(200)];
			await stakeContract.stageReduceRewards(addrList, RewardList, {
				from: uploader
			});

			const reduceRewardStagingIdx = await stakeContract.reduceRewardStagingIdx.call();

			assert.isTrue(
				util.isEqual(reduceRewardStagingIdx.first, 1) &&
				util.isEqual(reduceRewardStagingIdx.last, 2),
				'staging reduce reward pointer not set correctly'
			);

			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = RewardList[i];
				const userReward = await stakeContract.reduceRewardStagingList.call(
					Number(reduceRewardStagingIdx.first) + i
				);

				assert.isTrue(
					userReward.user === addr &&
					util.isEqual(
						util.fromWei(userReward.amtInWei.valueOf()),
						util.fromWei(reward)
					),

					'reward updated wrongly'
				);
			}
		});
	});

	describe('commitAddRewards', () => {
		const addrList = [alice, bob];
		const addRewardList = [100, 200];
		const INITIAL_BALANCE_OF_OPT = 10000;
		beforeEach(async () => {
			await initContracts();
			await duoContract.approve(stakeContract.address, util.toWei(1000000), {
				from: operator
			});
			await duoContract.transfer(operator, util.toWei(INITIAL_BALANCE_OF_OPT), {
				from: creator
			});
			await stakeContract.setStakeFlag(false, { from: operator });

			// const reduceRewardList = [util.toWei(10), util.toWei(20)];
			await stakeContract.stageAddRewards(
				addrList,
				addRewardList.map(val => util.toWei(val)),
				{
					from: uploader
				}
			);

			// await stakeContract.stageReduceRewards(addrList, reduceRewardList, {
			// 	from: uploader
			// });
		});

		it('should not commitAddReward when staking enabled', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.commitAddRewards(0, { from: operator });
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingIsEnabled,
					'transaction not reverted'
				);
			}
		});

		it('should not commitAddReward if there is not enough duo allowance', async () => {
			await duoContract.approve(stakeContract.address, util.toWei(0), { from: operator });
			try {
				await stakeContract.commitAddRewards(0, { from: operator });
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should not commitAddReward if there is not enough duo balance', async () => {
			await duoContract.transfer(creator, util.toWei(10000), { from: operator });
			try {
				await stakeContract.commitAddRewards(0, { from: operator });
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		const checkAllCommit = async tx => {
			// rewardsInWei set correctly
			let totalRewwards = 0;
			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = addRewardList[i];
				const userReward = await stakeContract.rewardsInWei.call(addr);
				totalRewwards += Number(util.fromWei(userReward.valueOf()));
				assert.isTrue(
					util.isEqual(util.fromWei(userReward.valueOf()), reward),
					'reward updated wrongly'
				);
			}

			// staging queue is reset
			const addRewardStagingIdx = await stakeContract.addRewardStagingIdx.call();
			assert.isTrue(
				util.isEqual(addRewardStagingIdx.first, 0) &&
				util.isEqual(addRewardStagingIdx.last, 0),
				'staging add reward pointer not set correctly'
			);

			// duo balance updated correctly
			const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(
				util.isEqual(util.fromWei(contractDuoBalance), totalRewwards),
				'contractDuoBalance updated wrongly'
			);
			const operatorDuoBalance = await duoContract.balanceOf.call(operator);
			assert.isTrue(
				util.isEqual(
					util.fromWei(operatorDuoBalance),
					INITIAL_BALANCE_OF_OPT - totalRewwards
				),
				'operatorDuoBalance updated wrongly'
			);

			// check log
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_ADD_REWARD,
				'log events incorrect'
			);
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()), totalRewwards),
				'event logs not emitted correctly'
			);
		};

		it('should commitAddReward, 0', async () => {
			const tx = await stakeContract.commitAddRewards(0, { from: operator });
			await checkAllCommit(tx);
		});

		it('should commitAddReward, more than all', async () => {
			const tx = await stakeContract.commitAddRewards(addrList.length + 1, { from: operator });
			await checkAllCommit(tx);
		});

		it('should commitAddReward, one by one', async () => {
			let totalRewwards = 0;
			let pointer = 1;
			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = addRewardList[i];

				const tx = await stakeContract.commitAddRewards(1, { from: operator });
				const userReward = await stakeContract.rewardsInWei.call(addr);
				totalRewwards += Number(util.fromWei(userReward.valueOf()));
				assert.isTrue(
					util.isEqual(util.fromWei(userReward.valueOf()), reward),
					'reward updated wrongly'
				);

				// staging queue pointer should be updated correctly
				const addRewardStagingIdx = await stakeContract.addRewardStagingIdx.call();
				assert.isTrue(
					util.isEqual(
						addRewardStagingIdx.first,
						i === addrList.length - 1 ? 0 : ++pointer
					) &&
					util.isEqual(
						addRewardStagingIdx.last,
						i === addrList.length - 1 ? 0 : addrList.length
					),
					'staging add reward pointer not set correctly'
				);

				// duo balance updated correctly
				const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
				assert.isTrue(
					util.isEqual(util.fromWei(contractDuoBalance), totalRewwards),
					'contractDuoBalance updated wrongly'
				);
				const operatorDuoBalance = await duoContract.balanceOf.call(operator);
				assert.isTrue(
					util.isEqual(
						util.fromWei(operatorDuoBalance),
						INITIAL_BALANCE_OF_OPT - totalRewwards
					),
					'operatorDuoBalance updated wrongly'
				);

				// check log
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_ADD_REWARD,
					'log events incorrect'
				);
				assert.isTrue(
					util.isEqual(util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()), reward),
					'event logs not emitted correctly'
				);
			}
		});
	});

	describe('commitReduceRewards', () => {
		const addrList = [alice, bob];
		const addRewardList = [100, 200];
		const reduceRewardList = [100, 200];
		const INITIAL_BALANCE_OF_OPT = 10000;
		const INITIAL_ADDED_RewardS = addRewardList.reduce(
			(current, accumulator) => current + accumulator
		);
		beforeEach(async () => {
			await initContracts();
			await duoContract.approve(stakeContract.address, util.toWei(1000000), {
				from: operator
			});
			await duoContract.transfer(operator, util.toWei(INITIAL_BALANCE_OF_OPT), {
				from: creator
			});
			await stakeContract.setStakeFlag(false, { from: operator });

			await stakeContract.stageAddRewards(
				addrList,
				addRewardList.map(value => util.toWei(value)),
				{
					from: uploader
				}
			);
			await stakeContract.stageReduceRewards(
				addrList,
				reduceRewardList.map(value => util.toWei(value)),
				{
					from: uploader
				}
			);
			await stakeContract.commitAddRewards(0, { from: operator });
		});

		it('should not commitReduceReward when staking enabled', async () => {
			await stakeContract.setStakeFlag(true, { from: operator });
			try {
				await stakeContract.commitReduceRewards(0, { from: operator });
				assert.isTrue(false, 'can add non equal reward and addr list');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingIsEnabled,
					'transaction not reverted'
				);
			}
		});

		const checkAllCommit = async tx => {
			// rewardsInWei set correctly
			let totalRewwards = 0;
			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = addRewardList[i];
				const userReward = await stakeContract.rewardsInWei.call(addr);
				totalRewwards += reward;
				assert.isTrue(
					util.isEqual(util.fromWei(userReward.valueOf()), addRewardList[i] - reward),
					'reward updated wrongly'
				);
			}

			// staging queue is reset
			const reduceRewardStagingIdx = await stakeContract.reduceRewardStagingIdx.call();
			assert.isTrue(
				util.isEqual(reduceRewardStagingIdx.first, 0) &&
				util.isEqual(reduceRewardStagingIdx.last, 0),
				'staging add reward pointer not set correctly'
			);

			// duo balance updated correctly
			const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(
				util.isEqual(
					util.fromWei(contractDuoBalance),
					INITIAL_ADDED_RewardS - totalRewwards
				),
				'contractDuoBalance updated wrongly'
			);
			const operatorDuoBalance = await duoContract.balanceOf.call(operator);
			assert.isTrue(
				util.isEqual(
					util.fromWei(operatorDuoBalance),
					INITIAL_BALANCE_OF_OPT - INITIAL_ADDED_RewardS + totalRewwards
				),
				'operatorDuoBalance updated wrongly'
			);

			// check log
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_REDUCE_REWARD,
				'log events incorrect'
			);
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()), totalRewwards),
				'event logs not emitted correctly'
			);
		};

		it('should commitReduceReward, 0', async () => {
			const tx = await stakeContract.commitReduceRewards(0, { from: operator });
			await checkAllCommit(tx);
		});

		it('should commitReduceReward, more than all', async () => {
			const tx = await stakeContract.commitReduceRewards(reduceRewardList.length + 1, {
				from: operator
			});
			await checkAllCommit(tx);
		});

		it('should commitReduceReward, one by one', async () => {
			let totalRewwards = 0;
			let pointer = 1;
			for (let i = 0; i < addrList.length; i++) {
				const addr = addrList[i];
				const reward = reduceRewardList[i];

				const tx = await stakeContract.commitReduceRewards(1, { from: operator });
				const userReward = await stakeContract.rewardsInWei.call(addr);
				totalRewwards += reward;
				assert.isTrue(
					util.isEqual(util.fromWei(userReward.valueOf()), addRewardList[i] - reward),
					'reward updated wrongly'
				);

				// staging queue pointer should be updated correctly
				const reduceRewardStagingIdx = await stakeContract.reduceRewardStagingIdx.call();
				assert.isTrue(
					util.isEqual(
						reduceRewardStagingIdx.first,
						i === addrList.length - 1 ? 0 : ++pointer
					) &&
					util.isEqual(
						reduceRewardStagingIdx.last,
						i === addrList.length - 1 ? 0 : addrList.length
					),
					'staging add reward pointer not set correctly'
				);

				// duo balance updated correctly
				const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
				assert.isTrue(
					util.isEqual(
						util.fromWei(contractDuoBalance),
						INITIAL_ADDED_RewardS - totalRewwards
					),
					'contractDuoBalance updated wrongly'
				);
				const operatorDuoBalance = await duoContract.balanceOf.call(operator);
				assert.isTrue(
					util.isEqual(
						util.fromWei(operatorDuoBalance),
						INITIAL_BALANCE_OF_OPT - INITIAL_ADDED_RewardS + totalRewwards
					),
					'operatorDuoBalance updated wrongly'
				);

				// check log
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_REDUCE_REWARD,
					'log events incorrect'
				);
				assert.isTrue(
					util.isEqual(util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()), reward),
					'event logs not emitted correctly'
				);
			}
		});
	});

	describe('resetStagingRewards', () => {
		const addrList = [alice, bob];
		const addRewardList = [100, 200];
		const INITIAL_BALANCE_OF_OPT = 10000;

		beforeEach(async () => {
			await initContracts();
			await duoContract.approve(stakeContract.address, util.toWei(1000000), {
				from: operator
			});
			await duoContract.transfer(operator, util.toWei(INITIAL_BALANCE_OF_OPT), {
				from: creator
			});
			await stakeContract.setStakeFlag(false, { from: operator });

			// const reduceRewardList = [util.toWei(10), util.toWei(20)];
			await stakeContract.stageAddRewards(
				addrList,
				addRewardList.map(val => util.toWei(val)),
				{
					from: uploader
				}
			);
		});

		it('non operator should not reset staging Rewards', async () => {
			try {
				await stakeContract.commitAddRewards(0, { from: uploader });
				assert.isTrue(false, 'none operator can reset staging rewards');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should reset staging rewards', async () => {
			await stakeContract.resetStagingAwards({ from: operator });

			const addRewardStagingIdx = await stakeContract.addRewardStagingIdx.call();
			const reduceRewardStagingIdx = await stakeContract.reduceRewardStagingIdx.call();
			assert.isTrue(
				util.isEqual(addRewardStagingIdx.first, 0) &&
				util.isEqual(addRewardStagingIdx.last, 0) &&
				util.isEqual(reduceRewardStagingIdx.first, 0) &&
				util.isEqual(reduceRewardStagingIdx.last, 0),
				'staging add reward pointer not set correctly'
			);
		});
	});

	describe('autoroll', () => {
		const addrList = [alice, bob];
		const addRewardList = [100, 200];
		const INITIAL_ADDED_RewardS = addRewardList.reduce(
			(current, accumulator) => current + accumulator
		);
		const autoRollUser = addrList[0];
		const reward = addRewardList[0];

		function autoRollTest(autoRollRatio) {
			beforeEach(async () => {
				await initContracts();
	
				// const reduceRewardList = [util.toWei(10), util.toWei(20)];
				await stakeContract.stageAddRewards(
					addrList,
					addRewardList.map(val => util.toWei(val)),
					{
						from: uploader
					}
				);
				await stakeContract.setStakeFlag(false, { from: operator });
				await duoContract.approve(stakeContract.address, util.toWei(1000000), {
					from: operator
				});
				await duoContract.transfer(operator, util.toWei(10000), { from: creator });
				await stakeContract.commitAddRewards(0, { from: operator });
				await stakeContract.setStakeFlag(true, { from: operator });
				await duoContract.approve(stakeContract.address, util.toWei(1000000), {
					from: autoRollUser
				});
			});
	
			it('should not auto roll when staking not enabled', async () => {
				await stakeContract.setStakeFlag(false, { from: operator });
				try {
					await stakeContract.autoRoll(pf1, util.toWei(reward), { from: autoRollUser });
					assert.isTrue(false, 'can auto roll when disabled');
				} catch (err) {
					assert.equal(
						err.message,
						CST.VM_REVERT_MSG.stakingNotEnabled,
						'transaction not reverted'
					);
				}
			});
	
			it('shouldAutoRoll', async () => {
				
		
				autoRollRatio = autoRollRatio > 1 ? 1 : autoRollRatio;
				await stakeContract.autoRoll(pf1, util.toWei(reward * autoRollRatio), {
					from: autoRollUser
				});
				const rewardsInWei = await stakeContract.rewardsInWei.call(autoRollUser);
				const totalRewardsToDistributeInWei = await stakeContract.totalRewardsToDistributeInWei.call();

				assert.isTrue(
					util.isEqual(
						util.fromWei(rewardsInWei.valueOf()),
						reward * (1 - autoRollRatio)
					),
					'remaining reward not updated correctly'
				);
				assert.isTrue(
					util.isEqual(
						util.fromWei(totalRewardsToDistributeInWei.valueOf()),
						INITIAL_ADDED_RewardS - reward * autoRollRatio
					),
					'total reward not updated correctly'
				);
				
			});

			it('shouldAutoRoll, with setBurnAddress', async () => {
				await stakeContract.setBurnAddress(duoBurnAddr, { from: operator })
		
				
					autoRollRatio = autoRollRatio > 1 ? 1 : autoRollRatio;
					await stakeContract.autoRoll(pf1, util.toWei(reward * autoRollRatio), {
						from: autoRollUser
					});
					const rewardsInWei = await stakeContract.rewardsInWei.call(autoRollUser);
					const totalRewardsToDistributeInWei = await stakeContract.totalRewardsToDistributeInWei.call();
	
					assert.isTrue(
						util.isEqual(
							util.fromWei(rewardsInWei.valueOf()),
							reward * (1 - autoRollRatio)
						),
						'remaining reward not updated correctly'
					);
					assert.isTrue(
						util.isEqual(
							util.fromWei(totalRewardsToDistributeInWei.valueOf()),
							INITIAL_ADDED_RewardS - reward * autoRollRatio
						),
						'total reward not updated correctly'
					);
	
					const balanceOfBurnAddr = await duoContract.balanceOf.call(duoBurnAddr);
					assert.isTrue(
						util.isEqual(
							util.fromWei(balanceOfBurnAddr.valueOf()),
							reward * autoRollRatio
						),
						"duo balance is worng"
	
					)
	
	
				
			});

		}

		describe('paritial autoRoll, 0.5', () => {
			autoRollTest(
				0.5
			);
		});

		describe('exact autoRoll, 1', () => {
			autoRollTest(
				1
			);
		});

		describe('more than all autoRoll, 1.2', () => {
			autoRollTest(
				1.2
			);
		});


	});

	describe('claimReward', () => {
		const addrList = [alice, bob];
		const addRewardList = [100, 200];
		const reduceRewardList = [100, 200];
		const INITIAL_BALANCE_OF_OPT = 10000;
		beforeEach(async () => {
			await initContracts();
			await duoContract.approve(stakeContract.address, util.toWei(1000000), {
				from: operator
			});
			await duoContract.transfer(operator, util.toWei(INITIAL_BALANCE_OF_OPT), {
				from: creator
			});
			await stakeContract.setStakeFlag(false, { from: operator });

			await stakeContract.stageAddRewards(
				addrList,
				addRewardList.map(value => util.toWei(value)),
				{
					from: uploader
				}
			);
			await stakeContract.stageReduceRewards(
				addrList,
				reduceRewardList.map(value => util.toWei(value)),
				{
					from: uploader
				}
			);
			await stakeContract.commitAddRewards(0, { from: operator });
			await stakeContract.setStakeFlag(true, { from: operator });
		});

		it('should only claim reward when stasking enabled', async () => {
			await stakeContract.setStakeFlag(false, { from: operator });
			try {
				await stakeContract.claimReward(true, 0, {
					from: alice
				});
				assert.isTrue(false, 'can claim reward when canUnstake');
			} catch (err) {
				assert.equal(
					err.message,
					CST.VM_REVERT_MSG.stakingNotEnabled,
					'transaction not reverted'
				);
			}
		});

		it('calim all reward', async () => {
			const totalRewardOfAlice = await stakeContract.rewardsInWei.call(alice);
			const totalRewardsToDistributeInWei = await stakeContract.totalRewardsToDistributeInWei.call();
			const totalDuoBlance = await duoContract.balanceOf.call(stakeContract.address);
			const tx = await stakeContract.claimReward(true, 0, {
				from: alice
			});
			const totalRewardsToDistributeInWeiAfter = await stakeContract.totalRewardsToDistributeInWei.call();
			const totalDuoBlanceAfter = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_CLAIM_Reward,
				'wrong name worngly'
			);
			assert.isTrue(
				tx.logs[0].args.claimer.valueOf() === alice &&
				util.isEqual(
					util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()),
					util.fromWei(totalRewardOfAlice.valueOf())
				),
				'event args wrongly'
			);

			assert.isTrue(
				util.isEqual(
					util.fromWei(totalRewardsToDistributeInWei.valueOf()),
					Number(util.fromWei(totalRewardsToDistributeInWeiAfter.valueOf())) +
					Number(util.fromWei(totalRewardOfAlice))
				),
				'totalReward updated worngly'
			);

			assert.isTrue(
				util.isEqual(
					util.fromWei(totalDuoBlance.valueOf()),
					Number(util.fromWei(totalDuoBlanceAfter.valueOf())) +
					Number(util.fromWei(totalRewardOfAlice))
				),
				'total DUO balance updated worngly'
			);
		});

		it('claim partial reward, can only calim less than total reward', async () => {
			try {
				await stakeContract.claimReward(false, util.toWei(200), {
					from: alice
				});
				assert.isTrue(false, 'can claim reward when canUnstake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.noAward, 'transaction not reverted');
			}
		});

		it('claim partial reward', async () => {
			const totalRewardsToDistributeInWei = await stakeContract.totalRewardsToDistributeInWei.call();
			const totalDuoBlance = await duoContract.balanceOf.call(stakeContract.address);
			const tx = await stakeContract.claimReward(false, util.toWei(50), {
				from: alice
			});
			const totalRewardsToDistributeInWeiAfter = await stakeContract.totalRewardsToDistributeInWei.call();
			const totalDuoBlanceAfter = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_CLAIM_Reward,
				'wrong name worngly'
			);
			assert.isTrue(
				tx.logs[0].args.claimer.valueOf() === alice &&
				util.isEqual(util.fromWei(tx.logs[0].args.rewardAmtInWei.valueOf()), 50),
				'event args wrongly'
			);

			assert.isTrue(
				util.isEqual(
					util.fromWei(totalRewardsToDistributeInWei.valueOf()),
					Number(util.fromWei(totalRewardsToDistributeInWeiAfter.valueOf())) + 50
				),
				'totalReward updated worngly'
			);

			assert.isTrue(
				util.isEqual(
					util.fromWei(totalDuoBlance.valueOf()),
					Number(util.fromWei(totalDuoBlanceAfter.valueOf())) + 50
				),
				'total DUO balance updated worngly'
			);
		});

		it('should revert if isAll and no reward', async () => {
			await stakeContract.claimReward(true, 0, {
				from: alice
			});
			try {
				await stakeContract.claimReward(true, 0, {
					from: alice
				});
				assert.isTrue(false, 'can claim reward when there is non reward');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.noAward, 'transaction not reverted');
			}
		});
	});

	describe('getUserSize', () => {
		before(initContracts);

		it('userLenght should be 0', async () => {
			const userSize = await stakeContract.getUserSize.call();
			assert.equal(userSize.valueOf(), 0, 'userLenght wrong');
		});
	});

	describe('setValue', () => {
		beforeEach(initContracts);

		it('non operator should not be able to set minStakeAmtInWei', async () => {
			try {
				await stakeContract.setValue.call(0, 10000, { from: alice });
				assert.isTrue(false, 'non admin can change minStakeAmtInWei');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('operator should be able to set minStakeAmtInWei', async () => {
			await stakeContract.setValue(0, util.toWei(10000), { from: operator });
			const minStakeAmt = await stakeContract.minStakeAmtInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(minStakeAmt.valueOf()), 10000, true),
				'not set correctly'
			);
		});

		it('non operator should not be able to set maxOracleStakeAmtInWei', async () => {
			try {
				await stakeContract.setValue.call(1, 10000, { from: alice });
				assert.isTrue(false, 'non admin can change maxOracleStakeAmtInWei');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('operator should be able to set maxOracleStakeAmtInWei', async () => {
			await stakeContract.setValue(1, util.toWei(10000000), { from: operator });
			const maxStakePerPf = await stakeContract.maxOracleStakeAmtInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(maxStakePerPf.valueOf()), 10000000),
				'not set correctly'
			);
		});

		it('operator should not setValue within operation cooldown', async () => {
			await stakeContract.setValue(1, util.toWei(10000000), { from: operator });
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(currentTs.toNumber() + StakeInit.optCoolDown - 1);
			try {
				await stakeContract.setValue(1, util.toWei(10000000), { from: operator });
				assert.isTrue(false, 'can setValue within cooldown');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('operator should only setValue beyond operation cooldown', async () => {
			await stakeContract.setValue(1, util.toWei(10000000), { from: operator });
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(currentTs.toNumber() + StakeInit.optCoolDown + 1);
			await stakeContract.setValue(1, util.toWei(2000000), { from: operator });
			const maxStakePerPf = await stakeContract.maxOracleStakeAmtInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(maxStakePerPf.valueOf()), 2000000),
				'not set correctly'
			);
		});
	});

	describe('updateUploaderByOperator', () => {
		beforeEach(initContracts);

		it('non operator should not be able to update uploader', async () => {
			try {
				await stakeContract.updateUploaderByOperator(alice, { from: alice });
				assert.isTrue(false, 'non admin can change minStakeAmtInWei');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('operator should be able to update uploader', async () => {
			const tx = await stakeContract.updateUploaderByOperator(alice, { from: operator });
			const uploader = await stakeContract.uploader.call();
			assert.isTrue(uploader.valueOf() === alice, 'not set correctly');

			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_UPDATE_UPLOADER,
				'wrong events'
			);
		});
	});

	describe('updateUploaderByRoleManager', () => {
		before(async () => {
			await initContracts();
			await initCustodian();
		});

		it('hot address cannot updateUpdater', async () => {
			try {
				await stakeContract.updateUploaderByRoleManager.call({ from: alice });
				assert.isTrue(false, 'hot address can update updateUpdater');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'not reverted');
			}
		});

		it('should updateUpdater', async () => {
			await roleManagerContract.addCustodian(custodianContracct.address, {
				from: creator
			});
			await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.skipCooldown(1);
			await roleManagerContract.addOtherContracts(stakeContract.address, {
				from: newModerator
			});
			await roleManagerContract.setPool(0, 0, alice);
			const tx = await stakeContract.updateUploaderByRoleManager({ from: alice });

			const newUplAdddress = await stakeContract.uploader.call();
			assert.isTrue(
				validHotPool.includes(util.toChecksumAddress(newUplAdddress)),
				'address not from hot pool'
			);
			const statusOfAlice = await roleManagerContract.addrStatus.call(alice);
			const statusOfNewAddr = await roleManagerContract.addrStatus.call(newUplAdddress);
			assert.isTrue(
				Number(statusOfAlice.valueOf()) === 3 && Number(statusOfNewAddr.valueOf()) === 3,
				'status updated incorrectly'
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_UPDATE_UPLOADER,
				'wrong events'
			);
			assert.isTrue(
				tx.logs[0].args.updater === alice &&
				tx.logs[0].args.newUploader === newUplAdddress.valueOf(),
				'wrong event args'
			);
		});

		it('should not update uploader in cooldown period', async () => {
			await roleManagerContract.setPool(0, 0, bob);
			try {
				await stakeContract.updateUploaderByRoleManager({ from: bob });
				assert.isTrue(false, 'can update uploadere in cool down period');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'not reverted');
			}
		});
	});

	describe('addOracle', () => {
		beforeEach(initContracts);

		it('non operator should not be able to addOracle', async () => {
			try {
				await stakeContract.addOracle(alice, { from: bob });
				assert.isTrue(false, 'non admin can change minStakeAmtInWei');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should add oracle', async () => {
			await stakeContract.addOracle(alice, { from: operator });
			const isWhiteList = await stakeContract.isWhiteListOracle.call(alice);

			assert.isTrue(isWhiteList.valueOf(), 'not set correctly');
		});
	});
});
