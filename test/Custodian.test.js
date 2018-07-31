const Custodian = artifacts.require('./CustodianMock.sol');
const DUO = artifacts.require('./DUO.sol');
const Web3 = require('web3');
// import Web3 from 'web3';
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];
const PoolInit = InitParas['Pool'];

// Event
const START_PRE_RESET = 'StartPreReset';
const START_RESET = 'StartReset';
const START_TRADING = 'StartTrading';
const CREATE = 'Create';
const REDEEM = 'Redeem';
const TOTAL_SUPPLY = 'TotalSupply';
const COMMIT_PRICE = 'CommitPrice';
const ACCEPT_PRICE = 'AcceptPrice';
const TRANSFER = 'Transfer';
const APPROVAL = 'Approval';
const ADD_ADDRESS = 'AddAddress';
const UPDATE_ADDRESS = 'UpdateAddress';
const REMOVE_ADDRESS = 'RemoveAddress';
const SET_VALUE = 'SetValue';
const COLLECT_FEE = 'CollectFee';

const STATE_INCEPT_RESET = '0';
const STATE_TRADING = '1';
const STATE_PRE_RESET = '2';
const STATE_UPWARD_RESET = '3';
const STATE_DOWNWARD_RESET = '4';
const STATE_PERIODIC_RESET = '5';

const IDX_ADMIN = 0;
const IDX_FEE_COLLECTOR = 1;
const IDX_PRICEFEED_1 = 2;
const IDX_PRICEFEED_2 = 3;
const IDX_PRICEFEED_3 = 4;
const IDX_POOL_MANAGER = 5;

const IDX_STATE = 0;
const IDX_NAV_A = 1;
const IDX_NAV_B = 2;
// const IDX_TOTAL_SUPPLY_A = 3;
// const IDX_TOTAL_SUPPLY_B = 4;
// const IDX_ALPHA_IN_WEI = 5;
const IDX_BETA_IN_WEI = 7;
const IDX_FEE_IN_WEI = 8;
// const IDX_COUPON_RATE = 8;
// const IDX_PERIODICAL_INWEI = 9;
// const IDX_LIMIT_UPPER = 10;
// const IDX_LIMIT_LOWER = 11;
const IDX_CREATE_COMM_RATE = 13;
const IDX_PERIOD = 14;
const IDX_ITERATION_GAS_TH = 15;
const IDX_ETH_DUO_RATIO = 16;
const IDX_PRE_RESET_WAITING_BLK = 17;
const IDX_PRICE_TOL = 18;
const IDX_PF_TOL = 19;
const IDX_PF_TIME_TOL = 20;
const IDX_PRICE_UPDATE_COOLDOWN = 21;
// const IDX_NUM_OF_PX = 16;
const IDX_NEXT_RESET_ADDR_IDX = 23;
const IDX_USER_SIZE = 26;
const IDX_POOL_SIZE = 27;
const IDX_REDEEM_COMM_RATE = 28;

// system prices
// const IDX_FIRST_ADDR = 0;
const IDX_FIRST_PX = 1;
const IDX_FIRST_TS = 2;
// const IDX_SECOND_ADDR = 3;
const IDX_SECOND_PX = 4;
const IDX_SECOND_TS = 5;
// const IDX_RESET_ADDR = 6;
const IDX_RESET_PX = 7;
const IDX_RESET_TS = 8;
// const IDX_LAST_ADDR = 9;
const IDX_LAST_PX = 10;
const IDX_LAST_TS = 11;

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
const VM_INVALID_OP_CODE_MSG = 'VM Exception while processing transaction: invalid opcode';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

const EPSILON = 1e-10;
const ethInitPrice = 582;
const ethDuoFeeRatio = 800;

const A_ADDR = '0xa';
const B_ADDR = '0xb';
const DUMMY_ADDR = '0xc';

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

