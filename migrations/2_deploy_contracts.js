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
	let creator, feeAdd, pf1, pf2, pf3;

	if (network == 'kovan') {
		creator = accounts[3];
		feeAdd = accounts[3];
		pf1 = accounts[0];
		pf2 = accounts[1];
		pf3 = accounts[2];
	}
	if (network == 'development') {
		creator = accounts[0];
		feeAdd = accounts[0];
		pf1 = accounts[0];
		pf2 = accounts[1];
		pf3 = accounts[2];
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
		CustodianInit.alphaInBP,
		web3.utils.toWei(CustodianInit.couponRate),
		web3.utils.toWei(CustodianInit.hp),
		web3.utils.toWei(CustodianInit.hu),
		web3.utils.toWei(CustodianInit.hd),
		CustodianInit.commissionRateInBP,
		CustodianInit.period,
		web3.utils.toWei(CustodianInit.memberThreshold),
		CustodianInit.gasThreshhold,
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
