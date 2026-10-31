// Recreates the API test database: the v1.0.1 schema from db/baseline, then
// every migration, so each test run also proves the migrations upgrade an old
// database. Refuses to touch any database whose name doesn't end in _test.
require('dotenv').config();
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');
var lib = require('../lib/migrate');

var name = process.env.TEST_DB_NAME || 'blockchainvoting_test';
if (!/_test$/.test(name)) {
  console.error('Refusing to reset "' + name + '": test database names must end in _test.');
  process.exit(1);
}

var baseline = fs.readFileSync(path.join(__dirname, '..', 'db', 'baseline', 'ecl-v1.0.1.sql'), 'utf8');
var conn = mysql.createConnection(lib.adminConnectionConfig(undefined));
var query = lib.promisify(conn);

(async function () {
  await query('DROP DATABASE IF EXISTS ??', [name]);
  await query('CREATE DATABASE ?? CHARACTER SET latin1', [name]);
  await query('USE ??', [name]);
  await query(baseline);
  await lib.migrate(conn);
  // SEC-12: let the restricted app user (if configured) use the test database too.
  if (process.env.DB_ADMIN_USER && process.env.DB_USER && process.env.DB_USER !== process.env.DB_ADMIN_USER) {
    await query('GRANT SELECT, INSERT, UPDATE ON ??.* TO ?@?', [name, process.env.DB_USER, 'localhost']);
    await query('GRANT DELETE ON ??.sessions TO ?@?', [name, process.env.DB_USER, 'localhost']);
  }
})()
  .catch(function (err) {
    console.error('Resetting ' + name + ' failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
