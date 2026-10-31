// npm run seed:admin -- <email> [--set-password] [--revoke]
// Makes an existing account an admin (or, with --revoke, a voter again).
// --set-password also sets a new password, read from SEED_ADMIN_PASSWORD or
// typed at a hidden prompt, so it never appears on the command line.
// The account must already exist: sign up at /register first.
require('dotenv').config();
var readline = require('readline');
var mysql = require('mysql');
var bcrypt = require('bcryptjs');
var lib = require('../lib/migrate');

var BCRYPT_COST = 12;
var args = process.argv.slice(2);
var revoke = args.indexOf('--revoke') !== -1;
var setPassword = args.indexOf('--set-password') !== -1;
var email = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];

if (!email) {
  console.error('Usage: npm run seed:admin -- <email> [--set-password] [--revoke]');
  process.exit(1);
}

function askHidden(prompt) {
  return new Promise(function (resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function (s) { if (s.indexOf(prompt) === 0) rl.output.write(s); };
    rl.question(prompt, function (answer) {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function newPassword() {
  var pw = process.env.SEED_ADMIN_PASSWORD;
  if (!pw) {
    if (!process.stdin.isTTY) throw new Error('Set SEED_ADMIN_PASSWORD or run in a terminal to type the password.');
    pw = await askHidden('New password for ' + email + ': ');
    var again = await askHidden('Repeat it: ');
    if (pw !== again) throw new Error('Passwords do not match.');
  }
  if (pw.length < 8) throw new Error('The password must be at least 8 characters.');
  return pw;
}

var role = revoke ? 'voter' : 'admin';
var conn = mysql.createConnection(lib.adminConnectionConfig(process.env.DB_NAME));
var query = lib.promisify(conn);

(async function () {
  var rows = await query('SELECT reg_id FROM registration WHERE email_address = ?', [email]);
  if (!rows.length) {
    throw new Error('No account with email ' + email + '. Sign up at /register first.');
  }
  var hash = setPassword ? await bcrypt.hash(await newPassword(), BCRYPT_COST) : null;
  if (hash) {
    await query('UPDATE registration SET role = ?, password = ? WHERE reg_id = ?', [role, hash, rows[0].reg_id]);
  } else {
    await query('UPDATE registration SET role = ? WHERE reg_id = ?', [role, rows[0].reg_id]);
  }
  console.log(email + ' is now ' + (revoke ? 'a voter' : 'an admin') + (hash ? ', with a new password' : '') + '.');
})()
  .catch(function (err) {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
