// In-memory stand-in for lib/chain (INT-2), so API tests don't need Ganache.
// fakeChain({ unavailable: true }) fails every call like a stopped Ganache;
// any other key replaces the method of that name.
var crypto = require('crypto');
var ChainUnavailableError = require('../../config/contract').ChainUnavailableError;
var VoteRejectedError = require('../../lib/chain').VoteRejectedError;

function fakeChain(overrides) {
  overrides = overrides || {};
  var registered = {};
  var state = {
    contractAddress: '0x' + 'f'.repeat(40),
    phase: 0,
    events: [],
    results: null,
    contestants: []
  };
  var calls = { registerVoter: [], commitments: [], castVote: [], isRegistered: [], audit: 0 };
  var nullifiers = {};

  function guard() {
    if (overrides.unavailable) return Promise.reject(new ChainUnavailableError());
    return null;
  }

  var chain = {
    calls: calls,
    state: state,

    // calls.registerVoter: the wallets; calls.commitments: their voting keys
    registerVoter: function (address, identityCommitment) {
      calls.registerVoter.push(address);
      calls.commitments.push(identityCommitment);
      if (overrides.registerVoter) return overrides.registerVoter(address, identityCommitment);
      var down = guard();
      if (down) return down;
      var key = String(address).toLowerCase();
      if (registered[key]) return Promise.resolve({ txHash: null, alreadyRegistered: true });
      registered[key] = true;
      state.events.push({ event: 'VoterRegistered', blockNumber: state.events.length + 1, args: { voter: address } });
      return Promise.resolve({ txHash: '0x' + crypto.randomBytes(32).toString('hex') });
    },

    // Accepts any well-formed proof (lib/chain and the contract check the
    // real ones); refuses like the contract outside voting and on a reused
    // nullifier.
    castVote: function (proof) {
      calls.castVote.push(proof);
      if (overrides.castVote) return overrides.castVote(proof);
      var down = guard();
      if (down) return down;
      if (state.phase !== 1) return Promise.reject(VoteRejectedError('voting_closed'));
      if (nullifiers[proof.nullifier]) return Promise.reject(VoteRejectedError('already_voted'));
      nullifiers[proof.nullifier] = true;
      state.events.push({ event: 'VoteCast', blockNumber: state.events.length + 1,
        args: { contestantId: Number(proof.message), nullifier: proof.nullifier } });
      return Promise.resolve({ txHash: '0x' + crypto.randomBytes(32).toString('hex'), blockNumber: state.events.length, nullifier: proof.nullifier });
    },

    isRegistered: function (address) {
      calls.isRegistered.push(address);
      if (overrides.isRegistered) return overrides.isRegistered(address);
      return guard() || Promise.resolve(Boolean(registered[String(address).toLowerCase()]));
    },

    audit: function () {
      calls.audit += 1;
      if (overrides.audit) return overrides.audit();
      return guard() || Promise.resolve(JSON.parse(JSON.stringify(state)));
    }
  };
  return chain;
}

module.exports = { fakeChain: fakeChain };
