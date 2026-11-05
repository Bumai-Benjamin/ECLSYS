// UI-1: who is signed in, for the shared nav (shell.js) and the step tracker.
// Only what those need: never the email, ID number, date of birth or hash.
var express = require('express');
var router = express.Router();
var db = require('../database');

router.get('/me', function (req, res, next) {
  res.set('Cache-Control', 'no-store');
  if (!req.session || !req.session.loggedinUser || !req.session.emailAddress) {
    return res.json({ loggedIn: false });
  }
  db.query(
    'SELECT first_name, role, Is_registered, account_address FROM registration WHERE email_address = ?',
    [req.session.emailAddress],
    function (err, rows) {
      if (err) return next(err);
      if (!rows.length) return res.json({ loggedIn: false });
      var u = rows[0];
      var verified = String(u.Is_registered).toUpperCase() === 'YES';
      res.json({
        loggedIn: true,
        role: u.role === 'admin' ? 'admin' : 'voter',
        firstName: u.first_name,
        walletVerified: verified,
        wallet: verified && u.account_address ? u.account_address : null
      });
    });
});

module.exports = router;
