const Beethoven = artifacts.require('../contracts/custodians/BeethovenMock');
// const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const A = artifacts.require('../contracts/tokens/TokenA.sol');
const B = artifacts.require('../contracts/tokens/TokenB.sol');
const RoleManager = artifacts.require('../contracts/common/EsplanadeMock.sol');
const Magi = artifacts.require('../contracts/oracles/MagiMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const WETH = artifacts.require('../contracts/tokens/WETH.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const AInit = InitParas['TokenA'];
const BInit = InitParas['TokenB'];
// const Pool = InitParas['Pool'];
const MagiInit = InitParas['Magi'];

// Event
const EVENT_ACCEPT_PX = 'AcceptPrice';
const EVENT_START_TRADING = 'StartTrading';
// const START_TRADING = 'StartTrading';
const EVENT_CREATE = 'Create';
const EVENT_REDEEM = 'Redeem';
const EVENT_TOTAL_SUPPLY = 'TotalSupply';
const EVENT_START_RESET = 'StartReset';
// const EVENT_TRANSFER = 'Transfer';
// const APPROVAL = 'Approval';
// const ADD_ADDRESS = 'AddAddress';
// const UPDATE_ADDRESS = 'UpdateAddress';
// const REMOVE_ADDRESS = 'RemoveAddress';
const EVENT_SET_VALUE = 'SetValue';
const EVENT_COLLECT_FEE = 'CollectFee';

const STATE_INCEPT_RESET = '0';
const STATE_TRADING = '1';
const STATE_PRE_RESET = '2';
const STATE_RESET = '3';
const STATE_UPWARD_RESET = '0';
const STATE_DOWNWARD_RESET = '1';
const STATE_PERIODIC_RESET = '2';

const DUMMY_ADDR = '0xc';

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
const VM_INVALID_OP_CODE_MSG = 'VM Exception while processing transaction: invalid opcode';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 1e-10;
const ethInitPrice = 582;
const ethDuoFeeRatio = 800;

// const A_ADDR = '0xa';
// const B_ADDR = '0xb';

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
const assertState = async (beethovenContract, state) => {
	let _state = await beethovenContract.state.call();
	assert.isTrue(_state.valueOf() === state);
};

const assertResetState = async (beethovenContract, state) => {
	let _state = await beethovenContract.resetState.call();
	assert.isTrue(_state.valueOf() === state);
};

contract('Beethoven', accounts => {
	let beethovenContract;
	let duoContract;
	let roleManagerContract;
	let aContract, bContract;
	let oracleContract;
	let wethContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	// const pm = accounts[5];
	const alice = accounts[6]; //duoMember
	const bob = accounts[7];
	const charles = accounts[8];
	// const david = accounts[9];

	const WEI_DENOMINATOR = 1e18;
	const BP_DENOMINATOR = 10000;

	const initContracts = async (alphaInBP = 0) => {
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

		beethovenContract = await Beethoven.new(
			duoContract.address,
			roleManagerContract.address,
			fc,
			alphaInBP ? alphaInBP : BeethovenInit.alphaInBP,
			web3.utils.toWei(BeethovenInit.couponRate),
			web3.utils.toWei(BeethovenInit.hp),
			web3.utils.toWei(BeethovenInit.hu),
			web3.utils.toWei(BeethovenInit.hd),
			BeethovenInit.comm,
			BeethovenInit.pd,
			BeethovenInit.optCoolDown,
			BeethovenInit.pxFetchCoolDown,
			BeethovenInit.iteGasTh,
			BeethovenInit.ethDuoRate,
			BeethovenInit.preResetWaitBlk,
			{
				from: creator
			}
		);

		aContract = await A.new(AInit.tokenName, AInit.tokenSymbol, beethovenContract.address, {
			from: creator
		});
		bContract = await B.new(BInit.tokenName, BInit.tokenSymbol, beethovenContract.address, {
			from: creator
		});

		oracleContract = await Magi.new(
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

		wethContract = await WETH.new();
	};

	describe('constructor', () => {
		before(initContracts);

		it('alpha should equal specified value', async () => {
			let alpha = await beethovenContract.alphaInBP.call();
			assert.equal(alpha.toNumber(), BeethovenInit.alphaInBP, 'alpha specified incorrect');
		});

		it('period should equal specified value', async () => {
			let pd = await beethovenContract.period.call();
			assert.equal(pd.valueOf(), BeethovenInit.pd, 'period specified incorrect');
		});

		it('limitPeriodicInWei should equal specified value', async () => {
			let limitPeriodicInWei = await beethovenContract.limitPeriodicInWei.call();
			// console.log(web3.utils.fromWei(limitPeriodicInWei.valueOf(), 'ether'), BeethovenInit.hp);
			assert.equal(
				web3.utils.fromWei(limitPeriodicInWei.valueOf(), 'ether'),
				BeethovenInit.hp + '',
				'limitPeriodicInWei specified incorrect'
			);
		});

		it('limitUpperInWei should equal specified value', async () => {
			let limitUpperInWei = await beethovenContract.limitUpperInWei.call();
			// console.log(web3.utils.fromWei(limitUpperInWei.valueOf(), 'ether'), BeethovenInit.hu);
			assert.equal(
				web3.utils.fromWei(limitUpperInWei.valueOf(), 'ether'),
				Number(BeethovenInit.hu) + '',
				'limitUpperInWei specified incorrect'
			);
		});

		it('limitLowerInWei should equal specified value', async () => {
			let limitLowerInWei = await beethovenContract.limitLowerInWei.call();
			assert.equal(
				web3.utils.fromWei(limitLowerInWei.valueOf(), 'ether'),
				BeethovenInit.hd + '',
				'limitLowerInWei specified incorrect'
			);
		});

		it('iterationGasThreshold should equal specified value', async () => {
			let iterationGasThreshold = await beethovenContract.iterationGasThreshold.call();
			assert.equal(
				iterationGasThreshold.valueOf(),
				BeethovenInit.iteGasTh,
				'iterationGasThreshold specified incorrect'
			);
		});

		it('ethDuoFeeRatio should equal specified value', async () => {
			let ethDuoFeeRatio = await beethovenContract.ethDuoFeeRatio.call();
			assert.equal(
				ethDuoFeeRatio.valueOf(),
				BeethovenInit.ethDuoRate,
				'ethDuoRate specified incorrect'
			);
		});

		it('createCommInBP should equal specified value', async () => {
			let createCommInBP = await beethovenContract.createCommInBP.call();
			assert.equal(
				createCommInBP.valueOf(),
				BeethovenInit.comm + '',
				'ethDuoRate specified incorrect'
			);
		});

		it('redeemCommInBP should equal specified value', async () => {
			let comm = await beethovenContract.redeemCommInBP.call();
			assert.equal(comm.toNumber(), BeethovenInit.comm, 'redeemCommInBP specified incorrect');
		});

		it('bAdj should equal specified value', async () => {
			let bAdj = await beethovenContract.getBadj.call();
			assert.equal(
				web3.utils.fromWei(bAdj.valueOf(), 'ether'),
				'2',
				'bAdj specified incorrect'
			);
		});

		it('preResetWaitingBlocks should equal specified value', async () => {
			let preResetWaitingBlocks = await beethovenContract.preResetWaitingBlocks.call();
			// console.log(web3.utils.fromWei(preResetWaitingBlocks.valueOf(), 'ether'));
			assert.equal(
				preResetWaitingBlocks.valueOf(),
				'10',
				'preResetWaitingBlocks specified incorrect'
			);
		});
	});

	describe('startCustodian', () => {
		before(initContracts);
		let time;

		it('state should be Inception before starting', async () => {
			let state = await beethovenContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('non operator cannot start', async () => {
			try {
				await beethovenContract.startCustodian.call(
					aContract.address,
					bContract.address,
					oracleContract.address,
					{ from: alice }
				);
				assert.isTrue(false, 'can start');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should not start with oracle not ready', async () => {
			try {
				await beethovenContract.startCustodian.call(
					aContract.address,
					bContract.address,
					oracleContract.address,
					{ from: creator }
				);
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should start contract', async () => {
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				time.valueOf(),
				pf1
			);

			let tx = await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);

			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_ACCEPT_PX &&
					tx.logs[1].event === EVENT_START_TRADING,
				'worng event emitted'
			);

			assert.isTrue(
				web3.utils.fromWei(tx.logs[0].args.priceInWei.valueOf(), 'ether') ===
					Number(ethInitPrice).toString() &&
					tx.logs[0].args.timeInSecond.valueOf() === time.valueOf() &&
					web3.utils.fromWei(tx.logs[0].args.navAInWei.valueOf(), 'ether') === '1' &&
					web3.utils.fromWei(tx.logs[0].args.navBInWei.valueOf(), 'ether') === '1',
				'worng event parameter emitted'
			);
		});

		it('should update lastPrice and resetPrice', async () => {
			let lastPrice = await beethovenContract.lastPriceInWei.call();
			let lastPriceTime = await beethovenContract.lastPriceTimeInSecond.call();
			assert.equal(
				lastPrice.valueOf(),
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				'lastPrice price not updated correctly'
			);
			assert.equal(
				lastPriceTime.valueOf(),
				time.valueOf(),
				'lastPrice time not updated correctly'
			);

			let resetPrice = await beethovenContract.resetPriceInWei.call();
			let resetPriceTime = await beethovenContract.resetPriceTimeInSecond.call();
			assert.equal(
				resetPrice.valueOf(),
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				'resetPrice price not updated correctly'
			);
			assert.equal(
				resetPriceTime.valueOf(),
				time.valueOf(),
				'resetPrice time not updated correctly'
			);
		});

		it('state should be trading', async () => {
			let state = await beethovenContract.state.call();
			assert.equal(state.valueOf(), STATE_TRADING, 'state is not trading');
		});
	});

	describe('fetchPrice', () => {
		let time;
		beforeEach(async () => {
			await initContracts();
			time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				time.valueOf(),
				pf1
			);
			await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);
		});

		it('should not fetchPrice 0', async () => {
			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();
			await beethovenContract.setTimestamp(time.toNumber());
			await oracleContract.setLastPrice(0, time.valueOf(), pf1);
			try {
				await beethovenContract.fetchPrice();
			} catch (err) {
				assert.equal(
					err.message,
					VM_INVALID_OP_CODE_MSG,
					'can collect fee more than allowed'
				);
			}
		});

		it('should fetchPrice with time more than current time', async () => {
			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();
			await beethovenContract.setTimestamp(time.toNumber() - 1);
			await oracleContract.setLastPrice(100, time.valueOf(), pf1);
			try {
				await beethovenContract.fetchPrice();
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can collect fee more than allowed');
			}
		});

		it('should fetchPrice price', async () => {
			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();
			await beethovenContract.setTimestamp(time.toNumber());
			await oracleContract.setLastPrice(
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				time.valueOf(),
				pf1
			);
			let tx = await beethovenContract.fetchPrice();
			assert.isTrue(tx.logs.length === 1 && tx.logs[0].event === EVENT_ACCEPT_PX);
			assert.isTrue(
				web3.utils.fromWei(tx.logs[0].args.priceInWei.valueOf(), 'ether') ===
					ethInitPrice.toString() &&
					tx.logs[0].args.timeInSecond.valueOf() === time.valueOf(),
				'wrong fetching'
			);
		});
	});

	describe('creation', () => {
		function CREATE(isWithWETH) {
			let amtEth = 1;
			let tokenValueB =
				((1 - BeethovenInit.comm / BP_DENOMINATOR) * ethInitPrice) /
				(1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);
			let tokenValueA = (BeethovenInit.alphaInBP / BP_DENOMINATOR) * tokenValueB;

			let tokenValueBPayFeeDUO =
				ethInitPrice / (1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);
			let tokenValueAPayFeeDUO =
				(BeethovenInit.alphaInBP / BP_DENOMINATOR) * tokenValueBPayFeeDUO;
			let accumulatedFeeAfterWithdrawal;
			let preDUO = 1000000;
			let feeOfDUOinWei = ((amtEth * BeethovenInit.comm) / BP_DENOMINATOR) * ethDuoFeeRatio;
			let totalSupplyA, totalSupplyB;
			before(async () => {
				await initContracts();
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(
					web3.utils.toWei(ethInitPrice + '', 'ether'),
					time.valueOf(),
					pf1
				);
				await beethovenContract.startCustodian(
					aContract.address,
					bContract.address,
					oracleContract.address,
					{ from: creator }
				);
				await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
				await duoContract.approve(beethovenContract.address, web3.utils.toWei('1000000'), {
					from: alice
				});
				if (isWithWETH) {
					await wethContract.deposit({
						from: alice,
						value: web3.utils.toWei(amtEth * 3 + '', 'ether')
					});
				}
			});

			if (isWithWETH) {
				it('cannot createWiethWETH with not enough allowance', async () => {
					try {
						await beethovenContract.createWithWETH.call(
							web3.utils.toWei(amtEth + '', 'ether'),
							true,
							wethContract.address,
							{ from: alice }
						);
					} catch (err) {
						assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
					}
				});

				it('cannot createWiethWETH with more than balance', async () => {
					await wethContract.approve(
						beethovenContract.address,
						web3.utils.toWei(amtEth + '', 'ether'),
						{ from: alice }
					);
					try {
						await beethovenContract.createWithWETH.call(
							web3.utils.toWei(amtEth * 4 + '', 'ether'),
							true,
							wethContract.address,
							{ from: alice }
						);
					} catch (err) {
						assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
					}
				});
			}

			it('should create', async () => {
				let tx;
				let preBalance, afterBalance;
				if (isWithWETH) {
					await wethContract.approve(
						beethovenContract.address,
						web3.utils.toWei(amtEth + '', 'ether'),
						{ from: alice }
					);
					preBalance = await web3.eth.getBalance(beethovenContract.address);
					tx = await beethovenContract.createWithWETH(
						web3.utils.toWei(amtEth + '', 'ether'),
						true,
						wethContract.address,
						{ from: alice }
					);
				} else {
					tx = await beethovenContract.create(true, {
						from: alice,
						value: web3.utils.toWei(amtEth + '')
					});
				}

				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === EVENT_CREATE &&
						tx.logs[1].event === EVENT_TOTAL_SUPPLY,
					'incorrect event emitted'
				);

				assert.isTrue(
					tx.logs[0].args.sender === alice &&
						isEqual(
							// tx.logs[0].args.tokenAInWei.toNumber() / WEI_DENOMINATOR,
							web3.utils.fromWei(tx.logs[0].args.tokenAInWei.valueOf(), 'ether'),
							tokenValueA + ''
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.tokenBInWei.valueOf(), 'ether'),
							tokenValueB + ''
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.ethAmtInWei.valueOf(), 'ether'),
							amtEth * (1 - BeethovenInit.comm / BP_DENOMINATOR) + ''
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.ethFeeInWei.valueOf(), 'ether'),
							(amtEth * BeethovenInit.comm) / BP_DENOMINATOR + ''
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.duoFeeInWei.valueOf(), 'ether'),
							'0'
						),
					'incorrect event arguments emitted'
				);

				afterBalance = await web3.eth.getBalance(beethovenContract.address);

				if (isWithWETH) {
					assert.isTrue(
						web3.utils.fromWei(afterBalance.valueOf() + '', 'ether') -
							web3.utils.fromWei(preBalance.valueOf() + '', 'ether') ===
							amtEth,
						'contract balance updated incorrectly'
					);
				}

				totalSupplyA = tokenValueA;
				totalSupplyB = tokenValueB;
				assert.isTrue(
					isEqual(
						web3.utils.fromWei(tx.logs[1].args.totalSupplyAInWei.valueOf(), 'ether'),
						totalSupplyA + ''
					) &&
						isEqual(
							web3.utils.fromWei(
								tx.logs[1].args.totalSupplyBInWei.valueOf(),
								'ether'
							),
							totalSupplyB + ''
						),
					'totalSupply not updated connectly'
				);
			});

			it('feeAccumulated should be updated', async () => {
				let ethFee = await beethovenContract.ethFeeBalanceInWei.call();
				let fee = (1 * BeethovenInit.comm) / BP_DENOMINATOR;
				assert.isTrue(
					web3.utils.fromWei(ethFee.valueOf(), 'ether') === fee.toString(),
					'feeAccumulated not updated correctly'
				);
			});

			it('should update user list if required', async () => {
				let userIdx = await beethovenContract.existingUsers.call(alice);
				assert.isTrue(userIdx.toNumber() === 1, 'new user is not updated');
			});

			it('should update balance of A correctly', async () => {
				let balanceA = await beethovenContract.balanceOf.call(0, alice);
				assert.isTrue(
					isEqual(
						web3.utils.fromWei(balanceA.valueOf(), 'ether'),
						tokenValueA.toString()
					),
					'balance A not updated correctly'
				);
			});

			it('should update balance of B correctly', async () => {
				let balanceB = await beethovenContract.balanceOf.call(1, alice);
				assert.isTrue(
					isEqual(
						web3.utils.fromWei(balanceB.valueOf(), 'ether'),
						tokenValueB.toString()
					),
					'balance B not updated correctly'
				);
			});

			it('should createWithWETH token A and B payFee with DUO', async () => {
				let tx;
				if (isWithWETH) {
					await wethContract.approve(
						beethovenContract.address,
						web3.utils.toWei(amtEth + '', 'ether'),
						{ from: alice }
					);
					tx = await beethovenContract.createWithWETH(
						web3.utils.toWei(amtEth + '', 'ether'),
						false,
						wethContract.address,
						{ from: alice }
					);
				} else {
					tx = await beethovenContract.create(false, {
						from: alice,
						value: web3.utils.toWei(amtEth + '')
					});
				}

				// console.log(tx);

				assert.isTrue(
					tx.logs.length === 2 &&
						tx.logs[0].event === EVENT_CREATE &&
						tx.logs[1].event === EVENT_TOTAL_SUPPLY,
					'incorrect event emitted'
				);

				totalSupplyA += tokenValueAPayFeeDUO;
				totalSupplyB += tokenValueBPayFeeDUO;
				assert.isTrue(
					tx.logs[0].args.sender === alice &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.tokenAInWei.valueOf(), 'ether'),
							tokenValueAPayFeeDUO
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.tokenBInWei.valueOf(), 'ether'),
							tokenValueBPayFeeDUO
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.ethAmtInWei.valueOf(), 'ether'),
							amtEth
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.ethFeeInWei.valueOf(), 'ether'),
							0
						) &&
						isEqual(
							web3.utils.fromWei(tx.logs[0].args.duoFeeInWei.valueOf(), 'ether'),
							((amtEth * BeethovenInit.comm) / BP_DENOMINATOR) * ethDuoFeeRatio
						),
					'incorrect event arguments emitted'
				);

				assert.isTrue(
					isEqual(
						web3.utils.fromWei(tx.logs[1].args.totalSupplyAInWei.valueOf(), 'ether'),
						totalSupplyA.toString()
					) &&
						isEqual(
							web3.utils.fromWei(
								tx.logs[1].args.totalSupplyBInWei.valueOf(),
								'ether'
							),
							totalSupplyB.toString()
						),
					'totalSupply not updated connectly'
				);
			});

			it('should update DUO balance of Alice correctly', async () => {
				let balanceOfAlice = await duoContract.balanceOf.call(alice);
				assert.isTrue(
					isEqual(preDUO - balanceOfAlice.toNumber() / WEI_DENOMINATOR, feeOfDUOinWei),
					'DUO balance of Alice of updated correctly'
				);
			});

			it('should update burned DUO correctly', async () => {
				let burntDUOamt = await duoContract.balanceOf.call(beethovenContract.address);
				assert.isTrue(
					burntDUOamt.toNumber() / WEI_DENOMINATOR === feeOfDUOinWei,
					'burned DUO not updated correctly'
				);
			});

			it('should not create token A and B payFee with insufficient DUO allowed', async () => {
				try {
					await beethovenContract.create(false, {
						from: bob,
						value: web3.utils.toWei('1')
					});
					assert.isTrue(false, 'able to create without DUO allowed');
				} catch (err) {
					assert.equal(err.message, VM_REVERT_MSG, 'can collect fee more than allowed');
				}
			});

			it('should not be added into userList with small creation amt', async () => {
				await beethovenContract.create(true, {
					from: charles,
					value: web3.utils.toWei('0.00003')
				});
				let userIdx = await beethovenContract.existingUsers.call(charles);
				assert.isTrue(userIdx.toNumber() === 0, 'new user is included in userList');
			});

			it('should only collect fee less than allowed', async () => {
				try {
					await beethovenContract.collectEthFee.call(web3.utils.toWei('1'), { from: fc });
					assert.isTrue(false, 'can collect fee more than allowed');
				} catch (err) {
					assert.equal(
						err.message,
						VM_INVALID_OP_CODE_MSG,
						'can collect fee more than allowed'
					);
				}
			});

			it('should collectETH fee', async () => {
				let ethFeeBalanceInWei = await beethovenContract.ethFeeBalanceInWei.call();
				let duoFeeBalanceInWei = await duoContract.balanceOf.call(
					beethovenContract.address
				);
				accumulatedFeeAfterWithdrawal =
					ethFeeBalanceInWei.toNumber() - web3.utils.toWei('0.0001');
				let success = await beethovenContract.collectEthFee.call(
					web3.utils.toWei('0.0001'),
					{
						from: fc
					}
				);
				assert.isTrue(success);
				let tx = await beethovenContract.collectEthFee(web3.utils.toWei('0.0001'), {
					from: fc
				});

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_COLLECT_FEE,
					'worng event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.addr.valueOf() === fc &&
						tx.logs[0].args.ethFeeInWei.valueOf() === web3.utils.toWei('0.0001') &&
						tx.logs[0].args.ethFeeBalanceInWei.toNumber() ===
							accumulatedFeeAfterWithdrawal &&
						tx.logs[0].args.duoFeeInWei.valueOf() === '0' &&
						tx.logs[0].args.duoFeeBalanceInWei.valueOf() ===
							duoFeeBalanceInWei.valueOf(),
					'worng fee parameter'
				);
			});

			it('should fee pending withdrawal amount should be updated correctly', async () => {
				let ethFeeBalanceInWei = await beethovenContract.ethFeeBalanceInWei.call();
				assert.isTrue(
					isEqual(
						ethFeeBalanceInWei.toNumber() / WEI_DENOMINATOR,
						accumulatedFeeAfterWithdrawal / WEI_DENOMINATOR
					),
					'fee not updated correctly'
				);
			});
		}

		describe('ucreate with ETH', () => {
			CREATE(false);
		});

		describe('ucreate with ETH', () => {
			CREATE(true);
		});
	});

	describe('redemption and eth withdrawal', () => {
		let prevBalanceA, prevBalanceB, prevFeeAccumulated;
		let amtA = 28;
		let amtB = 29;
		let adjAmtA = (amtA * BP_DENOMINATOR) / BeethovenInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = (deductAmtB * BeethovenInit.alphaInBP) / BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtB) / ethInitPrice;
		let fee = (amtEth * BeethovenInit.comm) / BP_DENOMINATOR;
		let preDUO = 1000000;
		let feeInDUO = fee * ethDuoFeeRatio;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts();
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				time.valueOf(),
				pf1
			);
			await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);
			await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
			await duoContract.transfer(bob, web3.utils.toWei(preDUO + ''), { from: creator });
			await beethovenContract.create(true, { from: alice, value: web3.utils.toWei('1') });
			prevBalanceA = await beethovenContract.balanceOf.call(0, alice);
			prevBalanceB = await beethovenContract.balanceOf.call(1, alice);
			let ethFee = await beethovenContract.ethFeeBalanceInWei.call();
			prevFeeAccumulated = ethFee.valueOf();
			await duoContract.approve(beethovenContract.address, web3.utils.toWei('1000000'), {
				from: alice
			});
			totalSupplyA = await beethovenContract.totalSupplyA.call();
			totalSupplyA = totalSupplyA.toNumber() / WEI_DENOMINATOR;
			totalSupplyB = await beethovenContract.totalSupplyB.call();
			totalSupplyB = totalSupplyB.toNumber() / WEI_DENOMINATOR;
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await beethovenContract.redeem(
					web3.utils.toWei('2800'),
					web3.utils.toWei('2900'),
					true,
					{
						from: alice
					}
				);
				assert.isTrue(false, 'able to redeem more than allowed');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'able to redeem more than allowed');
			}
		});

		it('should redeem token A and B fee paying with eth', async () => {
			let success = await beethovenContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await beethovenContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REDEEM &&
					tx.logs[1].event === EVENT_TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			totalSupplyA = totalSupplyA - deductAmtA;
			totalSupplyB = totalSupplyB - deductAmtB;

			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.tokenAInWei.valueOf(), 'ether'),
						deductAmtA
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.tokenBInWei.valueOf(), 'ether'),
						deductAmtB
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.ethAmtInWei.valueOf(), 'ether'),
						amtEth - fee
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.ethFeeInWei.valueOf(), 'ether'),
						fee
					) &&
					isEqual(web3.utils.fromWei(tx.logs[0].args.duoFeeInWei.valueOf(), 'ether'), 0),
				'incorrect event arguments emitted'
			);

			// console.log(tx.logs[1].args.totalSupplyAInWei.valueOf(), totalSupplyA);
			assert.isTrue(
				isEqual(
					web3.utils.fromWei(tx.logs[1].args.totalSupplyAInWei.valueOf(), 'ether'),
					totalSupplyA
				) &&
					isEqual(
						web3.utils.fromWei(tx.logs[1].args.totalSupplyBInWei.valueOf(), 'ether'),
						totalSupplyB
					)
			);
		});

		it('feeAccumulated should be updated', async () => {
			let feeAccumulated = await beethovenContract.ethFeeBalanceInWei.call();
			// let feeAccumulated = sysStates[IDX_FEE_IN_WEI];
			assert.isTrue(
				isEqual(
					web3.utils.fromWei(feeAccumulated.minus(prevFeeAccumulated).valueOf(), 'ether'),
					fee
				),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await beethovenContract.balanceOf.call(0, alice);
			// console.log(currentBalanceA.toNumber() / WEI_DENOMINATOR);
			assert.isTrue(
				isEqual(
					currentBalanceA.toNumber() / WEI_DENOMINATOR + deductAmtA,
					prevBalanceA.toNumber() / WEI_DENOMINATOR
				),
				'balance A not updated correctly after redeed'
			);
		});

		it('should update balance of B correctly', async () => {
			let currentBalanceB = await beethovenContract.balanceOf.call(1, alice);
			assert.isTrue(
				isEqual(
					currentBalanceB.toNumber() / WEI_DENOMINATOR + deductAmtB,
					prevBalanceB.toNumber() / WEI_DENOMINATOR
				),
				'balance B not updated correctly after redeed'
			);
		});

		it('should be in user list', async () => {
			let userIdx = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(userIdx.toNumber() === 1, 'user not in the user list');
			let userSize = await beethovenContract.getUserSize.call();
			assert.equal(userSize.toNumber(), 1, 'user size not updated correctly');
		});

		it('should redeem token A and B fee paying with DUO token', async () => {
			let success = await beethovenContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await beethovenContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === EVENT_REDEEM &&
					tx.logs[1].event === EVENT_TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			totalSupplyA = totalSupplyA - deductAmtA;
			totalSupplyB = totalSupplyB - deductAmtB;
			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.tokenAInWei.valueOf(), 'ether'),
						deductAmtA
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.tokenBInWei.valueOf(), 'ether'),
						deductAmtB
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.ethAmtInWei.valueOf(), 'ether'),
						amtEth
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.ethFeeInWei.valueOf(), 'ether'),
						0
					) &&
					isEqual(
						web3.utils.fromWei(tx.logs[0].args.duoFeeInWei.valueOf(), 'ether'),
						((amtEth * BeethovenInit.comm) / BP_DENOMINATOR) * ethDuoFeeRatio
					),
				'incorrect event arguments emitted'
			);
			assert.isTrue(
				isEqual(
					web3.utils.fromWei(tx.logs[1].args.totalSupplyAInWei.valueOf(), 'ether'),
					totalSupplyA
				) &&
					isEqual(
						web3.utils.fromWei(tx.logs[1].args.totalSupplyBInWei.valueOf(), 'ether'),
						totalSupplyB
					)
			);
		});

		it('should update DUO balance of Alice correctly', async () => {
			let balanceOfAlice = await duoContract.balanceOf.call(alice);

			assert.isTrue(
				isEqual(preDUO - balanceOfAlice.toNumber() / WEI_DENOMINATOR, feeInDUO),
				'DUO balance of Alice of updated incorrectly'
			);
		});

		it('should update burned DUO correctly', async () => {
			let burntDUOamt = await duoContract.balanceOf.call(beethovenContract.address);
			assert.isTrue(
				isEqual(burntDUOamt.toNumber() / WEI_DENOMINATOR, feeInDUO),
				'burned DUO not updated correctly'
			);
		});

		it('should be in user list', async () => {
			let userIdx = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(userIdx.toNumber() === 1, 'user not in the user list');
			let userSize = await beethovenContract.getUserSize.call();
			assert.equal(userSize.toNumber(), 1, 'user size not updated correctly');
		});

		it('should be removed from user list if all tokens are redeemed', async () => {
			// await web3.eth.sendTransaction({from: creator, to: beethovenContract.address, value: web3.utils.toWei('10', 'ether')});
			await beethovenContract.setCollatarization(web3.utils.toWei('1', 'ether'));
			let currentBalanceA = await beethovenContract.balanceOf.call(0, alice);
			let currentBalanceB = await beethovenContract.balanceOf.call(1, alice);
			await beethovenContract.redeem(
				currentBalanceA.valueOf(),
				currentBalanceB.valueOf(),
				true,
				{ from: alice }
			);
			let userIdx = await beethovenContract.existingUsers.call(alice);
			assert.isTrue(userIdx.toNumber() === 0, 'user still in the userList');
			let userSize = await beethovenContract.getUserSize.call();
			assert.equal(userSize.toNumber(), 0, 'user size not updated correctly');
		});
	});

	describe('nav calculation', () => {
		before(async () => {
			await initContracts();
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei(ethInitPrice + '', 'ether'),
				time.valueOf(),
				pf1
			);
			await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);
		});

		function calcNav(price, time, resetPrice, resetTime, beta) {
			let numOfPeriods = Math.floor((time - resetTime) / BeethovenInit.pd);
			let navParent =
				(price / resetPrice / beta) * (1 + BeethovenInit.alphaInBP / BP_DENOMINATOR);

			let navA = 1 + numOfPeriods * Number(BeethovenInit.couponRate);
			let navAAdj = (navA * BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			if (navParent <= navAAdj)
				return [(navParent * BP_DENOMINATOR) / BeethovenInit.alphaInBP, 0];
			else return [navA, navParent - navAAdj];
		}

		function testNav(resetPrice, lastPrice, beta) {
			let resetPriceInWei = web3.utils.toWei(resetPrice + '');
			let resetPriceTimeSeconds = 1522745087;
			let lastPriceInWei = web3.utils.toWei(lastPrice + '');
			let lastPriceTimeSeconds = 1522745087 + 60 * 5 + 10;
			let betaInWei = web3.utils.toWei(beta + '');
			let [navA, navB] = calcNav(
				lastPrice,
				lastPriceTimeSeconds,
				resetPrice,
				resetPriceTimeSeconds,
				beta
			);
			return beethovenContract.calculateNav
				.call(
					lastPriceInWei,
					lastPriceTimeSeconds,
					resetPriceInWei,
					resetPriceTimeSeconds,
					betaInWei
				)
				.then(res => {
					let navAInWei = res[0].valueOf();
					let navBInWei = res[1].valueOf();
					assert.isTrue(
						isEqual(web3.utils.fromWei(navAInWei), navA),
						'navA not calculated correctly'
					);
					assert.isTrue(
						isEqual(web3.utils.fromWei(navBInWei), navB),
						'navB not calculated correctly'
					);
				});
		}

		// for non reset case
		it('it should calculate nav correclty case 1', () => {
			return testNav(582, 600, 1.2);
		});

		//for upward reset case
		it('it should calculate nav correclty case 2', () => {
			return testNav(800, 1500, 1);
		});

		//for downward reset case
		it('it should calculate nav correclty case 3', () => {
			return testNav(1000, 600, 1);
		});

		//for downward reset case where navB goes to 0
		it('it should calculate nav correclty case 4', () => {
			return testNav(1000, 200, 1);
		});
	});

	describe('pre reset', () => {
		before(async () => {
			await initContracts();
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei('400', 'ether'),
				time.valueOf(),
				pf1
			);
			await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);
			// let state = await beethovenContract.state.call();
			// console.log(state.valueOf());

			await oracleContract.skipCooldown(1);
			time = await oracleContract.timestamp.call();

			await beethovenContract.setTimestamp(time.valueOf());
			// console.log(time);
			await oracleContract.setLastPrice(
				web3.utils.toWei('888', 'ether'),
				time.valueOf(),
				pf1
			);
			// console.log(await beethovenContract.timestamp.call());

			await beethovenContract.fetchPrice();
		});

		it('should be in state preReset', async () => {
			let state = await beethovenContract.state.call();
			assert.equal(state.valueOf(), STATE_PRE_RESET, 'state is wrong');
		});

		it('should not allow creation', async () => {
			try {
				await beethovenContract.create.call(true, {
					from: alice,
					value: web3.utils.toWei('1')
				});
				assert.isTrue(false, 'still can create');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can create ');
			}
		});

		it('should not allow redemption', async () => {
			try {
				await beethovenContract.redeem.call(
					web3.utils.toWei('2800'),
					web3.utils.toWei('2900'),
					true,
					{
						from: alice
					}
				);

				assert.isTrue(false, 'still can redeem');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can redeem ');
			}
		});

		it('should not allow any transfer or approve of A', async () => {
			try {
				await beethovenContract.transfer.call(0, DUMMY_ADDR, bob, web3.utils.toWei('1'), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer or approve of B', async () => {
			try {
				await beethovenContract.transfer.call(1, DUMMY_ADDR, bob, web3.utils.toWei('1'), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		it('should not allow admin set commissionRate', async () => {
			try {
				await beethovenContract.setValue.call(0, 1000, { from: creator });

				assert.isTrue(false, 'still can set commissionRate');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can set commissionRate');
			}
		});

		it('should not allow admin set ethDuoFeeRatio', async () => {
			try {
				await beethovenContract.setValue.call(1, 1000, { from: creator });

				assert.isTrue(false, 'still can set ethDuoFeeRatio');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can set ethDuoFeeRatio');
			}
		});

		it('should not allow admin set iterationGasThreshold', async () => {
			try {
				await beethovenContract.setValue.call(2, 1000, { from: creator });
				assert.isTrue(false, 'still can set iterationGasThreshold');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set iterationGasThreshold');
			}
		});

		it('should not allow admin set preResetWaitingBlocks', async () => {
			try {
				await beethovenContract.setValue.call(3, 1000, { from: creator });
				assert.isTrue(false, 'still can set preResetWaitingBlocks');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set preResetWaitingBlocks');
			}
		});

		it('should not allow admin set priceTolInBP', async () => {
			try {
				await beethovenContract.setValue.call(4, 1000, { from: creator });

				assert.isTrue(false, 'still can set priceTolInBP');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still set priceTolInBP');
			}
		});

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			// console.log(await beethovenContract.state.call());

			let preResetWaitBlk = await beethovenContract.preResetWaitingBlocks.call();

			for (let i = 0; i < preResetWaitBlk.valueOf() - 1; i++)
				await beethovenContract.startPreReset();

			// await beethovenContract.startPreReset();
			await assertState(beethovenContract, STATE_PRE_RESET);

			let tx = await beethovenContract.startPreReset();
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[1].event === EVENT_START_RESET &&
					tx.logs[0].event === EVENT_TOTAL_SUPPLY,
				'wrong events emitted'
			);

			await assertState(beethovenContract, STATE_RESET);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta, alphaInBP = 0) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let excessA = navA - 1;
			let excessB = navB - 1;
			//if (excessB >= excessBForA) {
			let newAFromA = prevBalanceA * excessA;
			let excessBAfterA = excessB - excessA;
			let excessNewBFromB = (prevBalanceB * excessBAfterA * beta) / (1 + alpha);
			let newBFromB = prevBalanceB * excessA + excessNewBFromB;
			let newAFromB = excessNewBFromB * alpha;
			return [prevBalanceA + newAFromA + newAFromB, prevBalanceB + newBFromB];
			/*} else {
				let newBFromB = prevBalanceB * excessB;
				let excessAForB = excessB * alpha;
				let excessAAfterB = excessA - excessAForB;
				let newBFromA = prevBalanceA * excessAAfterB * beta / (1 + alpha);
				let newAFromA = prevBalanceA * excessAForB + newBFromA * alpha;
				return [prevBalanceA + newAFromA, prevBalanceB + newBFromA + newBFromB];
			}*/
		}

		function downwardReset(
			prevBalanceA,
			prevBalanceB,
			currentNavA,
			currentNavB,
			beta,
			alphaInBP = 0
		) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = ((currentNavA - currentNavB) / (1 + alpha)) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (currentNavB + newAFromA);
			let newBalanceB = prevBalanceB * currentNavB + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function periodicReset(
			prevBalanceA,
			prevBalanceB,
			currentNavA,
			currentNavB,
			beta,
			alphaInBP = 0
		) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = ((currentNavA - 1) / (1 + alpha)) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (1 + newAFromA);
			let newBalanceB = prevBalanceB * 1 + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function assertABalanceForAddress(addr, expected) {
			return beethovenContract.balanceOf.call(0, addr).then(currentBalanceA => {
				assert.isTrue(
					isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return beethovenContract.balanceOf
				.call(1, addr)
				.then(currentBalanceB =>
					assert.isTrue(
						isEqual(currentBalanceB.valueOf() / WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function updateBeta(prevBeta, lastPrice, lastResetPrice, currentNavA, alphaInBP = 0) {
			let alpha = (alphaInBP || BeethovenInit.alphaInBP) / BP_DENOMINATOR;
			return (
				((1 + alpha) * lastPrice) /
				((1 + alpha) * lastPrice - lastResetPrice * alpha * prevBeta * (currentNavA - 1))
			);
		}

		function resetTest(
			price,
			resetFunc,
			resetState,
			resetGas,
			isPeriodicReset,
			transferABRequired,
			alphaInBP = 0
		) {
			let prevBalanceAalice, prevBalanceBalice;
			let prevBalanceAbob, prevBalanceBbob;
			let prevBalanceAcharles, prevBalanceBcharles;
			let currentNavA;
			let currentNavB;
			let newBalanceAalice, newBalanceBalice;
			let newBalanceAbob, newBalanceBbob;
			let newBalanceAcharles, newBalanceBcharles;
			// let timestamp;
			let prevBeta, beta;

			let skipNum = isPeriodicReset
				? Math.ceil((Number(BeethovenInit.hp) - 1) / Number(BeethovenInit.couponRate)) + 1
				: 1;

			before(async () => {
				await initContracts(alphaInBP);
				let time = await oracleContract.timestamp.call();
				await oracleContract.setLastPrice(
					web3.utils.toWei(ethInitPrice + '', 'ether'),
					time.valueOf(),
					pf1
				);
				await beethovenContract.startCustodian(
					aContract.address,
					bContract.address,
					oracleContract.address,
					{ from: creator }
				);
				// let state = await beethovenContract.state.call();
				// console.log(state.valueOf());

				// console.log(time);

				await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(charles, web3.utils.toWei('100'), { from: creator });
				await beethovenContract.create(true, {
					from: alice,
					value: web3.utils.toWei('1')
				});
				await beethovenContract.create(true, {
					from: bob,
					value: web3.utils.toWei('1.2')
				});
				await beethovenContract.create(true, {
					from: charles,
					value: web3.utils.toWei('1.5')
				});

				if (transferABRequired) {
					let aliceA = await beethovenContract.balanceOf.call(0, alice);

					beethovenContract.transfer(0, DUMMY_ADDR, bob, aliceA.valueOf(), {
						from: alice
					});
					await beethovenContract.balanceOf.call(1, bob).then(bobB => {
						beethovenContract.transfer(1, DUMMY_ADDR, alice, bobB.valueOf(), {
							from: bob
						});
					});

					await beethovenContract.balanceOf.call(1, charles).then(charlesB => {
						beethovenContract.transfer(1, DUMMY_ADDR, alice, charlesB.valueOf(), {
							from: charles
						});
					});
				}

				await beethovenContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.toNumber() / WEI_DENOMINATOR));
				let aliceB = await beethovenContract.balanceOf.call(1, alice);

				prevBalanceBalice = aliceB.toNumber() / WEI_DENOMINATOR;

				await beethovenContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.toNumber() / WEI_DENOMINATOR));
				let bobB = await beethovenContract.balanceOf.call(1, bob);
				prevBalanceBbob = bobB.toNumber() / WEI_DENOMINATOR;

				await beethovenContract.balanceOf
					.call(0, charles)
					.then(
						charlesA => (prevBalanceAcharles = charlesA.toNumber() / WEI_DENOMINATOR)
					);
				let charlesB = await beethovenContract.balanceOf.call(1, charles);
				prevBalanceBcharles = charlesB.toNumber() / WEI_DENOMINATOR;

				// await beethovenContract.skipCooldown(skipNum);

				// timestamp = await beethovenContract.timestamp.call();
				await oracleContract.skipCooldown(skipNum);
				time = await oracleContract.timestamp.call();
				await beethovenContract.setTimestamp(time.valueOf());

				await oracleContract.setLastPrice(
					web3.utils.toWei(price + '', 'ether'),
					time.valueOf(),
					pf1
				);
				// console.log(await beethovenContract.timestamp.call());

				await beethovenContract.fetchPrice();

				let navAinWei = await beethovenContract.navAInWei.call();
				// let navAinWei = sysStates[IDX_NAV_A];
				currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;
				let navBinWei = await beethovenContract.navBInWei.call();
				currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

				let betaInWei = await beethovenContract.betaInWei.call();
				prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR;
				for (let i = 0; i < 10; i++) await beethovenContract.startPreReset();
				// let sysStatesAfter = await beethovenContract.getSystemStates.call();
				let betaInWeiAfter = await beethovenContract.betaInWei.call();
				// let betaInWeiAfter = await beethovenContract.betaInWei.call();
				beta = betaInWeiAfter.valueOf() / WEI_DENOMINATOR;
			});

			it('should update beta correctly', () => {
				if (isPeriodicReset) {
					let newBeta = updateBeta(
						prevBeta,
						price,
						Number(ethInitPrice),
						currentNavA,
						alphaInBP
					);
					return assert.isTrue(isEqual(beta, newBeta), 'beta is not updated correctly');
				} else {
					return assert.equal(beta, 1, 'beta is not reset to 1');
				}
			});

			it('should in corect reset state', async () => {
				assertState(beethovenContract, STATE_RESET);
				assertResetState(beethovenContract, resetState);
			});

			it('should have three users', async () => {
				let userSize = await beethovenContract.getUserSize.call();
				assert.equal(userSize.toNumber(), 3, 'num of users incorrect');
			});

			it('should have correct setup', () => {
				if (transferABRequired)
					assert.isTrue(
						prevBalanceAalice === 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob === 0 &&
							prevBalanceAcharles > 0 &&
							prevBalanceBcharles === 0,
						'Wrong setup'
					);
				else
					assert.isTrue(
						prevBalanceAalice > 0 &&
							prevBalanceBalice > 0 &&
							prevBalanceAbob > 0 &&
							prevBalanceBbob > 0 &&
							prevBalanceAcharles > 0 &&
							prevBalanceBcharles > 0,
						'Wrong setup'
					);
			});

			it('should process reset for only one user', async () => {
				let tx = await beethovenContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_RESET,
					'not only one user processed'
				);

				let nextIndex = await beethovenContract.getNextResetAddrIndex.call();
				// let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await beethovenContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await beethovenContract.balanceOf.call(1, alice);
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAalice,
					prevBalanceBalice,
					currentNavA,
					currentNavB,
					beta,
					alphaInBP
				);
				newBalanceAalice = newBalanceA;
				newBalanceBalice = newBalanceB;

				assert.isTrue(
					isEqual(currentBalanceAalice.toNumber() / WEI_DENOMINATOR, newBalanceA),
					'BalanceA not updated correctly'
				);
				assert.isTrue(
					isEqual(currentBalanceBalice.toNumber() / WEI_DENOMINATOR, newBalanceB),
					'BalanceB not updated correctly'
				);
			});

			it('should complete reset for second user', async () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAbob,
					prevBalanceBbob,
					currentNavA,
					currentNavB,
					beta,
					alphaInBP
				);
				newBalanceAbob = newBalanceA;
				newBalanceBbob = newBalanceB;
				let tx = await beethovenContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_RESET,
					'reset not completed'
				);
				// let sysStates = await beethovenContract.getSystemStates.call();
				// let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				// assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(bob, newBalanceA);
				await assertBBalanceForAddress(bob, newBalanceB);
			});

			it('should complete reset for third user and transit to trading', async () => {
				let [newBalanceA, newBalanceB] = resetFunc(
					prevBalanceAcharles,
					prevBalanceBcharles,
					currentNavA,
					currentNavB,
					beta,
					alphaInBP
				);
				newBalanceAcharles = newBalanceA;
				newBalanceBcharles = newBalanceB;
				let tx = await beethovenContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === EVENT_START_TRADING,
					'reset not completed'
				);
				let nextIndex = await beethovenContract.getNextResetAddrIndex.call();
				// let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(charles, newBalanceA);
				await assertBBalanceForAddress(charles, newBalanceB);
			});

			it('totalA should equal totalB times alpha', async () => {
				let totalA = await beethovenContract.totalSupplyA.call();
				let totalB = await beethovenContract.totalSupplyB.call();
				assert.isTrue(
					isEqual(
						totalA.toNumber() / WEI_DENOMINATOR,
						newBalanceAbob + newBalanceAalice + newBalanceAcharles
					),
					'totalSupplyA is wrong'
				);
				assert.isTrue(
					isEqual(
						totalB.toNumber() / WEI_DENOMINATOR,
						newBalanceBbob + newBalanceBalice + newBalanceBcharles
					),
					'totalSupplyB is wrong'
				);
				assert.isTrue(
					isEqual(
						newBalanceAbob + newBalanceAalice + newBalanceAcharles,
						((newBalanceBbob + newBalanceBalice + +newBalanceBcharles) *
							(alphaInBP || BeethovenInit.alphaInBP)) /
							BP_DENOMINATOR
					),
					'total A is not equal to total B times alpha'
				);
			});

			it('should update nav', async () => {
				let navA = await beethovenContract.navAInWei.call();
				let navB = await beethovenContract.navBInWei.call();

				assert.equal(web3.utils.fromWei(navA.valueOf()), '1', 'nav A not reset to 1');

				// lnavB = sysStates[IDX_NAV_B];
				assert.isTrue(
					isPeriodicReset
						? isEqual(web3.utils.fromWei(navB.valueOf()), currentNavB)
						: web3.utils.fromWei(navB.valueOf()) === '1',
					'nav B not updated correctly'
				);
			});

			it('should update reset price', async () => {
				if (!isPeriodicReset) {
					let resetPriceInWei = await beethovenContract.resetPriceInWei.call();

					assert.equal(
						resetPriceInWei.valueOf() / WEI_DENOMINATOR,
						price,
						'resetprice not updated'
					);
				}
			});
		}

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 1', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 2', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 3', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 4', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('upward reset case 5', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('upward reset case 6', () => {
			resetTest(1200, upwardReset, STATE_UPWARD_RESET, 95000, false, true, 5000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 1', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, 95000, false, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 2', () => {
			resetTest(350, downwardReset, STATE_DOWNWARD_RESET, 95000, false, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 3', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, 95000, false, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 4', () => {
			resetTest(430, downwardReset, STATE_DOWNWARD_RESET, 95000, false, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('downward reset case 5', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, 95000, false, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('downward reset case 6', () => {
			resetTest(290, downwardReset, STATE_DOWNWARD_RESET, 95000, false, true, 5000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 1', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, false);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 2', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, true);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 3', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, false, 20000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 4', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, true, 20000);
		});

		//case 1: aliceA > 0, aliceB > 0; bobA > 0, bobB > 0
		describe('periodic reset case 5', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, false, 5000);
		});

		//case 2: aliceA = 0, aliceB > 0; bobA > 0, bobB = 0
		describe('periodic reset case 6', () => {
			resetTest(ethInitPrice, periodicReset, STATE_PERIODIC_RESET, 95000, true, true, 5000);
		});
	});

	describe('setValue', () => {
		before(async () => {
			await initContracts();
			let time = await oracleContract.timestamp.call();
			await oracleContract.setLastPrice(
				web3.utils.toWei('400', 'ether'),
				time.valueOf(),
				pf1
			);
			await beethovenContract.startCustodian(
				aContract.address,
				bContract.address,
				oracleContract.address,
				{ from: creator }
			);
		});

		beforeEach(async () => {
			await beethovenContract.skipCooldown(25);
		});

		it('admin should be able to set createCommission', async () => {
			let success = await beethovenContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let createCommInBP = await beethovenContract.createCommInBP.call();
			let preValue = createCommInBP.toNumber();
			let tx = await beethovenContract.setValue(0, 50, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 0 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 50,
				'wrong argument emitted'
			);
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await beethovenContract.setValue.call(0, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await beethovenContract.setValue.call(0, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set redeemCommInBP', async () => {
			let success = await beethovenContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set ethDuoRatio');
			let redeemCommInBP = await beethovenContract.redeemCommInBP.call();
			let preValue = redeemCommInBP.toNumber();
			let tx = await beethovenContract.setValue(1, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 1 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await beethovenContract.setValue.call(1, 10001, { from: creator });

				assert.isTrue(false, 'admin can set comission higher than 10000');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('non admin should not be able to set comm', async () => {
			try {
				await beethovenContract.setValue.call(1, 100, { from: alice });
				assert.isTrue(false, 'non admin can change comm');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set ethDuoRatio', async () => {
			let success = await beethovenContract.setValue.call(2, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set ethDuoFeeRatio');
			let ethDuoFeeRatio = await beethovenContract.ethDuoFeeRatio.call();
			let preValue = ethDuoFeeRatio.toNumber();
			let tx = await beethovenContract.setValue(2, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 2 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set ethDuoRatio', async () => {
			try {
				await beethovenContract.setValue.call(2, 100, { from: alice });
				assert.isTrue(false, 'non admin can change ethDuoRatio');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set iteration gas threshold', async () => {
			let success = await beethovenContract.setValue.call(3, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
			let iterationGasThreshold = await beethovenContract.iterationGasThreshold.call();
			let preValue = iterationGasThreshold.toNumber();
			let tx = await beethovenContract.setValue(3, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 3 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await beethovenContract.setValue.call(3, 100000, { from: alice });
				assert.isTrue(false, 'non admin can change gas threshhold');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set pre reset waiting blocks', async () => {
			let success = await beethovenContract.setValue.call(4, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
			let preResetWaitingBlocks = await beethovenContract.preResetWaitingBlocks.call();
			let preValue = preResetWaitingBlocks.toNumber();
			let tx = await beethovenContract.setValue(4, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 4 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await beethovenContract.setValue.call(4, 100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});
	});
});
