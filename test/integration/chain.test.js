// INT-2 against a real Ganache: needs Ganache UI on GANACHE_RPC, `npm run migrate`
// done, and REGISTRAR_PRIVATE_KEY in .env. Skips itself when Ganache is not reachable.
var path = require('path');
var expect = require('chai').expect;

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

var RPC = process.env.GANACHE_RPC || 'http://127.0.0.1:7545';

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
  var Web3 = require('web3').Web3;
  return new Web3().eth.accounts.create().address;
}

describe('INT-2 lib/chain against Ganache', function () {
  var chain;

  before(async function () {
    if (!(await ganacheUp())) {
      console.log('    (skipped: Ganache is not reachable on ' + RPC + ')');
      this.skip();
    }
    chain = require('../../lib/chain').create({ rpcUrl: RPC });
  });

  it('registers a fresh address and reads it back', async function () {
    var addr = freshAddress();
    expect(await chain.isRegistered(addr)).to.equal(false);
    var res = await chain.registerVoter(addr);
    expect(res.txHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(await chain.isRegistered(addr)).to.equal(true);
  });

  it('treats an address that is already registered as success', async function () {
    var addr = freshAddress();
    await chain.registerVoter(addr);
    expect(await chain.registerVoter(addr)).to.deep.equal({ txHash: null, alreadyRegistered: true });
  });

  it('lists VoterRegistered in the audit events', async function () {
    var addr = freshAddress();
    await chain.registerVoter(addr);
    var audit = await chain.audit();
    expect(audit.contractAddress).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect([0, 1, 2]).to.include(audit.phase);
    var registered = audit.events.filter(function (e) {
      return e.event === 'VoterRegistered' && String(e.args.voter).toLowerCase() === addr.toLowerCase();
    });
    expect(registered).to.have.length(1);
  });
});
