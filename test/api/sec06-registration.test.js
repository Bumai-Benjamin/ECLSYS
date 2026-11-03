// SEC-6 / D8, D9: unique email and ID number, the "already registered"
// check works, and sign-up / voter-registration input is validated on the
// server.
var expect = require('chai').expect;
var h = require('./helpers');
var mailer = require('../../lib/mailer');

function signUp(fields) {
  return h.submitForm(h.agent(), '/register', '/register', fields);
}

async function countByEmail(email) {
  return (await h.query('SELECT COUNT(*) AS n FROM registration WHERE email_address = ?', [email]))[0].n;
}

describe('SEC-6 registration', function () {
  it('has unique indexes on email_address and id_number', async function () {
    var idx = await h.query('SHOW INDEX FROM registration WHERE Non_unique = 0');
    var cols = idx.map(function (i) { return i.Column_name; });
    expect(cols).to.include.members(['email_address', 'id_number']);
  });

  it('accepts a valid sign-up', async function () {
    var u = h.newVoter();
    var res = await signUp(u);
    expect(res.text).to.contain('successfully registered');
    expect(await countByEmail(u.email_address)).to.equal(1);
  });

  it('rejects the first duplicate email (D9)', async function () {
    var u = h.newVoter();
    await signUp(u);
    var res = await signUp(Object.assign(h.newVoter(), { email_address: u.email_address }));
    expect(res.text).to.contain('already exists');
    expect(await countByEmail(u.email_address)).to.equal(1);
  });

  it('rejects a duplicate ID number', async function () {
    var u = h.newVoter();
    await signUp(u);
    var other = Object.assign(h.newVoter(), { id_number: u.id_number });
    var res = await signUp(other);
    expect(res.text).to.contain('already exists');
    expect(await countByEmail(other.email_address)).to.equal(0);
  });

  it('lets only one of two simultaneous identical sign-ups through', async function () {
    var u = h.newVoter();
    await Promise.all([signUp(u), signUp(u)]);
    expect(await countByEmail(u.email_address)).to.equal(1);
  });

  var INVALID = [
    ['an ID number with 10 digits', { id_number: '9001010111' }, 'ID number'],
    ['an ID number with 12 digits', { id_number: '900101011122' }, 'ID number'],
    ['an ID number with letters', { id_number: '90010A01011' }, 'ID number'],
    ['a malformed email', { email_address: 'not-an-email' }, 'email'],
    ['a 7-character password', { password: 'short12', confirm_password: 'short12' }, 'at least 8'],
    ['a password over 72 bytes', { password: 'x'.repeat(73), confirm_password: 'x'.repeat(73) }, '72'],
    ['passwords that differ', { confirm_password: 'something else entirely' }, 'not Matched'],
    ['a date of birth in the future', { Dob: '2999-01-01' }, 'date of birth'],
    ['a date of birth that is not a date', { Dob: 'yesterday' }, 'date of birth'],
    ['an empty first name', { first_name: '   ' }, 'first name'],
    ['a missing last name', { last_name: undefined }, 'last name']
  ];
  INVALID.forEach(function (c) {
    it('rejects ' + c[0], async function () {
      var u = Object.assign(h.newVoter(), c[1]);
      var res = await signUp(u);
      expect(res.status).to.equal(200);
      expect(res.text).to.contain(c[2]);
      expect(res.text).to.not.contain('successfully registered');
      expect(await countByEmail(u.email_address)).to.equal(0);
    });
  });

  it('stops an already-registered voter from registering again (D8)', async function () {
    var reg = await h.startRegistration();
    var done = await h.submitOtp(reg, h.lastOtp(reg.user.email_address));
    expect(done.text).to.contain('You are successfully registered');
    var before = mailer.outbox.length;
    var again = await h.submitForm(reg.a, '/form', '/registerdata', { id_number: reg.user.id_number, account_address: h.newWallet() });
    expect(again.text).to.contain('You are already registered');
    expect(mailer.outbox.length).to.equal(before);
  });

  ['0x123', 'abc', '0x' + 'g'.repeat(40), '0x' + 'a'.repeat(41)].forEach(function (addr) {
    it('rejects the wallet address ' + addr, async function () {
      var user = await h.createUser();
      var a = h.agent();
      await h.login(a, user);
      var before = mailer.outbox.length;
      var res = await h.submitForm(a, '/form', '/registerdata', { id_number: user.id_number, account_address: addr });
      expect(res.text).to.contain('wallet address');
      expect(mailer.outbox.length).to.equal(before);
    });
  });

  it("rejects a wallet already registered to another voter", async function () {
    var first = await h.startRegistration();
    await h.submitOtp(first, h.lastOtp(first.user.email_address));
    var user = await h.createUser();
    var a = h.agent();
    await h.login(a, user);
    var res = await h.submitForm(a, '/form', '/registerdata', { id_number: user.id_number, account_address: first.wallet.toUpperCase().replace('0X', '0x') });
    expect(res.text).to.contain('already registered to another voter');
  });
});
