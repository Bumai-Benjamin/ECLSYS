// INT-2: the server's view of the NamVoting contract (web3 4). The server signs
// registrations with the registrar key (REGISTRAR_ROLE, granted by the
// migration) and relays anonymous votes with the relayer key (ANON-3). Every
// method rejects with ChainUnavailableError when Ganache is unreachable or the
// contract isn't deployed on the chain it is running now.
var Web3 = require('web3').Web3;
var contractConfig = require('../config/contract');

var ChainUnavailableError = contractConfig.ChainUnavailableError;
var PHASES = 3;

// web3 returns uint values as BigInt; the pages and JSON need plain values.
// Nullifiers and commitments are 254-bit numbers, so those stay exact, as
// decimal strings.
function plain(value) {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
  }
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

// Why the contract refused a vote, found by the custom error's selector
// somewhere in what web3 hands back. code: what the relayer route answers.
var VOTE_ERRORS = [
  ['AlreadyVoted()', 'already_voted'],
  ['WrongPhase(uint8,uint8)', 'voting_closed'],
  ['InvalidContestant(uint256)', 'invalid_candidate'],
  ['WrongElection(uint256)', 'invalid_proof'],
  ['InvalidProof()', 'invalid_proof'],
  ['Semaphore__MerkleTreeRootIsNotPartOfTheGroup()', 'invalid_proof'],
  ['Semaphore__MerkleTreeRootIsExpired()', 'invalid_proof'],
  ['Semaphore__MerkleTreeDepthIsNotSupported()', 'invalid_proof'],
  ['Semaphore__GroupHasNoMembers()', 'invalid_proof']
];

function errorText(err) {
  return JSON.stringify(err, function (k, v) { return typeof v === 'bigint' ? String(v) : v; }) +
    ' ' + String(err && err.message);
}

// A vote the contract refused; err.code is one of the VOTE_ERRORS codes.
function VoteRejectedError(code) {
  var err = new Error('The contract refused the vote: ' + code);
  err.name = 'VoteRejectedError';
  err.code = code;
  return err;
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
  var relayerKey = options.relayerKey !== undefined ? options.relayerKey : process.env.RELAYER_PRIVATE_KEY;
  var artifactFile = options.artifactFile;
  var web3 = new Web3(rpcUrl);
  var alreadyRegisteredSelector = web3.utils.sha3('AlreadyRegistered(address)').slice(0, 10);
  var voteErrors = VOTE_ERRORS.map(function (pair) {
    return { selector: web3.utils.sha3(pair[0]).slice(0, 10).toLowerCase(), code: pair[1] };
  });

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

  function signer(privateKey, envName) {
    if (!privateKey) {
      var err = new Error(envName + ' is not set in .env');
      err.status = 503;
      throw err;
    }
    var key = String(privateKey).startsWith('0x') ? String(privateKey) : '0x' + privateKey;
    var account = web3.eth.accounts.privateKeyToAccount(key);
    if (!web3.eth.accounts.wallet.get(account.address)) web3.eth.accounts.wallet.add(account);
    return account;
  }

  // web3 4.0.3's contract .send() never signs with the local wallet: it asks
  // the node to sign, which only works for Ganache's own unlocked accounts.
  // web3.eth.sendTransaction does sign locally, so the call is encoded and
  // sent through it.
  function sendFrom(from, c, method, gas) {
    return web3.eth.sendTransaction({ from: from, to: c.address, data: method.encodeABI(), gas: gas });
  }

  async function isRegistered(address) {
    var c = await connect();
    return Boolean(await c.contract.methods.registered(address).call());
  }

  // One at a time: web3 picks the nonce from the latest block, so two sends
  // racing each other could get the same nonce and one would be rejected.
  // Registrations and votes use different accounts, so each has its own queue.
  var registerVoter = serial(registerVoterNow);

  // ANON-1: the wallet and its identity commitment join in one transaction.
  // Adding to the Semaphore tree costs more as the group grows, hence the gas.
  async function registerVoterNow(address, identityCommitment) {
    var c = await connect();
    var from = signer(registrarKey, 'REGISTRAR_PRIVATE_KEY').address;
    if (await c.contract.methods.registered(address).call()) return { txHash: null, alreadyRegistered: true };
    try {
      var receipt = await sendFrom(from, c, c.contract.methods.voterRegisteration(address, String(identityCommitment)), 1000000);
      return { txHash: receipt.transactionHash };
    } catch (err) {
      // A registration that raced ours (e.g. the admin's recovery form)
      if (errorText(err).indexOf(alreadyRegisteredSelector) !== -1) {
        return { txHash: null, alreadyRegistered: true };
      }
      throw err;
    }
  }

  function voteRejection(err) {
    var text = errorText(err).toLowerCase();
    for (var i = 0; i < voteErrors.length; i++) {
      if (text.indexOf(voteErrors[i].selector) !== -1) return VoteRejectedError(voteErrors[i].code);
    }
    return null;
  }

  // ANON-3: sends a voter's proof from the relayer account, so no voter
  // wallet is in the transaction. A dry run first, so a refused proof costs
  // no gas and comes back as VoteRejectedError.
  var castVote = serial(castVoteNow);

  async function castVoteNow(proof) {
    var c = await connect();
    var from = signer(relayerKey, 'RELAYER_PRIVATE_KEY').address;
    var method = c.contract.methods.castVote(proof);
    try {
      await method.call({ from: from });
    } catch (err) {
      throw voteRejection(err) || err;
    }
    try {
      var receipt = await sendFrom(from, c, method, 1000000);
      return { txHash: receipt.transactionHash, blockNumber: plain(receipt.blockNumber), nullifier: String(proof.nullifier) };
    } catch (err) {
      throw voteRejection(err) || err;
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
      contestants.push({ id: id, name: row.name, party: row.party });
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

  return { registerVoter: registerVoter, isRegistered: isRegistered, castVote: castVote, audit: audit };
}

module.exports = {
  create: create,
  serial: serial,
  plain: plain,
  ChainUnavailableError: ChainUnavailableError,
  VoteRejectedError: VoteRejectedError
};
