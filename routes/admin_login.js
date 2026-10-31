var express = require('express');

var router = express.Router();
var db=require('../database');
/* GET users listing. */
router.get('/adlogin', function(req, res, next) {
  res.render('admin_login.ejs');
});


router.post('/adlogin', function(req, res){
    const md5 = require('md5');
    var emailAddress = req.body.email_address;
    var password = req.body.password;


    // SEC-1: only admin accounts; a voter gets the same message as a wrong password
    var sql="SELECT * FROM registration WHERE email_address =? AND password =? AND role='admin'";
    db.query(sql, [emailAddress, md5(password.toString())], function (err, data, fields) {
        if(err) throw err
        if(data.length>0){
            req.session.loggedinUser= true;
            req.session.emailAddress= emailAddress;
            req.session.role= data[0].role;
            res.redirect('/addCandidate');
        }else{
            res.render('admin_login.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    })

})

module.exports = router;

