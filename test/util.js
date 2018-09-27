const Web3 = require('web3');
const web3 = new Web3(
	new Web3.providers.HttpProvider('http://localhost:' + process.env.GANACHE_PORT)
);
const EPSILON = 1e-10;

module.exports = {
	isEqual: (a, b, log = false) => {
		if (log) {
			console.log(a);
			console.log(b);
		}
		if (Math.abs(Number(a)) > EPSILON && Math.abs(Number(b)) > EPSILON) {
			return Math.abs(Number(a) - Number(b)) / Number(b) <= EPSILON;
		} else {
			return Math.abs(Number(a) - Number(b)) <= EPSILON;
		}
	},
	fromWei: (bn) => web3.utils.fromWei(bn.valueOf(), 'ether'),
	toWei: (num) => web3.utils.toWei(num + '', 'ether'),
	toChecksumAddress: (addr) => web3.utils.toChecksumAddress(addr),
	checkAddressChecksum: (addr) => web3.utils.checkAddressChecksum(addr),
	getLastBlockTime: async () => {
		let blockNumber = await web3.eth.getBlockNumber();
		let block = await web3.eth.getBlock(blockNumber);
		return block.timestamp;
	},
	getBalance: (addr) => web3.eth.getBalance(addr),
	sendTransaction: (param) => web3.eth.sendTransaction(param),
	VM_REVERT_MSG: 'Returned error: VM Exception while processing transaction: revert',
	VM_INVALID_OPCODE_MSG : 'Returned error: VM Exception while processing transaction: invalid opcode'
};
