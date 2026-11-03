// SEC-7: last-resort error handler. The visitor sees a friendly page; the log
// gets the method, path and the error with any secrets masked. Request bodies,
// query strings and SQL are never logged, so passwords and OTPs can't leak there.

var SECRET_NAMES = /\b(password|otp|_csrf|SESSION_SECRET|OTP_PEPPER)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&]+)/gi;
var PRIVATE_KEY = /0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;

// Masks the values of known secret names and anything shaped like a private
// key (64 hex). Wallet addresses (40 hex) are left alone.
function redact(text) {
  return String(text)
    .replace(SECRET_NAMES, '$1$2[redacted]')
    .replace(PRIVATE_KEY, '[redacted]');
}

function describe(err) {
  if (!err) return 'Error';
  // mysql errors: code + errno is enough to diagnose; their messages can
  // quote values from the query (e.g. the duplicate email), so leave them out
  if (err.code && err.errno) return err.code + ' (errno ' + err.errno + ')';
  return redact(err.stack || ((err.name || 'Error') + ': ' + err.message));
}

function handler(err, req, res, next) {
  console.error('[error] ' + req.method + ' ' + req.path + ' -> ' + describe(err));
  if (res.headersSent) return next(err);
  res.status(err && err.status || 500).render('error.ejs', {
    message: 'The request could not be completed. Please try again in a moment.'
  });
}

module.exports = { handler: handler, redact: redact };
