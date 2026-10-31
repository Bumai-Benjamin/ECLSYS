var express = require('express');

var router = express.Router();
var db=require('../database');
var app = express();
app.use(express.static('public'))
app.use('/css',express.static(__dirname + 'public/css'))
/* GET users listing. */
router.get('/login', function(req, res, next) {
  res.render('login-form.ejs');
});

router.post('/login', function(req, res){
    const md5 = require('md5')
    var emailAddress = req.body.email_address;
    var password = req.body.password;
    

    var sql='SELECT * FROM registration WHERE email_address =? AND password =?';
    db.query(sql, [emailAddress, md5(password.toString())], function (err, data, fields) {
        if(err) throw err
        if(data.length>0){
            req.session.loggedinUser= true;
            req.session.emailAddress= emailAddress;
            res.redirect('/userInfo');
            // res.redirect('/blockchain');
        }else{
            res.render('login-form.ejs',{alertMsg:"Your Email Address or password is wrong"});
        }
    })

})

module.exports = router;

