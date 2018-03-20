var Custodian = artifacts.require('./Custodian.sol');
var TokenA = artifacts.require('./TokenA.sol');
var TokenB = artifacts.require('./TokenB.sol');
module.exports = function(deployer, network, accounts) {
	deployer
		.deploy(Custodian, 520000000000000000000, "0x00d2FE16AF9De4143A2d291Fe68C206Ba2e6276d")
		.then(() => {
			deployer.deploy(TokenA, 'TokenA', 'TKA', Custodian.address)
			.then(() => {
				deployer.deploy(TokenB, 'TokenB', 'TKB', Custodian.address);
			}).catch(error => console.log(error));
		})
		.catch(error => console.log(error));
};


