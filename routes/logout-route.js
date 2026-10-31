var express = require('express');
var router = express.Router();
var sessions = require('../lib/session');
/* GET users listing. */
router.get('/logout', function(req, res) {
  // SEC-5: remove the session from the store and the cookie from the browser
  sessions.endSession(req, res).then(function () {
    res.redirect('/');
  });
});
module.exports = router;
