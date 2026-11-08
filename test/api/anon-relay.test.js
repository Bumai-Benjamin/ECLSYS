// ANON-1 to ANON-5: registration sends a voting key (identity commitment)
// that never reaches the database, and POST /api/vote relays a proof without
// knowing who sent it. The contract checks the proofs themselves
// (test/contracts/NamVoting.js); here the fake chain accepts any well-formed one.
var expect = require('chai').expect;
var request = require('supertest');
var h = require('./helpers');
var fakes = require('./fakes');
var fakeRpc = require('./fake-rpc');
var server = require('../../server');
var validate = require('../../lib/validate');
var chainLib = require('../../lib/chain');

var BIG = '21888242871839275222246405745257275088548364400416034343698204186575808495616'; // field size - 1

function proof(overrides) {
  return Object.assign({
    merkleTreeDepth: 16,
    merkleTreeRoot: '123456789',
    nullifier: BIG,
    message: '1',
    scope: '987654321',
    points: ['1', '2', '3', '4', '5', '6', '7', '8']
  }, overrides);
}

function votingChain() {
  var chain = fakes.fakeChain();
  chain.state.phase = 1;
  return chain;
}

// A request with no cookies at all, as the voting page sends it
function relay(app, body) {
  return request(app).post('/api/vote').set('Content-Type', 'application/json').send(body);
}

