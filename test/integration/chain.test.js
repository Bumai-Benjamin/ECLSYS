// INT-2 and ANON against a real Ganache: needs Ganache on GANACHE_RPC with
// `npm run migrate` done (for Semaphore). Skips itself when Ganache is not
// reachable. Each run deploys its own NamVoting, with fresh registrar and
// relayer accounts funded from Ganache's first account, so it never touches
// the migrated election or its phase.
var fs = require('fs');
var os = require('os');
var path = require('path');
var expect = require('chai').expect;
var Web3 = require('web3').Web3;
var semaphore = require('@semaphore-protocol/core');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

var RPC = process.env.GANACHE_RPC || 'http://127.0.0.1:7545';
var BUILD = path.join(__dirname, '..', '..', 'build', 'contracts');
var ZK = path.join(__dirname, '..', '..', 'src', 'zk');

async function ganacheUp() {
  try {
    var res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'net_version', params: [] }),
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch (err) {
    return false;
  }
}

function freshAddress() {
  return new Web3().eth.accounts.create().address;
}

function artifact(name) {
  return JSON.parse(fs.readFileSync(path.join(BUILD, name + '.json'), 'utf8'));
}

describe('INT-2 and ANON: lib/chain against Ganache', function () {
  this.timeout(120000);
  var web3;
  var admin;
  var voting;
  var registrar;
  var relayer;
  var artifactFile;
  var chain;

  before(async function () {
    if (!(await ganacheUp())) {
      console.log('    (skipped: Ganache is not reachable on ' + RPC + ')');
      this.skip();
    }
    web3 = new Web3(RPC);
    admin = (await web3.eth.getAccounts())[0];
    var networkId = String(await web3.eth.net.getId());
    var sem = artifact('Semaphore').networks[networkId];
    if (!sem) throw new Error('Semaphore is not deployed on this chain: run npm run migrate');

    var nv = artifact('NamVoting');
    voting = await new web3.eth.Contract(nv.abi).deploy({ data: nv.bytecode, arguments: [sem.address] })
      .send({ from: admin, gas: 5000000 });
    registrar = web3.eth.accounts.create();
    relayer = web3.eth.accounts.create();
    for (var acct of [registrar, relayer]) {
      await web3.eth.sendTransaction({ from: admin, to: acct.address, value: web3.utils.toWei('1', 'ether') });
    }
    await voting.methods.grantRole(await voting.methods.REGISTRAR_ROLE().call(), registrar.address).send({ from: admin });
    await voting.methods.grantRole(await voting.methods.RELAYER_ROLE().call(), relayer.address).send({ from: admin });

    var networks = {};
    networks[networkId] = { address: voting.options.address };
    artifactFile = path.join(os.tmpdir(), 'namvoting-int-' + process.pid + '.json');
    fs.writeFileSync(artifactFile, JSON.stringify({ abi: nv.abi, networks: networks }));
    chain = require('../../lib/chain').create({
      rpcUrl: RPC, artifactFile: artifactFile, registrarKey: registrar.privateKey, relayerKey: relayer.privateKey
    });
  });

  after(function () {
    if (artifactFile) try { fs.unlinkSync(artifactFile); } catch (e) { /* gone */ }
  });

  var voters = [1, 2].map(function (n) {
    return { address: freshAddress(), identity: new semaphore.Identity('int-test-' + Date.now() + '-' + n) };
  });

  it('registers a fresh address with its voting key and reads it back', async function () {
    var v = voters[0];
    expect(await chain.isRegistered(v.address)).to.equal(false);
    var res = await chain.registerVoter(v.address, v.identity.commitment.toString());
    expect(res.txHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(await chain.isRegistered(v.address)).to.equal(true);
  });

  it('treats an address that is already registered as success', async function () {
    expect(await chain.registerVoter(voters[0].address, voters[1].identity.commitment.toString()))
      .to.deep.equal({ txHash: null, alreadyRegistered: true });
  });

  it('lists VoterRegistered in the audit events', async function () {
    await chain.registerVoter(voters[1].address, voters[1].identity.commitment.toString());
    var audit = await chain.audit();
    expect(audit.contractAddress.toLowerCase()).to.equal(voting.options.address.toLowerCase());
    var registered = audit.events.filter(function (e) { return e.event === 'VoterRegistered'; });
    expect(registered).to.have.length(2);
  });

  it('relays a real proof: the vote counts, and no voter wallet is in the transaction', async function () {
    await voting.methods.addContestant('Alice', 'Party A', 45, 'MSc').send({ from: admin, gas: 300000 });
    await voting.methods.changeState(1).send({ from: admin });
    var members = (await voting.methods.members().call()).map(String);
    var scope = String(await voting.methods.electionId().call());
    var p = await semaphore.generateProof(voters[0].identity, new semaphore.Group(members), '1', scope, 16,
      { wasm: path.join(ZK, 'semaphore-16.wasm'), zkey: path.join(ZK, 'semaphore-16.zkey') });
    var proof = {
      merkleTreeDepth: String(p.merkleTreeDepth), merkleTreeRoot: String(p.merkleTreeRoot),
      nullifier: String(p.nullifier), message: String(p.message), scope: String(p.scope), points: p.points.map(String)
    };

    var receipt = await chain.castVote(proof);
    expect(receipt.nullifier).to.equal(proof.nullifier);
    var tx = await web3.eth.getTransaction(receipt.txHash);
    expect(tx.from.toLowerCase()).to.equal(relayer.address.toLowerCase());
    var raw = JSON.stringify(tx, function (k, v) { return typeof v === 'bigint' ? String(v) : v; }).toLowerCase();
    voters.forEach(function (v) { expect(raw).to.not.contain(v.address.slice(2).toLowerCase()); });

    var cast = (await chain.audit()).events.filter(function (e) { return e.event === 'VoteCast'; });
    expect(cast).to.have.length(1);
    expect(cast[0].args).to.deep.equal({ contestantId: 1, nullifier: proof.nullifier });

    var again;
    try { await chain.castVote(proof); } catch (err) { again = err; }
    expect(again && again.code).to.equal('already_voted');
  });
});
