const NamVoting = artifacts.require("NamVoting");

// SC-1: the deployer (accounts[0]) is the admin. The server's registrar and
// relayer accounts come from .env, or Ganache accounts[1] and [2].
module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(NamVoting);
  const voting = await NamVoting.deployed();
  const registrar = process.env.REGISTRAR_ADDRESS || accounts[1];
  const relayer = process.env.RELAYER_ADDRESS || accounts[2];
  await voting.grantRole(await voting.REGISTRAR_ROLE(), registrar);
  await voting.grantRole(await voting.RELAYER_ROLE(), relayer);
};
