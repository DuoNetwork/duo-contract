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
const Pool = InitParas['Pool'];
const MagiInit = InitParas['Magi'];

const STATE_TRADING = '1';
const STATE_PRE_RESET = '2';
const STATE_UPWARD_RESET = '3';
const STATE_DOWNWARD_RESET = '4';
const STATE_PERIODIC_RESET = '5';

const IDX_FIRST_PX = 1;
const IDX_FIRST_TS = 2;

const IDX_SECOND_PX = 4;
const IDX_SECOND_TS = 5;
// const IDX_RESET_ADDR = 6;
const IDX_RESET_PX = 7;
const IDX_RESET_TS = 8;
// const IDX_LAST_ADDR = 9;
const IDX_LAST_PX = 10;
const IDX_LAST_TS = 11;

// Event
const EVENT_ACCEPT_PRICE = 'AcceptPrice';
const EVENT_COMMIT_PRICE = 'CommitPrice';
// const EVENT_TERMINATE_TIMEOUT = 'TerminateByTimeStamp';
// const EVENT_REPLACE_MODERATOR = 'ReplaceModerator';
// const EVENT_ADD_CUSTODIAN = 'AddCustodian';
// const EVENT_ADD_OTHER_CONTRACT = 'AddOtherContract';
// const EVENT_ADD_ADDRESS = 'AddAddress';
// const EVENT_REMOVE_ADDRESS = 'RemoveAddress';

// const STATE_VOTING_NOT_STARTED = '0';
// const STATE_VOTING_MODERATOR = '1';
// const STATE_VOTING_CONTRACT = '2';

const EPSILON = 1e-10;
const ethInitPrice = 582;
const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

// // const DUMMY_ADDR = '0xc';
// const CONTRACT_CANDIDTDE = '0xa8Cac43aA0C2B61BA4e0C10DC85bCa02662E1Bee';

const isEqual = (a, b, log = false) => {
	if (log) {
		console.log(a);
		console.log(b);
	}
	if (Math.abs(Number(b)) > EPSILON && Math.abs(Number(b)) > EPSILON) {
		return Math.abs(Number(a) - Number(b)) / Number(b) <= EPSILON;
	} else {
		return Math.abs(Number(a) - Number(b)) <= EPSILON;
	}
};

const assertState = async state => {
	let sysStates = await oracleContract.getSystemStates.call();
	assert.equal(sysStates[IDX_STATE].valueOf(), state, 'state is wrong');
};

