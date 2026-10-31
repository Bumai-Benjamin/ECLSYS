// SEC-5 / D6: sessions in MySQL, secret from .env, httpOnly + SameSite=Strict
// cookies with a 30-minute idle timeout, new session id at login, destroyed
// at logout.
var request = require('supertest');
var expect = require('chai').expect;
var h = require('./helpers');
var server = require('../../server');

var COOKIE = 'namvoting.sid';

function sessionCookie(res) {
  var all = res.headers['set-cookie'] || [];
  return all.filter(function (c) { return c.indexOf(COOKIE + '=') === 0; })[0];
}

function sidOf(cookie) {
  // s%3A<id>.<signature>
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]).slice(2).split('.')[0];
}

describe('SEC-5 sessions', function () {
  it('creates the sessions table', async function () {
    var cols = (await h.query('SHOW COLUMNS FROM sessions')).map(function (c) { return c.Field; });
    expect(cols).to.have.members(['session_id', 'expires', 'data']);
  });

  it('sets an httpOnly, SameSite=Strict cookie that idles out after 30 minutes', async function () {
    var u = await h.createUser();
    var res = await h.login(h.agent(), u);
    var c = sessionCookie(res);
    expect(c, 'session cookie').to.be.a('string');
    expect(c).to.match(/HttpOnly/i);
    expect(c).to.match(/SameSite=Strict/i);
    var expires = new Date(/Expires=([^;]+)/i.exec(c)[1]).getTime();
    expect(expires - Date.now()).to.be.within(29 * 60 * 1000, 30 * 60 * 1000 + 5000);
  });

  it('stores the session in MySQL', async function () {
    var u = await h.createUser();
    var res = await h.login(h.agent(), u);
    var rows = await h.query('SELECT data FROM sessions WHERE session_id = ?', [sidOf(sessionCookie(res))]);
    expect(rows).to.have.length(1);
    expect(rows[0].data).to.contain(u.email_address);
  });

  it('keeps the user logged in across a server restart', async function () {
    var u = await h.createUser();
    var res = await h.login(h.agent(), u);
    var cookie = sessionCookie(res).split(';')[0];
    var restarted = server.createApp();
    var page = await request(restarted).get('/userInfo').set('Cookie', cookie);
    expect(page.status).to.equal(200);
  });

  it('issues a new session id at login', async function () {
    var a = h.agent();
    var first = sessionCookie(await h.login(a, await h.createUser()));
    var second = sessionCookie(await h.login(a, await h.createUser()));
    expect(sidOf(second)).to.not.equal(sidOf(first));
    var old = await h.query('SELECT 1 FROM sessions WHERE session_id = ?', [sidOf(first)]);
    expect(old).to.have.length(0);
  });

  it('destroys the session at logout', async function () {
    var u = await h.createUser();
    var a = h.agent();
    var cookie = sessionCookie(await h.login(a, u));
    await a.get('/logout');
    var rows = await h.query('SELECT 1 FROM sessions WHERE session_id = ?', [sidOf(cookie)]);
    expect(rows).to.have.length(0);
    var replay = await request(server.createApp()).get('/userInfo').set('Cookie', cookie.split(';')[0]);
    expect(replay.status).to.equal(302);
    expect(replay.headers.location).to.equal('/login');
  });

  it('logs the user out once the session has expired', async function () {
    var u = await h.createUser();
    var cookie = sessionCookie(await h.login(h.agent(), u));
    await h.query('UPDATE sessions SET expires = UNIX_TIMESTAMP() - 1 WHERE session_id = ?', [sidOf(cookie)]);
    var res = await request(server.createApp()).get('/userInfo').set('Cookie', cookie.split(';')[0]);
    expect(res.status).to.equal(302);
    expect(res.headers.location).to.equal('/login');
  });

  it('rejects a cookie signed with a different secret', async function () {
    var forged = COOKIE + '=' + encodeURIComponent('s:abc.' + 'x'.repeat(43));
    var res = await request(server.createApp()).get('/userInfo').set('Cookie', forged);
    expect(res.status).to.equal(302);
  });
});
