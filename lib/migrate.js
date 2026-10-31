// Applies db/migrations/*.sql in filename order and records each one in
// schema_migrations, so running it again only applies new files.
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');

var MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Connection settings for schema changes. SEC-12 gives the app's own DB user
// no ALTER/CREATE rights, so migrations use DB_ADMIN_* when they are set.
function adminConnectionConfig(database) {
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_ADMIN_USER || process.env.DB_USER,
    password: process.env.DB_ADMIN_USER ? (process.env.DB_ADMIN_PASS || '') : process.env.DB_PASS,
    database: database,
    multipleStatements: true
  };
}

function promisify(conn) {
  return function query(sql, params) {
    return new Promise(function (resolve, reject) {
      conn.query(sql, params, function (err, rows) {
        if (err) reject(err); else resolve(rows);
      });
    });
  };
}

async function migrate(conn, log) {
  log = log || function () {};
  var query = promisify(conn);
  await query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
    '  name VARCHAR(255) PRIMARY KEY,' +
    '  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  var applied = (await query('SELECT name FROM schema_migrations')).map(function (r) { return r.name; });
  var files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(function (f) { return f.endsWith('.sql'); }).sort()
    : [];

  var pending = files.filter(function (f) { return applied.indexOf(f) === -1; });
  for (var f of pending) {
    log('Applying ' + f + ' ...');
    await query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
    await query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
  }
  return { total: files.length, applied: pending };
}

module.exports = { migrate: migrate, adminConnectionConfig: adminConnectionConfig, promisify: promisify };
