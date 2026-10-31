// SEC-1 / D2: only accounts with role='admin' can log in at /adlogin.
var path = require('path');
var childProcess = require('child_process');
var expect = require('chai').expect;
var h = require('./helpers');

function seedAdmin(args) {
  return childProcess.spawnSync(process.execPath,
    [path.join(__dirname, '..', '..', 'scripts', 'seed-admin.js')].concat(args),
    { env: process.env, encoding: 'utf8' });
}

describe('SEC-1 admin roles', function () {
  it('adds registration.role, defaulting to voter', async function () {
    var cols = await h.query("SHOW COLUMNS FROM registration LIKE 'role'");
    expect(cols).to.have.length(1);
    expect(cols[0].Type).to.equal("enum('voter','admin')");
    expect(cols[0].Default).to.match(/voter/);
  });

  it('marks the seeded admin@gmail.com account as admin', async function () {
    var rows = await h.query("SELECT role FROM registration WHERE email_address = 'admin@gmail.com'");
    expect(rows[0].role).to.equal('admin');
  });

  it('rejects a voter at /adlogin even with the right password (D2)', async function () {
    var voter = await h.createUser();
    var a = h.agent();
    var res = await h.adminLogin(a, voter);
    expect(res.status).to.equal(200);
    expect(res.headers.location).to.equal(undefined);
    expect(res.text).to.contain('Your Email Address or password is wrong');
  });

  it('logs an admin in at /adlogin and redirects to /addCandidate', async function () {
    var admin = await h.createUser({ role: 'admin' });
    var res = await h.adminLogin(h.agent(), admin);
    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal('/addCandidate');
  });

  it('npm run seed:admin promotes an existing account', async function () {
    var u = await h.createUser();
    var out = seedAdmin([u.email_address]);
    expect(out.status, out.stderr).to.equal(0);
    var rows = await h.query('SELECT role FROM registration WHERE reg_id = ?', [u.reg_id]);
    expect(rows[0].role).to.equal('admin');
  });

  it('seed:admin --revoke demotes an admin back to voter', async function () {
    var u = await h.createUser({ role: 'admin' });
    var out = seedAdmin([u.email_address, '--revoke']);
    expect(out.status, out.stderr).to.equal(0);
    var rows = await h.query('SELECT role FROM registration WHERE reg_id = ?', [u.reg_id]);
    expect(rows[0].role).to.equal('voter');
  });

  it('seed:admin fails clearly for an unknown email', function () {
    var out = seedAdmin(['nobody@example.test']);
    expect(out.status).to.not.equal(0);
    expect(out.stderr).to.contain('No account');
  });
});
