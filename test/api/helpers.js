// Shared helpers for the API tests.
var request = require('supertest');
var db = require('../../database');
var server = require('../../server');

function query(sql, params) {
  return new Promise(function (resolve, reject) {
    db.query(sql, params, function (err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// Schema changes in tests (e.g. renaming a table to simulate a DB failure)
// need the admin account: the SEC-12 app user has no ALTER/DROP rights.
function adminQuery(sql, params) {
  var mysql = require('mysql');
  var conn = mysql.createConnection(require('../../lib/migrate').adminConnectionConfig(process.env.DB_NAME));
  return new Promise(function (resolve, reject) {
    conn.query(sql, params, function (err, rows) {
      conn.end();
      if (err) reject(err); else resolve(rows);
    });
  });
}

// A supertest agent keeps cookies, so it behaves like one browser.
function agent(options) {
  return request.agent(server.createApp(options));
}

// Pulls the CSRF token out of a rendered form (SEC-9). Returns undefined when
// the page has none.
function csrfFrom(html) {
  var m = /name="_csrf" value="([^"]+)"/.exec(html);
  return m ? m[1] : undefined;
}

// GET the form page, then POST to it with that page's CSRF token.
async function submitForm(a, formPath, postPath, fields) {
  var page = await a.get(formPath);
  var body = Object.assign({ _csrf: csrfFrom(page.text) }, fields);
  return a.post(postPath).type('form').send(body);
}

var counter = 0;
// A unique, valid sign-up for each call, so tests don't collide.
function newVoter(overrides) {
  counter += 1;
  var n = String(Date.now() % 1e6).padStart(6, '0') + String(counter).padStart(3, '0');
  return Object.assign({
    id_number: ('90' + n).slice(0, 11).padEnd(11, '0'),
    first_name: 'Test',
    last_name: 'Voter' + counter,
    gender: 'Female',
    Dob: '1990-05-01',
    email_address: 'voter' + n + '@example.test',
    password: 'correct horse battery',
    confirm_password: 'correct horse battery'
  }, overrides);
}

// Inserts an account straight into the DB (no email/OTP) and returns it.
// { legacyMd5: true } stores the old v1.0.1 unsalted MD5 hash instead of bcrypt.
async function createUser(overrides) {
  overrides = overrides || {};
  var u = newVoter(overrides);
  var hash = overrides.legacyMd5
    ? require('md5')(u.password)
    : await require('../../lib/users').hashPassword(u.password);
  var res = await query(
    'INSERT INTO registration (id_number, first_name, last_name, email_address, gender, Dob, password, Is_registered, account_address, role) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [u.id_number, u.first_name, u.last_name, u.email_address, u.gender, u.Dob,
      hash, 'No', '', u.role || 'voter']
  );
  u.reg_id = res.insertId;
  return u;
}

async function login(a, user) {
  return submitForm(a, '/login', '/login', { email_address: user.email_address, password: user.password });
}

async function adminLogin(a, user) {
  return submitForm(a, '/adlogin', '/adlogin', { email_address: user.email_address, password: user.password });
}

// A valid-looking wallet address, unique per call.
function newWallet() {
  counter += 1;
  return '0x' + (Date.now().toString(16) + String(counter)).padStart(40, 'a').slice(-40);
}

// The newest OTP mailed to `email` (lib/mailer memory outbox).
function lastOtp(email) {
  var outbox = require('../../lib/mailer').outbox;
  for (var i = outbox.length - 1; i >= 0; i--) {
    if (outbox[i].to === email) {
      var m = /\b(\d{6})\b/.exec(outbox[i].text);
      return m && m[1];
    }
  }
  return undefined;
}

// Logged-in voter who has asked for a registration OTP. Returns { a, user, wallet, res }.
async function startRegistration(userOverrides) {
  var user = await createUser(userOverrides);
  var a = agent();
  await login(a, user);
  var wallet = newWallet();
  var res = await submitForm(a, '/form', '/registerdata', { id_number: user.id_number, account_address: wallet });
  return { a: a, user: user, wallet: wallet, res: res };
}

// POST a code to /otpverify, using the CSRF token from the code-entry page.
function submitOtp(reg, otp) {
  return reg.a.post('/otpverify').type('form').send({ otp: otp, _csrf: csrfFrom(reg.res.text) });
}

module.exports = {
  query: query, adminQuery: adminQuery, agent: agent, csrfFrom: csrfFrom, submitForm: submitForm, newVoter: newVoter,
  createUser: createUser, login: login, adminLogin: adminLogin,
  newWallet: newWallet, lastOtp: lastOtp, startRegistration: startRegistration, submitOtp: submitOtp
};
