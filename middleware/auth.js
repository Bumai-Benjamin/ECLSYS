// SEC-2: login and role checks for pages and routes.

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedinUser) return next();
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.loggedinUser) return res.redirect('/adlogin');
  if (req.session.role !== 'admin') return res.status(403).send('Forbidden: this page is for election administrators.');
  next();
}

// Static files in src/ that must go through the same checks as their routes.
var ADMIN_FILES = ['/adminaddcandidate.html', '/adminchangephase.html', '/admincandidatedetails.html'];
var VOTER_FILES = ['/userinfo.html', '/voting.html', '/vote_area.html'];

// Reduce a request path to the file Windows would actually open: decode it,
// treat \ as /, drop NTFS stream suffixes (file::$DATA) and the trailing dots
// and spaces Windows ignores, resolve . and .., and lower-case it.
function canonicalPath(rawPath) {
  var p = decodeURIComponent(rawPath).replace(/\\/g, '/');
  var out = [];
  p.split('/').forEach(function (seg) {
    seg = seg.split(':')[0].replace(/[. ]+$/, function (m) { return seg === m ? m : ''; });
    if (seg === '' || seg === '.') return;
    if (seg === '..') { out.pop(); return; }
    out.push(seg.toLowerCase());
  });
  return '/' + out.join('/');
}

// Runs before express.static (and lite-server's own static server).
function protectStatic(req, res, next) {
  var p;
  try {
    p = canonicalPath(req.path);
  } catch (e) {
    return res.status(400).send('Bad request');
  }
  if (p.indexOf('/views/') === 0 || /\.ejs$/.test(p)) return res.status(404).send('Not found');
  if (ADMIN_FILES.indexOf(p) !== -1) return requireAdmin(req, res, next);
  if (VOTER_FILES.indexOf(p) !== -1) return requireLogin(req, res, next);
  next();
}

module.exports = {
  requireLogin: requireLogin,
  requireAdmin: requireAdmin,
  protectStatic: protectStatic,
  canonicalPath: canonicalPath
};
