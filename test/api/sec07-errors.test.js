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
});
