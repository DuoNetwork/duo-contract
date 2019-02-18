module.exports = {
	norpc: true,
	skipFiles: [
		'interfaces/ICustodian.sol',
		'interfaces/ICustodianToken.sol',
		'interfaces/IERC20.sol',
		'interfaces/IMultiSigManager.sol',
		'interfaces/IOracle.sol',
		'interfaces/IWETH.sol',
		'mocks/BeethovenMock.sol',
		'mocks/CustodianMock.sol',
		'mocks/CustodianTokenMock.sol',
		'mocks/DualClassCustodianMock.sol',
		'mocks/DUOMock.sol',
		'mocks/Erc20CustodianMock.sol',
		'mocks/EsplanadeMock.sol',
		'mocks/MagiMock.sol',
		'mocks/MozartMock',
		'mocks/OptionCustodianMock',
		'mocks/WETHMock.sol'
	],
	compileCommand: 'truffle compile --network coverage',
	testCommand: 'truffle test --network coverage'
};
