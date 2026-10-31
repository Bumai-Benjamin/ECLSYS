// The Express app. bs-config.js mounts it inside lite-server; the API tests
// mount it directly with supertest.
var path = require('path');
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');

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

  app.use(express.static(path.join(__dirname, 'src')));

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000 * 300 }
  }));

  app.use('/', registrationRouter);
  app.use('/', loginRouter);
  app.use('/', dashboardRouter);
  app.use('/', logoutRouter);
  app.use('/', RegisterRouter);
  app.use('/', AdminLogin);
  app.use('/', Tableview);

  app.get('/vote_area', page('vote_area.html'));
  app.get('/candidateDetails', page('adminCandidateDetails.html'));
  app.get('/userInfo', page('userInfo.html'));
  app.get('/result', page('result.html'));
  app.get('/addCandidate', page('adminAddCandidate.html'));
  app.get('/changePhase', page('adminChangePhase.html'));
  app.get('/voting', page('voting.html'));

  app.get('/hello', function (req, res) {
    res.send('hello');
  });

  return app;
}

module.exports = { createApp: createApp };
