const Web3 = require('web3');
// const provider = 'https://mainnet.infura.io/Ky03pelFIxoZdAUsr82w';
const provider = 'https://kovan.infura.io/WSDscoNUvMiL1M7TvMNP ';
const web3 = new Web3(new Web3.providers.HttpProvider(provider));

const CustodianABI = require('./ABI/custodian.json'); //Custodian Contract ABI
const addressCustodianContract = '';

const custodianContract = new web3.eth.Contract(CustodianABI, addressCustodianContract);


let priceFeedInterval = 3600000; //60*60*1000 ; 1 Hour
setInterval(() => {
	let priceInWei;  //ETH/USD price in Wei
	let priceInSeconds; //seconds since unix epoch

	custodianContract.methods
	.commitPrice(priceInWei, priceInSeconds)
	.call()
	.then(success => {
		console.log(success);
	})
	.catch(error => rej(error));
}, priceFeedInterval);


