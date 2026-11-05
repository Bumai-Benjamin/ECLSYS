// The Express app. bs-config.js mounts it inside lite-server; the API tests
// mount it directly with supertest.
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var helmet = require('helmet');
var sessions = require('./lib/session');
var auth = require('./middleware/auth');
var errors = require('./middleware/errors');
var csrf = require('./middleware/csrf');
var limits = require('./middleware/limits');

var registrationRouter = require('./routes/registration-route');
var loginRouter = require('./routes/login-route');
var dashboardRouter = require('./routes/dashboard-route');
var logoutRouter = require('./routes/logout-route');
var RegisterRouter = require('./routes/main');
var AdminLogin = require('./routes/admin_login');
var Tableview = require('./routes/table_view');
var AuditPage = require('./routes/audit');
var MeRoute = require('./routes/me');

// SEC-11: scripts only from this site. Stylesheets and fonts may come from the
// CDNs the pages already use; MetaMask's fallback provider talks to Ganache.
// No upgrade-insecure-requests: the app and Ganache run over plain HTTP.
var CSP = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://maxcdn.bootstrapcdn.com', 'https://use.fontawesome.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://maxcdn.bootstrapcdn.com', 'https://use.fontawesome.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'http://127.0.0.1:7545', 'http://localhost:7545'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
  }
};

function page(file) {
  return function (req, res) {
    res.sendFile(path.join(__dirname, 'src', file));
  };
}

// INT-2: the contract wrapper the routes use (req.app.locals.chain). API tests
// set CHAIN=fake to get the in-memory fake; creating the real one doesn't
// connect, so a stopped Ganache only shows when a page needs the chain.
function defaultChain() {
  if (process.env.CHAIN === 'fake') return require('./test/api/fakes').fakeChain();
  return require('./lib/chain').create();
}

// options.rateLimitMax: per-IP POST limit per minute (SEC-10; tests set it)
// options.chain: lib/chain or a fake with the same methods (INT-2)
function createApp(options) {
  options = options || {};
  var app = express();
  app.locals.chain = options.chain || defaultChain();
  app.use(helmet({ contentSecurityPolicy: CSP }));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bodyParser.json());

  app.set('views', path.join(__dirname, 'src', 'views'));
  app.set('view engine', 'ejs');

  app.use(sessions.middleware());

  // SEC-2: guard the raw .html files and hide templates before any static
  // server (this one or lite-server's) can serve them.
  app.use(auth.protectStatic);
  app.use(express.static(path.join(__dirname, 'src')));

  // SEC-9: token for forms, checked on every POST
  app.use(csrf.csrf);

  // SEC-10: new in-memory counters for every app (D-001)
  limits.apply(app, limits.create({ max: options.rateLimitMax }));

  app.use('/', registrationRouter);
  app.use('/', loginRouter);
  app.use('/', dashboardRouter);
  app.use('/', logoutRouter);
  app.use('/', RegisterRouter);
  app.use('/', AdminLogin);
  app.use('/', Tableview);
  app.use('/', AuditPage);   // INT-4: public
  app.use('/', MeRoute);     // UI-1: who is signed in (no personal data)

  app.get('/vote_area', auth.requireLogin, page('vote_area.html'));
  app.get('/candidateDetails', auth.requireAdmin, page('adminCandidateDetails.html'));
  app.get('/userInfo', auth.requireLogin, page('userInfo.html'));
  app.get('/result', page('result.html'));
  app.get('/addCandidate', auth.requireAdmin, page('adminAddCandidate.html'));
  app.get('/changePhase', auth.requireAdmin, page('adminChangePhase.html'));
  app.get('/voting', auth.requireLogin, page('voting.html'));

  app.get('/hello', function (req, res) {
    res.send('hello');
  });

  // SEC-7: must be registered last
  app.use(errors.handler);

  return app;
}

module.exports = { createApp: createApp };
