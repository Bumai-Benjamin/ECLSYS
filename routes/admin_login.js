var express = require('express');

var router = express.Router();
var users = require('../lib/users');
/* GET users listing. */
router.get('/adlogin', function(req, res, next) {
  res.render('admin_login.ejs');
});


router.post('/adlogin', function(req, res, next){
    var emailAddress = req.body.email_address;
    var password = req.body.password;

    // SEC-1: only admin accounts; a voter gets the same message as a wrong password
    users.verifyLogin(emailAddress, password, { adminOnly: true }).then(function (user) {
        if(user){
            req.session.loggedinUser= true;
            req.session.emailAddress= emailAddress;
            req.session.role= user.role;
            res.redirect('/addCandidate');
        }else{
            res.render('admin_login.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    }).catch(next);

})

module.exports = router;
