// SEC-9 / D15: every POST form carries a CSRF token that must match the
// session's; a forged cross-site POST gets 403 and changes nothing.
var expect = require('chai').expect;
var h = require('./helpers');
var mailer = require('../../lib/mailer');

describe('SEC-9 CSRF protection', function () {
  [['/register', 'registration form'], ['/login', 'login form'], ['/adlogin', 'admin login form']].forEach(function (p) {
    it('puts a token in the ' + p[1], async function () {
      var res = await h.agent().get(p[0]);
      expect(h.csrfFrom(res.text)).to.match(/^[0-9a-f]{64}$/);
    });
  });

  it('puts a token in the voter registration and OTP forms', async function () {
    var reg = await h.startRegistration();
    expect(h.csrfFrom(reg.res.text), 'OTP form').to.match(/^[0-9a-f]{64}$/);
    var form = await reg.a.get('/form');
    expect(h.csrfFrom(form.text), 'registration form').to.match(/^[0-9a-f]{64}$/);
  });

  it('refuses a sign-up without a token, and stores nothing', async function () {
    var u = h.newVoter();
    var a = h.agent();
    await a.get('/register');
    var res = await a.post('/register').type('form').send(u);
    expect(res.status).to.equal(403);
    var rows = await h.query('SELECT 1 FROM registration WHERE email_address = ?', [u.email_address]);
    expect(rows).to.have.length(0);
  });

  it('refuses a login with a token from another session', async function () {
    var u = await h.createUser();
    var other = await h.agent().get('/login');
    var a = h.agent();
    await a.get('/login');
    var res = await a.post('/login').type('form')
      .send({ email_address: u.email_address, password: u.password, _csrf: h.csrfFrom(other.text) });
    expect(res.status).to.equal(403);
  });

  it('refuses /adlogin without a token', async function () {
    var admin = await h.createUser({ role: 'admin' });
    var res = await h.agent().post('/adlogin').type('form').send({ email_address: admin.email_address, password: admin.password });
    expect(res.status).to.equal(403);
  });

  it('refuses a forged /registerdata from a logged-in voter, sending no OTP', async function () {
    var u = await h.createUser();
    var a = h.agent();
    await h.login(a, u);
    var before = mailer.outbox.length;
    var res = await a.post('/registerdata').type('form').send({ id_number: u.id_number, account_address: h.newWallet() });
    expect(res.status).to.equal(403);
    expect(mailer.outbox.length).to.equal(before);
  });

  it('refuses a forged /otpverify, leaving the voter unregistered', async function () {
    var reg = await h.startRegistration();
    var res = await reg.a.post('/otpverify').type('form').send({ otp: h.lastOtp(reg.user.email_address) });
    expect(res.status).to.equal(403);
    var row = await h.query('SELECT Is_registered FROM registration WHERE reg_id = ?', [reg.user.reg_id]);
    expect(row[0].Is_registered).to.equal('No');
  });

  it('accepts the token in an X-CSRF-Token header (for JSON calls)', async function () {
    var u = await h.createUser();
    var a = h.agent();
    var page = await a.get('/login');
    var res = await a.post('/login').set('X-CSRF-Token', h.csrfFrom(page.text))
      .type('form').send({ email_address: u.email_address, password: u.password });
    expect(res.status).to.equal(302);
  });

  it("doesn't create a session for a page without a form", async function () {
    var res = await h.agent().get('/result');
    expect(res.headers['set-cookie'] || []).to.have.length(0);
  });
});
