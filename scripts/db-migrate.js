// Applies db/migrations/*.sql in filename order and records each one in
// schema_migrations, so running it again only applies new files.
require('dotenv').config();
var fs = require('fs');
var path = require('path');
var mysql = require('mysql');

var dir = path.join(__dirname, '..', 'db', 'migrations');

var conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  multipleStatements: true
});

function query(sql, params) {
  return new Promise(function (resolve, reject) {
    conn.query(sql, params, function (err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

async function main() {
  await query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
    '  name VARCHAR(255) PRIMARY KEY,' +
    '  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );
  var applied = (await query('SELECT name FROM schema_migrations')).map(function (r) { return r.name; });
  var files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(function (f) { return f.endsWith('.sql'); }).sort()
    : [];

  var pending = files.filter(function (f) { return applied.indexOf(f) === -1; });
  if (!pending.length) {
    console.log('Database is up to date (' + files.length + ' migration(s) applied).');
    return;
  }
  for (var f of pending) {
    console.log('Applying ' + f + ' ...');
    await query(fs.readFileSync(path.join(dir, f), 'utf8'));
    await query('INSERT INTO schema_migrations (name) VALUES (?)', [f]);
  }
  console.log('Applied ' + pending.length + ' migration(s).');
}

main()
  .catch(function (err) {
    console.error('Migration failed: ' + err.message);
    process.exitCode = 1;
  })
  .finally(function () { conn.end(); });
