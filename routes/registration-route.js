var express = require('express');
var router = express.Router();
var db=require('../database');
var users=require('../lib/users');

// to display registration form
router.get('/register', function(req, res, next) {
  res.render('registration-form.ejs');
});


// to store user input detail on post request
router.post('/register', function(req, res, next) {
    var inputData ={
        id_number: req.body.id_number,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email_address: req.body.email_address,
        gender: req.body.gender,
        Dob: req.body.Dob,
        Is_registered:'No',
        account_address: '',
    }
    var password = String(req.body.password);
    var confirmPassword = String(req.body.confirm_password);


var sql='SELECT * FROM registration WHERE email_address =?';
db.query(sql, [inputData.email_address] ,function (err, data, fields) {
 if(err) throw err
 if(data.length>1){
     var msg = inputData.email_address+ " was already exist ";
     return res.render('registration-form.ejs',{alertMsg:msg});
 }else if(confirmPassword != password){
    var msg ="Password & Confirm Password is not Matched";
    return res.render('registration-form.ejs',{alertMsg:msg});
 }
 // SEC-3: bcrypt; confirm_password is checked above but never stored
 users.hashPassword(password).then(function (hash) {
    inputData.password = hash;
    // save users data into database
    var sql = 'INSERT INTO registration SET ?';
    db.query(sql, inputData, function (err, data) {
      if (err) return next(err);
      res.render('registration-form.ejs',{alertMsg:"Your are successfully registered"});
    });
 }).catch(next);
})

});
module.exports = router;

