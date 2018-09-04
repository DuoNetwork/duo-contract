const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/common/MultiSigRoleManagerMock.sol');
// const Magi = artifacts.require('../contracts/oracles/MagiMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
// const ColdPool = InitParas['ColdPool'];
// const MagiInit = InitParas['Magi'];

// Event
const TERMINATE_CON_VOTING = 'TerminateContractVoting';
const START_MODERATOR_VOTING = 'StartModeratorVoting';
// const UPDATE_ORACLE = 'UpdateOracle';
// const COLLECT_FEE = 'CollectFee';

const STATE_VOTING_NOT_STARTED = '0';
const STATE_VOTING_MODERATOR = '1';
const STATE_VOTING_CONTRACT = '2';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

// const DUMMY_ADDR = '0xc';
const CONTRACT_CANDIDTDE = '0xa8Cac43aA0C2B61BA4e0C10DC85bCa02662E1Bee';

contract('Custodian', accounts => {
	let custodianContract, duoContract, roleManagerContract; //, oracleContract;
	let newCustodianContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const newModerator = accounts[2];
	const alice = accounts[3];
	const bob = accounts[4];
	const charles = accounts[5];
	const david = accounts[6];
	const eric = accounts[7];
	// const frank = accounts[8];

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

		custodianContract = await initCustodian();
	};

	const initCustodian = async () => {
		return await Custodian.new(
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
	};

	describe('constructor', () => {
		before(initContracts);

		it('votingStage should be not started', async () => {
			let votingStage = await roleManagerContract.votingStage.call();
			assert.equal(
				votingStage.valueOf(),
				STATE_VOTING_NOT_STARTED,
				'state is not not started'
			);
		});

		it('moderator should be msg sender', async () => {
			let moderator = await roleManagerContract.moderator.call();
			assert.equal(moderator.valueOf(), creator, 'moderator is not correct');
		});

		it('moderator status should be 3', async () => {
			let moderatorStatus = await roleManagerContract.addrStatus.call(creator);
			assert.equal(moderatorStatus.valueOf(), '3', 'moderator status is not correct');
		});

		it('pool address status should be marked accordingly', async () => {
			let length = await roleManagerContract.getPoolSize.call(0);
			for (let i = 0; i < length; i++) {
				let poolAddr = await roleManagerContract.addrPool.call(0, i);
				assert.equal(
					(await roleManagerContract.addrStatus.call(poolAddr)).valueOf(),
					'1',
					'cold status is not correct'
				);
			}
			length = await roleManagerContract.getPoolSize.call(1);
			for (let i = 0; i < length; i++) {
				let poolAddr = await roleManagerContract.addrPool.call(1, i);
				assert.equal(
					(await roleManagerContract.addrStatus.call(poolAddr)).valueOf(),
					'2',
					'cold status is not correct'
				);
			}
		});

		it('operation cooldown should be set correctly', async () => {
			let optCoolDown = await roleManagerContract.operatorCoolDown.call();
			assert.equal(
				optCoolDown.valueOf(),
				RoleManagerInit.optCoolDown,
				'moderator status is not correct'
			);
		});
	});

	const START_VOTING = async custodianContract => {
		await roleManagerContract.addCustodian(custodianContract.address, { from: creator });
		await roleManagerContract.skipCooldown(1);
		await roleManagerContract.setModerator(newModerator);
		newCustodianContract = await initCustodian();
		await roleManagerContract.setPassedContract(newCustodianContract.address);
		return await roleManagerContract.startContractVoting(newCustodianContract.address, {
			from: newModerator
		});
	};

	const SET_POOLS = async (index, addr)  => {
		for(let i = 0 ; i < addr.length; i++) {
			await roleManagerContract.setPool(index, i, addr[i]);
		}
	};

	const VOTE = async (voters, voteFor) => {
			
		assert.isTrue(voters.length <= voteFor.length, 'length not equal');
		for(let i = 0; i <voters.length; i ++) {
			await roleManagerContract.vote(voteFor[i], {from: voters[i]});
			// console.log(tx);1
		}				
	};

	describe('start Contract voting', () => {
		beforeEach(initContracts);

		it('non moderator cannot start contreact voting', async () => {
			try {
				await roleManagerContract.startContractVoting.call(CONTRACT_CANDIDTDE, {
					from: alice
				});
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot propose added contracts', async () => {
			try {
				let tx = await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
				await roleManagerContract.skipCooldown(1);
				let moderator = tx.logs[0].args.newModerator;
				assert.isTrue(moderator != creator, 'moderator not changed');
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.startContractVoting(custodianContract.address, {
					from: newModerator
				});
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot propose in non voting stage', async () => {
			try {
				await roleManagerContract.setVotingStage(2);
				await roleManagerContract.startContractVoting(custodianContract.address, {
					from: creator
				});
				assert.isTrue(false, 'can start voting in contract voting stage');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can proposeContract', async () => {
			let tx = await START_VOTING(custodianContract);
			let moderator = tx.logs[0].args.newModerator;
			assert.isTrue(newModerator != moderator, 'moderator not changed');
			let votedFor = await roleManagerContract.votedFor.call();
			let votedAgainst = await roleManagerContract.votedAgainst.call();
			let candidate = await roleManagerContract.candidate.call();
			assert.isTrue(
				votedAgainst.valueOf() === '0' && votedFor.valueOf() === '0',
				'not rest correctlyu'
			);
			assert.isTrue(candidate.valueOf() === newCustodianContract.address, 'not rest correctlyu');
		});
	});

	describe('terminating Contract voting', () => {
		beforeEach(initContracts);
		it('non moderator cannot terminate voting', async () => {
			await START_VOTING(custodianContract);
			try {
				await roleManagerContract.terminateContractVoting.call({ from: alice });
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('moderator cannot terminate in notStarted voting stage', async () => {
			try {
				await roleManagerContract.terminateContractVoting.call({ from: creator });
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('moderator can terminate Voting when in Contract stage', async () => {
			await START_VOTING(custodianContract);
			await roleManagerContract.setModerator(newModerator);
			let tx = await roleManagerContract.terminateContractVoting({ from: newModerator });
			let moderator = tx.logs[0].args.newModerator;
			assert.isTrue(newModerator != moderator, 'moderator not changed');
			let votingStage = await roleManagerContract.votingStage.call();
			assert.isTrue(votingStage.valueOf() === STATE_VOTING_NOT_STARTED, 'not reset');
			assert.isTrue(tx.logs.length === 2, 'not correct event emitted');
			assert.isTrue(
				tx.logs[0].event === TERMINATE_CON_VOTING &&
					tx.logs[0].args.terminator === newModerator &&
					tx.logs[0].args.currentCandidate === newCustodianContract.address,
				'wrong event argus'
			);
		});

	});

	describe('start moderator voting', () => {
		beforeEach(initContracts);
		it('non coldPool address cannot start moderator voting', async () => {
			try {
				await roleManagerContract.startModeratorVoting.call({ from: alice });
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('coldPool address start moderator voting', async () => {
			await roleManagerContract.setPool(0,0, alice);
			let tx = await roleManagerContract.startModeratorVoting({ from: alice });
			let candidate = await roleManagerContract.candidate.call();
			assert.equal(candidate.valueOf(), alice, 'not equal');
			let votingStage = await roleManagerContract.votingStage.call();
			assert.equal(votingStage.valueOf(), STATE_VOTING_MODERATOR, 'voting stage wrong');
			let status = await roleManagerContract.addrStatus.call(alice);
			assert.equal(status.valueOf(), '3', 'not marked as used');
			assert.isTrue(tx.logs.length === 1 && tx.logs[0].event === START_MODERATOR_VOTING, 'wrong event');
			assert.isTrue(tx.logs[0].args.proposer === alice, 'wrong event argument');
		
		});
	});

	describe('voting for contract', () => {
		beforeEach(initContracts);
		it('non cold Pool addr cannot vote', async () => {
			try {
				await roleManagerContract.vote(true, {from: alice});
				assert.isTrue(false, 'non cold can vote');
			} catch(err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('already voted is not allowed to vote again', async () => {
			await SET_POOLS(0, [alice, bob]);
			await START_VOTING(custodianContract);
			try {
				await VOTE([alice, alice], [true, true]);
			} catch(err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('less than half votes is not allowed to complete', async () => {
			await START_VOTING(custodianContract); // consume one pool
			await SET_POOLS(0, [alice, bob, charles, david, eric]);
			await VOTE([alice, bob, charles, david], [true, true, true, true, true]);
			let votedFor = await roleManagerContract.votedFor.call();
			let votedAgainst = await roleManagerContract.votedAgainst.call();
			let votingStage = await roleManagerContract.votingStage.call();
			assert.isTrue(
				votedAgainst.valueOf() === '0' && votedFor.valueOf() === '4',
				'not rest correctlyu'
			);
			assert.isTrue(votingStage.valueOf() === STATE_VOTING_CONTRACT, 'not in correct voting stage');
		});

		it('more than half votes should complete Voting', async () => {
			await START_VOTING(custodianContract); // consume one pool
			await SET_POOLS(0, [alice, bob, charles, david, eric]);
			await VOTE([alice, bob, charles, david, eric], [true, true, true, true, true]);
			let votedFor = await roleManagerContract.votedFor.call();
			let votedAgainst = await roleManagerContract.votedAgainst.call();
			let votingStage = await roleManagerContract.votingStage.call();
			assert.isTrue(
				votedAgainst.valueOf() === '0' && votedFor.valueOf() === '5',
				'not rest correctlyu'
			);
			assert.isTrue(votingStage.valueOf() === STATE_VOTING_NOT_STARTED, 'not in correct voting stage');
		});
	});
});
