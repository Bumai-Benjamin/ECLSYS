// INT-2: the server's view of the NamVoting contract (web3 4). The server signs
// registrations with the registrar key (REGISTRAR_ROLE, granted by the
// migration). Every method rejects with ChainUnavailableError when Ganache is
// unreachable or the contract isn't deployed on the chain it is running now.
var Web3 = require('web3').Web3;
var contractConfig = require('../config/contract');

var ChainUnavailableError = contractConfig.ChainUnavailableError;
var PHASES = 3;

// web3 returns uint values as BigInt; the pages and JSON need plain values.
function plain(value) {
  if (typeof value === 'bigint') return Number(value);
  return value;
}

function eventArgs(returnValues) {
  var args = {};
  Object.keys(returnValues || {}).forEach(function (key) {
    // web3 repeats every argument under its index ('0', '1', ...) and adds __length__
    if (/^\d+$/.test(key) || key === '__length__') return;
    args[key] = plain(returnValues[key]);
  });
  return args;
}

// Wraps an async function so calls run one at a time, in order. A failed call
// doesn't stop the ones queued behind it.
function serial(fn) {
  var tail = Promise.resolve();
  return function () {
    var args = arguments;
    var run = tail.then(function () { return fn.apply(null, args); });
    tail = run.catch(function () {});
    return run;
  };
}

function create(options) {
  options = options || {};
  var rpcUrl = options.rpcUrl || process.env.GANACHE_RPC || 'http://127.0.0.1:7545';
  var registrarKey = options.registrarKey !== undefined ? options.registrarKey : process.env.REGISTRAR_PRIVATE_KEY;
  var artifactFile = options.artifactFile;
  var web3 = new Web3(rpcUrl);
  var alreadyRegisteredSelector = web3.utils.sha3('AlreadyRegistered(address)').slice(0, 10);

  // Ganache may have been restarted with a fresh chain since the last call,
  // and a stale address would fail in confusing ways, so the deployment is
  // checked again after recheckMs. Calls in between share one check (and one
  // read of the build file), so the voter table costs one check per page, not
  // one per row. A failed check is never reused.
  var recheckMs = options.recheckMs !== undefined ? options.recheckMs : 2000;
  var checked = null;
  var checkedAt = 0;
  function connect() {
    if (!checked || Date.now() - checkedAt > recheckMs) {
      var attempt = checkDeployment();
      checked = attempt;
      checkedAt = Date.now();
      attempt.then(function () { checkedAt = Date.now(); }, function () {
        if (checked === attempt) checked = null;
      });
    }
    return checked;
  }

  async function checkDeployment() {
    var artifact = contractConfig.loadArtifact(artifactFile);
    var networkId;
    var code;
    try {
      networkId = await web3.eth.net.getId();
    } catch (err) {
      throw new ChainUnavailableError(err);
    }
    var address = contractConfig.addressFor(artifact, plain(networkId));
    try {
      code = await web3.eth.getCode(address);
    } catch (err) {
      throw new ChainUnavailableError(err);
    }
    // The artifact remembers an address on a chain that has since been reset
    if (!code || code === '0x') throw new ChainUnavailableError();
    return { address: address, contract: new web3.eth.Contract(artifact.abi, address) };
  }

  function registrarAccount() {
    if (!registrarKey) {
      var err = new Error('REGISTRAR_PRIVATE_KEY is not set in .env');
      err.status = 503;
      throw err;
    }
    var key = String(registrarKey).startsWith('0x') ? String(registrarKey) : '0x' + registrarKey;
    var account = web3.eth.accounts.privateKeyToAccount(key);
    if (!web3.eth.accounts.wallet.get(account.address)) web3.eth.accounts.wallet.add(account);
    return account;
  }

  async function isRegistered(address) {
    var c = await connect();
    var voter = await c.contract.methods.voters(address).call();
    return Boolean(voter.isRegistered);
  }

  // One at a time: web3 picks the nonce from the latest block, so two sends
  // racing each other could get the same nonce and one would be rejected.
  var registerVoter = serial(registerVoterNow);

  async function registerVoterNow(address) {
    var c = await connect();
    var from = registrarAccount().address;
    var voter = await c.contract.methods.voters(address).call();
    if (voter.isRegistered) return { txHash: null, alreadyRegistered: true };
    try {
      var receipt = await c.contract.methods.voterRegisteration(address).send({ from: from, gas: 200000 });
      return { txHash: receipt.transactionHash };
    } catch (err) {
      // A registration that raced ours (e.g. the admin's recovery form)
      if (JSON.stringify(err, function (k, v) { return typeof v === 'bigint' ? String(v) : v; })
        .indexOf(alreadyRegisteredSelector) !== -1) {
        return { txHash: null, alreadyRegistered: true };
      }
      throw err;
    }
  }

  async function audit() {
    var c = await connect();
    var m = c.contract.methods;
    var phase = plain(await m.state().call());
    var count = plain(await m.contestantsCount().call());
    var contestants = [];
    for (var id = 1; id <= count; id++) {
      var row = await m.contestants(id).call();
      contestants.push({ id: id, name: row.name });
    }
    var results = phase === PHASES - 1 ? (await m.results().call()).map(plain) : null;
    var events = (await c.contract.getPastEvents('allEvents', { fromBlock: 0, toBlock: 'latest' }))
      .map(function (e) {
        return { event: e.event, blockNumber: plain(e.blockNumber), args: eventArgs(e.returnValues) };
      });
    // All of them: the audit page's re-count must see every VoteCast. The page
    // trims what it displays.
    return { contractAddress: c.address, phase: phase, events: events, results: results, contestants: contestants };
  }

  return { registerVoter: registerVoter, isRegistered: isRegistered, audit: audit };
}

module.exports = { create: create, serial: serial, ChainUnavailableError: ChainUnavailableError };
