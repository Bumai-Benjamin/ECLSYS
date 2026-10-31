var express = require('express');

var router = express.Router();
var users = require('../lib/users');
/* GET users listing. */
router.get('/login', function(req, res, next) {
  res.render('login-form.ejs');
});

router.post('/login', function(req, res, next){
    var emailAddress = req.body.email_address;
    var password = req.body.password;

    users.verifyLogin(emailAddress, password).then(function (user) {
        if(user){
            req.session.loggedinUser= true;
            req.session.emailAddress= emailAddress;
            req.session.role= user.role;
            res.redirect('/userInfo');
        }else{
            res.render('login-form.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    }).catch(next);

})

module.exports = router;
