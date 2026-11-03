require('dotenv').config();
var mysql = require('mysql');
// a pool reconnects automatically if MySQL drops an idle connection
var conn = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});
conn.getConnection(function(err, connection) {
  if (err) {
    // SEC-7: a clear message instead of an uncaught exception from a callback
    console.error('Cannot connect to MySQL database "' + process.env.DB_NAME + '" as "' + process.env.DB_USER +
      '": ' + err.code + '. Is MySQL running in XAMPP, and are the DB_* settings in .env right?');
    process.exit(1);
  }
  console.log('Database is connected successfully !');
  connection.release();
});
module.exports = conn;
