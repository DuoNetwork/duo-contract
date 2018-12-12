const fs = require('fs');
const moment = require('moment');
const path = './deployHistory.json';

const deployHistory = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log(deployHistory);

module.exports = {
	saveGeneralContractInfo: async (contractName, address, paras) => {
		if (!deployHistory[contractName]) deployHistory[contractName] = {};

		deployHistory[contractName].address = address;
		deployHistory[contractName].paras = paras;
		deployHistory[contractName].deployedAt = moment.utc().format('YYYY-MM-DD HH:mm:SS');
		fs.writeFileSync('./migrations/deployHistory.json', JSON.stringify(deployHistory), 'utf8');
	},
	saveDualCustodianInfo: async (type, tenor, address, paras) => {
		if (!deployHistory[type]) deployHistory[type] = {};
		if (!deployHistory[type][tenor]) deployHistory[type][tenor] = {};

		deployHistory[type][tenor].address = address;
		deployHistory[type][tenor].paras = paras;
		deployHistory[type][tenor].deployedAt = moment.utc().format('YYYY-MM-DD HH:mm:SS');
		fs.writeFileSync('./migrations/deployHistory.json', JSON.stringify(deployHistory), 'utf8');

	}
};
