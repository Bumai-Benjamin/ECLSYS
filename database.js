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
  if (err) throw err;
  console.log('Database is connected successfully !');
  connection.release();
});
module.exports = conn;
