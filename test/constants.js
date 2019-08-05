module.exports = {
	WEI_DENOMINATOR : 1e18,
	BP_DENOMINATOR : 10000,
	VM_REVERT_MSG: {
		canStakeNotSet: 'Returned error: VM Exception while processing transaction: revert staking is not enabled -- Reason given: staking is not enabled.',
		notWhiteListOracle: 'Returned error: VM Exception while processing transaction: revert not whitelist oracle -- Reason given: not whitelist oracle.',
		stakeLessThanMinAmt: 'Returned error: VM Exception while processing transaction: revert staking amt less than min amt required -- Reason given: staking amt less than min amt required.',
		revert: 'Returned error: VM Exception while processing transaction: revert',
		exceedingMaxStakeAmt: 'Returned error: VM Exception while processing transaction: revert exceeding the maximum amt allowed -- Reason given: exceeding the maximum amt allowed.',
		notEnoughAllowanceOrBalance: 'Returned error: VM Exception while processing transaction: revert exceeding the maximum amt allowed -- Reason given: not enough allowance or balance',
		canUnstakeNotSet: "Returned error: VM Exception while processing transaction: revert canUnstake is not set -- Reason given: canUnstake is not set.",
		stakingPeriodPassed : "Returned error: VM Exception while processing transaction: revert exceeding the maximum amt allowed -- Reason given: staking period not passed.",
		tokenTransferFailure : "Returned error: VM Exception while processing transaction: revert exceeding the maximum amt allowed -- Reason given: token transfer failure.",
		inputParasWrong : "Returned error: VM Exception while processing transaction: revert input parameters wrong -- Reason given: input parameters wrong.",
		stakingIsNotFrozen: "Returned error: VM Exception while processing transaction: revert staking is not frozen -- Reason given: staking is not frozen.",
		notEnoughBalanceCoveringAwards :"Returned error: VM Exception while processing transaction: revert not enough balance to give awards -- Reason given: not enough balance to give awards.",
		emptyQueue: 'Returned error: VM Exception while processing transaction: revert empty queue -- Reason given: empty queue.'
	},
	VM_INVALID_OPCODE_MSG:
		'Returned error: VM Exception while processing transaction: invalid opcode',
	DUAL_CUSTODIAN: {
		STATE_INDEX: {
			LAST_OPERATION_TIME: 0,
			OPERATION_COOLDOWN: 1,
			STATE: 2,
			MIN_BALANCE: 3,
			TOTAL_SUPPLYA: 4,
			TOTAL_SUPPLYB: 5,
			ETH_COLLATERAL_INWEI: 6,
			NAVA_INWEI: 7,
			NAVB_INWEI: 8,
			LAST_PRICE_INWEI: 9,
			LAST_PRICETIME_INSECOND: 10,
			RESET_PRICE_INWEI: 11,
			RESET_PRICETIME_INSECOND: 12,
			CREATE_COMMINBP: 13,
			REDEEM_COMMINBP: 14,
			PERIOD: 15,
			MATURITY_IN_SECOND: 16,
			PRERESET_WAITING_BLOCKS: 17,
			PRICE_FETCH_COOLDOWN: 18,
			NEXT_RESET_ADDR_INDEX: 19,
			TOTAL_USERS: 20,
			FEE_BALANCE_INWEI: 21,
			RESET_STATE: 22,
			ALPHA_INBP: 23,
			BETA_INWEI: 24,
			PERIOD_COUPON_INWEI: 25,
			LIMIT_PERIODIC_INWEI: 26,
			LIMIT_UPPER_INWEI: 27,
			LIMIT_LOWER_INWEI: 28,
			ITERATION_GAS_THRESHOLD: 29
		},
		EVENT: {
			EVENT_ACCEPT_PX: 'AcceptPrice',
			EVENT_MATURIED: 'Matured',
			EVENT_START_TRADING: 'StartTrading',
			EVENT_CREATE: 'Create',
			EVENT_REDEEM: 'Redeem',
			EVENT_TOTAL_SUPPLY: 'TotalSupply',
			EVENT_START_RESET: 'StartReset',
			EVENT_SET_VALUE: 'SetValue',
			EVENT_COLLECT_FEE: 'CollectFee'
		},
		STATE: {
			STATE_INCEPTION: '0',
			STATE_TRADING: '1',
			STATE_PRE_RESET: '2',
			STATE_RESET: '3',
			STATE_MATURITY: '4',

			STATE_UPWARD_RESET: '0',
			STATE_DOWNWARD_RESET: '1',
			STATE_PERIODIC_RESET: '2'
		},
		ADDRESS: {
			DUMMY_ADDR: '0xdE8BDd2072D736Fc377e00b8483f5959162DE317'
		}
	}
};
