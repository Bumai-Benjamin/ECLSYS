// UI-2: the voter step tracker (spec §4.1). src/js/steps.js runs in the
// browser and here.
var expect = require('chai').expect;
var Steps = require('../../src/js/steps');

var OPENS = 'Voting opens when the commission starts the voting phase.';
var REG_CLOSED = 'Registration is closed.';
var VOTE_CLOSED = 'Voting is closed.';
var VERIFY_FIRST = 'Verify your wallet first.';
var RESULTS_LATER = 'Results appear when voting closes.';

function byId(result) {
  var out = {};
  result.steps.forEach(function (s) { out[s.id] = s; });
  return out;
}

function check(input, expected) {
  var s = byId(Steps.compute(Object.assign({ loggedIn: true }, input)));
  Object.keys(expected).forEach(function (id) {
    var want = expected[id];
    expect(s[id].status, id + ' status for ' + JSON.stringify(input)).to.equal(want[0]);
    expect(s[id].reason, id + ' reason for ' + JSON.stringify(input)).to.equal(want[1]);
  });
}

describe('UI-2 step tracker', function () {
  it('labels and links', function () {
    var r = Steps.compute({ loggedIn: true, walletVerified: false, phase: 0, hasVoted: false });
    expect(r.steps.map(function (s) { return s.id; })).to.deep.equal(['account', 'wallet', 'vote', 'results']);
    expect(r.steps.map(function (s) { return s.label; })).to.deep.equal(['Account', 'Verify wallet', 'Vote', 'Results']);
    expect(r.steps.map(function (s) { return s.href; })).to.deep.equal(['/dashboard', '/form', '/voting', '/result']);
  });

  it('registration, wallet not verified', function () {
    check({ walletVerified: false, phase: 0, hasVoted: false }, {
      account: ['done', undefined], wallet: ['current', undefined],
      vote: ['locked', OPENS], results: ['locked', RESULTS_LATER]
    });
  });

  it('registration, wallet verified', function () {
    check({ walletVerified: true, phase: 0, hasVoted: false }, {
      wallet: ['done', undefined], vote: ['locked', OPENS], results: ['locked', RESULTS_LATER]
    });
  });

  it('voting, wallet not verified', function () {
    check({ walletVerified: false, phase: 1, hasVoted: false }, {
      wallet: ['locked', REG_CLOSED], vote: ['locked', VERIFY_FIRST], results: ['locked', RESULTS_LATER]
    });
  });

  it('voting, verified, not voted', function () {
    check({ walletVerified: true, phase: 1, hasVoted: false }, {
      wallet: ['done', undefined], vote: ['current', undefined], results: ['locked', RESULTS_LATER]
    });
  });

  it('voting, verified, voted', function () {
    check({ walletVerified: true, phase: 1, hasVoted: true }, {
      vote: ['done', undefined], results: ['locked', RESULTS_LATER]
    });
  });

  it('closed, wallet not verified', function () {
    check({ walletVerified: false, phase: 2, hasVoted: false }, {
      wallet: ['locked', REG_CLOSED], vote: ['locked', VOTE_CLOSED], results: ['current', undefined]
    });
  });

  it('closed, verified, not voted', function () {
    check({ walletVerified: true, phase: 2, hasVoted: false }, {
      vote: ['locked', VOTE_CLOSED], results: ['current', undefined]
    });
  });

  it('closed, verified, voted', function () {
    check({ walletVerified: true, phase: 2, hasVoted: true }, {
      vote: ['done', undefined], results: ['current', undefined]
    });
  });

  it('badge text per phase', function () {
    expect(Steps.compute({ loggedIn: true, walletVerified: false, phase: 0 }).badge).to.equal('Registration');
    expect(Steps.compute({ loggedIn: true, walletVerified: false, phase: 1 }).badge).to.equal('Voting open');
    expect(Steps.compute({ loggedIn: true, walletVerified: false, phase: 2 }).badge).to.equal('Voting closed');
    expect(Steps.compute({ loggedIn: true, walletVerified: false, phase: null }).badge).to.equal('Checking…');
  });

  it('phase null gives checking for vote and results', function () {
    check({ walletVerified: false, phase: null, hasVoted: null }, {
      wallet: ['current', undefined], vote: ['checking', undefined], results: ['checking', undefined]
    });
    check({ walletVerified: true, phase: null, hasVoted: null }, {
      wallet: ['done', undefined], vote: ['checking', undefined], results: ['checking', undefined]
    });
  });

  it('voting with hasVoted not known yet gives checking for vote', function () {
    check({ walletVerified: true, phase: 1, hasVoted: null }, { vote: ['checking', undefined] });
  });

  it('unavailable() turns checking into locked with the blockchain message', function () {
    var r = Steps.unavailable(Steps.compute({ loggedIn: true, walletVerified: true, phase: null, hasVoted: null }));
    var s = byId(r);
    expect(s.vote.status).to.equal('locked');
    expect(s.vote.reason).to.equal('The blockchain is not available right now.');
    expect(s.results.status).to.equal('locked');
    expect(s.wallet.status).to.equal('done');
    expect(r.badge).to.equal('Unavailable');
  });

  it('never more than one current step', function () {
    [0, 1, 2, null].forEach(function (phase) {
      [true, false].forEach(function (walletVerified) {
        [true, false, null].forEach(function (hasVoted) {
          var r = Steps.compute({ loggedIn: true, walletVerified: walletVerified, phase: phase, hasVoted: hasVoted });
          var current = r.steps.filter(function (s) { return s.status === 'current'; });
          expect(current.length, JSON.stringify([phase, walletVerified, hasVoted])).to.be.at.most(1);
        });
      });
    });
  });

  it('returns plain text only', function () {
    var r = Steps.compute({ loggedIn: true, walletVerified: false, phase: 1, hasVoted: false });
    r.steps.forEach(function (s) {
      expect(s.label + (s.reason || '')).not.to.match(/[<>]/);
    });
  });
});
