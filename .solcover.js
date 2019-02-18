module.exports = {
	norpc: true,
	skipFiles: ['mocks/BeethovenMock.sol', 'mocks/CustodianMock.sol', 'mocks/CustodianTokenMock.sol', 'mocks/DualClassCustodianMock.sol', 'mocks/DUOMock.sol', 'mocks/Erc20CustodianMock.sol', 'mocks/EsplanadeMock.sol', 'mocks/MagiMock.sol', 'mocks/MozartMock', 'mocks/OptionCustodianMock', 'mocks/WETHMock.sol'],
	compileCommand: 'truffle compile --network coverage',
	testCommand: 'truffle test --network coverage'
};
