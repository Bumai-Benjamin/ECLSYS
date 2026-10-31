// Account lookups and password checks shared by the login routes (SEC-3).
var crypto = require('crypto');
var bcrypt = require('bcryptjs');
var md5 = require('md5');
var db = require('../database');

var BCRYPT_COST = 12;
var LEGACY_MD5 = /^[0-9a-f]{32}$/i;
// Compared against when the email is unknown, so a miss takes as long as a hit.
var DUMMY_HASH = bcrypt.hashSync('not a real password', BCRYPT_COST);

function query(sql, params) {
  return new Promise(function (resolve, reject) {
    db.query(sql, params, function (err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
}

function md5Matches(password, stored) {
  var a = Buffer.from(md5(String(password)), 'utf8');
  var b = Buffer.from(String(stored).toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns the account row when email and password match (and, with
// { adminOnly: true }, the account is an admin), otherwise null. A v1.0.1 MD5
// hash that matches is replaced with a bcrypt hash on the spot.
async function verifyLogin(email, password, options) {
  options = options || {};
  var sql = 'SELECT * FROM registration WHERE email_address = ?' + (options.adminOnly ? " AND role = 'admin'" : '');
  var rows = await query(sql, [String(email)]);
  var user = rows[0];
  if (!user) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    return null;
  }
  if (LEGACY_MD5.test(user.password)) {
    if (!md5Matches(password, user.password)) return null;
    var upgraded = await hashPassword(password);
    await query('UPDATE registration SET password = ? WHERE reg_id = ? AND password = ?', [upgraded, user.reg_id, user.password]);
    user.password = upgraded;
    return user;
  }
  return (await bcrypt.compare(String(password), user.password)) ? user : null;
}

module.exports = { hashPassword: hashPassword, verifyLogin: verifyLogin, query: query, BCRYPT_COST: BCRYPT_COST };
