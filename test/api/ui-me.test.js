// UI-1: GET /me tells the shared nav and the step tracker who is signed in,
// without any personal data (spec §3.3).
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');

describe('UI-1 GET /me', function () {
  it('signed out returns { loggedIn: false }', async function () {
    var res = await h.agent().get('/me');
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ loggedIn: false });
    expect(res.headers['cache-control']).to.contain('no-store');
  });

  it('voter without a verified wallet', async function () {
    var user = await h.createUser();
    var a = h.agent();
    await h.login(a, user);
    var res = await a.get('/me');
    expect(res.body).to.deep.equal({
      loggedIn: true, role: 'voter', firstName: 'Test', walletVerified: false, wallet: null
    });
    expect(res.headers['cache-control']).to.contain('no-store');
  });

  it('voter after on-chain registration', async function () {
    var reg = await h.startRegistration(undefined, { chain: fakes.fakeChain() });
    await h.submitOtp(reg, h.lastOtp(reg.user.email_address));
    var res = await reg.a.get('/me');
    expect(res.body.walletVerified).to.equal(true);
    expect(res.body.wallet).to.equal(reg.wallet);
  });

  it('admin', async function () {
    var admin = await h.createUser({ role: 'admin' });
    var a = h.agent();
    await h.adminLogin(a, admin);
    var res = await a.get('/me');
    expect(res.body.loggedIn).to.equal(true);
    expect(res.body.role).to.equal('admin');
  });

  it('never returns personal data', async function () {
    var user = await h.createUser();
    var a = h.agent();
    await h.login(a, user);
    var res = await a.get('/me');
    var text = JSON.stringify(res.body);
    [user.email_address, user.id_number, '1990-05-01', '$2'].forEach(function (secret) {
      expect(text).not.to.contain(secret);
    });
    expect(Object.keys(res.body).sort()).to.deep.equal(['firstName', 'loggedIn', 'role', 'wallet', 'walletVerified']);
  });
});
