const web3 = require("web3");

var DUO = artifacts.require('./DUO.sol');
var Custodian = artifacts.require('./Custodian.sol');
var CustodianMock = artifacts.require('./CustodianMock.sol');
var TokenA = artifacts.require('./TokenA.sol');
var TokenB = artifacts.require('./TokenB.sol');

module.exports = (deployer, network, accounts) => {
	let CustodianToDeploy = network !== 'development' ? Custodian : CustodianMock;
	return deployer
		.deploy(DUO, web3.utils.toWei("10000"), 'DUO', 'DUO')
		.then(() =>
			deployer
				.deploy(
					CustodianToDeploy,
					web3.utils.toWei("582"),
					accounts[0],
					DUO.address,
					accounts[0],
					accounts[1],
					accounts[2],
					10000,
					web3.utils.toWei("0.0002"),
					web3.utils.toWei("1.2"),
					web3.utils.toWei("1.5"),
					web3.utils.toWei("0.25"),
					300,
					3600,
					0,
					200000
				)
				.then(() =>
					deployer
						.deploy(TokenA, 'TokenA', 'TKA', CustodianToDeploy.address)
						.then(() =>
							deployer.deploy(TokenB, 'TokenB', 'TKB', CustodianToDeploy.address)
						)
						.catch(error => console.log(error))
				)
				.catch(error => console.log(error))
		)
		.catch(error => console.log(error));
};
