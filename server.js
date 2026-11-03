// The Express app. bs-config.js mounts it inside lite-server; the API tests
// mount it directly with supertest.
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var sessions = require('./lib/session');
var auth = require('./middleware/auth');
var errors = require('./middleware/errors');
var csrf = require('./middleware/csrf');

var registrationRouter = require('./routes/registration-route');
var loginRouter = require('./routes/login-route');
var dashboardRouter = require('./routes/dashboard-route');
var logoutRouter = require('./routes/logout-route');
var RegisterRouter = require('./routes/main');
var AdminLogin = require('./routes/admin_login');
var Tableview = require('./routes/table_view');

function page(file) {
  return function (req, res) {
    res.sendFile(path.join(__dirname, 'src', file));
  };
}

function createApp() {
  var app = express();
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

  app.use('/', registrationRouter);
  app.use('/', loginRouter);
  app.use('/', dashboardRouter);
  app.use('/', logoutRouter);
  app.use('/', RegisterRouter);
  app.use('/', AdminLogin);
  app.use('/', Tableview);

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
