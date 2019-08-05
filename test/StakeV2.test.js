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
const EVENT_ADD_AWARD = 'AddAward';
const EVENT_ReduceAward = 'ReduceAward';
const EVENT_CLAIM_AWARD = 'ClaimAward';
const EVENT_UPDATE_UPLOADER = 'UpdateUploader';

contract('StakeV2', accounts => {
	let duoContract, stakeContract, roleManagerContract, custodianContracct;
	let validHotPool = Pool[1].map(addr => util.toChecksumAddress(addr));

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const pfList = [pf1,pf2,pf3];
	const nonPf = accounts[4];
	const operator = accounts[5];
	const uploader = accounts[6];
	const alice = accounts[7];
	const bob = accounts[8];
	const fc = accounts[9];
	const newModerator = accounts[10];

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
			[pf1,pf2,pf3],
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

		it('duoBurnAddr address should be set correctly', async () => {
			const burnAddress = await stakeContract.burnAddress.call();
			assert.isTrue(burnAddress.valueOf() === StakeInit.duoBurnAddr, 'duoBurnAddr not updated correctly');		
		});

		it('lockMinTime should be set correctly', async () => {
			const lockMinTimeInSecond = await stakeContract.lockMinTimeInSecond.call();
			assert.isTrue(util.isEqual(lockMinTimeInSecond.valueOf(), StakeInit.minStakeTs), 'lockMinTime not updated correctly');
		});

		it("stakingEnabled should be set correctly", async () => {
			const stakingEnabled = await stakeContract.stakingEnabled.call();
			assert.isFalse(stakingEnabled.valueOf(), 'canUnstake not updated correctly');
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

		it('uploader address should be set correctly', async () => {
			const uploader = await stakeContract.uploader.call();
			assert.isTrue(uploader.valueOf() === uploader, 'uploader not updated correctly');		

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
			await stakeContract.setStakeFlag(true, {from: operator});
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
			await stakeContract.setStakeFlag(true,{from: operator});
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
			await stakeContract.setStakeFlag(true, {from: operator});
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
			await stakeContract.setStakeFlag(true, {from: operator});
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
			await stakeContract.setStakeFlag(true, {from: operator});
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
			await stakeContract.setStakeFlag(true, {from: operator});
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
			await stakeContract.setStakeFlag(true, {from: operator});
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









});
