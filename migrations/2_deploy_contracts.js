var DUO = artifacts.require("./DUO.sol");
var TokenA = artifacts.require("./TokenA.sol");
var TokenB = artifacts.require("./TokenB.sol");
module.exports = function(deployer, network, accounts) {

  deployer.deploy(DUO);
  deployer.deploy(TokenA);
  deployer.deploy(TokenB);
};
