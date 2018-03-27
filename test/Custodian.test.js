let Custodian = artifacts.require('./CustodianMock.sol');

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

	it('priceFeedTolInBP should equal 100', () => {
		return Custodian.deployed()
			.then(instance => instance.getPriceFeedTolInBP.call())
			.then(priceFeedTolInBP => assert.equal(priceFeedTolInBP.valueOf(), 100, "priceFeedTolInBP not equal to 100"));
	});
});