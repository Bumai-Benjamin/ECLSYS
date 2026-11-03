// SEC-7 / D15: a database error gives the user a friendly 500 page instead of
// crashing the server, and the log line carries no passwords, OTPs or SQL.
var expect = require('chai').expect;
var h = require('./helpers');

// Capture console.error while fn runs.
async function captureErrors(fn) {
  var lines = [];
  var original = console.error;
  console.error = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return lines.join('\n');
}

// Temporarily rename a table so queries against it fail.
async function withTableMissing(table, fn) {
  await h.query('RENAME TABLE ?? TO ??', [table, table + '_hidden']);
  try {
    return await fn();
  } finally {
    await h.query('RENAME TABLE ?? TO ??', [table + '_hidden', table]);
  }
}

describe('SEC-7 error handling', function () {
  var admin;
  before(async function () {
    admin = await h.createUser({ role: 'admin' });
  });

  it('answers a DB failure on /table_view with a 500 page and keeps running', async function () {
    var a = h.agent();
    await h.adminLogin(a, admin);
    var res;
    await captureErrors(function () {
      return withTableMissing('registered_users', async function () { res = await a.get('/table_view'); });
    });
    expect(res.status).to.equal(500);
    expect(res.text).to.contain('Something went wrong');
    expect(res.text).to.not.match(/ER_NO_SUCH_TABLE|registered_users|\n\s+at /);
    var after = await a.get('/table_view');
    expect(after.status).to.equal(200);
  });

  it('keeps passwords out of the log when login fails on a DB error', async function () {
    var secret = 'S3cret-in-the-request-' + Date.now();
    var res;
    var log = await captureErrors(function () {
      return withTableMissing('registration', async function () {
        res = await h.submitForm(h.agent(), '/login', '/login', { email_address: 'x@example.test', password: secret });
      });
    });
    expect(res.status).to.equal(500);
    expect(log).to.contain('POST /login');
    expect(log).to.not.contain(secret);
    expect(log).to.not.contain('x@example.test');
  });

  it('keeps OTPs out of the log when verification fails on a DB error', async function () {
    var reg = await h.startRegistration();
    var code = h.lastOtp(reg.user.email_address);
    var res;
    var log = await captureErrors(function () {
      return withTableMissing('otp_codes', async function () { res = await h.submitOtp(reg, code); });
    });
    expect(res.status).to.equal(500);
    expect(log).to.contain('POST /otpverify');
    expect(log).to.not.contain(code);
  });

  describe('when a route throws an error carrying a secret', function () {
    var users = require('../../lib/users');
    var original = users.verifyLogin;
    beforeEach(function () {
      users.verifyLogin = function () { return Promise.reject(new Error('db down password=hunter2')); };
    });
    afterEach(function () { users.verifyLogin = original; });

    it('returns a friendly 500 page, and keeps serving', async function () {
      var a = h.agent();
      var res;
      await captureErrors(async function () {
        res = await h.submitForm(a, '/login', '/login', { email_address: 'x@example.test', password: 'whatever1' });
      });
      expect(res.status).to.equal(500);
      expect(res.text).to.contain('Something went wrong');
      expect(res.text).to.not.contain('hunter2');
      expect(res.text).to.not.contain('Error:');
      users.verifyLogin = original;
      expect((await a.get('/login')).status).to.equal(200);
    });

    it('logs the error with the secret redacted', async function () {
      var log = await captureErrors(function () {
        return h.submitForm(h.agent(), '/login', '/login', { email_address: 'x@example.test', password: 'whatever1' });
      });
      expect(log).to.contain('[redacted]');
      expect(log).to.not.contain('hunter2');
    });
  });

  describe('errors.redact', function () {
    var redact = require('../../middleware/errors').redact;
    it('masks password, otp, _csrf, SESSION_SECRET and OTP_PEPPER values and private keys', function () {
      var key = '0x' + 'ab'.repeat(32);
      var out = redact('password=p1 otp: 123456 _csrf=t0k SESSION_SECRET=s3 OTP_PEPPER=pp key ' + key);
      ['p1', '123456', 't0k', 's3', 'pp', key].forEach(function (s) { expect(out).to.not.contain(s); });
      expect(out.match(/\[redacted\]/g)).to.have.length(6);
    });
    it('leaves a wallet address (40 hex) alone', function () {
      var wallet = '0x' + 'ab'.repeat(20);
      expect(redact('wallet ' + wallet)).to.contain(wallet);
    });
  });

  describe('when the OTP email cannot be sent', function () {
    var mailer = require('../../lib/mailer');
    var original = mailer.sendMail;
    beforeEach(function () {
      mailer.sendMail = function () { return Promise.reject(new Error('smtp')); };
    });
    afterEach(function () { mailer.sendMail = original; });

    it('tells the voter, and shows no code-entry form', async function () {
      var reg;
      await captureErrors(async function () { reg = await h.startRegistration(); });
      expect(reg.res.text).to.contain("We couldn&#39;t send your code. Please try again in a few minutes.");
      expect(reg.res.text).to.not.contain('action="/otpverify"');
    });

    it('retires the code and the pending registration', async function () {
      var reg;
      await captureErrors(async function () { reg = await h.startRegistration(); });
      var live = await h.query(
        'SELECT COUNT(*) AS n FROM otp_codes WHERE reg_id = ? AND used_at IS NULL AND attempts < 5 AND expires_at > NOW()',
        [reg.user.reg_id]);
      expect(live[0].n).to.equal(0);
      var form = await reg.a.get('/form');
      var res = await reg.a.post('/otpverify').type('form').send({ otp: '000000', _csrf: h.csrfFrom(form.text) });
      expect(res.text).to.contain('No registration is in progress');
    });
  });
});
