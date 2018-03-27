module.exports = {
	migrations_directory: './migrations',
	networks: {
		test: {
			host: 'localhost',
			port: 8545,
			network_id: '*' // Match any network id,
			// gas:5000000
		},
		kovan: {
			host: 'localhost',
			port: 8545,
			network_id: '*' // Match any network id,
			// gas:5000000
		},
		live: {
			host: 'localhost',
			port: 8545,
			network_id: '*' // Match any network id,
			// gas:5000000
		}
	}
};
