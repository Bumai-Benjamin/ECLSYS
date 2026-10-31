// npm run seed:admin -- <email> [--revoke]
// Makes an existing account an admin (or, with --revoke, a voter again).
// The account must already exist: sign up at /register first.
require('dotenv').config();
var mysql = require('mysql');
var lib = require('../lib/migrate');

var args = process.argv.slice(2);
var revoke = args.indexOf('--revoke') !== -1;
var email = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];

if (!email) {
  console.error('Usage: npm run seed:admin -- <email> [--revoke]');
  process.exit(1);
}

var role = revoke ? 'voter' : 'admin';
var conn = mysql.createConnection(lib.adminConnectionConfig(process.env.DB_NAME));
var query = lib.promisify(conn);

(async function () {
  var res = await query('UPDATE registration SET role = ? WHERE email_address = ?', [role, email]);
  if (res.affectedRows === 0) {
    throw new Error('No account with email ' + email + '. Sign up at /register first.');
  }
  console.log(email + ' is now ' + (revoke ? 'a voter' : 'an admin') + '.');
})()
  .catch(function (err) {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
