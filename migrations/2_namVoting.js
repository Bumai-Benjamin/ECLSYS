const NamVoting = artifacts.require("NamVoting");

module.exports = function (deployer) {
  deployer.deploy(NamVoting);
};