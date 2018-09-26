const web3 = require('web3');
const EPSILON = 1e-10;

module.exports = {
	isEqual: (a, b, log = false) => {
		if (log) {
			console.log(a);
			console.log(b);
		}
		if (Math.abs(Number(b)) > EPSILON && Math.abs(Number(b)) > EPSILON) {
			return Math.abs(Number(a) - Number(b)) / Number(b) <= EPSILON;
		} else {
			return Math.abs(Number(a) - Number(b)) <= EPSILON;
		}
	},
	fromWei: (bn) => web3.utils.fromWei(bn.valueOf(), 'ether'),
	toWei: (num) => web3.utils.toWei(num + '', 'ether'),
	toChecksumAddress: (addr) => web3.utils.toChecksumAddress(addr),
	VM_REVERT_MSG: 'Returned error: VM Exception while processing transaction: revert',
	VM_INVALID_OPCODE_MSG : 'Returned error: VM Exception while processing transaction: invalid opcode'
};
