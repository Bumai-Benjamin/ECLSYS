// SEC-10: rate limits on the form POSTs and an account lockout after repeated
// failed logins. Counters are in memory (D-001): they reset when the server
// restarts and each createApp() gets its own, which keeps tests isolated.
var rateLimit = require('express-rate-limit').rateLimit;

var LIMITED_POSTS = ['/login', '/adlogin', '/register', '/registerdata', '/otpverify'];
var LOGIN_POSTS = ['/login', '/adlogin'];

function tooMany(message) {
  return function (req, res, next, options) {
    res.status(options.statusCode).render('error.ejs', { message: message });
  };
}

// Each route gets its own per-IP budget, so a voter who logs in and mistypes
// an OTP isn't also blocked from logging in again.
function perIpFor(max) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: tooMany('Too many attempts. Please wait a minute and try again.')
  });
}

function create(options) {
  options = options || {};
  var max = options.max != null ? options.max : (Number(process.env.RATE_LIMIT_MAX) || 5);

  var perIp = {};
  LIMITED_POSTS.forEach(function (path) { perIp[path] = perIpFor(max); });

  // 10 failures per account in 15 minutes, from any IP. A login succeeds
  // when it redirects; successes aren't counted.
  var loginLockout = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    requestWasSuccessful: function (req, res) { return res.statusCode === 302; },
    keyGenerator: function (req) {
      return 'account:' + String((req.body && req.body.email_address) || '').trim().toLowerCase();
    },
    handler: tooMany('Too many failed logins for this account. Please wait 15 minutes and try again.')
  });

  return { perIp: perIp, loginLockout: loginLockout };
}

// Mounts the limiters on their POST routes.
function apply(app, limits) {
  LIMITED_POSTS.forEach(function (path) { app.post(path, limits.perIp[path]); });
  LOGIN_POSTS.forEach(function (path) { app.post(path, limits.loginLockout); });
}

module.exports = { create: create, apply: apply };
