// SEC-5: session middleware backed by MySQL, so sessions survive restarts and
// don't pile up in memory. One store per process, shared by every app
// instance (lite-server or the tests).
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);

var IDLE_TIMEOUT_MS = 30 * 60 * 1000;
var COOKIE_NAME = 'namvoting.sid';

var store;
function getStore() {
  if (!store) {
    store = new MySQLStore({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      createDatabaseTable: false,     // db/migrations/004_sessions.sql
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: IDLE_TIMEOUT_MS
    });
  }
  return store;
}

function middleware() {
  return session({
    name: COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    store: getStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,                    // each request restarts the 30-minute idle clock
    cookie: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',   // set when served over HTTPS
      maxAge: IDLE_TIMEOUT_MS
    }
  });
}

// Replaces the session with a fresh one (new id) and stores `fields` in it.
// Call at login so a session id known before login is useless afterwards.
function startSession(req, fields) {
  return new Promise(function (resolve, reject) {
    req.session.regenerate(function (err) {
      if (err) return reject(err);
      Object.assign(req.session, fields);
      req.session.save(function (err) {
        if (err) reject(err); else resolve();
      });
    });
  });
}

function endSession(req, res) {
  return new Promise(function (resolve) {
    req.session.destroy(function () {
      res.clearCookie(COOKIE_NAME);
      resolve();
    });
  });
}

module.exports = { middleware: middleware, startSession: startSession, endSession: endSession, COOKIE_NAME: COOKIE_NAME };
