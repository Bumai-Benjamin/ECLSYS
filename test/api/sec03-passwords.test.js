// SEC-3 / D5: bcrypt (cost 12) instead of unsalted MD5; MD5 hashes are
// upgraded on the next successful login; confirm_password is not stored.
var path = require('path');
var childProcess = require('child_process');
var expect = require('chai').expect;
var h = require('./helpers');

var BCRYPT_12 = /^\$2[aby]\$12\$/;

async function storedHash(email) {
  var rows = await h.query('SELECT password FROM registration WHERE email_address = ?', [email]);
  return rows[0] && rows[0].password;
}

describe('SEC-3 password hashing', function () {
  it('drops the confirm_password column', async function () {
    var cols = await h.query("SHOW COLUMNS FROM registration LIKE 'confirm_password'");
    expect(cols).to.have.length(0);
  });

  it('stores new sign-ups as bcrypt cost 12', async function () {
    var u = h.newVoter();
    var res = await h.submitForm(h.agent(), '/register', '/register', u);
    expect(res.status).to.equal(200);
    expect(await storedHash(u.email_address)).to.match(BCRYPT_12);
  });

  it('logs in a bcrypt account', async function () {
    var u = await h.createUser();
    var res = await h.login(h.agent(), u);
    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal('/userInfo');
  });

  it('upgrades a legacy MD5 hash to bcrypt on successful login', async function () {
    var u = await h.createUser({ legacyMd5: true });
    expect(await storedHash(u.email_address)).to.match(/^[0-9a-f]{32}$/);
    var res = await h.login(h.agent(), u);
    expect(res.status).to.equal(302);
    expect(await storedHash(u.email_address)).to.match(BCRYPT_12);
    // and the upgraded hash still works
    res = await h.login(h.agent(), u);
    expect(res.status).to.equal(302);
  });

  it('leaves a legacy MD5 hash alone after a wrong password', async function () {
    var u = await h.createUser({ legacyMd5: true });
    var before = await storedHash(u.email_address);
    var res = await h.login(h.agent(), Object.assign({}, u, { password: 'wrong password!' }));
    expect(res.status).to.equal(200);
    expect(res.text).to.contain('Your Email Address or password is wrong');
    expect(await storedHash(u.email_address)).to.equal(before);
  });

  it('upgrades a legacy MD5 admin at /adlogin too', async function () {
    var u = await h.createUser({ legacyMd5: true, role: 'admin' });
    var res = await h.adminLogin(h.agent(), u);
    expect(res.status).to.equal(302);
    expect(await storedHash(u.email_address)).to.match(BCRYPT_12);
  });

  it('rejects the MD5 hash itself used as the password', async function () {
    var u = await h.createUser({ legacyMd5: true });
    var hash = await storedHash(u.email_address);
    var res = await h.login(h.agent(), Object.assign({}, u, { password: hash }));
    expect(res.status).to.equal(200);
  });

  it('seed:admin --set-password sets a bcrypt password for the admin', async function () {
    var u = await h.createUser();
    var out = childProcess.spawnSync(process.execPath,
      [path.join(__dirname, '..', '..', 'scripts', 'seed-admin.js'), u.email_address, '--set-password'],
      { env: Object.assign({}, process.env, { SEED_ADMIN_PASSWORD: 'a brand new admin pass' }), encoding: 'utf8' });
    expect(out.status, out.stderr).to.equal(0);
    expect(await storedHash(u.email_address)).to.match(BCRYPT_12);
    var res = await h.adminLogin(h.agent(), Object.assign({}, u, { password: 'a brand new admin pass' }));
    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal('/addCandidate');
  });
});
