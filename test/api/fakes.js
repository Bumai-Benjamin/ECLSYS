// In-memory stand-in for lib/chain (INT-2), so API tests don't need Ganache.
// fakeChain({ unavailable: true }) fails every call like a stopped Ganache;
// any other key replaces the method of that name.
var crypto = require('crypto');
var ChainUnavailableError = require('../../config/contract').ChainUnavailableError;

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
  var calls = { registerVoter: [], isRegistered: [], audit: 0 };

  function guard() {
    if (overrides.unavailable) return Promise.reject(new ChainUnavailableError());
    return null;
  }

  var chain = {
    calls: calls,
    state: state,

    registerVoter: function (address) {
      calls.registerVoter.push(address);
      if (overrides.registerVoter) return overrides.registerVoter(address);
      var down = guard();
      if (down) return down;
      var key = String(address).toLowerCase();
      if (registered[key]) return Promise.resolve({ txHash: null, alreadyRegistered: true });
      registered[key] = true;
      state.events.push({ event: 'VoterRegistered', blockNumber: state.events.length + 1, args: { voter: address } });
      return Promise.resolve({ txHash: '0x' + crypto.randomBytes(32).toString('hex') });
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
