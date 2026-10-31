// npm run db:migrate: apply new db/migrations/*.sql to DB_NAME.
require('dotenv').config();
var mysql = require('mysql');
var lib = require('../lib/migrate');

var conn = mysql.createConnection(lib.adminConnectionConfig(process.env.DB_NAME));

lib.migrate(conn, console.log)
  .then(function (result) {
    if (!result.applied.length) {
      console.log('Database is up to date (' + result.total + ' migration(s) applied).');
    } else {
      console.log('Applied ' + result.applied.length + ' migration(s).');
    }
  })
  .catch(function (err) {
    console.error('Migration failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