describe('ANON-3 POST /api/vote (the relayer)', function () {
  it('relays a proof sent without cookies or CSRF token, and sets no cookie', async function () {
    var chain = votingChain();
    var res = await relay(server.createApp({ chain: chain }), { proof: proof() });
    expect(res.status).to.equal(200);
    expect(res.body.txHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(res.body.nullifier).to.equal(BIG);
    expect(res.headers['set-cookie']).to.equal(undefined);
    expect(chain.calls.castVote).to.have.length(1);
    expect(chain.calls.castVote[0].merkleTreeDepth).to.equal('16');
    expect(chain.calls.castVote[0].points).to.deep.equal(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('refuses a malformed proof without calling the chain', async function () {
    var chain = votingChain();
    var app = server.createApp({ chain: chain });
    var bad = [
      {},
      { proof: 'x' },
      { proof: proof({ points: ['1', '2'] }) },
      { proof: proof({ nullifier: '-1' }) },
      { proof: proof({ message: '0x01' }) },
      { proof: proof({ merkleTreeDepth: 33 }) },
      { proof: proof({ scope: '1'.repeat(79) }) }
    ];
    for (var i = 0; i < bad.length; i++) {
      var res = await relay(app, bad[i]);
      expect(res.status, JSON.stringify(bad[i])).to.equal(400);
      expect(res.body.error).to.equal('bad_request');
    }
    expect(chain.calls.castVote).to.have.length(0);
  });

  it('answers 409 already_voted when the nullifier was used', async function () {
    var app = server.createApp({ chain: votingChain() });
    expect((await relay(app, { proof: proof() })).status).to.equal(200);
    var again = await relay(app, { proof: proof({ message: '2' }) });
    expect(again.status).to.equal(409);
    expect(again.body.error).to.equal('already_voted');
    expect(again.body.message).to.contain('already voted');
  });

  it('answers 409 voting_closed outside the voting phase', async function () {
    var res = await relay(server.createApp({ chain: fakes.fakeChain() }), { proof: proof() });
    expect(res.status).to.equal(409);
    expect(res.body.error).to.equal('voting_closed');
  });

  it('answers 400 invalid_proof when the contract refuses the proof', async function () {
    var chain = fakes.fakeChain({ castVote: function () { return Promise.reject(chainLib.VoteRejectedError('invalid_proof')); } });
    var res = await relay(server.createApp({ chain: chain }), { proof: proof() });
    expect(res.status).to.equal(400);
    expect(res.body.error).to.equal('invalid_proof');
  });

  it('answers 503 when the chain is down', async function () {
    var res = await relay(server.createApp({ chain: fakes.fakeChain({ unavailable: true }) }), { proof: proof() });
    expect(res.status).to.equal(503);
    expect(res.body.error).to.equal('unavailable');
  });

  it('logs nothing about the proof when relaying fails', async function () {
    var chain = fakes.fakeChain({ castVote: function () { return Promise.reject(new Error('boom ' + BIG)); } });
    var logged = [];
    var original = console.error;
    console.error = function () { logged.push(Array.prototype.join.call(arguments, ' ')); };
    try {
      var res = await relay(server.createApp({ chain: chain }), { proof: proof() });
      expect(res.status).to.equal(500);
    } finally {
      console.error = original;
    }
    expect(logged.join('\n')).to.not.contain(BIG);
  });

  it('has its own per-IP limit', async function () {
    var app = server.createApp({ chain: votingChain(), voteRateLimitMax: 2 });
    await relay(app, { proof: proof({ nullifier: '1' }) });
    await relay(app, { proof: proof({ nullifier: '2' }) });
    var third = await relay(app, { proof: proof({ nullifier: '3' }) });
    expect(third.status).to.equal(429);
    expect(third.body.error).to.equal('too_many');
  });
});

describe('ANON-1 registration sends a voting key', function () {
  it('refuses a registration without a voting key, sending no code', async function () {
    var user = await h.createUser();
    var a = h.agent({ chain: fakes.fakeChain() });
    await h.login(a, user);
    var res = await h.submitForm(a, '/form', '/registerdata',
      { id_number: user.id_number, account_address: h.newWallet(), identity_commitment: '' });
    expect(res.text).to.contain('could not create your voting key');
    expect(h.lastOtp(user.email_address)).to.equal(undefined);
  });

  it('refuses a voting key outside the SNARK field', async function () {
    expect(validate.commitment('21888242871839275222246405745257275088548364400416034343698204186575808495617')).to.be.a('string');
    expect(validate.commitment('0')).to.be.a('string');
    expect(validate.commitment('12ab')).to.be.a('string');
    expect(validate.commitment(BIG)).to.equal(null);
  });

  it('puts the key on-chain with the wallet, and never in the database', async function () {
    var chain = fakes.fakeChain();
    var user = await h.createUser();
    var a = h.agent({ chain: chain });
    await h.login(a, user);
    var key = h.newCommitment();
    var wallet = h.newWallet();
    var reg = { a: a, user: user, wallet: wallet };
    reg.res = await h.submitForm(a, '/form', '/registerdata', { id_number: user.id_number, account_address: wallet, identity_commitment: key });
    var res = await h.submitOtp(reg, h.lastOtp(user.email_address));
    expect(res.text).to.contain('successfully registered');
    expect(chain.calls.registerVoter).to.deep.equal([wallet]);
    expect(chain.calls.commitments).to.deep.equal([key]);

    var rows = await h.query('SELECT * FROM registration WHERE reg_id = (SELECT reg_id FROM registration WHERE id_number = ?)', [user.id_number]);
    var audit = await h.query('SELECT * FROM audit_log');
    expect(JSON.stringify(rows)).to.not.contain(key);
    expect(JSON.stringify(audit)).to.not.contain(key);
  });

  it('shows the voter their key when the chain step fails, for the recovery form', async function () {
    var chain = fakes.fakeChain({ registerVoter: function () { return Promise.reject(new Error('down')); } });
    var user = await h.createUser();
    var a = h.agent({ chain: chain });
    await h.login(a, user);
    var key = h.newCommitment();
    var reg = { a: a, user: user };
    reg.res = await h.submitForm(a, '/form', '/registerdata', { id_number: user.id_number, account_address: h.newWallet(), identity_commitment: key });
    var res = await h.submitOtp(reg, h.lastOtp(user.email_address));
    expect(res.text).to.contain('id="voting-key-note"');
    expect(res.text).to.contain(key);
  });
});

describe('ANON-2 pages', function () {
  it('the voting page loads the proof code and no longer votes from the wallet', async function () {
    var fs = require('fs');
    var path = require('path');
    var html = fs.readFileSync(path.join(__dirname, '../../src/voting.html'), 'utf8');
    var app = fs.readFileSync(path.join(__dirname, '../../src/js/app.js'), 'utf8');
    expect(html).to.contain('js/semaphore.bundle.js');
    expect(html).to.contain('id="receipt-nullifier"');
    expect(app).to.not.match(/instance\.vote\(/);
    expect(app).to.contain("credentials: 'omit'");
  });

  it('serves the depth-16 circuit files and allows WebAssembly in the CSP', async function () {
    var app = server.createApp({ chain: fakes.fakeChain() });
    var wasm = await request(app).get('/zk/semaphore-16.wasm');
    expect(wasm.status).to.equal(200);
    var zkey = await request(app).head('/zk/semaphore-16.zkey');
    expect(zkey.status).to.equal(200);
    var csp = (await request(app).get('/hello')).headers['content-security-policy'];
    expect(csp).to.contain("'wasm-unsafe-eval'");
    expect(csp).to.not.match(/'unsafe-eval'/);
  });
});

describe('ANON-5 big numbers stay exact', function () {
  var rpc;
  afterEach(function () { return rpc && rpc.close(); });

  it('plain() keeps 254-bit values as decimal strings', function () {
    expect(chainLib.plain(BigInt(7))).to.equal(7);
    expect(chainLib.plain(BigInt(BIG))).to.equal(BIG);
  });

  it('audit() gives each VoteCast its exact nullifier', async function () {
    rpc = await fakeRpc.start({ phase: 1, contestants: ['A', 'B'], votes: [2] });
    var chain = chainLib.create({ rpcUrl: rpc.url, registrarKey: '1'.repeat(64), artifactFile: rpc.artifactFile });
    var votes = (await chain.audit()).events.filter(function (e) { return e.event === 'VoteCast'; });
    expect(votes[0].args.contestantId).to.equal(2);
    expect(votes[0].args.nullifier).to.equal((BigInt(2) ** BigInt(250)).toString());
  });
});
