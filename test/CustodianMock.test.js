let CustodianMock = artifacts.require('./CustodianMock.sol');

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWRD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_POST_RESET = '4';

contract('CustodianMock', () => {
	it('should be deployed', () => {
		return CustodianMock.deployed()
			.then(instance => instance.state.call())
			.then(state => assert.isTrue(state.valueOf() === STATE_TRADING));
	});

	it('priceFeedTolInBP should equal 100', () => {
		return CustodianMock.deployed()
			.then(instance => instance.GETpriceFeedTolInBP.call())
			.then(priceFeedTolInBP => assert.equal(priceFeedTolInBP.valueOf(), 100, "priceFeedTolInBP not equal to 100"));
	});
});