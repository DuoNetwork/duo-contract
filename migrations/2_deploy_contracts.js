const web3 = require('web3');

const DUO = artifacts.require('./DUO.sol');
const Custodian = artifacts.require('./Custodian.sol');
const CustodianMock = artifacts.require('./CustodianMock.sol');
const TokenA = artifacts.require('./TokenA.sol');
const TokenB = artifacts.require('./TokenB.sol');

const InitParas = require('./contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];
const TokenAInit = InitParas['TokenA'];
const TokenBInit = InitParas['TokenB'];

module.exports = async (deployer, network, accounts) => {
	let CustodianToDeploy = network !== 'development' ? Custodian : CustodianMock;
	let creator, feeAdd, pf1, pf2, pf3, poolManager;

	if (network == 'kovan') {
		// creator = accounts[3];
		creator = "0x00D8d0660b243452fC2f996A892D3083A903576F";
		// pf1 = accounts[0];
		pf1 = "0x0022BFd6AFaD3408A1714fa8F9371ad5Ce8A0F1a";
		// pf2 = accounts[1];
		pf2 = "0x006f36c5B59F94688C460c4bA35c0d00a2683c76";
		// pf3 = accounts[2];
		pf3 = "0x0015c8Ea5937dadA06074464f5b6213D93709bEC";
		// feeAdd = accounts[4];
		feeAdd = "0x0017d61f0B0a28E2F0eBB3B6E269738a6252CFeD";
		// poolManager = accounts[5];
		poolManager = "0x00184D7745ef135490114EEFfB762C2A60E067d3";
	}
	if (network == 'ropsten') {
		// creator = accounts[3];
		creator = "0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E";
		// pf1 = accounts[0];
		pf1 = "0x00f125c2C1b08c2516e7A7B789d617ad93Fdf4C0";
		// pf2 = accounts[1];
		pf2 = "0x002cac65031CEbefE8233672C33bAE9E95c6dC1C";
		// pf3 = accounts[2];
		pf3 = "0x0076c03e1028F92f8391029f15096026bd3bdFd2";
		// feeAdd = accounts[4];
		feeAdd = "0x00C757418b1B36BE994b94e702df55bE4cC1f02e";
		// poolManager = accounts[5];
		poolManager = "0x000180CD73cAD192aCaCc4f00fddf1FcbD484AA3";
	}
	if (network == 'development') {
		creator = accounts[0];
		pf1 = accounts[1];
		pf2 = accounts[2];
		pf3 = accounts[3];
		feeAdd = accounts[4];
		poolManager = accounts[5];
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
	await deployer.deploy(
		CustodianToDeploy,
		feeAdd,
		DUO.address,
		pf1,
		pf2,
		pf3,
		poolManager,
		CustodianInit.alphaInBP,
		web3.utils.toWei(CustodianInit.couponRate),
		web3.utils.toWei(CustodianInit.hp),
		web3.utils.toWei(CustodianInit.hu),
		web3.utils.toWei(CustodianInit.hd),
		CustodianInit.commissionRateInBP,
		CustodianInit.period,
		// web3.utils.toWei(CustodianInit.memberThreshold),
		// CustodianInit.gasThreshhold,
		CustodianInit.coolDown,
		{ from: creator }
	);
	await deployer.deploy(
		TokenA,
		TokenAInit.tokenName,
		TokenAInit.tokenSymbol,
		CustodianToDeploy.address,
		{
			from: creator
		}
	);
	await deployer.deploy(
		TokenB,
		TokenBInit.tokenName,
		TokenBInit.tokenSymbol,
		CustodianToDeploy.address,
		{ from: creator }
	);
};
