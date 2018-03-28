let Custodian = artifacts.require('./CustodianMock.sol');

const STATE_TRADING = '0';
const STATE_PRE_RESET = '1';
const STATE_UPWARD_RESET = '2';
const STATE_DOWNWARD_RESET = '3';
const STATE_POST_RESET = '4';

contract('Custodian', () => {

	describe('constructor', () => {
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

	describe('creation', () => {
		it('should only allow duo member to create', () => {
			return assert.isTrue(false);
		});

		it('should collect fee', () => {
			return assert.isTrue(false);
		});

		it('should update user list if required', () => {
			return assert.isTrue(false);
		});

		it('should update A and B balance correctly', () => {
			return assert.isTrue(false);
		});
	});

	describe('redemption', () => {
		it('should only allow duo member to redeem', () => {
			return assert.isTrue(false);
		});

		it('should collect fee', () => {
			return assert.isTrue(false);
		});

		it('should update user list if required', () => {
			return assert.isTrue(false);
		});

		it('should update A and B balance correctly', () => {
			return assert.isTrue(false);
		});

		it('should update pending withdraw amount correctly', () => {
			return assert.isTrue(false);
		});

		it('should allow user to withdraw ETH', () => {
			return assert.isTrue(false);
		});
	});

	describe('only admin', () => {
		it('should be able to set fee address', () => {
			return assert.isTrue(false);
		});

		it('should be able to set commission', () => {
			return assert.isTrue(false);
		});

		it('should be able to set member threshold', () => {
			return assert.isTrue(false);
		});

		it('should be able to set iteration gas threshold', () => {
			return assert.isTrue(false);
		});

		it('should be able to set pre reset waiting blocks', () => {
			return assert.isTrue(false);
		});

		it('should be able to set post reset waiting blocks', () => {
			return assert.isTrue(false);
		});

		it('should be able to set price tolerance', () => {
			return assert.isTrue(false);
		});

		it('should be able to set price feed time tolerance', () => {
			return assert.isTrue(false);
		});

		it('should be able to set price update cool down', () => {
			return assert.isTrue(false);
		});	
	});

	describe('A', () => {
		it('should be able to transfer', () => {
			return assert.isTrue(false);
		});

		it('should be able to approve', () => {
			return assert.isTrue(false);
		});

		it('should be able to transfer from address', () => {
			return assert.isTrue(false);
		});
	});
	
	describe('B', () => {
		it('should be able to transfer', () => {
			return assert.isTrue(false);
		});

		it('should be able to approve', () => {
			return assert.isTrue(false);
		});

		it('should be able to transfer from address', () => {
			return assert.isTrue(false);
		});
	});

	describe('commit price', () => {
		it('should only allow price commit from given address', () => {
			return assert.isTrue(false);
		});

		it('should accept first price arrived if it is not too far away', () => {
			return assert.isTrue(false);
		});

		it('should not accept first price arrived if it is too far away', () => {
			return assert.isTrue(false);
		});

		it('should reject price from the same sender within cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept first price arrived if second price timed out and within cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept first price arrived if second price is close to it and within cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept second price arrived if it is from the same sender and is after cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept first price arrived if second price is from a different sender and is after cool down', () => {
			return assert.isTrue(false);
		});

		it('should wait for third price if first and second do not agree', () => {
			return assert.isTrue(false);
		});

		it('should reject price from first or second sender within cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept first price arrived if third price timed out and within cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept medium price if third price does not time out', () => {
			return assert.isTrue(false);
		});

		it('should accept third price arrived if it is from first or second sender and is after cool down', () => {
			return assert.isTrue(false);
		});

		it('should accept second price arrived if third price is from a different sender and is after cool down', () => {
			return assert.isTrue(false);
		});

		it('should update NAV for A and B after pric eis accepted', () => {
			return assert.isTrue(false);
		});

		it('should not allow price commit during cool down period', () => {
			return assert.isTrue(false);
		});

		it('should transit to reset state based on price accepted', () => {
			return assert.isTrue(false);
		});
	});

	describe('pre reset', () => {
		it('should not allow price commit', () => {
			return assert.isTrue(false);
		});

		it('should not allow creation or redemption', () => {
			return assert.isTrue(false);
		});

		it('should not allow any transfer or approve of A or B', () => {
			return assert.isTrue(false);
		});

		it('should not allow any admin activity', () => {
			return assert.isTrue(false);
		});

		it('should transit to reset state after a given number of blocks but not before that', () => {
			return assert.isTrue(false);
		});
	});

	describe('upward reset', () => {
		it('should reset accounts based on remaining gas', () => {
			return assert.isTrue(false);
		});

		it('should move to post reset state after every account is reset', () => {
			return assert.isTrue(false);
		});
	});

	describe('downward reset', () => {
		it('should reset accounts based on remaining gas', () => {
			return assert.isTrue(false);
		});

		it('should move to post reset state after every account is reset', () => {
			return assert.isTrue(false);
		});
	});

	describe('post reset', () => {
		it('should not allow price commit', () => {
			return assert.isTrue(false);
		});

		it('should not allow creation or redemption', () => {
			return assert.isTrue(false);
		});

		it('should not allow any transfer or approve of A or B', () => {
			return assert.isTrue(false);
		});

		it('should not allow any admin activity', () => {
			return assert.isTrue(false);
		});

		it('should transit to trading state after a given number of blocks but not before that', () => {
			return assert.isTrue(false);
		});
	});	

});