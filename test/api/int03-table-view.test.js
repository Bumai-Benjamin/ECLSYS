// INT-3: the admin voter table shows, for each wallet in the DB, whether the
// contract has it registered too, and lists recorded DB/chain mismatches
// (Review Focus 2). The page still works when the chain is down.
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');
var audit = require('../../lib/audit');

async function adminAgent(chain) {
  var admin = await h.createUser({ role: 'admin' });
  var a = h.agent({ chain: chain });
  await h.adminLogin(a, admin);
  return a;
}

async function addRegisteredUser(wallet) {
  await h.query('INSERT INTO registered_users SET ?', { Account_address: wallet, Is_registered: 'Yes' });
}

// The <tr> of the voter table that holds this wallet
function rowFor(html, wallet) {
  var rows = html.split(/<tr\b/i);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].indexOf(wallet) !== -1) return rows[i].split(/<\/tr>/i)[0].replace(/\s+/g, ' ');
  }
  return null;
}

describe('INT-3 on-chain status in the voter table', function () {
  it('a row registered on both shows Yes', async function () {
    var chain = fakes.fakeChain();
    var wallet = h.newWallet();
    await addRegisteredUser(wallet);
    await chain.registerVoter(wallet);
    var res = await (await adminAgent(chain)).get('/table_view');
    expect(res.status).to.equal(200);
    expect(res.text).to.contain('On blockchain');
    var row = rowFor(res.text, wallet);
    // the DB column says Yes too, so look at the on-chain cell only
    expect(row).to.match(/<td class="on-chain">\s*Yes\s*<\/td>/);
    expect(row).not.to.contain('mismatch');
  });

  it('a DB-only row shows mismatch', async function () {
    var wallet = h.newWallet();
    await addRegisteredUser(wallet);
    var res = await (await adminAgent(fakes.fakeChain())).get('/table_view');
    expect(rowFor(res.text, wallet)).to.match(/<td class="on-chain">\s*No ⚠ mismatch\s*<\/td>/);
  });

  it('with the chain unavailable the page still renders and shows Unknown', async function () {
    var wallet = h.newWallet();
    await addRegisteredUser(wallet);
    var res = await (await adminAgent(fakes.fakeChain({ unavailable: true }))).get('/table_view');
    expect(res.status).to.equal(200);
    expect(rowFor(res.text, wallet)).to.match(/<td class="on-chain">\s*Unknown \(blockchain unavailable\)\s*<\/td>/);
  });

  it('lists recorded chain_db_mismatch events above the table', async function () {
    var wallet = h.newWallet();
    var voter = await h.createUser();
    await audit.record(voter.reg_id, 'chain_db_mismatch', wallet);
    var res = await (await adminAgent(fakes.fakeChain())).get('/table_view');
    var mismatchAt = res.text.indexOf(wallet);
    expect(mismatchAt).to.be.greaterThan(-1);
    expect(mismatchAt).to.be.lessThan(res.text.indexOf('On blockchain'));
  });

  it('shows a failed registration that the chain has anyway (review #3)', async function () {
    // The send threw (e.g. timeout) but the transaction was mined: on-chain,
    // not in the DB, and only chain_register_failed records it.
    var chain = fakes.fakeChain();
    var voter = await h.createUser();
    var minedWallet = h.newWallet();
    var failedWallet = h.newWallet();
    await chain.registerVoter(minedWallet);
    await audit.record(voter.reg_id, 'chain_register_failed', minedWallet + ': receipt timeout');
    await audit.record(voter.reg_id, 'chain_register_failed', failedWallet + ': out of gas');
    var res = await (await adminAgent(chain)).get('/table_view');
    var at = res.text.indexOf(minedWallet);
    expect(at).to.be.greaterThan(-1);
    expect(at).to.be.lessThan(res.text.indexOf('On blockchain'));
    // really failed: nothing on-chain, nothing to fix
    expect(res.text).not.to.contain(failedWallet);
  });

  it('checks at most 10 wallets at a time', async function () {
    for (var i = 0; i < 25; i++) await addRegisteredUser(h.newWallet());
    var running = 0;
    var peak = 0;
    var chain = fakes.fakeChain({
      isRegistered: async function () {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise(function (r) { setTimeout(r, 5); });
        running -= 1;
        return false;
      }
    });
    var res = await (await adminAgent(chain)).get('/table_view');
    expect(res.status).to.equal(200);
    expect(chain.calls.isRegistered.length).to.be.at.least(25);
    expect(peak).to.be.at.most(10);
    expect(peak).to.be.greaterThan(1);
  });

  it('a voter session gets 403', async function () {
    var voter = await h.createUser();
    var a = h.agent({ chain: fakes.fakeChain() });
    await h.login(a, voter);
    var res = await a.get('/table_view');
    expect(res.status).to.equal(403);
  });
});
