var express = require('express');

var router = express.Router();
var users = require('../lib/users');
var sessions = require('../lib/session');
/* GET users listing. */
router.get('/login', function(req, res, next) {
  res.render('login-form.ejs');
});

router.post('/login', function(req, res, next){
    var emailAddress = req.body.email_address;
    var password = req.body.password;

    users.verifyLogin(emailAddress, password).then(async function (user) {
        if(user){
            // SEC-5: new session id at login
            await sessions.startSession(req, { loggedinUser: true, emailAddress: emailAddress, role: user.role });
            res.redirect('/userInfo');
        }else{
            res.render('login-form.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    }).catch(next);

})

module.exports = router;
