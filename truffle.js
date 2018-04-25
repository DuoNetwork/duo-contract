module.exports = {
	migrations_directory: './migrations',
	networks: {
		development: {
			host: 'localhost',
			port: 8545,
			network_id: '*', // Match any network id,
			gas: 6850000
		},
		kovan: {
			host: 'localhost',
			port: 8545,
			network_id: '*', // Match any network id,
			from: '0x00D8d0660b243452fC2f996A892D3083A903576F'
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
