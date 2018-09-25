const web3 = require('web3');
const SafeMath = artifacts.require('./SafeMath.sol');
const Beethoven = artifacts.require('./Beethoven.sol');
const BeethovenMock = artifacts.require('./BeethovenMock.sol');
const Magi = artifacts.require('./oracles/Magi.sol');
const Esplanade = artifacts.require('./Esplanade.sol');
const EsplanadeMock = artifacts.require('./EsplanadeMock.sol');
const DUO = artifacts.require('./DUO.sol');
const DuoMock = artifacts.require('./DuoMock.sol');
const TokenA = artifacts.require('./TokenA.sol');
const TokenB = artifacts.require('./TokenB.sol');
const InitParas = require('./contractInitParas.json');
const BeethovenInit = InitParas['Beethoven'];
const DuoInit = InitParas['DUO'];
const TokenAInit = InitParas['TokenA'];
const TokenBInit = InitParas['TokenB'];
const MagiInit = InitParas['Magi'];
const RoleManagerInit = InitParas['RoleManager'];

module.exports = async (deployer, network, accounts) => {
	let creator, pf1, pf2, pf3, fc;

	if (network == 'kovan') {
		creator = '0x00D8d0660b243452fC2f996A892D3083A903576F';
		pf1 = '0x0022BFd6AFaD3408A1714fa8F9371ad5Ce8A0F1a';
		// pf2 = accounts[1];
		pf2 = '0x002002812b42601Ae5026344F0395E68527bb0F8';
		// pf3 = accounts[2];
		pf3 = '0x00476E55e02673B0E4D2B474071014D5a366Ed4E';
		fc = '0x0';
	}
	if (network == 'ropsten') {
		// creator = accounts[3];
		creator = '0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E';
		pf1 = '0x00f125c2C1b08c2516e7A7B789d617ad93Fdf4C0';
		// pf2 = accounts[1];
		pf2 = '0x002cac65031CEbefE8233672C33bAE9E95c6dC1C';
		// pf3 = accounts[2];
		pf3 = '0x0076c03e1028F92f8391029f15096026bd3bdFd2';
		fc = '0x0';
	}
	if (network == 'development' || network == 'coverage') {
		creator = accounts[0];
		pf1 = accounts[1];
		pf2 = accounts[2];
		pf3 = accounts[3];
		fc = accounts[4];
	}

	let BeethovenToDeploy = (network !== 'development' && network !== 'coverage') ? Beethoven : BeethovenMock;
	let DuoToDeploy = (network !== 'development' && network !== 'coverage') ? DUO : DuoMock;
	let EsplanadeToDeploy = (network !== 'development' && network !== 'coverage') ? Esplanade : EsplanadeMock;

	// 42008
	await deployer.deploy(SafeMath, {
		from: creator
	});
	// 74748, 27008
	await deployer.link(SafeMath, [BeethovenToDeploy, Magi]);

	// 950268
	await deployer.deploy(
		DuoToDeploy,
		web3.utils.toWei(DuoInit.initSupply),
		DuoInit.tokenName,
		DuoInit.tokenSymbol,
		{
			from: creator
		}
	);

	// 2611094
	await deployer.deploy(EsplanadeToDeploy, RoleManagerInit.optCoolDown, {
		from: creator
	});

	// 5788827 for mock
	await deployer.deploy(
		BeethovenToDeploy,
		DuoToDeploy.address,
		EsplanadeToDeploy.address,
		fc,
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
	// 2359562 for mock
	await deployer.deploy(
		Magi,
		creator,
		pf1,
		pf2,
		pf3,
		EsplanadeToDeploy.address,
		MagiInit.pxCoolDown,
		MagiInit.optCoolDown,
		{
			from: creator
		}
	);

	// 1094050
	await deployer.deploy(
		TokenA,
		TokenAInit.tokenName,
		TokenAInit.tokenSymbol,
		BeethovenToDeploy.address,
		{
			from: creator
		}
	);
	// 1094370
	await deployer.deploy(
		TokenB,
		TokenBInit.tokenName,
		TokenBInit.tokenSymbol,
		BeethovenToDeploy.address,
		{ from: creator }
	);
};