contract('Custodian', accounts => {
	let custodianContract;
	let duoContract;

	const creator = accounts[0];
	const pf1 = accounts[1];
	const pf2 = accounts[2];
	const pf3 = accounts[3];
	const fc = accounts[4];
	const pm = accounts[5];
	const alice = accounts[6]; //duoMember
	const bob = accounts[7];
	const charles = accounts[8];
	const david = accounts[9];

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

		custodianContract = await Custodian.new(
			fc,
			duoContract.address,
			pf1,
			pf2,
			pf3,
			pm,
			alphaInBP ? alphaInBP : CustodianInit.alphaInBP,
			web3.utils.toWei(CustodianInit.couponRate),
			web3.utils.toWei(CustodianInit.hp),
			web3.utils.toWei(CustodianInit.hu),
			web3.utils.toWei(CustodianInit.hd),
			CustodianInit.commissionRateInBP,
			CustodianInit.period,
			CustodianInit.coolDown,
			{
				from: creator
			}
		);
	};

	const assertState = async state => {
		let sysStates = await custodianContract.getSystemStates.call();
		assert.equal(sysStates[IDX_STATE].valueOf(), state, 'state is wrong');
	};

	describe('constructor', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let state = sysStates[IDX_STATE];
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_FEE_COLLECTOR].valueOf(),
				fc,
				'feeCollector specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(fc);
			assert.isTrue(addrStatus.toNumber() === 2, 'fc not marked as used');
		});

		it('priceFeed1 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_1].valueOf(),
				pf1,
				'priceFeed1 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf1);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf1 not marked as used');
		});

		it('priceFeed2 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_2].valueOf(),
				pf2,
				'priceFeed2 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf2);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf2 not marked as used');
		});

		it('priceFeed3 should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_PRICEFEED_3].valueOf(),
				pf3,
				'priceFeed3 specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pf3);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf3 not marked as used');
		});

		it('admin should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(sysAddress[IDX_ADMIN].valueOf(), creator, 'admin specified incorrect');
			let addrStatus = await custodianContract.getAddrStatus.call(creator);
			assert.isTrue(addrStatus.toNumber() === 2, 'admin not marked as used');
		});

		it('poolManager should equal specified value', async () => {
			let sysAddress = await custodianContract.getSystemAddresses.call();
			assert.equal(
				sysAddress[IDX_POOL_MANAGER].valueOf(),
				pm,
				'poolManager specified incorrect'
			);
			let addrStatus = await custodianContract.getAddrStatus.call(pm);
			assert.isTrue(addrStatus.toNumber() === 2, 'pf3 not marked as used');
		});

		it('priceTolInBP should equal 500', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PRICE_TOL].valueOf(),
				500,
				'priceTolInBP specified incorrect'
			);
		});

		it('period should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PERIOD].valueOf(),
				CustodianInit.period,
				'period specified incorrect'
			);
		});

		it('priceUpdateCoolDown should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_PRICE_UPDATE_COOLDOWN].valueOf(),
				CustodianInit.coolDown,
				'priceUpdateCoolDown specified incorrect'
			);
		});

		it('createCommInBP should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_CREATE_COMM_RATE].valueOf(),
				CustodianInit.commissionRateInBP,
				'createCommInBP specified incorrect'
			);
		});

		it('redeemCommInBP should equal specified value', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_REDEEM_COMM_RATE].valueOf(),
				CustodianInit.commissionRateInBP,
				'redeemCommInBP specified incorrect'
			);
		});
	});

	describe('start contract', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(
				sysStates[IDX_STATE].valueOf(),
				STATE_INCEPT_RESET,
				'state is not inception'
			);
		});

		it('should start contract', async () => {
			let success = await custodianContract.startContract.call(
				web3.utils.toWei('507'),
				1524105709,
				A_ADDR,
				B_ADDR,
				{ from: pf1 }
			);
			assert.isTrue(success, 'not able to start contract');
			let tx = await custodianContract.startContract(
				web3.utils.toWei('507'),
				1524105709,
				A_ADDR,
				B_ADDR,
				{ from: pf1 }
			);
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === ACCEPT_PRICE &&
					tx.logs[1].event === START_TRADING,
				'worng event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.priceInWei.toNumber() / WEI_DENOMINATOR === 507 &&
					tx.logs[0].args.timeInSecond.valueOf() === '1524105709' &&
					tx.logs[0].args.sender.valueOf() === pf1 &&
					tx.logs[0].args.navAInWei.toNumber() / WEI_DENOMINATOR === 1 &&
					tx.logs[0].args.navBInWei.toNumber() / WEI_DENOMINATOR === 1,
				'worng event parameter emitted'
			);
		});

		it('should update lastPrice and resetPrice', async () => {
			let systPrices = await custodianContract.getSystemPrices.call();
			let lastPrice = systPrices[IDX_LAST_PX];
			let lastPriceTx = systPrices[IDX_LAST_TS];
			assert.equal(
				lastPrice.valueOf(),
				web3.utils.toWei('507'),
				'lastPrice price not updated correctly'
			);
			assert.equal(
				lastPriceTx.valueOf(),
				'1524105709',
				'lastPrice time not updated correctly'
			);

			let resetPrice = systPrices[IDX_RESET_PX];
			let resetPriceTx = systPrices[IDX_RESET_TS];
			assert.equal(
				resetPrice.valueOf(),
				web3.utils.toWei('507'),
				'resetPrice price not updated correctly'
			);
			assert.equal(
				resetPriceTx.valueOf(),
				'1524105709',
				'resetPrice time not updated correctly'
			);
		});

		it('state should be trading', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			assert.equal(sysStates[IDX_STATE].valueOf(), STATE_TRADING, 'state is not trading');
		});
	});

	describe('creation and fee withdrawal', () => {
		let initEthPrice = 582;
		let amtEth = 1;
		let tokenValueB =
			((1 - CustodianInit.commissionRateInBP / BP_DENOMINATOR) * initEthPrice) /
			(1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
		let tokenValueA = (CustodianInit.alphaInBP / BP_DENOMINATOR) * tokenValueB;

		let tokenValueBPayFeeDUO = initEthPrice / (1 + CustodianInit.alphaInBP / BP_DENOMINATOR);
		let tokenValueAPayFeeDUO =
			(CustodianInit.alphaInBP / BP_DENOMINATOR) * tokenValueBPayFeeDUO;
		let accumulatedFeeAfterWithdrawal;
		let preDUO = 1000000;
		let feeOfDUOinWei =
			((amtEth * CustodianInit.commissionRateInBP) / BP_DENOMINATOR) * ethDuoFeeRatio;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(initEthPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
			await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
			await duoContract.approve(custodianContract.address, web3.utils.toWei('1000000'), {
				from: alice
			});
		});

		it('should create token A and B payFee with eth', async () => {
			let success = await custodianContract.create.call(true, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			// first check return value with call()
			assert.isTrue(success, 'not able to create');
			// then send transaction to check effects
			let tx = await custodianContract.create(true, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CREATE &&
					tx.logs[1].event === TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(
						tx.logs[0].args.tokenAInWei.toNumber() / WEI_DENOMINATOR,
						tokenValueA
					) &&
					isEqual(
						tx.logs[0].args.tokenBInWei.toNumber() / WEI_DENOMINATOR,
						tokenValueB
					) &&
					isEqual(
						tx.logs[0].args.ethAmtInWei.toNumber() / WEI_DENOMINATOR,
						amtEth * (1 - CustodianInit.commissionRateInBP / BP_DENOMINATOR)
					) &&
					isEqual(
						tx.logs[0].args.ethFeeInWei.toNumber() / WEI_DENOMINATOR,
						(amtEth * CustodianInit.commissionRateInBP) / BP_DENOMINATOR
					) &&
					isEqual(tx.logs[0].args.duoFeeInWei.toNumber() / WEI_DENOMINATOR, 0),
				'incorrect event arguments emitted'
			);

			// let totalSupplyA = await custodianContract.totalSupplyA.call();
			// let totalSupplyB = await custodianContract.totalSupplyB.call();
			totalSupplyA = tokenValueA;
			totalSupplyB = tokenValueB;
			assert.isTrue(
				isEqual(tx.logs[1].args.totalSupplyA.toNumber() / WEI_DENOMINATOR, totalSupplyA) &&
					isEqual(
						tx.logs[1].args.totalSupplyB.toNumber() / WEI_DENOMINATOR,
						totalSupplyB
					),
				'totalSupply not updated connectly'
			);
		});

		it('feeAccumulated should be updated', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let fee = (1 * CustodianInit.commissionRateInBP) / BP_DENOMINATOR;
			assert.isTrue(
				isEqual(sysStates[IDX_FEE_IN_WEI].valueOf() / WEI_DENOMINATOR, fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update user list if required', async () => {
			let userIdx = await custodianContract.getExistingUser.call(alice);
			assert.isTrue(userIdx.toNumber() === 1, 'new user is not updated');
		});

		it('should update balance of A correctly', async () => {
			let balanceA = await custodianContract.balanceOf.call(0, alice);
			assert.isTrue(
				isEqual(balanceA.toNumber() / WEI_DENOMINATOR, tokenValueA),
				'balance A not updated correctly'
			);
		});

		it('should update balance of B correctly', async () => {
			let balanceB = await custodianContract.balanceOf.call(1, alice);
			assert.isTrue(
				isEqual(balanceB.toNumber() / WEI_DENOMINATOR, tokenValueB),
				'balance B not updated correctly'
			);
		});

		it('should create token A and B payFee with DUO', async () => {
			let success = await custodianContract.create.call(false, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			// // first check return value with call()
			assert.isTrue(success, 'not able to create');
			// then send transaction to check effects
			let tx = await custodianContract.create(false, {
				from: alice,
				value: web3.utils.toWei(amtEth + '')
			});
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === CREATE &&
					tx.logs[1].event === TOTAL_SUPPLY,
				'incorrect event emitted'
			);

			totalSupplyA += tokenValueAPayFeeDUO;
			totalSupplyB += tokenValueBPayFeeDUO;
			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(
						tx.logs[0].args.tokenAInWei.toNumber() / WEI_DENOMINATOR,
						tokenValueAPayFeeDUO
					) &&
					isEqual(
						tx.logs[0].args.tokenBInWei.toNumber() / WEI_DENOMINATOR,
						tokenValueBPayFeeDUO
					) &&
					isEqual(tx.logs[0].args.ethAmtInWei.toNumber() / WEI_DENOMINATOR, amtEth) &&
					isEqual(tx.logs[0].args.ethFeeInWei.toNumber() / WEI_DENOMINATOR, 0) &&
					isEqual(
						tx.logs[0].args.duoFeeInWei.toNumber() / WEI_DENOMINATOR,
						((amtEth * CustodianInit.commissionRateInBP) / BP_DENOMINATOR) *
							ethDuoFeeRatio
					),
				'incorrect event arguments emitted'
			);
			assert.isTrue(
				isEqual(tx.logs[1].args.totalSupplyA.toNumber() / WEI_DENOMINATOR, totalSupplyA) &&
					isEqual(
						tx.logs[1].args.totalSupplyB.toNumber() / WEI_DENOMINATOR,
						totalSupplyB
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
			let burntDUOamt = await duoContract.balanceOf.call(custodianContract.address);
			assert.isTrue(
				burntDUOamt.toNumber() / WEI_DENOMINATOR === feeOfDUOinWei,
				'burned DUO not updated correctly'
			);
		});

		it('should not create token A and B payFee with insufficient DUO allowed', async () => {
			try {
				await custodianContract.create(false, {
					from: bob,
					value: web3.utils.toWei('1')
				});
				assert.isTrue(false, 'able to create without DUO allowed');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'can collect fee more than allowed');
			}
		});

		it('should not be added into userList with small creation amt', async () => {
			await custodianContract.create(true, {
				from: charles,
				value: web3.utils.toWei('0.00003')
			});
			let userIdx = await custodianContract.getExistingUser.call(charles);
			assert.isTrue(userIdx.toNumber() === 0, 'new user is included in userList');
		});

		it('should only collect fee less than allowed', async () => {
			try {
				await custodianContract.collectFee.call(web3.utils.toWei('1'), { from: fc });
				assert.isTrue(false, 'can collect fee more than allowed');
			} catch (err) {
				assert.equal(err.message, VM_INVALID_OP_CODE_MSG, 'can collect fee more than allowed');
			}
		});

		it('should collect fee', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			accumulatedFeeAfterWithdrawal =
				sysStates[IDX_FEE_IN_WEI].toNumber() - web3.utils.toWei('0.0001');
			let success = await custodianContract.collectFee.call(web3.utils.toWei('0.0001'), {
				from: fc
			});
			assert.isTrue(success);
			let tx = await custodianContract.collectFee(web3.utils.toWei('0.0001'), { from: fc });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COLLECT_FEE,
				'worng event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.addr.valueOf() === fc &&
					tx.logs[0].args.value.valueOf() === web3.utils.toWei('0.0001') &&
					tx.logs[0].args.feeAccumulatedInWei.toNumber() ===
						accumulatedFeeAfterWithdrawal,
				'worng fee parameter'
			);
		});

		it('should fee pending withdrawal amount should be updated correctly', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let currentFee = sysStates[IDX_FEE_IN_WEI];
			assert.isTrue(
				isEqual(
					currentFee.toNumber() / WEI_DENOMINATOR,
					accumulatedFeeAfterWithdrawal / WEI_DENOMINATOR
				),
				'fee not updated correctly'
			);
		});
	});

	describe('redemption and eth withdrawal', () => {
		let prevBalanceA, prevBalanceB, prevFeeAccumulated;
		let amtA = 28;
		let amtB = 29;
		let adjAmtA = (amtA * BP_DENOMINATOR) / CustodianInit.alphaInBP;
		let deductAmtB = Math.min(adjAmtA, amtB);
		let deductAmtA = (deductAmtB * CustodianInit.alphaInBP) / BP_DENOMINATOR;
		let amtEth = (deductAmtA + deductAmtB) / ethInitPrice;
		let fee = (amtEth * CustodianInit.commissionRateInBP) / BP_DENOMINATOR;
		let preDUO = 1000000;
		let feeInDUO = fee * ethDuoFeeRatio;
		let totalSupplyA, totalSupplyB;

		before(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
			await duoContract.transfer(alice, web3.utils.toWei(preDUO + ''), { from: creator });
			await duoContract.transfer(bob, web3.utils.toWei(preDUO + ''), { from: creator });
			await custodianContract.create(true, { from: alice, value: web3.utils.toWei('1') });
			prevBalanceA = await custodianContract.balanceOf.call(0, alice);
			prevBalanceB = await custodianContract.balanceOf.call(1, alice);
			let sysStates = await custodianContract.getSystemStates.call();
			prevFeeAccumulated = sysStates[IDX_FEE_IN_WEI];
			await duoContract.approve(custodianContract.address, web3.utils.toWei('1000000'), {
				from: alice
			});
			totalSupplyA = await custodianContract.totalSupplyA.call();
			totalSupplyA = totalSupplyA.toNumber() / WEI_DENOMINATOR;
			totalSupplyB = await custodianContract.totalSupplyB.call();
			totalSupplyB = totalSupplyB.toNumber() / WEI_DENOMINATOR;
		});

		it('should only redeem token value less than balance', async () => {
			try {
				await custodianContract.redeem(
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
			let success = await custodianContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await custodianContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				true,
				{ from: alice }
			);
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === REDEEM &&
					tx.logs[1].event === TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			totalSupplyA = totalSupplyA - deductAmtA;
			totalSupplyB = totalSupplyB - deductAmtB;
			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(tx.logs[0].args.tokenAInWei.toNumber() / WEI_DENOMINATOR, deductAmtA) &&
					isEqual(tx.logs[0].args.tokenBInWei.toNumber() / WEI_DENOMINATOR, deductAmtB) &&
					isEqual(
						tx.logs[0].args.ethAmtInWei.toNumber() / WEI_DENOMINATOR,
						amtEth - fee
					) &&
					isEqual(tx.logs[0].args.ethFeeInWei.toNumber() / WEI_DENOMINATOR, fee) &&
					isEqual(tx.logs[0].args.duoFeeInWei.toNumber() / WEI_DENOMINATOR, 0),
				'incorrect event arguments emitted'
			);
			assert.isTrue(
				isEqual(tx.logs[1].args.totalSupplyA.toNumber() / WEI_DENOMINATOR, totalSupplyA) &&
					isEqual(tx.logs[1].args.totalSupplyB.toNumber() / WEI_DENOMINATOR, totalSupplyB)
			);
		});

		it('feeAccumulated should be updated', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let feeAccumulated = sysStates[IDX_FEE_IN_WEI];
			assert.isTrue(
				isEqual(feeAccumulated.minus(prevFeeAccumulated).toNumber() / WEI_DENOMINATOR, fee),
				'feeAccumulated not updated correctly'
			);
		});

		it('should update balance of A correctly', async () => {
			let currentBalanceA = await custodianContract.balanceOf.call(0, alice);
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
			let currentBalanceB = await custodianContract.balanceOf.call(1, alice);
			assert.isTrue(
				isEqual(
					currentBalanceB.toNumber() / WEI_DENOMINATOR + deductAmtB,
					prevBalanceB.toNumber() / WEI_DENOMINATOR
				),
				'balance B not updated correctly after redeed'
			);
		});

		it('should be in user list', async () => {
			let userIdx = await custodianContract.getExistingUser.call(alice);
			assert.isTrue(userIdx.toNumber() === 1, 'user not in the user list');
			let userSize = await custodianContract.getSystemStates.call();
			assert.equal(userSize[IDX_USER_SIZE].toNumber(), 1, 'user size not updated correctly');
		});

		it('should redeem token A and B fee paying with DUO token', async () => {
			let success = await custodianContract.redeem.call(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
			assert.isTrue(success, 'not able to redeem');
			let tx = await custodianContract.redeem(
				web3.utils.toWei(amtA + ''),
				web3.utils.toWei(amtB + ''),
				false,
				{ from: alice }
			);
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[0].event === REDEEM &&
					tx.logs[1].event === TOTAL_SUPPLY,
				'incorrect event emitted'
			);
			totalSupplyA = totalSupplyA - deductAmtA;
			totalSupplyB = totalSupplyB - deductAmtB;
			assert.isTrue(
				tx.logs[0].args.sender === alice &&
					isEqual(tx.logs[0].args.tokenAInWei.toNumber() / WEI_DENOMINATOR, deductAmtA) &&
					isEqual(tx.logs[0].args.tokenBInWei.toNumber() / WEI_DENOMINATOR, deductAmtB) &&
					isEqual(tx.logs[0].args.ethAmtInWei.toNumber() / WEI_DENOMINATOR, amtEth) &&
					isEqual(tx.logs[0].args.ethFeeInWei.toNumber() / WEI_DENOMINATOR, 0) &&
					isEqual(
						tx.logs[0].args.duoFeeInWei.toNumber() / WEI_DENOMINATOR,
						((amtEth * CustodianInit.commissionRateInBP) / BP_DENOMINATOR) *
							ethDuoFeeRatio
					),
				'incorrect event arguments emitted'
			);
			assert.isTrue(
				isEqual(tx.logs[1].args.totalSupplyA.toNumber() / WEI_DENOMINATOR, totalSupplyA) &&
					isEqual(tx.logs[1].args.totalSupplyB.toNumber() / WEI_DENOMINATOR, totalSupplyB)
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
			let burntDUOamt = await duoContract.balanceOf.call(custodianContract.address);
			assert.isTrue(
				isEqual(burntDUOamt.toNumber() / WEI_DENOMINATOR, feeInDUO),
				'burned DUO not updated correctly'
			);
		});

		it('should be in user list', async () => {
			let userIdx = await custodianContract.getExistingUser.call(alice);
			assert.isTrue(userIdx.toNumber() === 1, 'user not in the user list');
			let userSize = await custodianContract.getSystemStates.call();
			assert.equal(userSize[IDX_USER_SIZE].toNumber(), 1, 'user size not updated correctly');
		});

		it('should be removed from user list if all tokens are redeemed', async () => {
			let currentBalanceA = await custodianContract.balanceOf.call(0, alice);
			let currentBalanceB = await custodianContract.balanceOf.call(1, alice);

			await custodianContract.redeem(currentBalanceA, currentBalanceB, true, { from: alice });
			let userIdx = await custodianContract.getExistingUser.call(alice);
			assert.isTrue(userIdx.toNumber() === 0, 'user still in the userList');
			let userSize = await custodianContract.getSystemStates.call();
			assert.equal(userSize[IDX_USER_SIZE].toNumber(), 0, 'user size not updated correctly');
		});
	});

	describe('nav calculation', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		function calcNav(price, time, resetPrice, resetTime, beta) {
			let numOfPeriods = Math.floor((time - resetTime) / CustodianInit.period);
			let navParent =
				(price / resetPrice / beta) * (1 + CustodianInit.alphaInBP / BP_DENOMINATOR);

			let navA = 1 + numOfPeriods * Number(CustodianInit.couponRate);
			let navAAdj = (navA * CustodianInit.alphaInBP) / BP_DENOMINATOR;
			if (navParent <= navAAdj)
				return [(navParent * BP_DENOMINATOR) / CustodianInit.alphaInBP, 0];
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
			return custodianContract.calculateNav
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

	describe('calculate median', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(400, 500, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(500, 600, 400, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(600, 400, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 500, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(600, 600, 500, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(500, 600, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});

		it('should calculate median', () => {
			return custodianContract.getMedianPublic
				.call(600, 500, 600, { from: alice })
				.then(median => assert.equal(median.toNumber(), 600, 'the median is wrong'));
		});
	});

	describe('commit price', () => {
		let firstPeriod;
		let secondPeriod;
		let blockTime;

		before(async () => {
			await initContracts();
			const blockNumber = await web3.eth.getBlockNumber();
			const block = await web3.eth.getBlock(blockNumber);
			blockTime = block.timestamp;
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				blockTime - Number(CustodianInit.period) * 10,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		it('non pf address cannot call commitPrice method', async () => {
			try {
				await custodianContract.commitPrice.call(web3.utils.toWei('400'), blockTime, {
					from: alice
				});
				assert.isTrue(false, 'non pf address can commit price');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, '');
			}
		});

		it('should accept first price arrived if it is not too far away', async () => {
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			let success = await custodianContract.commitPrice.call(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.isTrue(success);
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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

		it('should not reset', async () => {
			await assertState(STATE_TRADING);
		});

		it('should not accept first price arrived if it is too far away', async () => {
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COMMIT_PRICE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.priceInWei.valueOf() === web3.utils.toWei('500') &&
					tx.logs[0].args.timeInSecond.toNumber() === firstPeriod.toNumber() &&
					tx.logs[0].args.sender.valueOf() === pf1 &&
					tx.logs[0].args.index.toNumber() === 0,
				'incorrect event arguments emitted'
			);
			let sysPrices = await custodianContract.getSystemPrices.call();
			let px = sysPrices[IDX_FIRST_PX];
			let ts = sysPrices[IDX_FIRST_TS];
			assert.isTrue(
				isEqual(px.toNumber(), web3.utils.toWei('500')) &&
					isEqual(ts.toNumber(), firstPeriod.toNumber()),
				'first price is not recorded'
			);
		});

		it('should reject price from the same sender within cool down', async () => {
			try {
				await custodianContract.commitPrice(
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
			await custodianContract.skipCooldown(1);

			secondPeriod = await custodianContract.timestamp.call();

			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf1
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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

		it('should not reset', async () => {
			await assertState(STATE_TRADING);
		});

		it('should accept first price arrived if second price timed out and sent by the different address as first price', async () => {
			// first price
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(web3.utils.toWei('500'), firstPeriod.toNumber(), {
				from: pf1
			});

			// second price
			await custodianContract.skipCooldown(1);
			secondPeriod = await custodianContract.timestamp.call();
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 10,
				{
					from: pf1
				}
			);
			// second price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('555'),
				firstPeriod.toNumber() - 5,
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[0].args.priceInWei.toNumber() / WEI_DENOMINATOR, 550),
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
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('700'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COMMIT_PRICE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === COMMIT_PRICE,
				'incorrect event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.priceInWei.valueOf() === web3.utils.toWei('700') &&
					tx.logs[0].args.timeInSecond.toNumber() === firstPeriod.toNumber() - 280 &&
					tx.logs[0].args.sender.valueOf() === pf2 &&
					tx.logs[0].args.index.toNumber() === 1,
				'incorrect event arguments emitted'
			);
			let sysPrices = await custodianContract.getSystemPrices.call();
			let px = sysPrices[IDX_SECOND_PX];
			let ts = sysPrices[IDX_SECOND_TS];
			assert.isTrue(
				isEqual(px.toNumber(), web3.utils.toWei('700')) &&
					isEqual(ts.toNumber(), firstPeriod.toNumber() - 280),
				'second price is not recorded'
			);
		});

		it('should reject price from first sender within cool down', async () => {
			// third price
			try {
				await custodianContract.commitPrice(
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
				await custodianContract.commitPrice(
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
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();

			await custodianContract.commitPrice(
				web3.utils.toWei('550'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('540'),
				firstPeriod.toNumber() - 260,
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();

			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 300,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('400'),
				firstPeriod.toNumber() - 280,
				{
					from: pf2
				}
			);
			// //third price
			await custodianContract.skipCooldown(1);
			secondPeriod = await custodianContract.timestamp.call();

			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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

		it('should not reset', async () => {
			await assertState(STATE_TRADING);
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', async () => {
			await custodianContract.skipCooldown(1);
			firstPeriod = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(
				web3.utils.toWei('580'),
				firstPeriod.toNumber() - 200,
				{
					from: pf1
				}
			);
			// second price
			await custodianContract.commitPrice(
				web3.utils.toWei('500'),
				firstPeriod.toNumber() - 180,
				{
					from: pf2
				}
			);
			// // //third price
			await custodianContract.skipCooldown(1);

			secondPeriod = await custodianContract.timestamp.call();
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('520'),
				secondPeriod.toNumber(),
				{
					from: pf3
				}
			);
			assert.equal(tx.logs.length, 1, 'more than one event emitted');
			assert.equal(tx.logs[0].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
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
				await custodianContract.skipCooldown(1);

				firstPeriod = await custodianContract.timestamp.call();
				await custodianContract.commitPrice(
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

		it('should transit to reset state based on price accepted', async () => {
			await custodianContract.skipCooldown(1);

			firstPeriod = await custodianContract.timestamp.call();

			custodianContract.commitPrice(web3.utils.toWei('888'), firstPeriod.toNumber() - 200, {
				from: pf1
			});
			// second price
			let tx = await custodianContract.commitPrice(
				web3.utils.toWei('898'),
				firstPeriod.toNumber(),
				{
					from: pf2
				}
			);
			assert.equal(tx.logs.length, 2, 'not two events emitted');
			assert.isTrue(
				tx.logs[0].event === START_PRE_RESET,
				'no or more than one StartPreReset event was emitted'
			);
			assert.equal(tx.logs[1].event, ACCEPT_PRICE, 'AcceptPrice Event is not emitted');
			assert.isTrue(
				isEqual(tx.logs[1].args.priceInWei.toNumber(), web3.utils.toWei('888')),
				'last price is not updated correctly'
			);
			assert.isTrue(
				isEqual(tx.logs[1].args.timeInSecond.toNumber(), firstPeriod.toNumber() - 200),
				'last price time is not updated correctly'
			);

			await assertState(STATE_PRE_RESET);
		});
	});

	describe('pre reset', () => {
		beforeEach(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
			await custodianContract.skipCooldown(1);

			let ts = await custodianContract.timestamp.call();
			await custodianContract.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
				from: pf1
			});
			await custodianContract.commitPrice(web3.utils.toWei('898'), ts.toNumber(), {
				from: pf2
			});
		});

		it('should be in state preReset', async () => {
			await assertState(STATE_PRE_RESET);
		});

		it('should not allow price commit', async () => {
			try {
				await custodianContract.skipCooldown(1);
				let ts = await custodianContract.timestamp.call();
				await custodianContract.commitPrice(web3.utils.toWei('888'), ts.toNumber() - 200, {
					from: pf1
				});
				assert.isTrue(false, 'still can commit price');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can commit price ');
			}
		});

		it('should not allow creation', async () => {
			try {
				await custodianContract.create(true, {
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
				await custodianContract.redeem(
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
				await custodianContract.transfer(0, DUMMY_ADDR, bob, web3.utils.toWei('1'), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer A token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer A token');
			}
		});

		it('should not allow any transfer or approve of B', async () => {
			try {
				await custodianContract.transfer(1, DUMMY_ADDR, bob, web3.utils.toWei('1'), {
					from: alice
				});

				assert.isTrue(false, 'still can transfer B token');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'still can transfer B token');
			}
		});

		// it('should not allow admin set commissionRate', async () => {
		// 	try {
		// 		await custodianContract.setValue(0, 1000, { from: creator });

		// 		assert.isTrue(false, 'still can set commissionRate');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still can set commissionRate');
		// 	}
		// });

		// it('should not allow admin set ethDuoFeeRatio', async () => {
		// 	try {
		// 		await custodianContract.setValue(1, 1000, { from: creator });

		// 		assert.isTrue(false, 'still can set ethDuoFeeRatio');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still can set ethDuoFeeRatio');
		// 	}
		// });

		// it('should not allow admin set iterationGasThreshold', async () => {
		// 	try {
		// 		await custodianContract.setValue(2, 1000, { from: creator });
		// 		assert.isTrue(false, 'still can set iterationGasThreshold');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set iterationGasThreshold');
		// 	}
		// });

		// it('should not allow admin set preResetWaitingBlocks', async () => {
		// 	try {
		// 		await custodianContract.setValue(3, 1000, { from: creator });
		// 		assert.isTrue(false, 'still can set preResetWaitingBlocks');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set preResetWaitingBlocks');
		// 	}
		// });

		// it('should not allow admin set priceTolInBP', async () => {
		// 	try {
		// 		await custodianContract.setValue(4, 1000, { from: creator });

		// 		assert.isTrue(false, 'still can set priceTolInBP');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set priceTolInBP');
		// 	}
		// });

		// it('should not allow admin set priceFeedTolInBP', async () => {
		// 	try {
		// 		await custodianContract.setValue(5, 1000, { from: creator });
		// 		assert.isTrue(false, 'still can set priceFeedTolInBP');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set priceFeedTolInBP');
		// 	}
		// });

		// it('should not allow admin set priceFeedTimeTol', async () => {
		// 	try {
		// 		await custodianContract.setValue(6, 1000, { from: creator });
		// 		assert.isTrue(false, 'still can set priceFeedTimeTol');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set priceFeedTimeTol');
		// 	}
		// });

		// it('should not allow admin set priceUpdateCoolDown', async () => {
		// 	try {
		// 		await custodianContract.setValue(7, 1000, { from: creator });
		// 		assert.isTrue(false, 'still can set priceUpdateCoolDown');
		// 	} catch (err) {
		// 		assert.equal(err.message, VM_REVERT_MSG, 'still set priceUpdateCoolDown');
		// 	}
		// });

		it('should only transit to reset state after a given number of blocks but not before that', async () => {
			for (let i = 0; i < 9; i++) await custodianContract.startPreReset();
			await assertState(STATE_PRE_RESET);

			let tx = await custodianContract.startPreReset();
			assert.isTrue(
				tx.logs.length === 2 &&
					tx.logs[1].event === START_RESET &&
					tx.logs[0].event === TOTAL_SUPPLY,
				'wrong events emitted'
			);

			await assertState(STATE_UPWARD_RESET);
		});
	});

	describe('resets', () => {
		function upwardReset(prevBalanceA, prevBalanceB, navA, navB, beta, alphaInBP = 0) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
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
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
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
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
			let newBFromA = ((currentNavA - 1) / (1 + alpha)) * beta;
			let newAFromA = newBFromA * alpha;

			let newBalanceA = prevBalanceA * (1 + newAFromA);
			let newBalanceB = prevBalanceB * 1 + prevBalanceA * newBFromA;
			return [newBalanceA, newBalanceB];
		}

		function assertABalanceForAddress(addr, expected) {
			return custodianContract.balanceOf.call(0, addr).then(currentBalanceA => {
				assert.isTrue(
					isEqual(currentBalanceA.valueOf() / WEI_DENOMINATOR, expected),
					'BalanceA not updated correctly'
				);
			});
		}

		function assertBBalanceForAddress(addr, expected) {
			return custodianContract.balanceOf
				.call(1, addr)
				.then(currentBalanceB =>
					assert.isTrue(
						isEqual(currentBalanceB.valueOf() / WEI_DENOMINATOR, expected),
						'BalanceB not updated correctly'
					)
				);
		}

		function updateBeta(prevBeta, lastPrice, lastResetPrice, currentNavA, alphaInBP = 0) {
			let alpha = (alphaInBP || CustodianInit.alphaInBP) / BP_DENOMINATOR;
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
			let timestamp;
			let prevBeta, beta;

			let skipNum = isPeriodicReset
				? Math.ceil((Number(CustodianInit.hp) - 1) / Number(CustodianInit.couponRate)) + 1
				: 1;

			before(async () => {
				await initContracts(alphaInBP);
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					1524105709,
					A_ADDR,
					B_ADDR,
					{
						from: pf1
					}
				);
				await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(bob, web3.utils.toWei('100'), { from: creator });
				await duoContract.transfer(charles, web3.utils.toWei('100'), { from: creator });
				await custodianContract.create(true, {
					from: alice,
					value: web3.utils.toWei('1')
				});
				await custodianContract.create(true, {
					from: bob,
					value: web3.utils.toWei('1.2')
				});
				await custodianContract.create(true, {
					from: charles,
					value: web3.utils.toWei('1.5')
				});

				if (transferABRequired) {
					let aliceA = await custodianContract.balanceOf.call(0, alice);

					custodianContract.transfer(0, DUMMY_ADDR, bob, aliceA.valueOf(), {
						from: alice
					});
					await custodianContract.balanceOf.call(1, bob).then(bobB => {
						custodianContract.transfer(1, DUMMY_ADDR, alice, bobB.valueOf(), {
							from: bob
						});
					});

					await custodianContract.balanceOf.call(1, charles).then(charlesB => {
						custodianContract.transfer(1, DUMMY_ADDR, alice, charlesB.valueOf(), {
							from: charles
						});
					});
				}

				await custodianContract.balanceOf
					.call(0, alice)
					.then(aliceA => (prevBalanceAalice = aliceA.toNumber() / WEI_DENOMINATOR));
				let aliceB = await custodianContract.balanceOf.call(1, alice);

				prevBalanceBalice = aliceB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.balanceOf
					.call(0, bob)
					.then(bobA => (prevBalanceAbob = bobA.toNumber() / WEI_DENOMINATOR));
				let bobB = await custodianContract.balanceOf.call(1, bob);
				prevBalanceBbob = bobB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.balanceOf
					.call(0, charles)
					.then(
						charlesA => (prevBalanceAcharles = charlesA.toNumber() / WEI_DENOMINATOR)
					);
				let charlesB = await custodianContract.balanceOf.call(1, charles);
				prevBalanceBcharles = charlesB.toNumber() / WEI_DENOMINATOR;

				await custodianContract.skipCooldown(skipNum);

				timestamp = await custodianContract.timestamp.call();

				if (isPeriodicReset) {
					await custodianContract.commitPrice(
						web3.utils.toWei(price + ''),
						timestamp.toNumber(),
						{
							from: pf1
						}
					);
				} else {
					await custodianContract.commitPrice(
						web3.utils.toWei(price + ''),
						timestamp.toNumber() - 200,
						{
							from: pf1
						}
					);
					await custodianContract.commitPrice(
						web3.utils.toWei(price + 1 + ''),
						timestamp.toNumber(),
						{
							from: pf2
						}
					);
				}

				let sysStates = await custodianContract.getSystemStates.call();
				let navAinWei = sysStates[IDX_NAV_A];
				currentNavA = navAinWei.valueOf() / WEI_DENOMINATOR;
				let navBinWei = sysStates[IDX_NAV_B];
				currentNavB = navBinWei.valueOf() / WEI_DENOMINATOR;

				let betaInWei = sysStates[IDX_BETA_IN_WEI];
				prevBeta = betaInWei.valueOf() / WEI_DENOMINATOR;
				for (let i = 0; i < 10; i++) await custodianContract.startPreReset();
				let sysStatesAfter = await custodianContract.getSystemStates.call();
				let betaInWeiAfter = sysStatesAfter[IDX_BETA_IN_WEI];
				// let betaInWeiAfter = await custodianContract.betaInWei.call();
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
				assertState(resetState);
				// let  = await custodianContract.state.call();

				// assert.equal(state.valueOf(), resetState, 'not in correct reset state');
			});

			it('should have three users', async () => {
				let sysStates = await custodianContract.getSystemStates.call();
				let numOfUsers = sysStates[IDX_USER_SIZE];

				assert.equal(numOfUsers.toNumber(), 3, 'num of users incorrect');
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
				let tx = await custodianContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_RESET,
					'not only one user processed'
				);

				let sysStates = await custodianContract.getSystemStates.call();
				let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '1', 'not moving to next user');
				let currentBalanceAalice = await custodianContract.balanceOf.call(0, alice);
				let currentBalanceBalice = await custodianContract.balanceOf.call(1, alice);
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
				let tx = await custodianContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_RESET,
					'reset not completed'
				);
				// let sysStates = await custodianContract.getSystemStates.call();
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
				let tx = await custodianContract.startReset({ gas: resetGas });
				//console.log(tx);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === START_TRADING,
					'reset not completed'
				);
				let sysStates = await custodianContract.getSystemStates.call();
				let nextIndex = sysStates[IDX_NEXT_RESET_ADDR_IDX];
				assert.equal(nextIndex.valueOf(), '0', 'not moving to first user');
				await assertABalanceForAddress(charles, newBalanceA);
				await assertBBalanceForAddress(charles, newBalanceB);
			});

			it('totalA should equal totalB times alpha', async () => {
				let totalA = await custodianContract.totalSupplyA.call();
				let totalB = await custodianContract.totalSupplyB.call();
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
							(alphaInBP || CustodianInit.alphaInBP)) /
							BP_DENOMINATOR
					),
					'total A is not equal to total B times alpha'
				);
			});

			it('should update nav', async () => {
				let sysStates = await custodianContract.getSystemStates.call();
				let navA = sysStates[IDX_NAV_A];

				assert.equal(web3.utils.fromWei(navA.valueOf()), '1', 'nav A not reset to 1');

				let navB = sysStates[IDX_NAV_B];
				assert.isTrue(
					isPeriodicReset
						? isEqual(web3.utils.fromWei(navB.valueOf()), currentNavB)
						: web3.utils.fromWei(navB.valueOf()) === '1',
					'nav B not updated correctly'
				);
			});

			it('should update reset price', async () => {
				if (!isPeriodicReset) {
					let sysPrices = await custodianContract.getSystemPrices.call();

					assert.equal(
						sysPrices[IDX_RESET_PX].valueOf() / WEI_DENOMINATOR,
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

	describe('token test', () => {
		function tokenTest(index) {
			before(async () => {
				await initContracts();
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					1524105709,
					A_ADDR,
					B_ADDR,
					{
						from: pf1
					}
				);
				await duoContract.transfer(alice, web3.utils.toWei('100'), { from: creator });
				await custodianContract.create(true, { from: alice, value: web3.utils.toWei('1') });
			});

			it('should show balance', async () => {
				let balance = await custodianContract.balanceOf.call(index, alice);
				assert.isTrue(balance.toNumber() > 0, 'balance of alice not shown');
			});

			it('alice userIdx should be updated', async () => {
				let userIdx = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdx.toNumber() === 1, 'alice is not updated');
				let userSize = await custodianContract.getSystemStates.call();
				assert.equal(
					userSize[IDX_USER_SIZE].toNumber(),
					1,
					'user size not updated correctly'
				);
			});

			it('should be able to approve', async () => {
				let success = await custodianContract.approve.call(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei('100'),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to approve');

				let tx = await custodianContract.approve(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei('100'),
					{
						from: alice
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === APPROVAL,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.tokenOwner.valueOf() === alice &&
						tx.logs[0].args.spender.valueOf() === bob &&
						tx.logs[0].args.tokens.valueOf() === web3.utils.toWei('100') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('should show allowance', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					100,
					'allowance of bob not equal to 100'
				);
			});

			it('dummy from address should not be used for approval', async () => {
				let dummyAllowance = await custodianContract.allowance.call(index, DUMMY_ADDR, bob);
				assert.equal(dummyAllowance.toNumber(), 0, 'dummy from address is used');
			});

			it('should be able to transfer', async () => {
				let success = await custodianContract.transfer.call(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei('10'),
					{
						from: alice
					}
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transfer(
					index,
					DUMMY_ADDR,
					bob,
					web3.utils.toWei('10'),
					{
						from: alice
					}
				);

				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from.valueOf() === alice &&
						tx.logs[0].args.to.valueOf() === bob &&
						tx.logs[0].args.value.valueOf() === web3.utils.toWei('10') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('bob userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob userIdx is not updated');
				let userSize = await custodianContract.getSystemStates.call();
				assert.equal(
					userSize[IDX_USER_SIZE].toNumber(),
					2,
					'user size not updated correctly'
				);
			});

			it('should show balance of bob equal to 10', async () => {
				let balance = await custodianContract.balanceOf.call(index, bob);
				assert.isTrue(
					balance.toNumber() === 10 * WEI_DENOMINATOR,
					'balance of bob not shown'
				);
			});

			it('dummy from address should not be used for transfer', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(balance.toNumber() === 0, 'dummy from address is used');
			});

			it('should not transfer more than balance', async () => {
				try {
					await custodianContract.transfer.call(
						index,
						DUMMY_ADDR,
						bob,
						web3.utils.toWei('10000000'),
						{
							from: alice
						}
					);

					assert.isTrue(false, 'able to transfer more than balance');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});

			it('should transferAFrom less than allowance', async () => {
				let success = await custodianContract.transferFrom.call(
					index,
					DUMMY_ADDR,
					alice,
					charles,
					web3.utils.toWei('50'),
					{ from: bob }
				);

				assert.isTrue(success, 'Not able to transfer');
				let tx = await custodianContract.transferFrom(
					index,
					DUMMY_ADDR,
					alice,
					charles,
					web3.utils.toWei('50'),
					{
						from: bob
					}
				);
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === TRANSFER,
					'incorrect event emitted'
				);
				assert.isTrue(
					tx.logs[0].args.from.valueOf() === alice &&
						tx.logs[0].args.to.valueOf() === charles &&
						tx.logs[0].args.value.valueOf() === web3.utils.toWei('50') &&
						tx.logs[0].args.index.toNumber() === index,
					'incorrect event arguments emitted'
				);
			});

			it('charles userIdx should be updated', async () => {
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob userIdx is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.isTrue(userIdxCharles.toNumber() === 3, 'charles userIdx is not updated');
				let userSize = await custodianContract.getSystemStates.call();
				assert.equal(
					userSize[IDX_USER_SIZE].toNumber(),
					3,
					'user size not updated correctly'
				);
			});

			it('dummy from address should not be used for transferFrom', async () => {
				let balance = await custodianContract.balanceOf.call(index, DUMMY_ADDR);
				assert.isTrue(balance.toNumber() === 0, 'dummy from address is used');
			});

			it('should not transferFrom more than allowance', async () => {
				try {
					await custodianContract.transferFrom.call(
						index,
						DUMMY_ADDR,
						alice,
						bob,
						web3.utils.toWei('200'),
						{
							from: bob
						}
					);
					assert.isTrue(false, 'can transferFrom of more than allowance');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});

			it('allowance for bob should be 50', async () => {
				let allowance = await custodianContract.allowance.call(index, alice, bob);
				assert.equal(
					allowance.toNumber() / WEI_DENOMINATOR,
					50,
					'allowance of bob not equal to 50'
				);
			});

			it('check balance of charles equal 50', async () => {
				let balance = await custodianContract.balanceOf.call(index, charles);
				await custodianContract.transfer.call(index, alice, david, balance, {
					from: alice
				});

				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					50,
					'balance of charles not equal to 50'
				);
			});

			it('alice transfer all balance to david and update userIdx correctly', async () => {
				let balanceA = await custodianContract.balanceOf.call(index, alice);
				let balanceB = await custodianContract.balanceOf.call(1 - index, alice);
				let userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 0, 'david is not updated');
				await custodianContract.transfer(index, alice, david, balanceA, {
					from: alice
				});
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 4, 'david is not updated');
				let userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 1, 'alice is not updated');
				await custodianContract.transfer(1 - index, alice, david, balanceB, {
					from: alice
				});

				userIdxAlice = await custodianContract.getExistingUser.call(alice);
				assert.isTrue(userIdxAlice.toNumber() === 0, 'alice is not updated');
				let userIdxBob = await custodianContract.getExistingUser.call(bob);
				assert.isTrue(userIdxBob.toNumber() === 2, 'bob is not updated');
				let userIdxCharles = await custodianContract.getExistingUser.call(charles);
				assert.isTrue(userIdxCharles.toNumber() === 3, 'charles is not updated');
				userIdxDavid = await custodianContract.getExistingUser.call(david);
				assert.isTrue(userIdxDavid.toNumber() === 1, 'david is not updated');

				let userSize = await custodianContract.getSystemStates.call();
				assert.equal(
					userSize[IDX_USER_SIZE].toNumber(),
					3,
					'user size not updated correctly'
				);
			});
		}

		describe('A', () => {
			tokenTest(0);
		});

		describe('B', () => {
			tokenTest(1);
		});
	});

	describe('only admin', () => {
		before(async () => {
			await initContracts();
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				1524105709,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		beforeEach(async () => {
			await custodianContract.skipCooldown(25);
		});

		it('admin should be able to set createCommission', async () => {
			let success = await custodianContract.setValue.call(0, 100, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_CREATE_COMM_RATE].toNumber();
			let tx = await custodianContract.setValue(0, 50, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 0 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 50,
				'wrong argument emitted'
			);
		});

		it('admin should be able to set redeemCommission', async () => {
			let success = await custodianContract.setValue.call(8, 200, { from: creator });
			assert.isTrue(success, 'not be able to set commissison');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_REDEEM_COMM_RATE].toNumber();
			let tx = await custodianContract.setValue(8, 200, { from: creator });

			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 8 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 200,
				'wrong argument emitted'
			);
		});

		it('should not be able to set commission higher than 10000', async () => {
			try {
				await custodianContract.setValue.call(0, 10001, { from: creator });

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
				await custodianContract.setValue.call(0, 100, { from: alice });
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
			let success = await custodianContract.setValue.call(1, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set ethDuoRatio');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_ETH_DUO_RATIO].toNumber();
			let tx = await custodianContract.setValue(1, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 1 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set ethDuoRatio', async () => {
			try {
				await custodianContract.setValue.call(1, 100, { from: alice });
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
			let success = await custodianContract.setValue.call(2, 100000, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set gas threshhold');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_ITERATION_GAS_TH].toNumber();
			let tx = await custodianContract.setValue(2, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 2 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set gas threshhold', async () => {
			try {
				await custodianContract.setValue.call(2, 100000, { from: alice });
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
			let success = await custodianContract.setValue.call(3, 100, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set pre reset waiting block');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_PRE_RESET_WAITING_BLK].toNumber();
			let tx = await custodianContract.setValue(3, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 3 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set pre reset waiting blocks', async () => {
			try {
				await custodianContract.setValue.call(3, 100, { from: alice });

				assert.isTrue(false, 'non admin can change pre reset waiting block');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price tolerance', async () => {
			let success = await custodianContract.setValue.call(4, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price tolerance');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_PRICE_TOL].toNumber();
			let tx = await custodianContract.setValue(4, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 4 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setValue.call(4, 100, { from: alice });
				assert.isTrue(false, 'non admin can change price tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price feed tolerance', async () => {
			let success = await custodianContract.setValue.call(5, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed tolerance');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_PF_TOL].toNumber();
			let tx = await custodianContract.setValue(5, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 5 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set price tolerance', async () => {
			try {
				await custodianContract.setValue.call(5, 100, { from: alice });
				assert.isTrue(false, 'non admin can change price feed tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price feed time tolerance', async () => {
			let success = await custodianContract.setValue.call(6, 100, { from: creator });
			assert.isTrue(success, 'not be able to set price feed time tolerance');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_PF_TIME_TOL].toNumber();
			let tx = await custodianContract.setValue(6, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 6 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set price feed time tolerance', async () => {
			try {
				await custodianContract.setValue.call(6, 100, { from: alice });
				assert.isTrue(false, 'non admin can change price feed time tolerance');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('admin should be able to set price update coolupdate', async () => {
			let success = await custodianContract.setValue.call(7, 10, {
				from: creator
			});
			assert.isTrue(success, 'not be able to set price update coolupdate');
			let sysStates = await custodianContract.getSystemStates.call();
			let preValue = sysStates[IDX_PRICE_UPDATE_COOLDOWN].toNumber();
			let tx = await custodianContract.setValue(7, 100, { from: creator });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === SET_VALUE,
				'wrong event emitted'
			);
			assert.isTrue(
				tx.logs[0].args.index.toNumber() === 7 &&
					tx.logs[0].args.oldValue.toNumber() === preValue &&
					tx.logs[0].args.newValue.toNumber() === 100,
				'wrong argument emitted'
			);
		});

		it('non admin should not be able to set price update coolupdate', async () => {
			try {
				await custodianContract.setValue.call(7, 10, { from: alice });
				assert.isTrue(false, 'non admin can change price update coolupdate');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});
	});

	describe('poolManager add address', () => {
		let blockTime;
		before(async () => {
			await initContracts();
			const blockNumber = await web3.eth.getBlockNumber();
			const block = await web3.eth.getBlock(blockNumber);
			blockTime = block.timestamp;
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				blockTime - Number(CustodianInit.period) * 30,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		let poolManager = pm;
		it('non poolManager cannot add address', async () => {
			try {
				await custodianContract.addAddress.call(alice, bob, { from: charles });
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
				await custodianContract.addAddress.call(alice, alice, { from: poolManager });
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
				await custodianContract.addAddress(pf1, pf2, { from: poolManager });
				assert.isTrue(false, 'can add used account');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should add two different address', async () => {
			let addStatus = await custodianContract.addAddress.call(
				web3.utils.toChecksumAddress(alice),
				web3.utils.toChecksumAddress(bob),
				{ from: poolManager }
			);
			assert.isTrue(addStatus, 'cannot add address');
			let tx = await custodianContract.addAddress(
				web3.utils.toChecksumAddress(alice),
				web3.utils.toChecksumAddress(bob),
				{ from: poolManager }
			);
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === ADD_ADDRESS,
				'not exactly one event emitted'
			);
			let args = tx.logs[0].args;
			let sysAddress = await custodianContract.getSystemAddresses.call();
			poolManager = sysAddress[IDX_POOL_MANAGER];
			assert.isTrue(
				args['added1'] === alice &&
					args['added2'] === bob &&
					args['newPoolManager'] === poolManager,
				'event args is wrong'
			);
		});

		it('pool size should be 7 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			// check correct poolSize
			assert.isTrue(poolSize === PoolInit.length + 1, 'cannot add address');
			let poolList = [];
			// check validatdion of address
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
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

		it('new poolManager should be set correctly', async () => {
			// let timestamp = await custodianContract.timestamp.call({ from: creator });
			let adderAddr = PoolInit[0];
			assert.isTrue(
				web3.utils.toChecksumAddress(adderAddr) ===
					web3.utils.toChecksumAddress(poolManager),
				'adder address not updated correctly'
			);
		});

		it('new poolManager should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(poolManager);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('new poolManager should be removed from the pool', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(poolManager),
					'new adder is still in the pool'
				);
			}
		});

		it('new poolManager should not add within coolDown', async () => {
			try {
				await custodianContract.addAddress.call(charles, david, { from: poolManager });
				assert.isTrue(false, 'can add same address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('new poolManager should only add beyond coolDown', async () => {
			await custodianContract.skipCooldown(25);
			let success = await custodianContract.addAddress.call(
				web3.utils.toChecksumAddress(charles),
				web3.utils.toChecksumAddress(david),
				{ from: poolManager }
			);
			assert.isTrue(success, 'cannot add outside cooldown');
		});
	});

	describe('poolManger remove from pool', () => {
		let blockTime;
		before(async () => {
			await initContracts();
			const blockNumber = await web3.eth.getBlockNumber();
			const block = await web3.eth.getBlock(blockNumber);
			blockTime = block.timestamp;
			await custodianContract.startContract(
				web3.utils.toWei(ethInitPrice + ''),
				blockTime - Number(CustodianInit.period) * 30,
				A_ADDR,
				B_ADDR,
				{
					from: pf1
				}
			);
		});

		let poolManager = pm;
		let nextCandidate;

		it('non poolManager cannot remove address', async () => {
			try {
				await custodianContract.removeAddress.call(alice, { from: bob });
				assert.isTrue(false, 'non poolManager can remove address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('should not remove address not in the pool', async () => {
			try {
				await custodianContract.removeAddress.call(charles, { from: poolManager });
				assert.isTrue(false, 'non poolManager can remove address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('poolManager should remove address in the pool', async () => {
			let canRemove = await custodianContract.removeAddress.call(PoolInit[0], {
				from: poolManager
			});
			assert.isTrue(canRemove, 'poolManager cannot remove from the pool List');
			let tx = await custodianContract.removeAddress(PoolInit[0], { from: poolManager });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === REMOVE_ADDRESS,
				'not exactly one event emitted'
			);
			let args = tx.logs[0].args;
			let sysAddress = await custodianContract.getSystemAddresses.call();
			poolManager = sysAddress[IDX_POOL_MANAGER];
			for (let i = 1; i < PoolInit.length; i++) {
				let currentCandidate = PoolInit[i];
				if (currentCandidate != poolManager) {
					nextCandidate = currentCandidate;
					break;
				}
			}
			assert.isTrue(
				web3.utils.toChecksumAddress(args['addr']) === PoolInit[0] &&
					args['newPoolManager'] === poolManager,
				'event args is wrong'
			);
		});

		it('pool size should be 4 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			// check correct poolSize
			assert.isTrue(poolSize === PoolInit.length - 2, 'cannot remove address');
			let poolList = [];
			// check validatdion of address
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
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

		it('removed address should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(PoolInit[0]);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('removed address should be not in the poolList', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(PoolInit[0]),
					'new adder is still in the pool'
				);
			}
		});

		it('new poolManager should be set correctly', async () => {
			let adderAddr = PoolInit[PoolInit.length - 1];
			assert.isTrue(
				web3.utils.toChecksumAddress(adderAddr) ===
					web3.utils.toChecksumAddress(poolManager),
				'adder address not updated correctly'
			);
		});

		it('new poolManager should be marked as used', async () => {
			let addStatus = await custodianContract.getAddrStatus.call(poolManager);
			assert.isTrue(addStatus.toNumber() === 2, 'new adder not marked as used');
		});

		it('new poolManager should be removed from the pool', async () => {
			let sysStates = await custodianContract.getSystemStates.call();
			let poolSize = sysStates[IDX_POOL_SIZE].toNumber();
			for (let i = 0; i < poolSize; i++) {
				let addr = await custodianContract.addrPool.call(i);
				assert.isTrue(
					web3.utils.toChecksumAddress(addr) !==
						web3.utils.toChecksumAddress(poolManager),
					'new adder is still in the pool'
				);
			}
		});

		it('new poolManager should not remove within coolDown', async () => {
			try {
				await custodianContract.removeAddress.call(nextCandidate, { from: poolManager });
				assert.isTrue(false, 'non poolManager can remove address');
			} catch (err) {
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				);
			}
		});

		it('new poolManager should only remove beyond coolDown', async () => {
			await custodianContract.skipCooldown(25);
			let success = await custodianContract.removeAddress.call(nextCandidate, {
				from: poolManager
			});
			assert.isTrue(success, 'cannot add outside cooldown');
		});
	});

	describe('update role', () => {
		function updateRole(currentRole, roelIndex) {
			let newAddr;
			let poolSize;
			let blockTime;

			before(async () => {
				// poolManager = creator;
				await initContracts();
				const blockNumber = await web3.eth.getBlockNumber();
				const block = await web3.eth.getBlock(blockNumber);
				blockTime = block.timestamp;
				await custodianContract.startContract(
					web3.utils.toWei(ethInitPrice + ''),
					blockTime - Number(CustodianInit.period) * 60,
					A_ADDR,
					B_ADDR,
					{
						from: pf1
					}
				);
				await custodianContract.addAddress(
					web3.utils.toChecksumAddress(alice),
					web3.utils.toChecksumAddress(bob),
					{ from: pm }
				);
				await custodianContract.skipCooldown(25);
			});

			it('address not in the pool cannot assign', async () => {
				try {
					await custodianContract.updateAddress(currentRole, { from: charles });
					assert.isTrue(false, 'member not in the pool can assign role');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});

			it('pool account can assign another pool account as role', async () => {
				let tx = await custodianContract.updateAddress(currentRole, { from: alice });
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === UPDATE_ADDRESS,
					'not exactly one event emitted'
				);
				let args = tx.logs[0].args;
				let sysAddress = await custodianContract.getSystemAddresses.call({ from: alice });
				newAddr = sysAddress[roelIndex];

				assert.isTrue(
					args['current'] === currentRole && args['newAddr'] === newAddr,
					'event args is wrong'
				);
				assert.isTrue(newAddr !== currentRole, 'currentRole not updated');
			});

			it('pool size should be 5 and pool candidate is valid eth address and pool candidate has no duplication', async () => {
				let sysStates = await custodianContract.getSystemStates.call();
				poolSize = sysStates[IDX_POOL_SIZE].toNumber();
				// check correct poolSize
				assert.isTrue(poolSize === PoolInit.length - 1, 'cannot add address');
				let poolList = [];
				// check validatdion of address
				for (let i = 0; i < poolSize; i++) {
					let addr = await custodianContract.addrPool.call(i);
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

			it('newAddr should be marked as used', async () => {
				let addrStatusNewPF = await custodianContract.getAddrStatus.call(newAddr);
				assert.isTrue(
					addrStatusNewPF.toNumber() === 2,
					'assigner and newPFaddr not marked as used'
				);
			});

			it('newAddr should be set correctly', async () => {
				assert.isTrue(
					web3.utils.toChecksumAddress(PoolInit[PoolInit.length - 1]) ===
						web3.utils.toChecksumAddress(newAddr),
					'adder address not updated correctly'
				);
			});

			it('newAddr should be removed from poolList', async () => {
				for (let i = 0; i < poolSize; i++) {
					let addr = await custodianContract.addrPool.call(i);
					assert.isTrue(
						web3.utils.toChecksumAddress(addr) !==
							web3.utils.toChecksumAddress(newAddr),
						'assigner is still in the pool'
					);
				}
			});

			it('should not update address within coolDonw', async () => {
				try {
					await custodianContract.updateAddress(newAddr, { from: bob });
					assert.isTrue(false, 'member not in the pool can assign role');
				} catch (err) {
					assert.equal(
						err.message,
						'VM Exception while processing transaction: revert',
						'transaction not reverted'
					);
				}
			});

			it('should only update beyond coolDown period', async () => {
				await custodianContract.skipCooldown(25);
				let tx = await custodianContract.updateAddress(newAddr, { from: bob });
				assert.isTrue(
					tx.logs.length === 1 && tx.logs[0].event === UPDATE_ADDRESS,
					'not exactly one event emitted'
				);
				let args = tx.logs[0].args;
				let sysAddress = await custodianContract.getSystemAddresses.call({ from: bob });
				let newAddr2 = sysAddress[roelIndex];

				assert.isTrue(
					args['current'] === newAddr && args['newAddr'] === newAddr2,
					'event args is wrong'
				);
				assert.isTrue(newAddr2 !== newAddr, 'currentRole not updated');
			});
		}

		describe('update pf1', () => {
			updateRole(pf1, IDX_PRICEFEED_1);
		});

		describe('update pf2', () => {
			updateRole(pf2, IDX_PRICEFEED_2);
		});

		describe('update pf3', () => {
			updateRole(pf3, IDX_PRICEFEED_3);
		});

		describe('update feeCollector', () => {
			updateRole(fc, IDX_FEE_COLLECTOR);
		});

		describe('update admin', () => {
			updateRole(creator, IDX_ADMIN);
		});
	});
});
