// SEC-12: the app connects as a least-privilege MySQL user (SELECT, INSERT,
// UPDATE; DELETE only on sessions), and security events go to audit_log
// (threat-model surface 4: privilege abuse).
var expect = require('chai').expect;
var h = require('./helpers');

var restricted = !!process.env.DB_ADMIN_USER && process.env.DB_ADMIN_USER !== process.env.DB_USER;

async function expectDenied(sql) {
  try {
    await h.query(sql);
  } catch (err) {
    expect(err.code).to.equal('ER_TABLEACCESS_DENIED_ERROR');
    return;
  }
  throw new Error('expected "' + sql + '" to be denied');
}

describe('SEC-12 least-privilege DB user and audit log', function () {
  describe('as the restricted app user', function () {
    before(function () {
      if (!restricted) this.skip();   // needs DB_ADMIN_USER different from DB_USER
    });

    it('app user cannot DELETE registration', function () {
      return expectDenied('DELETE FROM registration WHERE 1=0');
    });

    it('app user cannot DROP', function () {
      return expectDenied('DROP TABLE otp_codes');
    });

    it('app user cannot ALTER', function () {
      return expectDenied('ALTER TABLE registration ADD COLUMN pwned INT');
    });

    it('app user can still delete sessions (logout, expiry)', async function () {
      await h.query('DELETE FROM sessions WHERE 1=0');
    });
  });

  describe('audit.record', function () {
    var audit = require('../../lib/audit');

    it('writes a row', async function () {
      var action = 'test_' + Date.now();
      await audit.record(null, action, 'detail text');
      var rows = await h.query('SELECT actor_reg_id, action, detail, created_at FROM audit_log WHERE action = ?', [action]);
      expect(rows).to.have.length(1);
      expect(rows[0].actor_reg_id).to.equal(null);
      expect(rows[0].detail).to.equal('detail text');
      expect(rows[0].created_at).to.be.an.instanceof(Date);
    });

    it('never throws: a DB error is only logged', async function () {
      var db = require('../../database');
      var original = db.query;
      var logged = [];
      var originalError = console.error;
      db.query = function (sql, params, cb) { cb(Object.assign(new Error('boom'), { code: 'ER_X', errno: 1 })); };
      console.error = function (line) { logged.push(line); };
      try {
        await audit.record(1, 'admin_login');
      } finally {
        db.query = original;
        console.error = originalError;
      }
      expect(logged.join('\n')).to.contain('admin_login');
    });

    it('admin login is audited', async function () {
      var admin = await h.createUser({ role: 'admin' });
      var res = await h.adminLogin(h.agent(), admin);
      expect(res.status).to.equal(302);
      var rows = await h.query("SELECT 1 FROM audit_log WHERE actor_reg_id = ? AND action = 'admin_login'", [admin.reg_id]);
      expect(rows).to.have.length(1);
    });

    it('a failed admin login is not recorded as admin_login', async function () {
      var admin = await h.createUser({ role: 'admin' });
      await h.submitForm(h.agent(), '/adlogin', '/adlogin', { email_address: admin.email_address, password: 'wrong password!' });
      var rows = await h.query("SELECT 1 FROM audit_log WHERE actor_reg_id = ? AND action = 'admin_login'", [admin.reg_id]);
      expect(rows).to.have.length(0);
    });
  });
});
