// SEC-4 / D4, D7: one OTP per request, hashed with a pepper, 5-minute expiry,
// 5 attempts, single use; pending registration state lives in the session.
// These also cover threat-model surface 5 (email OTP channel).
var expect = require('chai').expect;
var h = require('./helpers');

async function isRegistered(user) {
  var rows = await h.query('SELECT Is_registered, account_address FROM registration WHERE reg_id = ?', [user.reg_id]);
  return rows[0];
}

describe('SEC-4 OTP', function () {
  it('creates the otp_codes table', async function () {
    var cols = (await h.query('SHOW COLUMNS FROM otp_codes')).map(function (c) { return c.Field; });
    expect(cols).to.include.members(['id', 'reg_id', 'code_hash', 'purpose', 'expires_at', 'attempts', 'used_at']);
  });

  it('mails a 6-digit code and stores only its hash', async function () {
    var reg = await h.startRegistration();
    expect(reg.res.status).to.equal(200);
    var code = h.lastOtp(reg.user.email_address);
    expect(code).to.match(/^\d{6}$/);
    var rows = await h.query('SELECT code_hash, TIMESTAMPDIFF(SECOND, NOW(), expires_at) AS ttl FROM otp_codes WHERE reg_id = ?', [reg.user.reg_id]);
    expect(rows).to.have.length(1);
    expect(rows[0].code_hash).to.match(/^[0-9a-f]{64}$/);
    expect(rows[0].code_hash).to.not.contain(code);
    expect(rows[0].ttl).to.be.within(280, 300);
  });

  it('gives different users different codes (D4)', async function () {
    var codes = [];
    for (var i = 0; i < 4; i++) {
      var reg = await h.startRegistration();
      codes.push(h.lastOtp(reg.user.email_address));
    }
    expect(new Set(codes).size).to.equal(codes.length);
  });

  it('registers the voter with the right code', async function () {
    var reg = await h.startRegistration();
    var res = await h.submitOtp(reg, h.lastOtp(reg.user.email_address));
    expect(res.status).to.equal(200);
    expect(res.text).to.contain('You are successfully registered');
    var row = await isRegistered(reg.user);
    expect(row.Is_registered).to.equal('YES');
    expect(row.account_address).to.equal(reg.wallet);
    var ru = await h.query('SELECT * FROM registered_users WHERE Account_address = ?', [reg.wallet]);
    expect(ru).to.have.length(1);
  });

  it('rejects a wrong code without registering', async function () {
    var reg = await h.startRegistration();
    var code = h.lastOtp(reg.user.email_address);
    var wrong = code === '000000' ? '000001' : '000000';
    var res = await h.submitOtp(reg, wrong);
    expect(res.text).to.not.contain('You are successfully registered');
    expect((await isRegistered(reg.user)).Is_registered).to.equal('No');
  });

  it('locks after 5 wrong attempts: the right code then fails', async function () {
    var reg = await h.startRegistration();
    var code = h.lastOtp(reg.user.email_address);
    var wrong = code === '111111' ? '222222' : '111111';
    for (var i = 0; i < 5; i++) await h.submitOtp(reg, wrong);
    var res = await h.submitOtp(reg, code);
    expect(res.text).to.not.contain('You are successfully registered');
    expect((await isRegistered(reg.user)).Is_registered).to.equal('No');
  });

  it('rejects an expired code', async function () {
    var reg = await h.startRegistration();
    await h.query('UPDATE otp_codes SET expires_at = NOW() - INTERVAL 1 SECOND WHERE reg_id = ?', [reg.user.reg_id]);
    var res = await h.submitOtp(reg, h.lastOtp(reg.user.email_address));
    expect(res.text).to.not.contain('You are successfully registered');
    expect((await isRegistered(reg.user)).Is_registered).to.equal('No');
  });

  it('accepts a code only once', async function () {
    var reg = await h.startRegistration();
    var code = h.lastOtp(reg.user.email_address);
    var first = await h.submitOtp(reg, code);
    expect(first.text).to.contain('You are successfully registered');
    var second = await h.submitOtp(reg, code);
    expect(second.text).to.not.contain('You are successfully registered');
    var used = await h.query('SELECT used_at FROM otp_codes WHERE reg_id = ?', [reg.user.reg_id]);
    expect(used[0].used_at).to.not.equal(null);
  });

  it("doesn't accept user A's code for user B", async function () {
    var a = await h.startRegistration();
    var b = await h.startRegistration();
    var res = await h.submitOtp(b, h.lastOtp(a.user.email_address));
    expect(res.text).to.not.contain('You are successfully registered');
    expect((await isRegistered(b.user)).Is_registered).to.equal('No');
  });

  it('keeps two registrations in progress apart (D7)', async function () {
    var a = await h.startRegistration();
    var b = await h.startRegistration();
    // finish in the opposite order to how they started
    var rb = await h.submitOtp(b, h.lastOtp(b.user.email_address));
    var ra = await h.submitOtp(a, h.lastOtp(a.user.email_address));
    expect(ra.text).to.contain('You are successfully registered');
    expect(rb.text).to.contain('You are successfully registered');
    expect((await isRegistered(a.user)).account_address).to.equal(a.wallet);
    expect((await isRegistered(b.user)).account_address).to.equal(b.wallet);
  });

  it('a new code replaces the previous one', async function () {
    var reg = await h.startRegistration();
    var oldCode = h.lastOtp(reg.user.email_address);
    reg.res = await h.submitForm(reg.a, '/form', '/registerdata', { id_number: reg.user.id_number, account_address: reg.wallet });
    var newCode = h.lastOtp(reg.user.email_address);
    if (oldCode !== newCode) {
      var stale = await h.submitOtp(reg, oldCode);
      expect(stale.text).to.not.contain('You are successfully registered');
    }
    var res = await h.submitOtp(reg, newCode);
    expect(res.text).to.contain('You are successfully registered');
  });

  it("won't start registration for someone else's ID number", async function () {
    var victim = await h.createUser();
    var reg = await h.startRegistration();
    var before = require('../../lib/mailer').outbox.length;
    var res = await h.submitForm(reg.a, '/form', '/registerdata', { id_number: victim.id_number, account_address: h.newWallet() });
    expect(res.text).to.contain('does not match your account');
    expect(require('../../lib/mailer').outbox.length).to.equal(before);
  });

  it('asks to start again when there is no registration in progress', async function () {
    var u = await h.createUser();
    var a = h.agent();
    await h.login(a, u);
    var page = await a.get('/form');
    var res = await a.post('/otpverify').type('form').send({ otp: '123456', _csrf: h.csrfFrom(page.text) });
    expect(res.text).to.contain('start the registration again');
  });
});
