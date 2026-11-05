// INT-1: after the OTP the server registers the wallet on-chain first, then in
// the DB. A chain failure leaves the DB alone; a DB failure after the chain
// succeeded is recorded for the admin (Review Focus 1 and 2).
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');
var db = require('../../database');

var CHAIN_FAILED = 'We couldn&#39;t register your wallet on the blockchain. Nothing was saved. Please try again later.';

async function verify(chain) {
  var reg = await h.startRegistration(undefined, { chain: chain });
  var res = await h.submitOtp(reg, h.lastOtp(reg.user.email_address));
  return { reg: reg, res: res };
}

async function registrationRow(regId) {
  return (await h.query('SELECT Is_registered, account_address FROM registration WHERE reg_id = ?', [regId]))[0];
}

async function registeredUsers(wallet) {
  return h.query('SELECT * FROM registered_users WHERE Account_address = ?', [wallet]);
}

async function auditRows(regId, action) {
  return h.query('SELECT * FROM audit_log WHERE actor_reg_id = ? AND action = ?', [regId, action]);
}

describe('INT-1 automatic on-chain registration', function () {
  it('registers the wallet on-chain then in the DB', async function () {
    var chain = fakes.fakeChain();
    var r = await verify(chain);
    expect(r.res.text).to.contain('You are successfully registered');
    expect(chain.calls.registerVoter).to.deep.equal([r.reg.wallet]);
    var row = await registrationRow(r.reg.user.reg_id);
    expect(row.Is_registered).to.equal('YES');
    expect(row.account_address).to.equal(r.reg.wallet);
    expect(await registeredUsers(r.reg.wallet)).to.have.length(1);
    expect(await auditRows(r.reg.user.reg_id, 'voter_registered')).to.have.length(1);
  });

  it('chain unavailable leaves DB untouched', async function () {
    var r = await verify(fakes.fakeChain({ unavailable: true }));
    expect(r.res.status).to.equal(200);
    expect(r.res.text).to.contain(CHAIN_FAILED);
    expect((await registrationRow(r.reg.user.reg_id)).Is_registered).to.equal('No');
    expect(await registeredUsers(r.reg.wallet)).to.have.length(0);
    var rows = await auditRows(r.reg.user.reg_id, 'chain_register_failed');
    expect(rows).to.have.length(1);
    expect(rows[0].detail).to.contain('The blockchain is not available');
    // the wallet comes first, so the admin table can check it on-chain later
    expect(rows[0].detail.indexOf(r.reg.wallet + ': ')).to.equal(0);
  });

  it('any other chain error also leaves DB untouched', async function () {
    var r = await verify(fakes.fakeChain({ registerVoter: function () { return Promise.reject(new Error('out of gas')); } }));
    expect(r.res.text).to.contain(CHAIN_FAILED);
    expect((await registrationRow(r.reg.user.reg_id)).Is_registered).to.equal('No');
    expect(await auditRows(r.reg.user.reg_id, 'chain_register_failed')).to.have.length(1);
  });

  it('DB failure after chain success is audited as chain_db_mismatch', async function () {
    // The session store shares the pool, so fail only the next connection,
    // taken right after the chain call: the registration transaction's.
    var original = db.getConnection;
    var chain = fakes.fakeChain();
    var realRegister = chain.registerVoter;
    chain.registerVoter = async function (address) {
      var result = await realRegister(address);
      db.getConnection = function (cb) {
        db.getConnection = original;
        cb(new Error('connection lost'));
      };
      return result;
    };
    var reg = await h.startRegistration(undefined, { chain: chain });
    var code = h.lastOtp(reg.user.email_address);
    var res;
    try {
      res = await h.submitOtp(reg, code);
    } finally {
      db.getConnection = original;
    }
    expect(res.status).to.equal(500);
    expect(chain.calls.registerVoter).to.deep.equal([reg.wallet]);
    var rows = await auditRows(reg.user.reg_id, 'chain_db_mismatch');
    expect(rows).to.have.length(1);
    expect(rows[0].detail).to.equal(reg.wallet);
    expect((await registrationRow(reg.user.reg_id)).Is_registered).to.equal('No');
  });

  it('already registered on-chain is treated as success', async function () {
    var chain = fakes.fakeChain({
      registerVoter: function () { return Promise.resolve({ txHash: null, alreadyRegistered: true }); }
    });
    var r = await verify(chain);
    expect(r.res.text).to.contain('You are successfully registered');
    expect((await registrationRow(r.reg.user.reg_id)).Is_registered).to.equal('YES');
  });

  it('a wrong code never reaches the chain', async function () {
    var chain = fakes.fakeChain();
    var reg = await h.startRegistration(undefined, { chain: chain });
    var code = h.lastOtp(reg.user.email_address);
    await h.submitOtp(reg, code === '000000' ? '111111' : '000000');
    expect(chain.calls.registerVoter).to.deep.equal([]);
  });
});
