var DUO = artifacts.require('./DUO.sol');
var Custodian = artifacts.require('./Custodian.sol');
var CustodianMock = artifacts.require('./CustodianMock.sol');
var TokenA = artifacts.require('./TokenA.sol');
var TokenB = artifacts.require('./TokenB.sol');

module.exports = (deployer, network, accounts) => {
	let CustodianToDeploy = network !== 'development' ? Custodian : CustodianMock;
	return deployer
		.deploy(DUO, 10000, 'DUO', 'DUO')
		.then(() =>
			deployer
				.deploy(
					CustodianToDeploy,
					582000000000000000000,
					accounts[0],
					DUO.address,
					accounts[0],
					accounts[1],
					accounts[2],
					10000,
					10000000000000000,
					1200000000000000000,
					1500000000000000000,
					250000000000000000,
					300,
					60 * 60,
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
