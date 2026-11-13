// npm run db:create-user (SEC-12): creates the app's least-privilege MySQL
// user DB_USER@localhost with password DB_PASS. It may SELECT, INSERT and
// UPDATE in DB_NAME, and DELETE only from sessions (logout and expiry).
// Connects as DB_ADMIN_USER. Safe to run again: it resets the password and
// grants. The API test database gets the same grants when it is rebuilt.
require('dotenv').config();
var mysql = require('mysql');
var lib = require('../lib/migrate');

var user = process.env.DB_USER;
var admin = process.env.DB_ADMIN_USER;
var problem =
  !admin ? 'Set DB_ADMIN_USER (and DB_ADMIN_PASS) in .env to an account that can create users, e.g. root.' :
  !user || user === admin ? 'Set DB_USER in .env to the app user to create, e.g. namvoting_app (not ' + admin + ').' :
  !process.env.DB_PASS ? 'Set DB_PASS in .env to a password for ' + user + '.' :
  null;
if (problem) {
  console.error(problem);
  process.exit(1);
}

var HOST = 'localhost';
var conn = mysql.createConnection(lib.adminConnectionConfig(undefined));
var query = lib.promisify(conn);

(async function () {
  var db = process.env.DB_NAME;
  // MySQL 8 defaults to caching_sha2_password, which the `mysql` driver can't
  // log in with (ER_NOT_SUPPORTED_AUTH_MODE). MariaDB (XAMPP) has no such plugin
  // and its default already works.
  var version = (await query('SELECT VERSION() AS v'))[0].v;
  var identified = /mariadb/i.test(version) ? 'IDENTIFIED BY ?' : 'IDENTIFIED WITH mysql_native_password BY ?';
  await query('CREATE USER IF NOT EXISTS ?@? ' + identified, [user, HOST, process.env.DB_PASS]);
  await query('ALTER USER ?@? ' + identified, [user, HOST, process.env.DB_PASS]);
  // start from nothing so a re-run also removes rights granted by hand
  await query('REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?', [user, HOST]);
  await query('GRANT SELECT, INSERT, UPDATE ON ??.* TO ?@?', [db, user, HOST]);
  await query('GRANT DELETE ON ??.sessions TO ?@?', [db, user, HOST]);
  console.log(user + '@' + HOST + ' can now SELECT, INSERT and UPDATE in ' + db + ', and DELETE from ' + db + '.sessions.');
})()
  .catch(function (err) {
    console.error('Creating the DB user failed: ' + (err.code || err.message));
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
