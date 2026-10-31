var express = require('express');

var router = express.Router();
var users = require('../lib/users');
var sessions = require('../lib/session');
/* GET users listing. */
router.get('/adlogin', function(req, res, next) {
  res.render('admin_login.ejs');
});


router.post('/adlogin', function(req, res, next){
    var emailAddress = req.body.email_address;
    var password = req.body.password;

    // SEC-1: only admin accounts; a voter gets the same message as a wrong password
    users.verifyLogin(emailAddress, password, { adminOnly: true }).then(async function (user) {
        if(user){
            // SEC-5: new session id at login
            await sessions.startSession(req, { loggedinUser: true, emailAddress: emailAddress, role: user.role });
            res.redirect('/addCandidate');
        }else{
            res.render('admin_login.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    }).catch(next);

})

module.exports = router;
