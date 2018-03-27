let Custodian = artifacts.require('./Custodian.sol');

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWRD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_POST_RESET = '4';

contract('Custodian', () => {
	it('should be deployed', () => {
		return Custodian.deployed()
			.then(instance => instance.state.call())
			.then(state => assert.isTrue(state.valueOf() === STATE_TRADING));
	});
});
