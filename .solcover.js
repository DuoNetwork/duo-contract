module.exports = {
	norpc: true,
	skipFiles: ['mocks/BeethovenMock.sol', 'mocks/CustodianMock.sol', 'mocks/DUOMock.sol', 'mocks/EsplanadeMock.sol', 'mocks/MagiMock.sol', 'mocks/WETHMock.sol'],
	compileCommand: '..\\node_modules\\.bin\\truffle.cmd compile --network coverage',
	testCommand: '..\\node_modules\\.bin\\truffle.cmd test --network coverage'
};
