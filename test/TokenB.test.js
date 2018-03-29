const TokenB = artifacts.require('./TokenB.sol');
const DUO = artifacts.require('./DUO.sol');
const Custodian = artifacts.require('./Custodian.sol');
const web3 = require('web3');

const InitParas = require('../migrations/contractInitParas.json');
const CustodianInit = InitParas['Custodian'];
const DuoInit = InitParas['DUO'];
const TokenBInit = InitParas['TokenB'];

contract('TokenB', accounts => {
	let tokenBContract;
	let duoContract;
	let custodianContract;

	const creator = accounts[0];
	const alice = accounts[1];
	const bob = accounts[2];
	const pf1 = accounts[3];
	const pf2 = accounts[4];
	const pf3 = accounts[5];
	const feeCollector = accounts[6];

	const WEI_DENOMINATOR = 1e18;

	before(() =>
		DUO.new(web3.utils.toWei(DuoInit.initSupply), DuoInit.tokenName, DuoInit.tokenSymbol, {
			from: creator
		})
			.then(instance => (duoContract = instance))
			.then(() =>
				Custodian.new(
					web3.utils.toWei(CustodianInit.ethInitPrice),
					feeCollector,
					duoContract.address,
					pf1,
					pf2,
					pf3,
					CustodianInit.alphaInBP,
					web3.utils.toWei(CustodianInit.couponRate),
					web3.utils.toWei(CustodianInit.hp),
					web3.utils.toWei(CustodianInit.hu),
					web3.utils.toWei(CustodianInit.hd),
					CustodianInit.commissionRateInBP,
					CustodianInit.period,
					CustodianInit.memberThreshold,
					CustodianInit.gasThreshhold,
					{
						from: creator
					}
				).then(instance => {
					custodianContract = instance;
					return custodianContract.create({ from: creator, value: 1 * WEI_DENOMINATOR });
				})
			)
			.then(() =>
				TokenB.new(
					TokenBInit.tokenName,
					TokenBInit.tokenSymbol,
					custodianContract.address
				).then(instance => (tokenBContract = instance))
			)
	);

	it('total supply should be 0', () => {
		return tokenBContract.totalSupply
			.call()
			.then(totalSupply =>
				assert.equal(totalSupply.valueOf(), 0, 'totalSupply not equal to 0')
			);
	});

	it('should show balance', () => {
		return tokenBContract.balanceOf.call(creator).then(balance => {
			return assert.isTrue(
				balance.toNumber() > 0,
				'balance of creator not equal to created amount'
			);
		});
	});

	it('should be able to approve', () => {
		return tokenBContract
			.approve(alice, web3.utils.toWei('100'), { from: creator })
			.then(success => {
				assert.isTrue(!!success, 'Not able to approve');
			});
	});

	it('should show allowance', () => {
		return tokenBContract.allowance.call(creator, alice).then(allowance => {
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				100,
				'allowance of alice not equal to 100'
			);
		});
	});

	it('creator should be able to transfer to bob', () => {
		return tokenBContract
			.transfer(bob, web3.utils.toWei('10'), { from: creator })
			.then(transfer => {
				assert.isTrue(!!transfer, 'Not able to approve');
			});
	});

	it('should show balance of bob', () => {
		return tokenBContract.balanceOf
			.call(bob)
			.then(balance =>
				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					10,
					'balance of bob not equal to 10'
				)
			);
	});

	it('alice cannot transfer 200 from creator to bob', () => {
		return tokenBContract
			.transferFrom(creator, bob, web3.utils.toWei('200'), { from: alice })
			.then(() => assert.isTrue(false, 'can transfer of more than balance'))
			.catch(err =>
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				)
			);
	});

	it('alice should transfer 50 from creator to bob', () => {
		return tokenBContract
			.transferFrom(creator, bob, web3.utils.toWei('50'), { from: alice })
			.then(transferFrom => {
				assert.isTrue(!!transferFrom, 'Not able to transferFrom');
			});
	});

	it('allowance for alice should be 50', () => {
		return tokenBContract.allowance.call(creator, alice).then(allowance => {
			assert.equal(
				allowance.toNumber() / WEI_DENOMINATOR,
				50,
				'allowance of alice not equal to 50'
			);
		});
	});

	it('check balance of bob equal 60', () => {
		return tokenBContract.balanceOf
			.call(bob)
			.then(balance =>
				assert.equal(
					balance.toNumber() / WEI_DENOMINATOR,
					60,
					'balance of bob not equal to 60'
				)
			);
	});

	it('should not transfer more than balance', () => {
		return tokenBContract
			.transfer(bob, web3.utils.toWei('10000000000000000000000'), { from: creator })
			.then(() => assert.isTrue(false, 'can transfer of more than balance'))
			.catch(err =>
				assert.equal(
					err.message,
					'VM Exception while processing transaction: revert',
					'transaction not reverted'
				)
			);
	});
});
