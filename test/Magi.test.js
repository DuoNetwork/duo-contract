const Custodian = artifacts.require('../contracts/mocks/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/mocks/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/mocks/MagiMock.sol');
const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['BeethovenPPT'];
const RoleManagerInit = InitParas['RoleManager'];
const Pool = InitParas['Pool'];
const MagiInit = InitParas['Magi'];
const util = require('./util');
// Event
const EVENT_ACCEPT_PRICE = 'AcceptPrice';
const EVENT_COMMIT_PRICE = 'CommitPrice';
const EVENT_UPDATE_PF = 'UpdatePriceFeed';
const EVENT_SET_VALUE = 'SetValue';

const ethInitPrice = 582;

let validHotPool = Pool[1].map(addr => util.toChecksumAddress(addr));

contract('Magi', accounts => {
	let custodianContract, roleManagerContract, oracleContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const pf1 = accounts[2];
	const pf2 = accounts[3];
	const pf3 = accounts[4];
	const alice = accounts[5];
	const bob = accounts[6];
	const newModerator = accounts[11];

	const initContracts = async () => {
		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});
		custodianContract = await initCustodian();
		oracleContract = await initOracle();
	};

	const initCustodian = async () => {
		return await Custodian.new(
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

	const initOracle = async () => {
		return await Magi.new(
			creator,
			pf1,
			pf2,
			pf3,
			roleManagerContract.address,
			MagiInit.pxFetchCoolDown,
			MagiInit.optCoolDown,
			{
				from: creator
			}
		);
	};

	describe('constructor', () => {
		before(initContracts);

		it('opt should be set correctly', async () => {
			let value = await oracleContract.operator.call();
			assert.equal(value.valueOf(), creator, 'opt is not set correctly');
		});

		it('pf1 should be set correctly', async () => {
			let value = await oracleContract.priceFeed1.call();
			assert.equal(value.valueOf(), pf1, 'pf1 is not set correctly');
		});

		it('pf2 should be set correctly', async () => {
			let value = await oracleContract.priceFeed2.call();
			assert.equal(value.valueOf(), pf2, 'pf2 is not set correctly');
		});

		it('pf3 should be set correctly', async () => {
			let value = await oracleContract.priceFeed3.call();
			assert.equal(value.valueOf(), pf3, 'pf3 is not set correctly');
		});

		it('roleManagerAddr should be set correctly', async () => {
			let value = await oracleContract.roleManagerAddress.call();
			assert.equal(
				value.valueOf(),
				roleManagerContract.address,
				'roleManagerAddr is not set correctly'
			);
		});

		it('pxCoolDown should be set correctly', async () => {
			let value = await oracleContract.priceUpdateCoolDown.call();
			assert.equal(
				value.valueOf(),
				MagiInit.pxFetchCoolDown,
				'pxCoolDown is not set correctly'
			);
		});

		it('optCoolDown should be set correctly', async () => {
			let value = await oracleContract.operationCoolDown.call();
			assert.equal(value.valueOf(), MagiInit.optCoolDown, 'optCoolDown is not set correctly');
		});
	});

	describe('startOrcle', () => {
		before(initContracts);
		let startPrice = 224.52;

		it('non pf cannot start', async () => {
			let blockTime = await util.getLastBlockTime();
			try {
				await oracleContract.startOracle.call(blockTime, util.toWei(startPrice), {
					from: alice
				});
				assert.isTrue(false, 'non pf can start');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('startTime should be less than blockchain time', async () => {
			let blockTime = await oracleContract.timestamp.call();

			try {
				await oracleContract.startOracle.call(
					util.toWei(startPrice),
					blockTime.valueOf() + 10,
					{ from: pf1 }
				);
				assert.isTrue(false, 'startTime can be less than blockchain time');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
			}
		});

		it('states should be set correctly upon start', async () => {
			let blockTime = await oracleContract.timestamp.call();
			let tx = await oracleContract.startOracle(util.toWei(startPrice), blockTime.valueOf(), {
				from: pf1
			});
			let started = await oracleContract.started.call();
			let lastPrice = await oracleContract.lastPrice.call();
			assert.isTrue(started.valueOf(), 'not started');
			assert.isTrue(
				util.isEqual(util.fromWei(lastPrice[0]), startPrice),
				'initial price not set correctly'
			);
			assert.isTrue(
				util.isEqual(lastPrice[1].toString(), blockTime.toString()),
				'initial time not set correctly'
			);
			assert.equal(lastPrice[2].valueOf(), pf1, 'initial address not set correctly');

			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_ACCEPT_PRICE,
				'wrong events'
			);
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), startPrice) &&
					Number(tx.logs[0].args.timeInSecond.valueOf()) ===
						Number(blockTime.valueOf()) &&
					tx.logs[0].args.sender === pf1,
				'wrong event args'
			);
		});

		it('cannot start once has been started', async () => {
			let blockTime = await oracleContract.timestamp.call();
			try {
				await oracleContract.startOracle.call(util.toWei(startPrice), blockTime.valueOf(), {
					from: pf1
				});
				assert.isTrue(false, 'not reverted');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
			}
		});
	});

	describe('commit price', () => {
		let firstPeriod;
		let secondPeriod;
		let blockTime;

		before(async () => {
			await initContracts();
			blockTime = await oracleContract.timestamp.call();
			await oracleContract.startOracle(
				util.toWei(ethInitPrice),
				blockTime - Number(BeethovenInit.pd) * 10,
				{
					from: pf1
				}
			);
		});

		it('non pf address cannot call commitPrice method', async () => {
			try {
				await oracleContract.commitPrice.call(util.toWei(400), blockTime, {
					from: alice
				});
				assert.isTrue(false, 'non pf address can commit price');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, '');
			}
		});

		it('should accept first price arrived if it is not too far away', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			let success = await oracleContract.commitPrice.call(
				util.toWei(580),
				firstPeriod.valueOf(),
				{
					from: pf1
				}
			);
			assert.isTrue(success);
			let tx = await oracleContract.commitPrice(util.toWei(580), firstPeriod.valueOf(), {
				from: pf1
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 580),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf()),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender.valueOf(), pf1, 'sender is not updated correctly');
		});

		it('should not accept first price arrived if it is too far away', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf(), {
				from: pf1
			});
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_PRICE,
				'incorrect event emitted'
			);
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 500) &&
					Number(tx.logs[0].args.timeInSecond.valueOf()) ===
						Number(firstPeriod.valueOf()) &&
					tx.logs[0].args.sender === pf1 &&
					Number(tx.logs[0].args.index.valueOf()) === 0,
				'incorrect event arguments emitted'
			);
			let firstPrice = await oracleContract.firstPrice.call();
			assert.isTrue(
				util.isEqual(util.fromWei(firstPrice[0]), 500),
				'first price is not recorded correctly'
			);
			assert.isTrue(
				util.isEqual(firstPrice[1].valueOf(), firstPeriod.valueOf()),
				'first price time is not recorded correctly'
			);
		});

		it('should reject price from the same sender within cool down', async () => {
			try {
				await oracleContract.commitPrice(util.toWei(570), firstPeriod.valueOf(), {
					from: pf1
				});

				assert.isTrue(false, 'the price is not rejected');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'the VM is not reverted');
			}
		});

		it('should accept second price arrived if second price timed out and sent by the same address as first price', async () => {
			await oracleContract.skipCooldown(1);

			secondPeriod = await oracleContract.timestamp.call();

			let tx = await oracleContract.commitPrice(util.toWei(550), secondPeriod.valueOf(), {
				from: pf1
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 550),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(secondPeriod.valueOf()),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source is not updated correctly');
		});

		it('should accept first price arrived if second price timed out and sent by the different address as first price', async () => {
			// first price
			await oracleContract.skipCooldown(1);

			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf(), {
				from: pf1
			});

			// second price
			await oracleContract.skipCooldown(1);
			secondPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(util.toWei(550), secondPeriod.valueOf(), {
				from: pf2
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 500),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(secondPeriod.valueOf()),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should accept first price arrived if second price is close to it and within cool down', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(util.toWei(550), firstPeriod.valueOf() - 10, {
				from: pf1
			});
			// second price
			let tx = await oracleContract.commitPrice(util.toWei(555), firstPeriod.valueOf() - 5, {
				from: pf2
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 550),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf() - 10),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should accept first price arrived if second price timed fall beyond time tolerance and sent by the different address as first price', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(util.toWei(580), firstPeriod.valueOf() - 10, {
				from: pf1
			});

			// second price
			tx = await oracleContract.commitPrice(util.toWei(550), firstPeriod.valueOf() - 300, {
				from: pf2
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 580),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf() - 10),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should wait for third price if first and second do not agree', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf() - 300, {
				from: pf1
			});
			// second price
			let tx = await oracleContract.commitPrice(
				util.toWei(700),
				firstPeriod.valueOf() - 280,
				{
					from: pf2
				}
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_COMMIT_PRICE,
				'incorrect event emitted'
			);

			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 700) &&
					Number(tx.logs[0].args.timeInSecond.valueOf()) ===
						Number(firstPeriod.valueOf()) - 280 &&
					tx.logs[0].args.sender === pf2 &&
					Number(tx.logs[0].args.index.valueOf()) === 1,
				'incorrect event arguments emitted'
			);
			let secondPrice = await oracleContract.secondPrice.call();

			assert.isTrue(
				util.isEqual(secondPrice[0].valueOf(), util.toWei('700')) &&
					util.isEqual(secondPrice[1].valueOf(), firstPeriod.valueOf() - 280),
				'second price is not recorded'
			);
		});

		it('should reject price from first sender within cool down', async () => {
			// third price
			try {
				await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf(), {
					from: pf1
				});

				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'third price is not rejected');
			}
		});

		it('should reject price from second sender within cool down', async () => {
			// third price
			try {
				await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf(), {
					from: pf2
				});
				assert.isTrue(false, 'third price is not rejected');
			} catch (err) {
				assert.equal(err.message, util.VM_REVERT_MSG, 'third price is not rejected');
			}
		});

		it('should accept first price arrived if third price timed out and within cool down', async () => {
			let tx = await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf(), {
				from: pf3
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 500),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf()) - 300,
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should accept median price if third price does not time out', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();

			await oracleContract.commitPrice(util.toWei(550), firstPeriod.valueOf() - 300, {
				from: pf1
			});
			// second price
			await oracleContract.commitPrice(util.toWei(400), firstPeriod.valueOf() - 280, {
				from: pf2
			});
			// //third price
			let tx = await oracleContract.commitPrice(
				util.toWei(540),
				firstPeriod.valueOf() - 260,
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 540),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf()) - 300,
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should accept second price if third price is same as second', async () => {
			// first price
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();

			await oracleContract.commitPrice(util.toWei(600), firstPeriod.valueOf() - 300, {
				from: pf1
			});
			// console.log(tx.logs);
			// second price
			await oracleContract.commitPrice(util.toWei(540), firstPeriod.valueOf() - 280, {
				from: pf2
			});
			// // //third price
			let tx = await oracleContract.commitPrice(
				util.toWei(540),
				firstPeriod.valueOf() - 260,
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 540),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(firstPeriod.valueOf()) - 300,
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf1, 'source not updated correctly');
		});

		it('should accept third price arrived if it is from first or second sender and is after cool down', async () => {
			await oracleContract.skipCooldown(1);

			firstPeriod = await oracleContract.timestamp.call();

			await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf() - 300, {
				from: pf1
			});
			// second price
			await oracleContract.commitPrice(util.toWei(400), firstPeriod.valueOf() - 280, {
				from: pf2
			});
			// //third price
			await oracleContract.skipCooldown(1);
			secondPeriod = await oracleContract.timestamp.call();

			let tx = await oracleContract.commitPrice(util.toWei(520), secondPeriod.valueOf(), {
				from: pf2
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 520),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(secondPeriod.valueOf()),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf2, 'source not updated correctly');
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', async () => {
			await oracleContract.skipCooldown(1);
			firstPeriod = await oracleContract.timestamp.call();
			await oracleContract.commitPrice(util.toWei(580), firstPeriod.valueOf() - 200, {
				from: pf1
			});
			// second price
			await oracleContract.commitPrice(util.toWei(500), firstPeriod.valueOf() - 180, {
				from: pf2
			});
			// // //third price
			await oracleContract.skipCooldown(1);

			secondPeriod = await oracleContract.timestamp.call();
			let tx = await oracleContract.commitPrice(util.toWei(520), secondPeriod.valueOf(), {
				from: pf3
			});
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, EVENT_ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				util.isEqual(util.fromWei(tx.logs[0].args.priceInWei), 500),
				'last price is not updated correctly'
			);
			assert.equal(
				Number(tx.logs[0].args.timeInSecond.valueOf()),
				Number(secondPeriod.valueOf()),
				'last price time is not updated correctly'
			);
			assert.equal(tx.logs[0].args.sender, pf2, 'source not updated correctly');
		});

		it('should not allow price commit during cool down period', async () => {
			try {
				await oracleContract.skipCooldown(1);

				firstPeriod = await oracleContract.timestamp.call();
				await oracleContract.commitPrice(util.toWei(400), firstPeriod.valueOf() - 800, {
					from: pf1
				});
				assert.isTrue(false, 'can commit price within cooldown period');
			} catch (err) {
				assert.equal(
					err.message,
					util.VM_REVERT_MSG,
					'can commit price within cooldown period'
				);
			}
		});
	});

	describe('calculate median', () => {
		before(async () => {
			await initContracts();
			let currentBlockTime = await oracleContract.timestamp.call();
			await oracleContract.startOracle(
				util.toWei(ethInitPrice + ''),
				currentBlockTime - Number(BeethovenInit.pd) * 10,
				{
					from: pf1
				}
			);
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(400, 500, 600, { from: alice })
				.then(median => assert.equal(median.valueOf(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(500, 600, 400, { from: alice })
				.then(median => assert.equal(median.valueOf(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(600, 400, 500, { from: alice })
				.then(median => assert.equal(median.valueOf(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(600, 600, 500, { from: alice })
				.then(median => assert.equal(median.valueOf(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(500, 600, 600, { from: alice })
				.then(median => assert.equal(median.valueOf(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return oracleContract.getMedianPublic
				.call(600, 500, 600, { from: alice })
				.then(median => assert.equal(median.valueOf(), 600, 'the median is wrong'));
		});
	});

	describe('getLastPrice', () => {
		let blockTime;
		before(async () => {
			await initContracts();
			blockTime = await oracleContract.timestamp.call();
			await oracleContract.startOracle(
				util.toWei(ethInitPrice + ''),
				blockTime.valueOf() - Number(BeethovenInit.pd),
				{
					from: pf1
				}
			);
		});

		it('should getLastPrice', async () => {
			let lastPrices = await oracleContract.getLastPrice.call();
			assert.isTrue(
				util.isEqual(util.fromWei(lastPrices[0]), ethInitPrice) &&
					util.isEqual(
						lastPrices[1].valueOf(),
						blockTime.valueOf() - Number(BeethovenInit.pd)
					),
				'wrong price'
			);
		});
	});

	describe('updatePriceFeed', () => {
		function updatePriceFeed(index) {
			before(initContracts);

			it('hot address cannot updatePriceFeed', async () => {
				try {
					await oracleContract.updatePriceFeed.call(0, { from: alice });
					assert.isTrue(false, 'hot address can update price feed');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
				}
			});

			it('should update priceFeed', async () => {
				await roleManagerContract.addCustodian(custodianContract.address, {
					from: creator
				});
				await roleManagerContract.setModerator(newModerator);
				await roleManagerContract.skipCooldown(1);
				await roleManagerContract.addOtherContracts(oracleContract.address, {
					from: newModerator
				});
				await roleManagerContract.setPool(0, 0, alice);
				let tx = await oracleContract.updatePriceFeed(index, { from: alice });

				let newFeedAddr;
				switch (index) {
					case 0:
						newFeedAddr = await oracleContract.priceFeed1.call();
						break;
					case 1:
						newFeedAddr = await oracleContract.priceFeed2.call();
						break;
					case 2:
						newFeedAddr = await oracleContract.priceFeed3.call();
						break;
					default:
						assert.isTrue(false, 'wrong argument');
				}
				assert.isTrue(
					validHotPool.includes(util.toChecksumAddress(newFeedAddr)),
					'address not from hot pool'
				);
				let statusOfAlice = await roleManagerContract.addrStatus.call(alice);
				let statusOfNewAddr = await roleManagerContract.addrStatus.call(newFeedAddr);
				assert.isTrue(
					Number(statusOfAlice.valueOf()) === 3 &&
						Number(statusOfNewAddr.valueOf()) === 3,
					'status updated incorrectly'
				);

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_UPDATE_PF,
					'wrong events'
				);
				assert.isTrue(
					tx.logs[0].args.updater === alice &&
						tx.logs[0].args.newPriceFeed === newFeedAddr.valueOf(),
					'wrong event args'
				);
			});

			it('should not update priceFeed in cooldown period', async () => {
				await roleManagerContract.setPool(0, 0, bob);
				try {
					await oracleContract.updatePriceFeed(index, { from: bob });
					assert.isTrue(false, 'can update price feed in cool down period');
				} catch (err) {
					assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
				}
			});
		}

		describe('updatePF1', () => {
			updatePriceFeed(0);
		});

		describe('updatePF2', () => {
			updatePriceFeed(1);
		});

		describe('updatePF3', () => {
			updatePriceFeed(2);
		});
	});

	describe('setValue', () => {
		function setValue(index, value) {
			before(initContracts);

			if (index > 3) {
				it('should not set for index more than 3', async () => {
					try {
						await oracleContract.setValue(index, value, { from: creator });
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});
			} else {
				it('non operator cannot setValue', async () => {
					try {
						await oracleContract.setValue(index, value, { from: alice });
						assert.isTrue(false, 'non operater can setValue');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});

				it('value should be updated correctly', async () => {
					let oldValue;
					let newValue;
					let tx;
					switch (index) {
						case 0:
							oldValue = await oracleContract.priceTolInBP.call();
							tx = await oracleContract.setValue(index, value, { from: creator });
							newValue = await oracleContract.priceTolInBP.call();
							break;
						case 1:
							oldValue = await oracleContract.priceFeedTolInBP.call();
							tx = await oracleContract.setValue(index, value, { from: creator });
							newValue = await oracleContract.priceFeedTolInBP.call();
							break;
						case 2:
							oldValue = await oracleContract.priceFeedTimeTol.call();
							tx = await oracleContract.setValue(index, value, { from: creator });
							newValue = await oracleContract.priceFeedTimeTol.call();
							break;
						case 3:
							oldValue = await oracleContract.priceUpdateCoolDown.call();
							tx = await oracleContract.setValue(index, value, { from: creator });
							newValue = await oracleContract.priceUpdateCoolDown.call();
							break;
						default:
							try {
								await oracleContract.setValue(index, value, { from: creator });
								assert.isTrue(false, 'wrong argument');
							} catch (err) {
								assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
							}
							break;
					}
					assert.equal(newValue.valueOf(), value + '', 'wrong value');

					assert.isTrue(
						tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
						'wrong events'
					);

					assert.isTrue(
						Number(tx.logs[0].args.index.valueOf()) === index &&
							Number(tx.logs[0].args.oldValue.valueOf()) ===
								Number(oldValue.valueOf()) &&
							Number(tx.logs[0].args.newValue.valueOf()) === value,
						'event argument wrong'
					);
				});

				it('cannot update within cool down', async () => {
					try {
						await oracleContract.setValue(index, value, { from: creator });
						assert.isTrue(false, 'non update within cool down');
					} catch (err) {
						assert.equal(err.message, util.VM_REVERT_MSG, 'not reverted');
					}
				});
			}
		}

		describe('set priceTolInBP', () => {
			setValue(0, 100);
		});

		describe('set priceFeedTolInBP', () => {
			setValue(1, 200);
		});

		describe('set priceFeedTimeTol', () => {
			setValue(2, 300);
		});

		describe('set priceUpdateCoolDown', () => {
			setValue(3, 400);
		});

		describe('should not set 4', () => {
			setValue(4, 400);
		});
	});
});
