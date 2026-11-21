require('dotenv').config();
// fail fast instead of running with missing configuration
var missingEnv = ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET', 'OTP_PEPPER'].filter(function (k) { return !process.env[k]; });
if (missingEnv.length) {
  throw new Error('Missing required settings in .env: ' + missingEnv.join(', ') + ' (copy .env.example to .env)');
}

var app = require('./server').createApp();

// one line in the log: can OTP emails be sent? (logs in to SMTP, sends nothing)
require('./lib/mailer').checkAtStartup();

module.exports = {
  "server": {
    "baseDir": ["./src", "./build/contracts"],
    "routes": {
      "/node_modules": "node_modules"
    },
    middleware: {
      1: app,
  },
},
port:3000,
};
