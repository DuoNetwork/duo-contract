const Custodian = artifacts.require('../contracts/custodians/CustodianMock.sol');
const RoleManager = artifacts.require('../contracts/common/EsplanadeMock.sol');
const DUO = artifacts.require('../contracts/tokens/DuoMock.sol');
const Managed = artifacts.require('../contracts/common/Managed.sol');
const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:' + process.env.GANACHE_PORT));

const InitParas = require('../migrations/contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const RoleManagerInit = InitParas['RoleManager'];
const Pool = InitParas['Pool'];
const ManagedInit = InitParas['Managed'];

const VM_REVERT_MSG = 'VM Exception while processing transaction: revert';

const EVENT_UPDATE_ROLEMANAGER = 'UpdateRoleManager';
const EVENT_UPDATE_OPERATOR = 'UpdateOperator';

let validColdPool = Pool[0].map(addr => web3.utils.toChecksumAddress(addr));

contract('Managed', accounts => {
	let managedContract;
	let roleManagerContract;

	const creator = accounts[0];
	const fc = accounts[1];
	const alice = accounts[5];
	const bob = accounts[6];

	const initContracts = async () => {
		roleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
			from: creator
		});
		managedContract = await initManaged();
	};

	const initCustodian = async () => {
		let duoContract = await DUO.new(
			web3.utils.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);
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

	const initManaged = async () => {
		return await Managed.new(roleManagerContract.address, creator, ManagedInit.optCoolDown, {
			from: creator
		});
	};

	describe('constructor', () => {
		before(initContracts);

		it('should set roleManagerAddress correctly', async () => {
			let value = await managedContract.roleManagerAddress.call();
			assert.equal(
				value.valueOf(),
				roleManagerContract.address,
				'rolemanagerAddr is not set'
			);
		});

		it('should set opt correctly', async () => {
			let value = await managedContract.operator.call();
			assert.equal(value.valueOf(), creator, 'opt is not dry');
		});

		it('should set optCoolDown correctly', async () => {
			let value = await managedContract.operationCoolDown.call();
			assert.equal(value.valueOf(), ManagedInit.optCoolDown + '', 'optCD is not set');
		});
	});

	describe('updateRoleManager', () => {
		before(initContracts);
		it('should not set not passed rolemanager contract', async () => {
			try {
				await managedContract.updateRoleManager.call(roleManagerContract.address);
				assert.isTrue(false, 'can set not passed role manager contract');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should not set passed rolemanager without moderator', async () => {
			await roleManagerContract.setPassedContract(alice);
			try {
				await managedContract.updateRoleManager.call(alice);
				assert.isTrue(false, 'can set role manager contract without moderator');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('should set passed rolemanage', async () => {
			let newRoleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
				from: creator
			});
			await roleManagerContract.setPassedContract(newRoleManagerContract.address);

			let tx = await managedContract.updateRoleManager(newRoleManagerContract.address);
			assert.isTrue(
				tx.logs.length === 1 &&
					tx.logs[0].event === EVENT_UPDATE_ROLEMANAGER &&
					tx.logs[0].args.newManagerAddress === newRoleManagerContract.address
			);
		});

		it('should not update within cooldown', async () => {
			let new2RoleManagerContract = await RoleManager.new(RoleManagerInit.optCoolDown, {
				from: creator
			});
			await roleManagerContract.setPassedContract(new2RoleManagerContract.address);
			try {
				await managedContract.updateRoleManager(new2RoleManagerContract.address);
				assert.isTrue(false, 'can set within cool down');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});
	});

	describe('updateOperator', () => {
		before(initContracts);
		let custodianContract;
		it('address not in pool cannot update', async () => {
			try {
				await managedContract.updateOperator({ from: alice });
				assert.isTrue(false, 'address not in pool can update');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});

		it('cold address can update', async () => {
			await roleManagerContract.setPool(0, 0, alice);
			custodianContract = await initCustodian();
			await roleManagerContract.addCustodian(custodianContract.address, {
				from: creator
			});
			await roleManagerContract.skipCooldown(1);
			let tx = await custodianContract.updateOperator({ from: alice });
			assert.isTrue(
				tx.logs.length === 1 && tx.logs[0].event === EVENT_UPDATE_OPERATOR,
				'event wrong'
			);

			assert.isTrue(
				tx.logs[0].args.updater === alice && tx.logs[0].args.newOperator != creator,
				'wrong event argument'
			);
			assert.isTrue(
				validColdPool.includes(web3.utils.toChecksumAddress(tx.logs[0].args.newOperator)),
				'newOperator invalid'
			);
		});

		it('hot address cannot update ', async () => {
			await roleManagerContract.setPool(1, 0, bob);
			await roleManagerContract.skipCooldown(1);
			try {
				await custodianContract.updateOperator({ from: bob });
				assert.isTrue(false, 'hot addr can update');
			} catch (err) {
				assert.equal(err.message, VM_REVERT_MSG, 'not reverted');
			}
		});
	});
});
