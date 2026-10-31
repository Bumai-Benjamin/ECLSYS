var mysql = require('mysql');
// a pool reconnects automatically if MySQL drops an idle connection
var conn = mysql.createPool({
  connectionLimit: 10,
  host: 'localhost', // assign your host name
  user: 'root',      //  assign your database username
  password: '',      // assign your database password
  database: 'blockchainvoting' // assign database Name
});
conn.getConnection(function(err, connection) {
  if (err) throw err;
  console.log('Database is connected successfully !');
  connection.release();
});
module.exports = conn;