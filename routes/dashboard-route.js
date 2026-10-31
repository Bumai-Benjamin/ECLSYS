var express = require('express');
var auth = require('../middleware/auth');
var router = express.Router();
/* GET users listing. */
router.get('/dashboard', auth.requireLogin, function(req, res, next) {
    res.render('dashboard.ejs',{email:req.session.emailAddress})
});
module.exports = router;
