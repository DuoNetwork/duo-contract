const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const Esplanade = artifacts.require('../contracts/common/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/oracles/MagiMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const Pool = InitParas['Pool'];
const MagiInit = InitParas['Magi'];

// Event
const EVENT_TERMINATE_CON_VOTING = 'TerminateContractVoting';
const EVENT_startModeratorVoting = 'StartModeratorVoting';
const EVENT_TERMINATE_TIMEOUT = 'TerminateByTimeStamp';
const EVENT_REPLACE_MODERATOR = 'ReplaceModerator';
const EVENT_ADD_CUSTODIAN = 'AddCustodian';
const EVENT_ADD_OTHER_CONTRACT = 'AddOtherContract';
const EVENT_ADD_ADDRESS = 'AddAddress';
const EVENT_REMOVE_ADDRESS = 'RemoveAddress';

const STATE_VOTING_NOT_STARTED = '0';
const STATE_VOTING_MODERATOR = '1';
const STATE_VOTING_CONTRACT = '2';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

// const DUMMY_ADDR = '0xc';
const CONTRACT_CANDIDTDE = '0xa8Cac43aA0C2B61BA4e0C10DC85bCa02662E1Bee';

contract('Esplanade', accounts => {
	let custodianContract, duoContract, roleManagerContract, oracleContract;
	let newCustodianContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const pf1 = accounts[2];
	const pf2 = accounts[3];
	const pf3 = accounts[4];
	const alice = accounts[5];
	const bob = accounts[6];
	const charles = accounts[7];
	const david = accounts[8];
	const eric = accounts[9];
	const frank = accounts[10];
	const newModerator = accounts[11];
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

		roleManagerContract = await Esplanade.new(RoleManagerInit.optCoolDown, {
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

	const startContractVoting = async custodianContract => {
		await roleManagerContract.addCustodian(custodianContract.address, { from: creator });
		await roleManagerContract.skipCooldown(1);
		await roleManagerContract.setModerator(newModerator);
		newCustodianContract = await initCustodian();
		await roleManagerContract.setPassedContract(newCustodianContract.address);
		return await roleManagerContract.startContractVoting(newCustodianContract.address, {
			from: newModerator
		});
	};

	const startModeratorVoting = async () => {
		await roleManagerContract.setPool(0, 0, alice);
		let tx = await roleManagerContract.startModeratorVoting({ from: alice });
		return tx;
	};

	const setPools = async (index, addr) => {
		for (let i = 0; i < addr.length; i++) {
			await roleManagerContract.setPool(index, i, addr[i]);
		}
	};

	const vote = async (voters, voteFor) => {
		assert.isTrue(voters.length <= voteFor.length, 'length not equal');
		for (let i = 0; i < voters.length; i++)
			await roleManagerContract.vote(voteFor[i], { from: voters[i] });
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
			let tx = await startContractVoting(custodianContract);
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
			await startContractVoting(custodianContract);
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
			await startContractVoting(custodianContract);
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
			let tx = await startModeratorVoting();
			// console.log(tx);
			let candidate = await roleManagerContract.candidate.call();
			assert.equal(candidate.valueOf(), alice, 'not equal');
			let votingStage = await roleManagerContract.votingStage.call();
			assert.equal(votingStage.valueOf(), STATE_VOTING_MODERATOR, 'voting stage wrong');
			let status = await roleManagerContract.addrStatus.call(alice);
			assert.equal(status.valueOf(), '3', 'not marked as used');
			// console.log(tx.logs.length, tx.logs[0].event);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_startModeratorVoting,
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
				await setPools(0, [bob, charles]);
				(await isContract)
					? startContractVoting(custodianContract)
					: startModeratorVoting();
				try {
					await vote([bob, bob], [true, true]);
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('less than half votes is not allowed to complete', async () => {
				isContract
					? await startContractVoting(custodianContract)
					: await startModeratorVoting();
				let voters = [bob, charles, david, eric];
				await setPools(0, voters);
				await vote(voters, [true, true, true, true]);
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
					? await startContractVoting(custodianContract)
					: await startModeratorVoting();
				let voters = [bob, charles, david, eric, frank];
				await setPools(0, voters);
				await vote(voters, [true, true, true, true, true]);
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
						? await startContractVoting(custodianContract)
						: await startModeratorVoting();
					roleManagerContract.terminateByTimeout({ from: alice });
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('cannot terminate within timeout', async () => {
				try {
					isContract
						? await startContractVoting(custodianContract)
						: await startModeratorVoting();
					roleManagerContract.terminateByTimeout({ from: alice });
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
				}
			});

			it('can terminate beyond timeout', async () => {
				isContract
					? await startContractVoting(custodianContract)
					: await startModeratorVoting();
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

	describe('start startManager', () => {
		before(initContracts);
		it('non moderator not allowed to start', async () => {
			try {
				await roleManagerContract.startManager.call({ from: alice });
				assert.isTrue(false, 'can start voting');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('canot start by without add custodian', async () => {
			try {
				await roleManagerContract.startManager({ from: creator });
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('can start by moderator', async () => {
			await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			await roleManagerContract.setModerator(newModerator);
			await roleManagerContract.startManager({ from: newModerator });
			let started = await roleManagerContract.started.call();
			assert.isTrue(started.valueOf(), ' not started');
		});

		it('cannot start if already started', async () => {
			try {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.startManager({ from: newModerator });
				await roleManagerContract.setModerator(newModerator2);
				await roleManagerContract.startManager({ from: newModerator2 });
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
		function ADD_ADDR(index) {
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
					await roleManagerContract.addAddress.call(alice, alice, index, {
						from: moderator
					});
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
				await roleManagerContract.startManager({ from: newModerator });
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
					poolSize[0].valueOf() ===
						(index === 0
							? Pool[0].length.toString()
							: (Pool[0].length - 2).toString()) &&
						poolSize[1].valueOf() ===
							(index === 0
								? Pool[1].length.toString()
								: (Pool[1].length + 2).toString()),
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

	describe('moderator remove from pool', () => {
		function REMOVE_ADDR(index) {
			beforeEach(async () => {
				await initContracts();
			});

			let moderator = creator;

			it('non moderator cannot remove address', async () => {
				try {
					await roleManagerContract.removeAddress.call(Pool[index][0], 0, {
						from: alice
					});
					assert.isTrue(false, 'non moderator can remove address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('index should not be more than 1', async () => {
				try {
					await roleManagerContract.removeAddress.call(Pool[index][0], 2, {
						from: moderator
					});
					assert.isTrue(false, 'non moderator can remove address');
				} catch (err) {
					assert.equal(err.message, VM_INVALID_OPCODE_MSG, 'transaction not reverted');
				}
			});

			it('should not remove address not in the pool', async () => {
				try {
					await roleManagerContract.removeAddress.call(charles, index, {
						from: moderator
					});
					assert.isTrue(false, 'non moderator can remove address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('should not remove if custodian pool size less than 1', async () => {
				try {
					await roleManagerContract.removeAddress.call(
						web3.utils.toChecksumAddress(Pool[index][0]),
						index,
						{ from: moderator }
					);
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('should not remove if poolSize is less than threshold', async () => {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: moderator
				});
				await roleManagerContract.skipCooldown(1);
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.setMinPoolSize.call(Pool[index].length);
				try {
					await roleManagerContract.removeAddress.call(
						web3.utils.toChecksumAddress(Pool[index][0]),
						index,
						{ from: newModerator }
					);
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('moderator should remove address in the pool', async () => {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: moderator
				}); // consume one from coldPool
				await roleManagerContract.skipCooldown(1);
				await roleManagerContract.setModerator(newModerator);
				let addrToRemove = await roleManagerContract.addrPool.call(index, 0);
				let tx = await roleManagerContract.removeAddress(addrToRemove.valueOf(), index, {
					from: newModerator
				});

				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === EVENT_REPLACE_MODERATOR &&
						tx.logs[1].event === EVENT_REMOVE_ADDRESS,
					'not exactly one event emitted'
				);
				let args = tx.logs[1].args;
				assert.isTrue(
					args.poolIndex.valueOf() === index.toString() &&
						web3.utils.toChecksumAddress(args.addr.valueOf()) ===
							web3.utils.toChecksumAddress(Pool[index][0]) &&
						args.newModerator != newModerator,
					'wrong event arguments'
				);
				let currentModerator = web3.utils.toChecksumAddress(
					tx.logs[0].args.currentModerator
				);
				let validatedPool = Pool[0].map(addr => web3.utils.toChecksumAddress(addr));

				assert.isTrue(validatedPool.includes(currentModerator));
				let poolSize = await roleManagerContract.getPoolSize.call().valueOf();
				let length = poolSize[0];
				for (let i = 1; i < length; i++) {
					let poolAddr = await roleManagerContract.addrPool.call(0, i);
					assert.isTrue(web3.utils.toChecksumAddress(poolAddr) != currentModerator);
				}
				assert.isTrue(
					poolSize[index].valueOf() ===
						(Pool[index].length - (index === 0 ? 3 : 1)).toString(),
					'cannot remove address'
				);

				let addStatus = await roleManagerContract.addrStatus.call(Pool[index][0]);
				// console.log(addStatus.valueOf());
				assert.isTrue(addStatus.toNumber() === 3, 'removed adder not marked as used');

				let addStatusOfNewModerator = await roleManagerContract.addrStatus.call(
					currentModerator
				);
				assert.isTrue(
					addStatusOfNewModerator.toNumber() === 3,
					'new adder not marked as used'
				);
			});

			it('new moderator should not remove within coolDown', async () => {
				let tx = await roleManagerContract.addCustodian(custodianContract.address, {
					from: moderator
				}); // consume one from coldPool
				await roleManagerContract.skipCooldown(1);
				await roleManagerContract.setModerator(newModerator);

				let addrToRemove = Pool[index][0];
				// console.log(tx.logs[0].args.currentModerator.valueOf().toLowerCase());
				addrToRemove =
					tx.logs[0].args.currentModerator.valueOf().toLowerCase() ===
					addrToRemove.toLowerCase()
						? Pool[index][1]
						: addrToRemove;

				tx = await roleManagerContract.removeAddress(addrToRemove, index, {
					from: newModerator
				});

				let currentModerator = web3.utils.toChecksumAddress(
					tx.logs[0].args.currentModerator
				);

				addrToRemove = Pool[index][2];
				// console.log(tx.logs[0].args.currentModerator.valueOf().toLowerCase());
				addrToRemove =
					tx.logs[0].args.currentModerator.valueOf().toLowerCase() ===
					addrToRemove.toLowerCase()
						? Pool[index][3]
						: addrToRemove;
				try {
					await roleManagerContract.removeAddress.call(Pool[index][0], index, {
						from: currentModerator
					});
					// assert.isTrue(false, 'non moderator can remove address');
				} catch (err) {
					// console.log(err.message === VM_REVERT_MSG);
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});
		}

		describe('remove cold pool', () => {
			REMOVE_ADDR(0);
		});

		describe('remove hot pool', () => {
			REMOVE_ADDR(1);
		});
	});

	describe('provideAddress', () => {
		function PROVIDE_ADDR(index) {
			beforeEach(async () => {
				await initContracts();
			});

			// let moderator = creator;
			// let index = 0;
			it('non contract address cannot request provideAddress', async () => {
				try {
					await roleManagerContract.provideAddress.call(Pool[0][0], index, {
						from: alice
					});
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('non cold address cannot request provideAddress', async () => {
				try {
					await roleManagerContract.provideAddress.call(Pool[1][0], index, {
						from: custodianContract.address
					});
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('should not provideAddr if poolSize below threshold', async () => {
				await roleManagerContract.setMinPoolSize(10);
				try {
					await roleManagerContract.provideAddress.call(Pool[0][0], index, {
						from: custodianContract.address
					});
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('poolIndex should be smaller than 2', async () => {
				try {
					await roleManagerContract.provideAddress.call(Pool[0][0], 3, {
						from: custodianContract.address
					});
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('should not add with custodian pool empty', async () => {
				try {
					await roleManagerContract.provideAddress.call(Pool[0][0], index, {
						from: custodianContract.address
					});
					assert.isTrue(false, 'non adder can add address');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'transaction not reverted');
				}
			});

			it('custodian contract can provideAddr', async () => {
				await custodianContract.setRoleManager(roleManagerContract.address);
				await roleManagerContract.addCustodian(custodianContract.address);
				roleManagerContract.skipCooldown(1);
				await roleManagerContract.setPool(0, 0, alice);
				await roleManagerContract.addrStatus.call(alice);
				let addr = await custodianContract.triggerProvideAddr.call(index, { from: alice });
				await custodianContract.triggerProvideAddr(index, { from: alice });
				let statusAddr = await roleManagerContract.addrStatus.call(addr);
				let statusAlice = await roleManagerContract.addrStatus.call(alice);
				assert.isTrue(statusAddr.valueOf() === '3' && statusAlice.valueOf() === '3');

				let validatedPool = Pool[index].map(addr => web3.utils.toChecksumAddress(addr));
				assert.isTrue(validatedPool.includes(web3.utils.toChecksumAddress(addr)));

				let poolSize = await roleManagerContract.getPoolSize.call();
				assert.isTrue(
					poolSize.valueOf()[index].toNumber() === 10 - (index === 0 ? 3 : 1),
					'poolSize not updated corrctly'
				);
			});

			it('other contract can provideAddr', async () => {
				await oracleContract.setRoleManager(roleManagerContract.address);
				await roleManagerContract.addCustodian(custodianContract.address);
				roleManagerContract.skipCooldown(1);
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: newModerator
				});
				roleManagerContract.skipCooldown(1);
				await roleManagerContract.setPool(0, 0, alice);
				let addr = await oracleContract.triggerProvideAddr.call(index, { from: alice });
				await oracleContract.triggerProvideAddr(index, { from: alice });
				let statusAddr = await roleManagerContract.addrStatus.call(addr);
				let statusAlice = await roleManagerContract.addrStatus.call(alice);
				assert.isTrue(statusAddr.valueOf() === '3' && statusAlice.valueOf() === '3');

				let validatedPool = Pool[index].map(addr => web3.utils.toChecksumAddress(addr));
				assert.isTrue(validatedPool.includes(web3.utils.toChecksumAddress(addr)));

				let poolSize = await roleManagerContract.getPoolSize.call();
				assert.isTrue(
					poolSize.valueOf()[index].toNumber() === 10 - (index === 0 ? 4 : 1),
					'poolSize not updated corrctly'
				);
			});
		}

		describe('provideAddress cold', () => {
			PROVIDE_ADDR(0);
		});

		describe('provideAddress hot', () => {
			PROVIDE_ADDR(1);
		});
	});
});
