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
async function createUser(overrides) {
  var u = newVoter(overrides);
  var md5 = require('md5');
  var res = await query(
    'INSERT INTO registration (id_number, first_name, last_name, email_address, gender, Dob, password, confirm_password, Is_registered, account_address, role) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [u.id_number, u.first_name, u.last_name, u.email_address, u.gender, u.Dob,
      md5(u.password), md5(u.password), 'No', '', u.role || 'voter']
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

module.exports = {
  query: query, agent: agent, csrfFrom: csrfFrom, submitForm: submitForm, newVoter: newVoter,
  createUser: createUser, login: login, adminLogin: adminLogin
};
