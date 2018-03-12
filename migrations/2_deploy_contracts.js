var DUO = artifacts.require('./DUO.sol');
var TokenA = artifacts.require('./TokenA.sol');
var TokenB = artifacts.require('./TokenB.sol');
module.exports = function(deployer, network, accounts) {
	deployer.deploy(DUO).then(function() {
		return deployer.deploy(TokenA,"TokenA","TKA", DUO.address);
	});
	//   ;
	//   deployer.deploy(TokenB);
};
