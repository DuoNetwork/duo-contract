const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/common/MultiSigRoleManagerMock.sol');
const Magi = artifacts.require('../contracts/oracles/MagiMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const ColdPool = InitParas['ColdPool'];
const HotPool = InitParas['HotPool'];
const MagiInit = InitParas['Magi'];

// Event
const EVENT_TERMINATE_CON_VOTING = 'TerminateContractVoting';
const EVENT_START_MODERATOR_VOTING = 'StartModeratorVoting';
const EVENT_TERMINATE_TIMEOUT = 'TerminateByTimeStamp';
const EVENT_REPLACE_MODERATOR = 'ReplaceModerator';
const EVENT_ADD_CUSTODIAN = 'AddCustodian';
const EVENT_ADD_OTHER_CONTRACT = 'AddOtherContract';
const EVENT_ADD_ADDRESS = 'AddAddress';

const STATE_VOTING_NOT_STARTED = '0';
const STATE_VOTING_MODERATOR = '1';
const STATE_VOTING_CONTRACT = '2';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

// const DUMMY_ADDR = '0xc';
const CONTRACT_CANDIDTDE = '0xa8Cac43aA0C2B61BA4e0C10DC85bCa02662E1Bee';

contract('Custodian', accounts => {
	let custodianContract, duoContract, roleManagerContract, oracleContract;
	let newCustodianContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const pf1 = accounts[2];
	const pf2 = accounts[3];
	const pf3 = accounts[4];
	const alice = accounts[6];
	const bob = accounts[7];
	const charles = accounts[8];
	const david = accounts[9];
	const eric = accounts[10];
	const frank = accounts[11];
	const newModerator = accounts[5];
	const newModerator2 = accounts[12];

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
		oracleContract = await initOracle();
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

	const initOracle = async () => {
		return await Magi.new(
			creator,
			pf1,
			pf2,
			pf3,
			roleManagerContract.address,
			MagiInit.pxCoolDown,
			MagiInit.optCoolDown,
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
			let length = await roleManagerContract.getPoolSize.call().valueOf()[0];
			for (let i = 0; i < length; i++) {
				let poolAddr = await roleManagerContract.addrPool.call(0, i);
				assert.equal(
					(await roleManagerContract.addrStatus.call(poolAddr)).valueOf(),
					'1',
					'cold status is not correct'
				);
			}
			length = await roleManagerContract.getPoolSize.call().valueOf()[1];
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

	const START_CONTRACT_VOTING = async custodianContract => {
		// console.log('start contract voting');
		await roleManagerContract.addCustodian(custodianContract.address, { from: creator });
		await roleManagerContract.skipCooldown(1);
		await roleManagerContract.setModerator(newModerator);
		newCustodianContract = await initCustodian();
		await roleManagerContract.setPassedContract(newCustodianContract.address);
		return await roleManagerContract.startContractVoting(newCustodianContract.address, {
			from: newModerator
		});
	};

	const START_MODERATOR_VOTING = async () => {
		await roleManagerContract.setPool(0, 0, alice);
		let tx = await roleManagerContract.startModeratorVoting({ from: alice });
		return tx;
	};

	const SET_POOLS = async (index, addr) => {
		for (let i = 0; i < addr.length; i++) {
			await roleManagerContract.setPool(index, i, addr[i]);
		}
	};

	const VOTE = async (voters, voteFor) => {
		assert.isTrue(voters.length <= voteFor.length, 'length not equal');
		for (let i = 0; i < voters.length; i++) {
			//let tx =
			await roleManagerContract.vote(voteFor[i], { from: voters[i] });
			// console.log(tx);
			// let votedFor = await roleManagerContract.votedFor.call();
			// let votedAgainst = await roleManagerContract.votedAgainst.call();
			// let votingStage = await roleManagerContract.votingStage.call();
			// console.log(
			// 	voters[i],
			// 	votedFor.valueOf(),
			// 	votedAgainst.valueOf(),
			// 	votingStage.valueOf()
			// );
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
			let tx = await START_CONTRACT_VOTING(custodianContract);
			let moderator = tx.logs[0].args.newModerator;
			assert.isTrue(newModerator != moderator, 'moderator not changed');
			let votedFor = await roleManagerContract.votedFor.call();
			let votedAgainst = await roleManagerContract.votedAgainst.call();
			let candidate = await roleManagerContract.candidate.call();
			assert.isTrue(
				votedAgainst.valueOf() === '0' && votedFor.valueOf() === '0',
				'not rest correctlyu'
			);
			assert.isTrue(
				candidate.valueOf() === newCustodianContract.address,
				'not rest correctlyu'
			);
		});
	});

	describe('terminating Contract voting', () => {
		beforeEach(initContracts);
		it('non moderator cannot terminate voting', async () => {
			await START_CONTRACT_VOTING(custodianContract);
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
			await START_CONTRACT_VOTING(custodianContract);
			await roleManagerContract.setModerator(newModerator);
			let tx = await roleManagerContract.terminateContractVoting({ from: newModerator });
			let moderator = tx.logs[0].args.newModerator;
			assert.isTrue(newModerator != moderator, 'moderator not changed');
			let votingStage = await roleManagerContract.votingStage.call();
			assert.isTrue(votingStage.valueOf() === STATE_VOTING_NOT_STARTED, 'not reset');
			assert.isTrue(tx.logs.length === 2, 'not correct event emitted');
			assert.isTrue(
				tx.logs[0].event === EVENT_TERMINATE_CON_VOTING &&
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
			let tx = await START_MODERATOR_VOTING();
			// console.log(tx);
			let candidate = await roleManagerContract.candidate.call();
			assert.equal(candidate.valueOf(), alice, 'not equal');
			let votingStage = await roleManagerContract.votingStage.call();
			assert.equal(votingStage.valueOf(), STATE_VOTING_MODERATOR, 'voting stage wrong');
			let status = await roleManagerContract.addrStatus.call(alice);
			assert.equal(status.valueOf(), '3', 'not marked as used');
			// console.log(tx.logs.length, tx.logs[0].event);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_START_MODERATOR_VOTING,
				'wrong event'
			);
			// assert.isTrue(tx.logs[0].args.proposer === alice, 'wrong event argument');
		});
	});

	describe('voting', () => {
		function voteTest(isContract) {
			beforeEach(initContracts);
			it('non cold Pool addr cannot vote', async () => {
				try {
					await roleManagerContract.vote(true, { from: alice });
					assert.isTrue(false, 'non cold can vote');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('already voted is not allowed to vote again', async () => {
				await SET_POOLS(0, [bob, charles]);
				(await isContract)
					? START_CONTRACT_VOTING(custodianContract)
					: START_MODERATOR_VOTING();
				try {
					await VOTE([bob, bob], [true, true]);
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('less than half votes is not allowed to complete', async () => {
				isContract
					? await START_CONTRACT_VOTING(custodianContract)
					: await START_MODERATOR_VOTING();
				let voters = [bob, charles, david, eric];
				await SET_POOLS(0, voters);
				await VOTE(voters, [true, true, true, true]);
				let votedFor = await roleManagerContract.votedFor.call();
				let votedAgainst = await roleManagerContract.votedAgainst.call();
				let votingStage = await roleManagerContract.votingStage.call();
				assert.isTrue(
					votedAgainst.valueOf() === '0' && votedFor.valueOf() === '4',
					'voting result wrong'
				);
				assert.isTrue(
					votingStage.valueOf() ===
						(isContract ? STATE_VOTING_CONTRACT : STATE_VOTING_MODERATOR),
					'not in correct voting stage'
				);
			});

			it('more than half votes should complete Voting', async () => {
				isContract
					? await START_CONTRACT_VOTING(custodianContract)
					: await START_MODERATOR_VOTING();
				let voters = [bob, charles, david, eric, frank];
				await SET_POOLS(0, voters);
				await VOTE(voters, [true, true, true, true, true]);
				let votedFor = await roleManagerContract.votedFor.call();
				let votedAgainst = await roleManagerContract.votedAgainst.call();
				let votingStage = await roleManagerContract.votingStage.call();
				// console.log(votedAgainst.valueOf() === '0', votedFor.valueOf());
				assert.isTrue(
					votedAgainst.valueOf() === '0' && votedFor.valueOf() === '5',
					'wrong voted number'
				);
				assert.isTrue(
					votingStage.valueOf() === STATE_VOTING_NOT_STARTED,
					'not in correct voting stage'
				);
			});
		}

		describe('contract voting', () => {
			voteTest(true);
		});

		describe('moederator voting', () => {
			voteTest(false);
		});
	});

	describe('terminateByTimeout', () => {
		function terminate(isContract) {
			beforeEach(initContracts);
			it('cannot terminate in non start stage', async () => {
				try {
					isContract
						? await START_CONTRACT_VOTING(custodianContract)
						: await START_MODERATOR_VOTING();
					roleManagerContract.terminateByTimeout({ from: alice });
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('cannot terminate within timeout', async () => {
				try {
					isContract
						? await START_CONTRACT_VOTING(custodianContract)
						: await START_MODERATOR_VOTING();
					roleManagerContract.terminateByTimeout({ from: alice });
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('can terminate beyond timeout', async () => {
				isContract
					? await START_CONTRACT_VOTING(custodianContract)
					: await START_MODERATOR_VOTING();
				await roleManagerContract.skipCooldown(2);
				let tx = await roleManagerContract.terminateByTimeout({ from: alice });
				assert.isTrue(tx.logs.length === 1, tx.logs[0].event === EVENT_TERMINATE_TIMEOUT);
				assert.isTrue(
					tx.logs[0].args.candidate.valueOf() ===
						(isContract ? newCustodianContract.address : alice),
					'event args wrong'
				);
			});
		}

		describe('contract terminateTimeOut', () => {
			terminate(true);
		});

		describe('moderator terminateTimeOut', () => {
			terminate(false);
		});
	});

	describe('start startRoleManager', () => {
		before(initContracts);
		it('non moderator not allowed to start', async () => {
			try {
				await roleManagerContract.startRoleManager.call({ from: alice });
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can start by moderator', async () => {
			await roleManagerContract.startRoleManager({ from: creator });
			let started = await roleManagerContract.started.call();
			assert.isTrue(started.valueOf(), ' not started');
		});

		it('cannot start if already started', async () => {
			try {
				await roleManagerContract.startRoleManager({ from: creator });
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.startRoleManager({ from: newModerator });
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});
	});

	describe('addCustodian', () => {
		beforeEach(initContracts);
		it('non moderator not allowed to start', async () => {
			try {
				await roleManagerContract.addCustodian(custodianContract.address, { from: alice });
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can only add within updateWindow', async () => {
			try {
				await roleManagerContract.setLastOperationTime();
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot add existing custodians', async () => {
			try {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: newModerator
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should add custodians', async () => {
			let tx = await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REPLACE_MODERATOR &&
					tx.logs[1].event === EVENT_ADD_CUSTODIAN,
				'wrong events emitted'
			);

			assert.isTrue(
				tx.logs[0].args.preModerator === creator &&
					tx.logs[0].args.preModerator != tx.logs[0].args.currentModerator
			);
			assert.isTrue(tx.logs[1].args.newCustodianAddr === custodianContract.address);

			let isExist = await roleManagerContract.existingCustodians.call(
				custodianContract.address
			);
			assert.isTrue(isExist.valueOf(), 'not set as existing');
			let status = await roleManagerContract.addrStatus.call(custodianContract.address);
			assert.isTrue(status.valueOf() === '3', 'marked as used');
		});
	});

	describe('addOtherContracts', () => {
		beforeEach(initContracts);
		it('non moderator not allowed to start', async () => {
			try {
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: alice
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can only add within updateWindow', async () => {
			try {
				await roleManagerContract.setLastOperationTime();
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: creator
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot add when custodian lenght is 0', async () => {
			try {
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: creator
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cannot add existing contracts', async () => {
			await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.skipCooldown(1);
			await roleManagerContract.addOtherContracts(oracleContract.address, {
				from: newModerator
			});
			await roleManagerContract.skipCooldown(1);
			await roleManagerContract.setModerator(newModerator2);
			try {
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: newModerator2
				});
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should add otherContracts', async () => {
			await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.skipCooldown(1);
			let tx = await roleManagerContract.addOtherContracts(oracleContract.address, {
				from: newModerator
			});

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REPLACE_MODERATOR &&
					tx.logs[1].event === EVENT_ADD_OTHER_CONTRACT,
				'wrong events emitted'
			);

			assert.isTrue(
				tx.logs[0].args.preModerator === newModerator &&
					tx.logs[0].args.preModerator != tx.logs[0].args.currentModerator
			);
			assert.isTrue(tx.logs[1].args.newContractAddr === oracleContract.address);

			let isExist = await roleManagerContract.existingOtherContracts.call(
				oracleContract.address
			);
			assert.isTrue(isExist.valueOf(), 'not set as existing');
			let status = await roleManagerContract.addrStatus.call(oracleContract.address);
			assert.isTrue(status.valueOf() === '3', 'marked as used');
		});
	});

	describe('moderator add address', () => {
		function ADD_ADDR(index)  {
			before(async () => {
				await initContracts();
			});
	
			let moderator = creator;
			it('non moderator cannot add address', async () => {
				try {
					await roleManagerContract.addAddress.call(alice, bob, index, { from: charles });
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});
	
			it('should not add same address', async () => {
				try {
					await roleManagerContract.addAddress.call(alice, alice, index, { from: moderator });
					assert.isTrue(false, 'can add same address');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});
	
			it('should not add used account', async () => {
				try {
					await roleManagerContract.addAddress(pf1, pf2, index, { from: moderator });
					assert.isTrue(false, 'can add used account');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});
	
			it('should add two different address when custodian pool is empty', async () => {
				try {
					await roleManagerContract.addAddress.call(
						web3.utils.toChecksumAddress(alice),
						web3.utils.toChecksumAddress(bob),
						index,
						{ from: moderator }
					);
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});
	
			it('should notw add two different address within cool down', async () => {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.startRoleManager({ from: newModerator });
				await roleManagerContract.setModerator(newModerator2);
				try {
					await roleManagerContract.addAddress(
						web3.utils.toChecksumAddress(alice),
						web3.utils.toChecksumAddress(bob),
						index,
						{ from: newModerator2 }
					);
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});
	
			it('should add two different address', async () => {
				await roleManagerContract.skipCooldown(1);
				let tx = await roleManagerContract.addAddress(
					web3.utils.toChecksumAddress(alice),
					web3.utils.toChecksumAddress(bob),
					index,
					{ from: newModerator2 }
				);
	
				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === EVENT_REPLACE_MODERATOR &&
						tx.logs[1].event === EVENT_ADD_ADDRESS,
					'not exactly one event emitted'
				);
				assert.isTrue(
					tx.logs[1].args['poolIndex'].valueOf() === index.toString() &&
						tx.logs[1].args['added1'].valueOf() === alice &&
						tx.logs[1].args['added2'].valueOf() === bob &&
						tx.logs[1].args['newModerator'] != newModerator2,
					'event args is wrong'
				);
			});
	
			it('pool size should be 10 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
				let poolSize = await roleManagerContract.getPoolSize.call();
				// console.log(poolSize.valueOf());
				assert.isTrue(
					poolSize[0].valueOf() === (index === 0? ColdPool.length.toString(): (ColdPool.length - 2).toString()) &&
						poolSize[1].valueOf() === (index === 0? HotPool.length.toString(): (HotPool.length + 2).toString()),
					'pool size wrong'
				);
				let poolList = [];
				// check validatdion of address
				for (let i = 0; i < poolSize[0].valueOf(); i++) {
					let addr = await roleManagerContract.addrPool.call(index, i);
					assert.isTrue(
						web3.utils.checkAddressChecksum(web3.utils.toChecksumAddress(addr)),
						' invalid address'
					);
					poolList.push(addr);
				}
				// check duplication
				assert.isTrue(
					new Set(poolList).size === poolList.length,
					'pool candidate contains duplicated value'
				);
			});
	
			it('new moderator should be marked as used', async () => {
				let addStatus = await roleManagerContract.addrStatus.call(newModerator2);
				assert.isTrue(addStatus.toNumber() === 3, 'new adder not marked as used');
			});

		}

		describe('addAddr cold', async () => {
			ADD_ADDR(0);
		});
		describe('addAddr hot', async () => {
			ADD_ADDR(1);
		});
	});

	// 	describe('poolManger remove from pool', () => {
	// 		let blockTime;
	// 		before(async () => {
	// 			await initContracts();
	// 			const blockNumber = await web3.eth.getBlockNumber();
	// 			const block = await web3.eth.getBlock(blockNumber);
	// 			blockTime = block.timestamp;
	// 			await beethovenContract.startContract(
	// 				web3.utils.toWei(ethInitPrice + ''),
	// 				blockTime - Number(BeethovenInit.period) * 30,
	// 				A_ADDR,
	// 				B_ADDR,
	// 				{
	// 					from: pf1
	// 				}
	// 			);
	// 		});

	// 		let moderator = pm;
	// 		let nextCandidate;

	// 		it('non moderator cannot remove address', async () => {
	// 			try {
	// 				await beethovenContract.removeAddress.call(alice, { from: bob });
	// 				assert.isTrue(false, 'non moderator can remove address');
	// 			} catch (err) {
	// 				assert.equal(
	// 					err.message,
	// 					'VM Exception while processing transaction: revert',
	// 					'transaction not reverted'
	// 				);
	// 			}
	// 		});

	// 		it('should not remove address not in the pool', async () => {
	// 			try {
	// 				await beethovenContract.removeAddress.call(charles, { from: moderator });
	// 				assert.isTrue(false, 'non moderator can remove address');
	// 			} catch (err) {
	// 				assert.equal(
	// 					err.message,
	// 					'VM Exception while processing transaction: revert',
	// 					'transaction not reverted'
	// 				);
	// 			}
	// 		});

	// 		it('moderator should remove address in the pool', async () => {
	// 			let canRemove = await beethovenContract.removeAddress.call(PoolInit[0], {
	// 				from: moderator
	// 			});
	// 			assert.isTrue(canRemove, 'moderator cannot remove from the pool List');
	// 			let tx = await beethovenContract.removeAddress(PoolInit[0], { from: moderator });
	// 			assert.isTrue(
	// 				tx.logs.length === 1 && tx.logs[0].event === REMOVE_ADDRESS,
	// 				'not exactly one event emitted'
	// 			);
	// 			let args = tx.logs[0].args;
	// 			let sysAddress = await beethovenContract.getSystemAddresses.call();
	// 			moderator = sysAddress[IDX_POOL_MANAGER];
	// 			for (let i = 1; i < PoolInit.length; i++) {
	// 				let currentCandidate = PoolInit[i];
	// 				if (currentCandidate != moderator) {
	// 					nextCandidate = currentCandidate;
	// 					break;
	// 				}
	// 			}
	// 			assert.isTrue(
	// 				web3.utils.toChecksumAddress(args['addr']) === PoolInit[0] &&
	// 					args['newPoolManager'] === moderator,
	// 				'event args is wrong'
	// 			);
	// 		});

	// 		it('pool size should be 4 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
	// 			let sysStates = await beethovenContract.getSystemStates.call();
	// 			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
	// 			// check correct poolSize
	// 			assert.isTrue(poolSize === PoolInit.length - 2, 'cannot remove address');
	// 			let poolList = [];
	// 			// check validatdion of address
	// 			for (let i = 0; i < poolSize; i++) {
	// 				let addr = await beethovenContract.addrPool.call(i);
	// 				assert.isTrue(
	// 					web3.utils.checkAddressChecksum(web3.utils.toChecksumAddress(addr)),
	// 					' invalid address'
	// 				);
	// 				poolList.push(addr);
	// 			}
	// 			// check duplication
	// 			assert.isTrue(
	// 				new Set(poolList).size === poolList.length,
	// 				'pool candidate contains duplicated value'
	// 			);
	// 		});

	// 		it('removed address should be marked as used', async () => {
	// 			let addStatus = await beethovenContract.getAddrStatus.call(PoolInit[0]);
	// 			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
	// 		});

	// 		it('removed address should be not in the poolList', async () => {
	// 			let sysStates = await beethovenContract.getSystemStates.call();
	// 			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
	// 			for (let i = 0; i < poolSize; i++) {
	// 				let addr = await beethovenContract.addrPool.call(i);
	// 				assert.isTrue(
	// 					web3.utils.toChecksumAddress(addr) !==
	// 						web3.utils.toChecksumAddress(PoolInit[0]),
	// 					'new adder is still in the pool'
	// 				);
	// 			}
	// 		});

	// 		it('new moderator should be set correctly', async () => {
	// 			let adderAddr = PoolInit[PoolInit.length - 1];
	// 			assert.isTrue(
	// 				web3.utils.toChecksumAddress(adderAddr) ===
	// 					web3.utils.toChecksumAddress(moderator),
	// 				'adder address not updated correctly'
	// 			);
	// 		});

	// 		it('new moderator should be marked as used', async () => {
	// 			let addStatus = await beethovenContract.getAddrStatus.call(moderator);
	// 			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
	// 		});

	// 		it('new moderator should be removed from the pool', async () => {
	// 			let sysStates = await beethovenContract.getSystemStates.call();
	// 			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
	// 			for (let i = 0; i < poolSize; i++) {
	// 				let addr = await beethovenContract.addrPool.call(i);
	// 				assert.isTrue(
	// 					web3.utils.toChecksumAddress(addr) !==
	// 						web3.utils.toChecksumAddress(moderator),
	// 					'new adder is still in the pool'
	// 				);
	// 			}
	// 		});

	// 		it('new moderator should not remove within coolDown', async () => {
	// 			try {
	// 				await beethovenContract.removeAddress.call(nextCandidate, { from: moderator });
	// 				assert.isTrue(false, 'non moderator can remove address');
	// 			} catch (err) {
	// 				assert.equal(
	// 					err.message,
	// 					'VM Exception while processing transaction: revert',
	// 					'transaction not reverted'
	// 				);
	// 			}
	// 		});

	// 		it('new moderator should only remove beyond coolDown', async () => {
	// 			await beethovenContract.skipCooldown(25);
	// 			let success = await beethovenContract.removeAddress.call(nextCandidate, {
	// 				from: moderator
	// 			});
	// 			assert.isTrue(success, 'cannot add outside cooldown');
	// 		});
	// 	});
});
