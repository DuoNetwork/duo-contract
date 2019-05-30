const Stake = artifacts.require('../contracts/mocks/StakeMock.sol');
const DUO = artifacts.require('../contracts/tokens/DUO.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const CST = require('./constants');
const util = require('./util');

const InitParas = require('../migrations/contractInitParas.json');
const DuoInit = InitParas['DUO'];
const StakeInit = InitParas['Stake'];
const RoleManagerInit = InitParas['RoleManager'];

const EVENT_STAKE = 'AddStake';
const EVENT_UNSTAKE = 'Unstake';
const EVENT_ADD_AWARD = 'AddAward';
const EVENT_ReduceAward = 'ReduceAward';
const EVENT_CLAIM_AWARD = 'ClaimAward';

contract('Stake', accounts => {
	let duoContract, stakeContract, roleManagerContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const pfList = [pf1,pf2,pf3];
	const nonPf = accounts[4];
	const operator = accounts[5];
	const alice = accounts[6];
	const bob = accounts[7];


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
				let isPf = await stakeContract.isWhiteListOracle.call(pf);
				assert.isTrue(isPf, 'pf not set correctly');
			}
		});

		it('non pf should be set false', async () => {
			const isPf = await stakeContract.isWhiteListOracle.call(nonPf);
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

		it("canStake should be set correctly", async () => {
			const canStake = await stakeContract.canStake.call();
			assert.isFalse(canStake.valueOf(), 'canStake not updated correctly');
		});

		it("canUnstake should be set correctly", async () => {
			const canUnstake = await stakeContract.canUnstake.call();
			assert.isFalse(canUnstake.valueOf(), 'canUnstake not updated correctly');
		});

		it('minStakeAmt should be set correctly', async () => {
			const minStakeAmtInWei = await stakeContract.minStakeAmtInWei.call();
			assert.isTrue(util.isEqual(util.fromWei(minStakeAmtInWei.valueOf()), StakeInit.minStakeAmt), 'minStakeAmt not updated correctly');
		});

		it('stakePerPf should be set correctly', async () => {
			const maxOracleStakeAmtInWei = await stakeContract.maxOracleStakeAmtInWei.call();
			assert.isTrue(util.isEqual(util.fromWei(maxOracleStakeAmtInWei.valueOf()), StakeInit.maxStakePerPf), 'stakePerPf not updated correctly');
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

	describe('stake', () => {
		beforeEach(async () => {
			await initContracts();
			await duoContract.transfer(alice, util.toWei(400000), {from: creator});
			await duoContract.approve(stakeContract.address, util.toWei(400000), {from: alice});
		});

		it('cannot stake when contract state not open', async () => {
			try {
				await stakeContract.stake(pf1, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake when contract is not open');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.canStakeNotSet, 'transaction not reverted');
			}
		});

		it('cannot stake for non pf address', async () => {
			await stakeContract.setStakeFlag(true, true, {from: operator});
			try {
				await stakeContract.stake(nonPf, util.toWei(1000), {
					from: alice
				});
				assert.isTrue(false, 'can stake for non pf address');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.notWhiteListOracle, 'transaction not reverted');
			}
		});

		it('cannot stake less than minStakeAmt', async () => {
			await stakeContract.setStakeFlag(true, true,{from: operator});
			try {
				await stakeContract.stake(pf1, util.toWei(50), {
					from: alice
				});
				assert.isTrue(false, 'can  stake less than minStakeAmt');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakeLessThanMinAmt, 'transaction not reverted');
			}
		});

		it('cannot stake without approving for DUO token trafer', async () => {
			await duoContract.approve(stakeContract.address, 0, {from: alice});
			await stakeContract.setStakeFlag(true, true, {from: operator});
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
			await stakeContract.setStakeFlag(true, true, {from: operator});
			try {
				await stakeContract.stake(pf1, util.toWei(400001), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than DUO token balance');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.exceedingMaxStakeAmt, 'transaction not reverted');
			}
		});

		it('can stake', async () => {
			await stakeContract.setStakeFlag(true, true, {from: operator});
			let tx = await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_STAKE, 'log events incorrect');

			assert.isTrue( 
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) && 
				util.isEqual(tx.logs[0].args.oracle.valueOf(), pf1) && 
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				"event logs not emitted correctly"
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 1) && 
				util.isEqual(queIdx.last.valueOf(), 1),
				"queueIndex not updated correctly"
			);

			const queueStake = await stakeContract.userStakeQueue.call(alice, pf1, 1);
			assert.isTrue(
				util.isEqual( util.fromWei(queueStake.amtInWei), 1000 ),
				'stakequeue not updated correctly'
			);

			let userSize = await stakeContract.getUserSize.call();
			assert.equal(userSize.valueOf(), 1, 'userLenght wrong');
			
		});

		it('each pf address cannot receive stake more than maxStakePerPf', async () => {
			await stakeContract.setStakeFlag(true, true, {from: operator});
			await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});

			try {
				await stakeContract.stake(pf1, util.toWei(200000), {
					from: alice
				});
				assert.isTrue(false, 'can stake more than maxStakePerPf');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.exceedingMaxStakeAmt, 'transaction not reverted');
			}
		});

		it('can stake second time', async () => {
			await stakeContract.setStakeFlag(true, true, {from: operator});
			await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			const tx = await stakeContract.stake(pf1, util.toWei(1000), {
				from: alice
			});
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_STAKE, 'log events incorrect');

			assert.isTrue( 
				util.isEqual(tx.logs[0].args.from.valueOf(), alice) && 
				util.isEqual(tx.logs[0].args.oracle.valueOf(), pf1) && 
				util.isEqual(tx.logs[0].args.amtInWei.valueOf(), util.toWei(1000)),
				"event logs not emitted correctly"
			);

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 1) && 
				util.isEqual(queIdx.last.valueOf(), 2),
				"queueIndex not updated correctly"
			);
			
		});


	});

	describe('unstake', () => {
		beforeEach(async () => {
			await initContracts();
			await duoContract.transfer(alice, util.toWei(StakeInit.maxStakePerPf * 2), {from: creator});
			await duoContract.approve(stakeContract.address, util.toWei(StakeInit.maxStakePerPf * 2), {from: alice});
			await stakeContract.setStakeFlag(true,  true,{from: operator});
			
		});


		it('cannot unstake within locking period', async () => {
			await stakeContract.stake(pf1, util.toWei(StakeInit.minStakeAmt * 2), {
				from: alice
			});
			await stakeContract.setStakeFlag(false, false, {from: operator});
			try {
				await stakeContract.unstake(pf1, {
					from: alice
				});
				assert.isTrue(false, 'can unstake within locking period');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.canUnstakeNotSet, 'transaction not reverted');
			}
		});

		it('cannot unStake without previously staking', async () => {
			let currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(currentTs.toNumber() + Number(StakeInit.minStakeTs) + 15*60);
			
			try {
				await stakeContract.unstake(pf1, {
					from: alice
				});
				assert.isTrue(false, 'can unstake without previously staking');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.emptyQueue, 'transaction not reverted');
			}
		});

		it('can unStake', async () => {
			await stakeContract.stake(pf1, util.toWei(StakeInit.minStakeAmt * 2), {
				from: alice
			});
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp(currentTs.toNumber() + Number(StakeInit.minStakeTs) + 15*60);
			const tx = await stakeContract.unstake(pf1, {
				from: alice
			});

			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_UNSTAKE);
			const eventArgs = tx.logs[0].args;
			assert.isTrue(eventArgs.from === alice && eventArgs.oracle === pf1 && 
				util.isEqual(util.fromWei(eventArgs.amtInWei), StakeInit.minStakeAmt * 2), 'event args wrong' );

			const queIdx = await stakeContract.userQueueIdx.call(alice, pf1);
			assert.isTrue( 
				util.isEqual(queIdx.first.valueOf(), 2) && 
				util.isEqual(queIdx.last.valueOf(), 1),
				"queueIndex not updated correctly"
			);

			const totalStakAmtInWei = await stakeContract.totalStakAmtInWei.call(pf1);
			assert.isTrue( util.isEqual(util.fromWei(totalStakAmtInWei.valueOf()),0), 'totalStakereceived updated wrongly' );
			

			const contractDuoBalance = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue( util.isEqual(util.fromWei(contractDuoBalance.valueOf()),0), 'contractDuoBalance updated wrongly' );

			let userSize = await stakeContract.getUserSize.call();
			assert.equal(userSize.valueOf(), 0, 'userLenght wrong');
			
		});

	});

	describe('batchAddAward', () => {
		beforeEach(async () => {
			await initContracts();
			await stakeContract.setStakeFlag(false,  false,{from: operator});
			await duoContract.transfer(stakeContract.address, util.toWei(10000), {from: creator});
		});

		it('should not add empty award list', async () => {
			try {
				await stakeContract.batchAddAward([], [], {
					from: operator
				});
				assert.isTrue(false, 'can add empty award list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.inputParasWrong, 'transaction not reverted');
			}
		});

		it('should not non equal award and addr list', async () => {
			try {
				await stakeContract.batchAddAward([alice, bob], [util.toWei(20)], {
					from: operator
				});
				assert.isTrue(false, 'can add non equal award and addr list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.inputParasWrong, 'transaction not reverted');
			}
		});

		it('non operator cannot batchAddAward', async () => {
					
			try {
				await stakeContract.batchAddAward([alice, bob], [util.toWei(20), util.toWei(30)], {
					from: alice
				});
				assert.isTrue(false, 'non operator can batchAddAward');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should not batchAddAward when canStake', async () => {
			await stakeContract.setStakeFlag(true,  false,{from: operator});
			try {
				await stakeContract.batchAddAward([alice, bob], [util.toWei(20), util.toWei(30)], {
					from: operator
				});
				assert.isTrue(false, 'can batchAddAward when canStake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakingIsNotFrozen, 'transaction not reverted');
			}
		});

		it('should not batchAddAward when canUnstake', async () => {
			await stakeContract.setStakeFlag(false,  true,{from: operator});
			try {
				await stakeContract.batchAddAward([alice, bob], [util.toWei(20), util.toWei(30)], {
					from: operator
				});
				assert.isTrue(false, 'can batchAddAward when unstake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakingIsNotFrozen, 'transaction not reverted');
			}

		});

		it('contract duo token balance should be more than award', async () => {
			try {
				await stakeContract.batchAddAward([alice, bob], [util.toWei(10000), util.toWei(30)], {
					from: operator
				});
				assert.isTrue(false, 'can batchAddAward when contract has not enought duo token');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.notEnoughBalanceCoveringAwards, 'transaction not reverted');
			}
		});

		it('should batchAddAward', async () => {
			const addrList = [alice, bob];
			const awardList = [util.toWei(100), util.toWei(200)];
			const tx = await stakeContract.batchAddAward(addrList, awardList, {
				from: operator
			});
			for(let i = 0; i < addrList.length; i++){
				const addr = addrList[i];
				const award = awardList[i];
				const awardInContract = await stakeContract.awardsInWei.call(addr);
				assert.isTrue( util.isEqual( util.fromWei(awardInContract.valueOf()), util.fromWei(award)), 'award updated wrongly');
			

				assert.isTrue(tx.logs[i].event === EVENT_ADD_AWARD, 'event name wrong');
				assert.isTrue(tx.logs[i].args.staker.valueOf() === addr &&
				util.isEqual(
					util.fromWei(tx.logs[i].args.awardAmtInWei.valueOf()), util.fromWei(award)
				), 
				'event args emitted wrongly'
				);
			}

			const totalAwardsToDistributeInWei = await stakeContract.totalAwardsToDistributeInWei.call();
			const totalAwards = awardList.reduce( (accu, cur) => accu + Number(util.fromWei(cur)), 0);
			assert.isTrue(
				util.isEqual(util.fromWei(totalAwardsToDistributeInWei.valueOf()), totalAwards),
				'totalAwards not updated correctly'
			);
		});
	});

	describe('batchReduceAward', () => {
		const addrList = [alice, bob];
		const awardList = [util.toWei(100), util.toWei(200)];
		beforeEach(async () => {
			await initContracts();
			await stakeContract.setStakeFlag(false,  false,{from: operator});
			await duoContract.transfer(stakeContract.address, util.toWei(10000), {from: creator});
			await stakeContract.batchAddAward(addrList, awardList, {
				from: operator
			});
		});

		it('should not reduceAward with empty award list', async () => {
			try {
				await stakeContract.batchReduceAward([], [], {
					from: operator
				});
				assert.isTrue(false, 'can reduceAward with empty award list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.inputParasWrong, 'transaction not reverted');
			}
		});

		it('should not reduce with non equal award and addr list', async () => {
			try {
				await stakeContract.batchReduceAward([alice, bob], [util.toWei(20)], {
					from: operator
				});
				assert.isTrue(false, 'can reduce with non equal award and addr list');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.inputParasWrong, 'transaction not reverted');
			}
		});

		it('non operator cannot batchReduceAward', async () => {
			try {
				await stakeContract.batchReduceAward(addrList, awardList, {
					from: alice
				});
				assert.isTrue(false, 'non operator can batchReduceAward');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});

		it('should not batchReduceAward when canStake', async () => {
			await stakeContract.setStakeFlag(true,  false,{from: operator});
			try {
				await stakeContract.batchReduceAward(addrList, awardList, {
					from: operator
				});
				assert.isTrue(false, 'can batchReduceAward when canStake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakingIsNotFrozen, 'transaction not reverted');
			}
		});

		it('should not batchReduceAward when canUnstake', async () => {
			await stakeContract.setStakeFlag(false,  true,{from: operator});
			try {
				await stakeContract.batchReduceAward(addrList, awardList, {
					from: operator
				});
				assert.isTrue(false, 'can batchReduceAward when canUnStake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakingIsNotFrozen, 'transaction not reverted');
			}
		});

		it('should not batchReduceAward with more than award', async () => {
			await stakeContract.setStakeFlag(false,  true,{from: operator});
			try {
				await stakeContract.batchReduceAward(addrList, awardList.map(award => util.toWei(Number(util.fromWei(award)) *2)), {
					from: operator
				});
				assert.isTrue(false, 'can batchReduceAward with more than award');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.stakingIsNotFrozen, 'transaction not reverted');
			}
		});

		it('should batchReduceAward', async () => {
			const tx = await stakeContract.batchReduceAward(addrList, awardList, {
				from: operator
			});

			for(let i = 0; i < addrList.length; i++){
				const addr = addrList[i];
				const award = awardList[i];
				const awardInContract = await stakeContract.awardsInWei.call(addr);
				assert.isTrue( util.isEqual( util.fromWei(awardInContract.valueOf()), 0), 'award updated wrongly');
			

				assert.isTrue(tx.logs[i].event === EVENT_ReduceAward, 'event name wrong');
				assert.isTrue(tx.logs[i].args.staker.valueOf() === addr &&
				util.isEqual(
					util.fromWei(tx.logs[i].args.awardAmtInWei.valueOf()), util.fromWei(award)
				), 
				'event args emitted wrongly'
				);
			}

			const totalAwardsToDistributeInWei = await stakeContract.totalAwardsToDistributeInWei.call();
			assert.isTrue(
				util.isEqual(util.fromWei(totalAwardsToDistributeInWei.valueOf()), 0),
				'totalAwards not updated correctly'
			);
		});
	});

	describe('claimAward', () => {
		beforeEach(async () => {
			await initContracts();
			await stakeContract.setStakeFlag(false,  false,{from: operator});
			await duoContract.transfer(stakeContract.address, util.toWei(10000), {from: creator});
			const addrList = [alice, bob];
			const awardList = [util.toWei(100), util.toWei(200)];
			await stakeContract.batchAddAward(addrList, awardList, {
				from: operator
			});
			await stakeContract.setStakeFlag(true,  true,{from: operator});
		});

		it('should only claim award when canUnstake', async () => {
			await stakeContract.setStakeFlag(true,  false,{from: operator});
			try {
				await stakeContract.claimAward(true, 0, {
					from: alice
				});
				assert.isTrue(false, 'can claim award when canUnstake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.canUnstakeNotSet, 'transaction not reverted');
			}
		});

		it('calim all award', async () => {
			const totalAwardOfAlice = await stakeContract.awardsInWei.call(alice);
			const totalAwardsToDistributeInWei = await stakeContract.totalAwardsToDistributeInWei.call();
			const totalDuoBlance = await duoContract.balanceOf.call(stakeContract.address);
			const tx = await stakeContract.claimAward(true, 0, {
				from: alice
			});
			const totalAwardsToDistributeInWeiAfter = await stakeContract.totalAwardsToDistributeInWei.call();
			const totalDuoBlanceAfter = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_CLAIM_AWARD, 'wrong name worngly');
			assert.isTrue(
				tx.logs[0].args.claimer.valueOf() === alice &&
				util.isEqual(util.fromWei(tx.logs[0].args.awardAmtInWei.valueOf()), util.fromWei(totalAwardOfAlice.valueOf())),
				'event args wrongly'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(totalAwardsToDistributeInWei.valueOf()), Number(util.fromWei(totalAwardsToDistributeInWeiAfter.valueOf())) + 
				Number(util.fromWei(totalAwardOfAlice))),
				'totalAward updated worngly'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(totalDuoBlance.valueOf()), Number(util.fromWei(totalDuoBlanceAfter.valueOf())) + 
				Number(util.fromWei(totalAwardOfAlice))),
				'total DUO balance updated worngly'
			);
		});

		it('claim partial award, can only calim less than total award', async () => {
			try {
				await stakeContract.claimAward(false, util.toWei(200), {
					from: alice
				});
				assert.isTrue(false, 'can claim award when canUnstake');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});
			

		it('claim partial award', async () => {
			const totalAwardsToDistributeInWei = await stakeContract.totalAwardsToDistributeInWei.call();
			const totalDuoBlance = await duoContract.balanceOf.call(stakeContract.address);
			const tx = await stakeContract.claimAward(false, util.toWei(50), {
				from: alice
			});
			const totalAwardsToDistributeInWeiAfter = await stakeContract.totalAwardsToDistributeInWei.call();
			const totalDuoBlanceAfter = await duoContract.balanceOf.call(stakeContract.address);
			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_CLAIM_AWARD, 'wrong name worngly');
			assert.isTrue(
				tx.logs[0].args.claimer.valueOf() === alice &&
				util.isEqual(util.fromWei(tx.logs[0].args.awardAmtInWei.valueOf()), 50),
				'event args wrongly'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(totalAwardsToDistributeInWei.valueOf()), Number(util.fromWei(totalAwardsToDistributeInWeiAfter.valueOf())) + 
				50),
				'totalAward updated worngly'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(totalDuoBlance.valueOf()), Number(util.fromWei(totalDuoBlanceAfter.valueOf())) + 
				50),
				'total DUO balance updated worngly'
			);
		});

		it('should revert if isAll and no award', async () => {
			await stakeContract.claimAward(true, 0, {
				from: alice
			});
			try {
				await stakeContract.claimAward(true, 0, {
					from: alice
				});
				assert.isTrue(false, 'can claim award when there is non award');
			} catch (err) {
				assert.equal(err.message, CST.VM_REVERT_MSG.revert, 'transaction not reverted');
			}
		});
	});

	describe('getUserSize', () => {
		before(initContracts);

		it('userLenght should be 0', async () => {
			let userSize = await stakeContract.getUserSize.call();
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
			assert.isTrue( util.isEqual(util.fromWei(minStakeAmt.valueOf()), 10000, true), 'not set correctly');
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
			assert.isTrue( util.isEqual(util.fromWei(maxStakePerPf.valueOf()), 10000000), 'not set correctly');
		});
		
		it('operator should not setValue within operation cooldown', async () => {
			await stakeContract.setValue(1, util.toWei(10000000), { from: operator });
			const currentTs = await stakeContract.timestamp.call();
			await stakeContract.setTimestamp( currentTs.toNumber() + StakeInit.optCoolDown - 1);
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
			await stakeContract.setTimestamp( currentTs.toNumber() + StakeInit.optCoolDown + 1);
			await stakeContract.setValue(1, util.toWei(2000000), { from: operator });
			const maxStakePerPf = await stakeContract.maxOracleStakeAmtInWei.call();
			assert.isTrue( util.isEqual(util.fromWei(maxStakePerPf.valueOf()), 2000000), 'not set correctly');
			
		});


	});

});
