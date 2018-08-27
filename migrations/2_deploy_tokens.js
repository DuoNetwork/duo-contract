const web3 = require('web3');

const Beethoven = artifacts.require('./Beethoven.sol');
// const IPool = artifacts.require('./IPool.sol');
const BeethovenMock = artifacts.require('./BeethovenMock.sol');

const SafeMath = artifacts.require('./SafeMath.sol');
const Managed = artifacts.require('./Managed.sol');
const Custodian = artifacts.require('./Custodian.sol');
const DUO = artifacts.require('./DUO.sol');
const TokenA = artifacts.require('./TokenA.sol');
const TokenB = artifacts.require('./TokenB.sol');

const InitParas = require('./contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const TokenAInit = InitParas['TokenA'];
const TokenBInit = InitParas['TokenB'];

module.exports = async (deployer, network, accounts) => {
	let creator;

	let BeethovenToDeploy = network !== 'development' ? Beethoven : BeethovenMock;

	if (network == 'kovan') {
		creator = '0x00D8d0660b243452fC2f996A892D3083A903576F';
	}
	if (network == 'ropsten') {
		// creator = accounts[3];
		creator = '0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E';
	}
	if (network == 'development') {
		creator = accounts[0];
	}

	await deployer.deploy(
		DUO,
		web3.utils.toWei(DuoInit.initSupply),
		DuoInit.tokenName,
		DuoInit.tokenSymbol,
		{
			from: creator
		}
	);

	await deployer.deploy(SafeMath, {
		from: creator
	});

	await deployer.link(SafeMath, Custodian);

	await deployer.deploy(Custodian, {
		from: creator
	});

	await deployer.deploy(Managed, { from: creator });

	await deployer.deploy(
		BeethovenToDeploy,
		BeethovenInit.alphaInBP,
		web3.utils.toWei(BeethovenInit.couponRate),
		web3.utils.toWei(BeethovenInit.hp),
		web3.utils.toWei(BeethovenInit.hu),
		web3.utils.toWei(BeethovenInit.hd),
		BeethovenInit.commissionRateInBP,
		BeethovenInit.period,
		BeethovenInit.optCoolDown,
		BeethovenInit.pxFetchCoolDown,
		BeethovenInit.iteGasTh,
		BeethovenInit.ethDuoRate,
		BeethovenInit.preResetWaitBlk,
		{ from: creator }
	);
	await deployer.deploy(
		TokenA,
		TokenAInit.tokenName,
		TokenAInit.tokenSymbol,
		BeethovenToDeploy.address,
		{
			from: creator
		}
	);
	await deployer.deploy(
		TokenB,
		TokenBInit.tokenName,
		TokenBInit.tokenSymbol,
		BeethovenToDeploy.address,
		{ from: creator }
	);
};
