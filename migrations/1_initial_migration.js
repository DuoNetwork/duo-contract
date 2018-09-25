var Migrations = artifacts.require('./Migrations.sol');

module.exports = function(deployer, network, accounts) {

	switch (network){
		case "kovan": 
			deployer.deploy(Migrations, {from: "0x00D8d0660b243452fC2f996A892D3083A903576F"});
			break;
		case "ropsten":
			deployer.deploy(Migrations, {from: "0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E"});
			break;
		case "live":
			deployer.deploy(Migrations, {from: accounts[0]});
			break;
		case "coverage":
			deployer.deploy(Migrations, {from: accounts[0]});
			break;
		default:
			deployer.deploy(Migrations, {from: accounts[0]});
			break;
	}	
};
