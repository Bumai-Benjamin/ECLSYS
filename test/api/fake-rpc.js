// A tiny JSON-RPC server that answers the calls lib/chain makes, so lib/chain
// can be tested without Ganache. It holds one fake NamVoting deployment.
var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var abi = require('web3-eth-abi');
var sha3 = require('web3-utils').sha3;

var NETWORK_ID = '5777';
var ADDRESS = '0x' + '5'.repeat(40);

// Just the parts of the NamVoting ABI that lib/chain uses
var ABI = [
  { type: 'function', name: 'voters', stateMutability: 'view', inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: 'isRegistered', type: 'bool' }, { name: 'hasVoted', type: 'bool' }] },
  { type: 'function', name: 'state', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'contestantsCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'contestants', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: 'id_', type: 'uint256' }, { name: 'name', type: 'string' }, { name: 'voteCount', type: 'uint256' },
      { name: 'party', type: 'string' }, { name: 'age', type: 'uint256' }, { name: 'qualification', type: 'string' }] },
  { type: 'function', name: 'results', stateMutability: 'view', inputs: [], outputs: [{ name: 'totals', type: 'uint256[]' }] },
  { type: 'function', name: 'voterRegisteration', stateMutability: 'nonpayable', inputs: [{ name: 'user', type: 'address' }], outputs: [] },
  { type: 'event', name: 'VoteCast', anonymous: false, inputs: [{ name: 'contestantId', type: 'uint256', indexed: true }] },
  { type: 'event', name: 'VoterRegistered', anonymous: false, inputs: [{ name: 'voter', type: 'address', indexed: true }] }
];

function selector(sig) { return sha3(sig).slice(0, 10); }

var SELECTORS = {};
SELECTORS[selector('voters(address)')] = 'voters';
SELECTORS[selector('state()')] = 'state';
SELECTORS[selector('contestantsCount()')] = 'contestantsCount';
SELECTORS[selector('contestants(uint256)')] = 'contestants';
SELECTORS[selector('results()')] = 'results';

function hex(n) { return '0x' + Number(n).toString(16); }
function word(n) { return '0x' + Number(n).toString(16).padStart(64, '0'); }

// options: { phase, contestants: [names], votes: [contestantId, ...], registered: [addr] }
function start(options) {
  options = options || {};
  var state = {
    phase: options.phase || 0,
    contestants: options.contestants || [],
    votes: options.votes || [],
    registered: (options.registered || []).map(function (a) { return a.toLowerCase(); })
  };
  var counts = {};

  function call(data) {
    var name = SELECTORS[data.slice(0, 10)];
    var args = '0x' + data.slice(10);
    if (name === 'voters') {
      var who = abi.decodeParameters(['address'], args)[0].toLowerCase();
      return abi.encodeParameters(['bool', 'bool'], [state.registered.indexOf(who) !== -1, false]);
    }
    if (name === 'state') return abi.encodeParameters(['uint8'], [state.phase]);
    if (name === 'contestantsCount') return abi.encodeParameters(['uint256'], [state.contestants.length]);
    if (name === 'contestants') {
      var id = Number(abi.decodeParameters(['uint256'], args)[0]);
      return abi.encodeParameters(['uint256', 'string', 'uint256', 'string', 'uint256', 'string'],
        [id, state.contestants[id - 1], 0, 'Party', 40, 'Degree']);
    }
    if (name === 'results') {
      var totals = state.contestants.map(function (n, i) {
        return state.votes.filter(function (v) { return v === i + 1; }).length;
      });
      return abi.encodeParameters(['uint256[]'], [totals]);
    }
    throw new Error('fake-rpc: unknown call ' + data.slice(0, 10));
  }

  function logs() {
    var topic = sha3('VoteCast(uint256)');
    return state.votes.map(function (id, i) {
      return {
        address: ADDRESS, topics: [topic, word(id)], data: '0x',
        blockNumber: hex(i + 10), blockHash: word(i + 10), transactionHash: word(1000 + i),
        transactionIndex: '0x0', logIndex: '0x0', removed: false
      };
    });
  }

  function answer(req) {
    counts[req.method] = (counts[req.method] || 0) + 1;
    switch (req.method) {
      case 'net_version': return NETWORK_ID;
      case 'eth_chainId': return '0x539';
      case 'eth_blockNumber': return hex(state.votes.length + 20);
      case 'eth_getCode': return '0x6080604052';
      case 'eth_call': return call(req.params[0].data);
      case 'eth_getLogs': return logs();
      default: throw new Error('fake-rpc: unsupported ' + req.method);
    }
  }

  var server = http.createServer(function (httpReq, httpRes) {
    var body = '';
    httpReq.on('data', function (c) { body += c; });
    httpReq.on('end', function () {
      var reqs = JSON.parse(body);
      var batch = Array.isArray(reqs);
      var out = (batch ? reqs : [reqs]).map(function (r) {
        try {
          return { jsonrpc: '2.0', id: r.id, result: answer(r) };
        } catch (err) {
          return { jsonrpc: '2.0', id: r.id, error: { code: -32601, message: err.message } };
        }
      });
      httpRes.setHeader('content-type', 'application/json');
      httpRes.end(JSON.stringify(batch ? out : out[0]));
    });
  });

  var artifactFile = path.join(os.tmpdir(), 'namvoting-fake-rpc-' + process.pid + '-' + Date.now() + '.json');
  var networks = {};
  networks[NETWORK_ID] = { address: ADDRESS };
  fs.writeFileSync(artifactFile, JSON.stringify({ abi: ABI, networks: networks }));

  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({
        url: 'http://127.0.0.1:' + server.address().port,
        artifactFile: artifactFile,
        state: state,
        counts: counts,
        close: function () {
          try { fs.unlinkSync(artifactFile); } catch (e) { /* already gone */ }
          return new Promise(function (r) { server.close(r); });
        }
      });
    });
  });
}

module.exports = { start: start, ADDRESS: ADDRESS };
