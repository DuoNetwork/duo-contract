var Migrations = artifacts.require('./Migrations.sol');

module.exports = function(deployer, network, accounts) {

	switch (network){
		case "kovan": 
			deployer.deploy(Migrations, {from: accounts[3]});
			break;
		case "live":
			deployer.deploy(Migrations, {from: accounts[0]});
			break;
		default:
			deployer.deploy(Migrations, {from: accounts[0]});
			break;
	}	
};
