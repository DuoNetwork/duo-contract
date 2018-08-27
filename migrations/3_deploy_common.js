const Magi = artifacts.require('./oracles/Magi.sol');
const Pool = artifacts.require('./Pool.sol');
const InitParas = require('./contractInitParas.json');
const MagiInit = InitParas['Magi'];
const PoolInit = InitParas['Pool'];


module.exports = async (deployer, network, accounts) => {
	let creator, pf1, pf2, pf3;

	if (network == 'kovan') {
		creator = '0x00D8d0660b243452fC2f996A892D3083A903576F';
		pf1 = '0x0022BFd6AFaD3408A1714fa8F9371ad5Ce8A0F1a';
		// pf2 = accounts[1];
		pf2 = '0x002002812b42601Ae5026344F0395E68527bb0F8';
		// pf3 = accounts[2];
		pf3 = '0x00476E55e02673B0E4D2B474071014D5a366Ed4E';
	}
	if (network == 'ropsten') {
		// creator = accounts[3];
		creator = '0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E';
		pf1 = '0x00f125c2C1b08c2516e7A7B789d617ad93Fdf4C0';
		// pf2 = accounts[1];
		pf2 = '0x002cac65031CEbefE8233672C33bAE9E95c6dC1C';
		// pf3 = accounts[2];
		pf3 = '0x0076c03e1028F92f8391029f15096026bd3bdFd2';
	}
	if (network == 'development') {
		creator = accounts[0];
		pf1 = accounts[1];
		pf2 = accounts[2];
		pf3 = accounts[3];
	}



	await deployer.deploy(Pool, PoolInit.optCoolDown, {
		from: creator
	});
	await deployer.deploy(Magi, creator, pf1, pf2, pf3, MagiInit.pxCoolDown, MagiInit.optCoolDown, {
		from: creator
	});
};
