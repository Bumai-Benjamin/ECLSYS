// SEC-9: synchronizer-token CSRF protection (csurf is deprecated).
// Forms include <input type="hidden" name="_csrf" value="<%= csrfToken() %>">.
// The token is created only when a form is rendered, so plain page views
// don't create sessions. Every POST/PUT/PATCH/DELETE must send it back in
// the _csrf field or an X-CSRF-Token header.
var crypto = require('crypto');

var UNSAFE = { POST: true, PUT: true, PATCH: true, DELETE: true };

function tokenFor(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function matches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false;
  var a = Buffer.from(given);
  var b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function csrf(req, res, next) {
  res.locals.csrfToken = function () { return tokenFor(req); };
  if (!UNSAFE[req.method]) return next();

  var given = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  if (matches(given, req.session && req.session.csrfToken)) return next();

  res.status(403).render('error.ejs', {
    message: 'This form has expired or did not come from this site. Please go back, reload the page and try again.'
  });
}

module.exports = { csrf: csrf };
