const WETH = artifacts.require('./WETH.sol');

module.exports = async (deployer) => {

	await deployer.deploy(WETH);
	
};
