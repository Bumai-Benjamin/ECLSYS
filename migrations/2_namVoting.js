const PoseidonT3 = artifacts.require("PoseidonT3");
const SemaphoreVerifier = artifacts.require("SemaphoreVerifier");
const Semaphore = artifacts.require("Semaphore");
const NamVoting = artifacts.require("NamVoting");

// SC-1: the deployer (accounts[0]) is the admin. The server's registrar and
// relayer accounts come from .env, or Ganache accounts[1] and [2].
// ANON-0: Semaphore (with its Poseidon library and proof verifier) goes first;
// NamVoting creates its voter group there. The verifier needs a block gas
// limit of about 30,000,000 (Ganache workspace settings).
module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(PoseidonT3);
  await deployer.link(PoseidonT3, Semaphore);
  await deployer.deploy(SemaphoreVerifier);
  await deployer.deploy(Semaphore, SemaphoreVerifier.address);
  await deployer.deploy(NamVoting, Semaphore.address);
  const voting = await NamVoting.deployed();
  const registrar = process.env.REGISTRAR_ADDRESS || accounts[1];
  const relayer = process.env.RELAYER_ADDRESS || accounts[2];
  await voting.grantRole(await voting.REGISTRAR_ROLE(), registrar);
  await voting.grantRole(await voting.RELAYER_ROLE(), relayer);
};
