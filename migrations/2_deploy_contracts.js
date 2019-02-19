const web3 = require('web3');
const SafeMath = artifacts.require('./SafeMath.sol');
const Beethoven = artifacts.require('./Beethoven.sol');
const Vivaldi = artifacts.require('./Vivaldi.sol');
const Mozart = artifacts.require('./Mozart.sol');
const Magi = artifacts.require('./Magi.sol');
const Esplanade = artifacts.require('./Esplanade.sol');
const DUO = artifacts.require('./DUO.sol');
const CustodianToken = artifacts.require('./CustodianToken.sol');
const InitParas = require('./contractInitParas.json');
const DuoInit = InitParas['DUO'];
const MagiInit = InitParas['Magi'];
const Erc20CustodianInit = InitParas['Erc20Custodian'];
const OptionCustodianInit = InitParas['OptionCustodian'];
const RoleManagerInit = InitParas['RoleManager'];
const deployInfoSaver = require('./deployInfoSaver');

module.exports = async (deployer, network, accounts) => {
	let creator;
	let pf1, pf2, pf3;
	let fc;

	if (network == 'kovan') {
		creator = '0x00D8d0660b243452fC2f996A892D3083A903576F';
		pf1 = '0x0022BFd6AFaD3408A1714fa8F9371ad5Ce8A0F1a';
		pf2 = '0x002002812b42601Ae5026344F0395E68527bb0F8';
		pf3 = '0x00476E55e02673B0E4D2B474071014D5a366Ed4E';
		fc = '0x003519A4aB2C35c59Cb31d9194A45DD3F9Bf9e32';
	} else if (network == 'ropsten') {
		creator = '0x00dCB44e6EC9011fE3A52fD0160b59b48a11564E';
		pf1 = '0x00f125c2C1b08c2516e7A7B789d617ad93Fdf4C0';
		pf2 = '0x002cac65031CEbefE8233672C33bAE9E95c6dC1C';
		pf3 = '0x0076c03e1028F92f8391029f15096026bd3bdFd2';
		fc = '0x003519A4aB2C35c59Cb31d9194A45DD3F9Bf9e32';
	} else if (network == 'development' || network == 'coverage') {
		creator = accounts[0];
		pf1 = accounts[1];
		pf2 = accounts[2];
		pf3 = accounts[3];
		fc = accounts[4];
	}

	if (process.env.CONTRACT_TYPE === 'DUO') {
		await deployer.deploy(
			DUO,
			web3.utils.toWei(DuoInit.initSupply),
			DuoInit.tokenName,
			DuoInit.tokenSymbol,
			{
				from: creator
			}
		);
		await deployInfoSaver.saveGeneralContractInfo('DUO', DUO.address, DuoInit);
	} else if (process.env.CONTRACT_TYPE === 'BTV') {
		let BTV_INIT_PARAS = InitParas.BTV.PPT;
		if (process.env.TENOR) BTV_INIT_PARAS = InitParas.BTV[process.env.TENOR];
		// 74748
		await deployer.deploy(SafeMath, {
			from: creator
		});
		await deployer.link(SafeMath, Beethoven);
		await deployer.deploy(
			Beethoven,
			BTV_INIT_PARAS.name,
			BTV_INIT_PARAS.maturity,
			BTV_INIT_PARAS.esplanade,
			fc,
			BTV_INIT_PARAS.alphaInBP,
			web3.utils.toWei(BTV_INIT_PARAS.couponRate),
			web3.utils.toWei(BTV_INIT_PARAS.hp), // 1.013 for perpetual 0 for Term
			web3.utils.toWei(BTV_INIT_PARAS.hu),
			web3.utils.toWei(BTV_INIT_PARAS.hd),
			BTV_INIT_PARAS.comm,
			BTV_INIT_PARAS.pd,
			BTV_INIT_PARAS.optCoolDown,
			BTV_INIT_PARAS.pxFetchCoolDown,
			BTV_INIT_PARAS.iteGasTh,
			BTV_INIT_PARAS.preResetWaitBlk,
			web3.utils.toWei(BTV_INIT_PARAS.minimumBalance + ''),
			{ from: creator }
		);
		// // 1094050
		await deployer.deploy(
			CustodianToken,
			BTV_INIT_PARAS.TokenA.tokenName,
			BTV_INIT_PARAS.TokenA.tokenSymbol,
			Beethoven.address,
			0,
			{
				from: creator
			}
		);
		BTV_INIT_PARAS.TokenA.address;
		// 1094370
		await deployer.deploy(
			CustodianToken,
			BTV_INIT_PARAS.TokenB.tokenName,
			BTV_INIT_PARAS.TokenB.tokenSymbol,
			Beethoven.address,
			1,
			{ from: creator }
		);
		BTV_INIT_PARAS.TokenB.address;

		await deployInfoSaver.saveDualCustodianInfo(
			'BTV',
			process.env.TENOR,
			Beethoven.address,
			BTV_INIT_PARAS
		);
	} else if (process.env.CONTRACT_TYPE === 'MZT') {
		let MOZART_INIT_PARAS = InitParas.MOZART.PPT;
		if (process.env.TENOR) MOZART_INIT_PARAS = InitParas.MOZART[process.env.TENOR];

		// 74748
		await deployer.deploy(SafeMath, {
			from: creator
		});
		await deployer.link(SafeMath, Mozart);
		await deployer.deploy(
			Mozart,
			MOZART_INIT_PARAS.name,
			MOZART_INIT_PARAS.maturity,
			MOZART_INIT_PARAS.esplanade,
			fc,
			MOZART_INIT_PARAS.alphaInBP,
			web3.utils.toWei(MOZART_INIT_PARAS.hu + ''),
			web3.utils.toWei(MOZART_INIT_PARAS.hd + ''),
			MOZART_INIT_PARAS.comm,
			MOZART_INIT_PARAS.pd,
			MOZART_INIT_PARAS.optCoolDown,
			MOZART_INIT_PARAS.pxFetchCoolDown,
			MOZART_INIT_PARAS.iteGasTh,
			MOZART_INIT_PARAS.preResetWaitBlk,
			web3.utils.toWei(MOZART_INIT_PARAS.minimumBalance + ''),
			{ from: creator }
		);
		// // 1094050
		await deployer.deploy(
			CustodianToken,
			MOZART_INIT_PARAS.TokenA.tokenName,
			MOZART_INIT_PARAS.TokenA.tokenSymbol,
			Mozart.address,
			0,
			{
				from: creator
			}
		);
		MOZART_INIT_PARAS.TokenA.address = CustodianToken.address;
		// 1094370
		await deployer.deploy(
			CustodianToken,
			MOZART_INIT_PARAS.TokenB.tokenName,
			MOZART_INIT_PARAS.TokenB.tokenSymbol,
			Mozart.address,
			1,
			{ from: creator }
		);
		MOZART_INIT_PARAS.TokenB.address = CustodianToken.address;

		await deployInfoSaver.saveDualCustodianInfo(
			'MZT',
			process.env.TENOR,
			Mozart.address,
			MOZART_INIT_PARAS
		);
	} else if (process.env.CONTRACT_TYPE === 'ESP') {
		// 4700965
		await deployer.deploy(Esplanade, RoleManagerInit.optCoolDown, {
			from: creator
		});
		await deployInfoSaver.saveGeneralContractInfo('ESP', Esplanade.address, RoleManagerInit);
	} else if (process.env.CONTRACT_TYPE === 'MAGI') {
		await deployer.deploy(
			Magi,
			creator,
			pf1,
			pf2,
			pf3,
			Esplanade.address,
			MagiInit.pxFetchCoolDown,
			MagiInit.optCoolDown,
			{
				from: creator
			}
		);
		MagiInit.esplanadeAddr = Esplanade.address;
		await deployInfoSaver.saveGeneralContractInfo('MAGI', Magi.address, MagiInit);
	} else if (process.env.CONTRACT_TYPE === 'VVD') {
		let VVD_INIT_PARAS = InitParas.Vivaldi.PPT;
		if (process.env.TENOR) VVD_INIT_PARAS = InitParas.Vivaldi[process.env.TENOR];
		// 74748
		await deployer.deploy(SafeMath, {
			from: creator
		});
		await deployer.link(SafeMath, Vivaldi);

		//6202415
		await deployer.deploy(
			Vivaldi,
			VVD_INIT_PARAS.name,
			VVD_INIT_PARAS.collateralTokenAddress,
			VVD_INIT_PARAS.maturity,
			VVD_INIT_PARAS.roleManagerContractAddress,
			fc,
			Erc20CustodianInit.comm,
			OptionCustodianInit.redeemComm,
			OptionCustodianInit.clearComm,
			VVD_INIT_PARAS.pd,
			Erc20CustodianInit.optCoolDown,
			Erc20CustodianInit.pxFetchCoolDown,
			Erc20CustodianInit.preResetWaitBlk,
			web3.utils.toWei(Erc20CustodianInit.minimumBalance + ''),
			VVD_INIT_PARAS.iteGasTh,
			{ from: creator }
		);
		// 1298519
		await deployer.deploy(
			CustodianToken,
			VVD_INIT_PARAS.inToken.tokenName,
			VVD_INIT_PARAS.inToken.tokenSymbol,
			Vivaldi.address,
			0,
			{
				from: creator
			}
		);
		// 1318383
		await deployer.deploy(
			CustodianToken,
			VVD_INIT_PARAS.outToken.tokenName,
			VVD_INIT_PARAS.outToken.tokenSymbol,
			Vivaldi.address,
			1,
			{ from: creator }
		);

		await deployInfoSaver.saveDualCustodianInfo(
			'VVD',
			process.env.TENOR,
			Vivaldi.address,
			VVD_INIT_PARAS
		);
	}
	
	else {
		console.log('contract type does not exist');
	}
};
