// SEC-10: per-IP rate limits on the form POSTs and an account lockout after
// repeated failed logins (threat-model surfaces 4 and 5). Counters live in
// memory (D-001), and every createApp() call gets its own.
var expect = require('chai').expect;
var h = require('./helpers');

function wrongLogin(a, user) {
  return h.submitForm(a, '/login', '/login', { email_address: user.email_address, password: 'wrong password!' });
}

describe('SEC-10 rate limits and lockout', function () {
  it('6th POST /login in a minute from one IP gets 429', async function () {
    var u = await h.createUser();
    var a = h.agent({ rateLimitMax: 5 });
    var statuses = [];
    for (var i = 0; i < 6; i++) statuses.push((await wrongLogin(a, u)).status);
    expect(statuses).to.deep.equal([200, 200, 200, 200, 200, 429]);
  });

  it('the 429 page says to wait', async function () {
    var u = await h.createUser();
    var a = h.agent({ rateLimitMax: 1 });
    await wrongLogin(a, u);
    var res = await wrongLogin(a, u);
    expect(res.status).to.equal(429);
    expect(res.text).to.contain('Too many attempts. Please wait a minute and try again.');
  });

  ['/adlogin', '/register'].forEach(function (route) {
    it('limits POST ' + route + ' per IP', async function () {
      var a = h.agent({ rateLimitMax: 1 });
      await h.submitForm(a, route, route, { email_address: 'nobody@example.test', password: 'x' });
      var res = await h.submitForm(a, route, route, { email_address: 'nobody@example.test', password: 'x' });
      expect(res.status).to.equal(429);
    });
  });

  it('limits POST /registerdata and /otpverify per IP, each with its own budget', async function () {
    var u = await h.createUser();
    var a = h.agent({ rateLimitMax: 1 });
    expect((await h.login(a, u)).status).to.equal(302);
    var first = await h.submitForm(a, '/form', '/registerdata', { id_number: u.id_number, account_address: h.newWallet() });
    expect(first.status).to.equal(200);
    var second = await h.submitForm(a, '/form', '/registerdata', { id_number: u.id_number, account_address: h.newWallet() });
    expect(second.status).to.equal(429);
    var token = h.csrfFrom((await a.get('/form')).text);
    expect((await a.post('/otpverify').type('form').send({ otp: '000000', _csrf: token })).status).to.equal(200);
    expect((await a.post('/otpverify').type('form').send({ otp: '000000', _csrf: token })).status).to.equal(429);
  });

  it('locks an account after 10 failed logins even from fresh agents', async function () {
    var u = await h.createUser();
    var app = require('../../server').createApp({ rateLimitMax: 1000 });
    var request = require('supertest');
    for (var i = 0; i < 10; i++) {
      expect((await wrongLogin(request.agent(app), u)).status).to.equal(200);
    }
    var a = request.agent(app);
    var res = await h.login(a, u);
    expect(res.status).to.equal(429);
    var after = await a.get('/userInfo');
    expect(after.status).to.equal(302);
    expect(after.headers.location).to.equal('/login');
  });

  it('the lockout is per account, not per IP', async function () {
    var locked = await h.createUser();
    var other = await h.createUser();
    var app = require('../../server').createApp({ rateLimitMax: 1000 });
    var request = require('supertest');
    for (var i = 0; i < 10; i++) await wrongLogin(request.agent(app), locked);
    expect((await h.login(request.agent(app), other)).status).to.equal(302);
  });

  it('a successful login does not count toward lockout', async function () {
    var u = await h.createUser();
    var app = require('../../server').createApp({ rateLimitMax: 1000 });
    var request = require('supertest');
    for (var i = 0; i < 9; i++) await wrongLogin(request.agent(app), u);
    expect((await h.login(request.agent(app), u)).status).to.equal(302);
    // the 10th failure is still allowed because the success wasn't counted
    expect((await wrongLogin(request.agent(app), u)).status).to.equal(200);
  });

  it('email case does not get around the lockout', async function () {
    var u = await h.createUser();
    var app = require('../../server').createApp({ rateLimitMax: 1000 });
    var request = require('supertest');
    for (var i = 0; i < 10; i++) {
      var email = i % 2 ? u.email_address.toUpperCase() : u.email_address;
      await h.submitForm(request.agent(app), '/login', '/login', { email_address: email, password: 'wrong password!' });
    }
    expect((await h.login(request.agent(app), u)).status).to.equal(429);
  });
});
