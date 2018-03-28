const web3 = require("web3");

var DUO = artifacts.require('./DUO.sol');
var Custodian = artifacts.require('./Custodian.sol');
var CustodianMock = artifacts.require('./CustodianMock.sol');
var TokenA = artifacts.require('./TokenA.sol');
var TokenB = artifacts.require('./TokenB.sol');

const InitParas = require("./contractInitParas.json");
const CustodianInit = InitParas["Custodian"];
const DuoInit = InitParas["DUO"];
const TokenAInit = InitParas["TokenA"];
const TokenBInit = InitParas["TokenB"];


module.exports = (deployer, network, accounts) => {
	let CustodianToDeploy = network !== 'development' ? Custodian : CustodianMock;
	return deployer
		.deploy(DUO, web3.utils.toWei(DuoInit.initSupply), DuoInit.tokenName, DuoInit.tokenSymbol)
		.then(() =>
			deployer
				.deploy(
					CustodianToDeploy,
					web3.utils.toWei(CustodianInit.ethInitPrice),
					accounts[0],
					DUO.address,
					accounts[0],
					accounts[1],
					accounts[2],
					CustodianInit.alphaInBP,
					web3.utils.toWei(CustodianInit.couponRate),
					web3.utils.toWei(CustodianInit.hp),
					web3.utils.toWei(CustodianInit.hu),
					web3.utils.toWei(CustodianInit.hd),
					CustodianInit.commissionRateInBP,
					CustodianInit.period,
					CustodianInit.memberThreshold,
					CustodianInit.gasThreshhold
				)
				.then(() =>
					deployer
						.deploy(TokenA, TokenAInit.tokenName, TokenAInit.tokenSymbol, CustodianToDeploy.address)
						.then(() =>
							deployer.deploy(TokenB, TokenBInit.tokenName, TokenBInit.tokenSymbol, CustodianToDeploy.address)
						)
						.catch(error => console.log(error))
				)
				.catch(error => console.log(error))
		)
		.catch(error => console.log(error));
};