contract('Custodian', accounts => {
	let custodianContract, duoContract, roleManagerContract, oracleContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const pf1 = accounts[2];
	const pf2 = accounts[3];
	const pf3 = accounts[4];
	const alice = accounts[5];
	// const bob = accounts[6];
	// const charles = accounts[7];
	// const david = accounts[8];
	// const eric = accounts[9];
	// const frank = accounts[10];
	// const newModerator = accounts[11];
	// const newModerator2 = accounts[12];

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

		it('opt should be not started', async () => {
			let value = await oracleContract.operator.call();
			assert.equal(value.valueOf(), creator, 'opt is not not started');
		});

		it('pf1 should be not started', async () => {
			let value = await oracleContract.priceFeed1.call();
			assert.equal(value.valueOf(), pf1, 'pf1 is not not started');
		});

		it('pf2 should be not started', async () => {
			let value = await oracleContract.priceFeed2.call();
			assert.equal(value.valueOf(), pf2, 'pf2 is not not started');
		});

		it('pf3 should be not started', async () => {
			let value = await oracleContract.priceFeed3.call();
			assert.equal(value.valueOf(), pf3, 'pf3 is not not started');
		});

		it('roleManagerAddr should be not started', async () => {
			let value = await oracleContract.roleManagerAddress.call();
			assert.equal(
				value.valueOf(),
				roleManagerContract.address,
				'roleManagerAddr is not not started'
			);
		});

		it('pxCoolDown should be not started', async () => {
			let value = await oracleContract.priceUpdateCoolDown.call();
			assert.equal(value.valueOf(), MagiInit.pxCoolDown, 'pxCoolDown is not not started');
		});

		it('optCoolDown should be not started', async () => {
			let value = await oracleContract.operationCoolDown.call();
			assert.equal(value.valueOf(), MagiInit.optCoolDown, 'optCoolDown is not not started');
		});
	});

	describe('startOrcle', () => {
		before(initContracts);
		let startPrice = 224.52;

		it('non pf cannot start', async () => {
			let blockNumber = await web3.eth.getBlockNumber();
			let block = await web3.eth.getBlock(blockNumber);
			let blockTime = block.timestamp;
			try {
				await oracleContract.startOracle.call(
					blockTime,
					web3.utils.toWei(startPrice + '', 'ether'),
					{ from: alice }
				);
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('startTime should be less than blockchain time', async () => {
			let blockTime = await oracleContract.timestamp.call();
	
			try{
				await oracleContract.startOracle.call(
					web3.utils.toWei(startPrice + '', 'ether'),
					blockTime.valueOf() + 10,
					{ from: pf1 }
				);
			}catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('states should be set correctly upon start', async () => {
			let blockTime = await oracleContract.timestamp.call();
			let tx = await oracleContract.startOracle(
				web3.utils.toWei(startPrice + '', 'ether'),
				blockTime.valueOf(),
				{ from: pf1 }
			);
			let started = await oracleContract.started.call();
			let lastPrice = await oracleContract.lastPrice.call();
			assert.isTrue(started.valueOf(), 'not started');
			assert.isTrue(lastPrice[0].valueOf() === web3.utils.toWei(startPrice + '', 'ether') && 
			lastPrice[1].valueOf() === blockTime.valueOf() &&
			lastPrice[2].valueOf() === pf1,
			'initial states not set correctly');

			assert.isTrue(tx.logs.length ===1 && tx.logs[0].event === EVENT_ACCEPT_PRICE);
			assert.isTrue(
				tx.logs[0].args.priceInWei.valueOf() ===web3.utils.toWei(startPrice + '', 'ether') && 
				tx.logs[0].args.timeInSecond.valueOf() === blockTime.valueOf() &&
				tx.logs[0].args.sender === pf1
			
			);


		});

		it('cannot start once has been started', async () => {
			let blockTime = await oracleContract.timestamp.call();
			try{
				await oracleContract.startOracle.call(
					web3.utils.toWei(startPrice + '', 'ether'),
					blockTime.valueOf(),
					{ from: pf1 }
				);
				assert.isTrue(false, 'not reverted');
			}catch(err){
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}

		});
	});

	describe.only('commit price', () => {
		let firstPeriod;
		let secondPeriod;
		let blockTime;
	
		before(async () => {
			await initContracts();
			blockTime = await oracleContract.timestamp.call();
			await oracleContract.startOracle(
				web3.utils.toWei(ethInitPrice + ''),
				blockTime - Number(BeethovenInit.period) * 10,
				{
					from: pf1
				}
			);
		});
	
		it('non pf address cannot call commitPrice method', async () => {
			try {
				await oracleContract.commitPrice.call(web3.utils.toWei('400'), blockTime, {
					from: alice
				});
				assert.isTrue(false, 'non pf address can commit price');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, '');
			}
		});
	
		it('should accept first price arrived if it is not too far away', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			let success = await oracleContract.commitPrice.call(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.isTrue(success);
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('580')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber()),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'sender is not updated correctly'
			);
		});
	
		it('should not accept first price arrived if it is too far away', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_PRICE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.priceInWei.valueOf() === web3.utils.toWei('500') &&
					tx.logs[0].args.timeInSecond.toNumber() === firstPeriod.toNumber() &&
					tx.logs[0].args.sender.valueOf() === pf1 &&
					tx.logs[0].args.index.toNumber() === 0,
				'incorrect event arguments emitted'
			);
			let firstPrice = await oracleContract.firstPrice.call();
			// let px = sysPrices[IDX_FIRST_PX];
			// let ts = sysPrices[IDX_FIRST_TS];
			assert.isTrue(
				isEqual(firstPrice[0].toNumber(), web3.utils.toWei('500')) &&
					isEqual(firstPrice[1].toNumber(), firstPeriod.toNumber()),
				'first price is not recorded'
			);
		});
	
		it('should reject price from the same sender within cool down', async () => {
			try {
				await oracleContract.commitPrice(
					web3.utils.toWei('570'),
					firstPeriod.toNumber(),
					{
						from: pf1
					}
				);
	
				assert.isTrue(false, 'the price is not rejected');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'the VM is not reverted');
			}
		});
	
		it('should accept second price arrived if second price timed out and sent by the same address as first price', async () => {
			await oracleContract.skipCooldown(1);
	
			secondPeriod = await oracleContract.timestamp.call();
	
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('550')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'source is not updated correctly'
			);
		});
	// });
	
		it('should accept first price arrived if second price timed out and sent by the different address as first price', async () => {
			// first price
			await oracleContract.skipCooldown(1);
	
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
				from: pf1
			});
	
			// second price
			await oracleContract.skipCooldown(1);
			secondPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'source not updated correctly'
			);
		});
	
		it('should accept first price arrived if second price is close to it and within cool down', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 10,
				{
					from: pf1
				}
			);
			// second price
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('555'),
				firstPeriod.toNumber() - 5,
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			// console.log(web3.utils.fromWei(tx.logs[0].args.priceInWei.valueOf(), 'ether'));
			assert.isTrue(
				isEqual(web3.utils.fromWei(tx.logs[0].args.priceInWei.valueOf(), 'ether'), '550'),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 10),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'source not updated correctly'
			);
		});
	
		it('should wait for third price if first and second do not agree', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('700'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_PRICE,
				'incorrect event emitted'
			);

			assert.isTrue(
				tx.logs[0].args.priceInWei.valueOf() === web3.utils.toWei('700') &&
					tx.logs[0].args.timeInSecond.toNumber() === firstPeriod.toNumber() - 280 &&
					tx.logs[0].args.sender.valueOf() === pf2 &&
					tx.logs[0].args.index.toNumber() === 1,
				'incorrect event arguments emitted'
			);
			let secondPrice = await oracleContract.secondPrice.call();

			assert.isTrue(
				isEqual(secondPrice[0].toNumber(), web3.utils.toWei('700')) &&
					isEqual(secondPrice[1].toNumber(), firstPeriod.toNumber() - 280),
				'second price is not recorded'
			);
		});
	
		it('should reject price from first sender within cool down', async () => {
			// third price
			try {
				await oracleContract.commitPrice(
					web3.utils.toWei('500'),
					firstPeriod.toNumber(),
					{
						from: pf1
					}
				);
	
				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected');
			}
		});
	
		it('should reject price from second sender within cool down', async () => {
			// third price
			try {
				await oracleContract.commitPrice(
					web3.utils.toWei('500'),
					firstPeriod.toNumber(),
					{
						from: pf2
					}
				);
				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.isTrue(err.message === VM_REVERT_MSG, 'third price is not rejected');
			}
		});
	
		it('should accept first price arrived if third price timed out and within cool down', async () => {
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 300),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'source not updated correctly'
			);
		});
	
		it('should accept median price if third price does not time out', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
	
			await oracleContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await oracleContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('540'),
				firstPeriod.toNumber() - 260,
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('540')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 300),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf1),
				'source not updated correctly'
			);
		});
	
		it('should accept third price arrived if it is from first or second sender and is after cool down', async () => {
			await oracleContract.skipCooldown(1);
	
			firstPeriod = await oracleContract.timestamp.call();
	
			await oracleContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await oracleContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			await oracleContract.skipCooldown(1);
			secondPeriod = await oracleContract.timestamp.call();
	
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('520')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf2),
				'source not updated correctly'
			);
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber() - 200,
				{
					from: pf1
				}
			);
			// second price
			await oracleContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 180,
				{
					from: pf2
				}
			);
			// // //third price
			await oracleContract.skipCooldown(1);
	
			secondPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber(), web3.utils.toWei('500')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.timeInSecond.toNumber(), secondPeriod.toNumber()),
				'last price time is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[0].args.sender.valueOf(), pf2),
				'source not updated correctly'
			);
		});
	
		it('should not allow price commit during cool down period', async () => {
			try {
				await oracleContract.skipCooldown(1);
	
				firstPeriod = await oracleContract.timestamp.call();
				await oracleContract.commitPrice(
					web3.utils.toWei('400'),
					firstPeriod.toNumber() - 800,
					{
						from: pf1
					}
				);
				assert.isTrue(false, 'can commit price within cooldown period');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can commit price within cooldown period');
			}
		});

	});
});
