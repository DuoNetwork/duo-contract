const Custodian = artifacts.require('../contracts/custodians/Custodian.sol');
// const Managed = artifacts.requrie('../contracts/common/Managed.sol');
// const Pool = artifacts.require('../contracts/common/Pool.sol');
// const SafeMath = artifacts.require('../contracts/common/SafeMath.sol');
// const Magi = artifacts.require('../contracts/oracles/Magi.sol');
// const DUO = artifacts.require('../contracts/tokens/DUO.sol');
// const Web3 = require('web3');
// import Web3 from 'web3';
// const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
// const DuoInit = InitParas['DUO'];
// const PoolInit = InitParas['Pool'];
// const MagiInit = InitParas['Magi'];

// Event
// const START_PRE_RESET = 'StartPreReset';
// const START_RESET = 'StartReset';
// const START_TRADING = 'StartTrading';
// const CREATE = 'Create';
// const REDEEM = 'Redeem';
// const TOTAL_SUPPLY = 'TotalSupply';
// const COMMIT_PRICE = 'CommitPrice';
// const ACCEPT_PRICE = 'AcceptPrice';
// const TRANSFER = 'Transfer';
// const APPROVAL = 'Approval';
// const ADD_ADDRESS = 'AddAddress';
// const UPDATE_ADDRESS = 'UpdateAddress';
// const REMOVE_ADDRESS = 'RemoveAddress';
// const SET_VALUE = 'SetValue';
// const COLLECT_FEE = 'CollectFee';

const STATE_INCEPT_RESET = '0';
// const STATE_TRADING = '1';
// const STATE_PRE_RESET = '2';
// const STATE_UPWARD_RESET = '3';
// const STATE_DOWNWARD_RESET = '4';
// const STATE_PERIODIC_RESET = '5';

// const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';
// const VM_INVALID_OP_CODE_MSG = 'VM Exception while processing transaction: invalid opcode';
// const VM_INVALID_OPCODE_MSG = 'VM Exception while processing transaction: invalid opcode';

// const EPSILON = 1e-10;
// const ethInitPrice = 582;
// const ethDuoFeeRatio = 800;

// const A_ADDR = '0xa';
// const B_ADDR = '0xb';
// const DUMMY_ADDR = '0xc';

// const isEqual = (a, b, log = false) => {
// 	if (log) {
// 		console.log(a);
// 		console.log(b);
// 	}
// 	if (Math.abs(Number(b)) > EPSILON && Math.abs(Number(b)) > EPSILON) {
// 		return Math.abs(Number(a) - Number(b)) / Number(b) <= EPSILON;
// 	} else {
// 		return Math.abs(Number(a) - Number(b)) <= EPSILON;
// 	}
// };

contract('Custodian', accounts => {
	let custodianContract;
	// let duoContract;
	// let poolContract;
	// let magiContract;

	const creator = accounts[0];
	const fc = accounts[1];

	// const alice = accounts[6]; //duoMember
	// const bob = accounts[7];
	// const charles = accounts[8];
	// const david = accounts[9];

	// const WEI_DENOMINATOR = 1e18;
	// const BP_DENOMINATOR = 10000;

	const initContracts = async () => {
		// duoContract = await DUO.new(
		// 	web3.utils.toWei(DuoInit.initSupply),
		// 	DuoInit.tokenName,
		// 	DuoInit.tokenSymbol,
		// 	{
		// 		from: creator
		// 	}
		// );

		custodianContract = await Custodian.new(
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

		// poolContract = await Pool.new(
		// 	BeethovenInit.optCoolDown
		// );

		// magiContract = await Magi.new(
		// 	creator,
		// 	pf1,
		// 	pf2,
		// 	pf3,
		// 	MagiInit.pxCoolDown,
		// 	MagiInit.optColDown
		// );
	};

	describe.only('constructor', () => {
		before(initContracts);

		it('state should be Inception', async () => {
			let state = await custodianContract.state.call();
			assert.equal(state.valueOf(), STATE_INCEPT_RESET, 'state is not inception');
		});

		it('feeCollector should equal specified value', async () => {
			let fc = await custodianContract.feeCollector.call();
			assert.equal(
				fc.valueOf(),
				fc,
				'feeCollector specified incorrect'
			);
		});

		it('createCommInBP should equal specified value', async () => {
			let comm = await custodianContract.createCommInBP.call();
			assert.equal(comm.toNumber(), BeethovenInit.comm, 'createCommInBP specified incorrect');
		});

		

		// it('period should equal specified value', async () => {
		// 	let sysStates = await beethovenContract.getSystemStates.call();
		// 	assert.equal(
		// 		sysStates[IDX_PERIOD].valueOf(),
		// 		BeethovenInit.period,
		// 		'period specified incorrect'
		// 	);
		// });

		// it('priceUpdateCoolDown should equal specified value', async () => {
		// 	let sysStates = await beethovenContract.getSystemStates.call();
		// 	assert.equal(
		// 		sysStates[IDX_PRICE_UPDATE_COOLDOWN].valueOf(),
		// 		BeethovenInit.coolDown,
		// 		'priceUpdateCoolDown specified incorrect'
		// 	);
		// });
	});
});
