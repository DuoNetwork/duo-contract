let Custodian = artifacts.require('../contracts/Custodian.sol');

contract('Custodian', () => {
	it('should be deployed', () => {
		return Custodian.deployed().then((instance) => assert.isTrue(!!instance));
	});
});