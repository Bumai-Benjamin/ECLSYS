// MAIL: the OTP mail service (lib/mailer.js): a default sender, a proper OTP
// message, a startup check that never shows the password, and timeouts.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var h = require('./helpers');
var mailer = require('../../lib/mailer');

var KEYS = ['MAIL_TRANSPORT', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

function withEnv(values, fn) {
  var saved = {};
  KEYS.forEach(function (k) { saved[k] = process.env[k]; });
  Object.keys(values).forEach(function (k) {
    if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k];
  });
  function restore() { KEYS.forEach(function (k) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); }
  var out;
  try { out = fn(); } catch (err) { restore(); throw err; }
  if (out && typeof out.then === 'function') return out.then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
  restore();
  return out;
}

describe('MAIL default sender', function () {
  it('is "ECN E-Vote" at the SMTP account when MAIL_FROM is empty', function () {
    withEnv({ MAIL_FROM: '', SMTP_USER: 'ecn.otp@gmail.com' }, function () {
      expect(mailer.fromAddress()).to.equal('"ECN E-Vote" <ecn.otp@gmail.com>');
    });
  });

  it('MAIL_FROM wins when it is set', function () {
    withEnv({ MAIL_FROM: 'Elections <noreply@example.org>', SMTP_USER: 'ecn.otp@gmail.com' }, function () {
      expect(mailer.fromAddress()).to.equal('Elections <noreply@example.org>');
    });
  });
});

describe('MAIL OTP message', function () {
  var m = mailer.otpMessage('482913', 5);

  it('has a clear subject and the code and expiry in the text', function () {
    expect(m.subject).to.equal('Your ECN E-Vote verification code');
    expect(m.text).to.contain('482913');
    expect(m.text).to.contain('5 minutes');
    expect(m.text).to.contain('If you did not ask for this code, ignore this email.');
  });

  it('has an HTML version with the code', function () {
    expect(m.html).to.contain('482913');
    expect(m.html).to.contain('5 minutes');
    expect(m.html).not.to.match(/<script/i);
  });

  it('sendOtp sends it to the voter from the default sender', async function () {
    await withEnv({ MAIL_FROM: '', SMTP_USER: 'ecn.otp@gmail.com' }, async function () {
      var before = mailer.outbox.length;
      await mailer.sendOtp('voter@example.com', '111222', 5);
      var sent = mailer.outbox[mailer.outbox.length - 1];
      expect(mailer.outbox.length).to.equal(before + 1);
      expect(sent.to).to.equal('voter@example.com');
      expect(sent.from).to.equal('"ECN E-Vote" <ecn.otp@gmail.com>');
      expect(sent.subject).to.equal('Your ECN E-Vote verification code');
      expect(sent.html).to.contain('111222');
    });
  });

  it('registration sends the new OTP message', async function () {
    var reg = await h.startRegistration();
    var sent = mailer.outbox.filter(function (x) { return x.to === reg.user.email_address; }).pop();
    expect(sent.subject).to.equal('Your ECN E-Vote verification code');
    expect(sent.text).to.contain(h.lastOtp(reg.user.email_address));
  });
});

describe('MAIL startup check', function () {
  it('skips the check for the in-memory test transport', async function () {
    var r = await mailer.verify();
    expect(r.ok).to.equal(true);
    expect(r.skipped).to.equal(true);
  });

  it('names the missing settings, without values, when SMTP is not set up', async function () {
    var r = await withEnv({ MAIL_TRANSPORT: '', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: '', SMTP_PASS: '' }, function () {
      return mailer.verify();
    });
    expect(r.ok).to.equal(false);
    expect(r.reason).to.equal('missing SMTP_USER, SMTP_PASS in .env');
  });

  it('describes a failed login by its code only, never the password', function () {
    var err = Object.assign(new Error('Invalid login: 535-5.7.8 Username and Password not accepted for pa55word'), { code: 'EAUTH', responseCode: 535 });
    var text = mailer.describeError(err);
    expect(text).to.equal('the mail server rejected the login (EAUTH 535)');
    expect(text).not.to.contain('pa55word');
    expect(mailer.describeError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).to.equal('could not reach the mail server (ETIMEDOUT)');
  });

  it('startup line: ready, or what is wrong and where to look', function () {
    expect(mailer.startupLine({ ok: true, from: '"ECN E-Vote" <a@b.c>' }))
      .to.equal('[mail] OTP emails will be sent from "ECN E-Vote" <a@b.c>');
    expect(mailer.startupLine({ ok: false, reason: 'missing SMTP_USER in .env' }))
      .to.equal('[mail] OTP emails are NOT working: missing SMTP_USER in .env. See SETUP.md, step 4.');
  });

  it('the SMTP transport has timeouts so a dead mail server cannot hang registration', function () {
    var opts = mailer.smtpOptions();
    expect(opts.connectionTimeout).to.equal(10000);
    expect(opts.greetingTimeout).to.equal(10000);
    expect(opts.socketTimeout).to.equal(20000);
  });

  it('the dev server runs the check, and npm run mail:test exists', function () {
    var root = path.join(__dirname, '..', '..');
    expect(fs.readFileSync(path.join(root, 'bs-config.js'), 'utf8')).to.contain("require('./lib/mailer').checkAtStartup()");
    expect(require(path.join(root, 'package.json')).scripts['mail:test']).to.equal('node scripts/mail-test.js');
    expect(fs.existsSync(path.join(root, 'scripts', 'mail-test.js'))).to.equal(true);
  });
});
