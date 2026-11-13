// Loaded by mocha (--require) before any API test file. Points the app at the
// test database and rebuilds it, synchronously, so database.js can connect
// when the test files require the server.
var path = require('path');
var childProcess = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

process.env.NODE_ENV = 'test';
process.env.TEST_DB_NAME = process.env.TEST_DB_NAME || 'blockchainvoting_test';
process.env.DB_NAME = process.env.TEST_DB_NAME;
process.env.MAIL_TRANSPORT = 'memory';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.OTP_PEPPER = process.env.OTP_PEPPER || 'test-otp-pepper';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '1000';
// INT-2: createApp() uses the in-memory chain unless a test passes its own
process.env.CHAIN = 'fake';

childProcess.execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'db-reset-test.js')], {
  stdio: 'inherit',
  env: process.env
});
