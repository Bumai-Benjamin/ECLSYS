var express = require('express');
var router = express.Router();
var db=require('../database');
var app = express();
app.use(express.urlencoded());
app.set('view engine', 'ejs');
app.use(express.static('public'))
app.use('/css',express.static(__dirname + 'public/css'))

// to display registration form 
router.get('/register', function(req, res, next) {
  res.render('registration-form.ejs');
});


// to store user input detail on post request
router.post('/register', function(req, res, next) {
    const md5 = require('md5');
    inputData ={
        id_number: req.body.id_number,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        email_address: req.body.email_address,
        gender: req.body.gender,
        Dob: req.body.Dob,
        password: md5(req.body.password.toString()),
        confirm_password:md5(req.body.confirm_password.toString()),
        Is_registered:'No',
        account_address: '',
    }
    

var sql='SELECT * FROM registration WHERE email_address =?';
db.query(sql, [inputData.email_address] ,function (err, data, fields) {
 if(err) throw err
 if(data.length>1){
     var msg = inputData.email_address+ " was already exist ";
 
 }else if(inputData.confirm_password != inputData.password){
    var msg ="Password & Confirm Password is not Matched";
 }else{
     
    // save users data into database
    var sql = 'INSERT INTO registration SET ?';
    console.log(sql);
   db.query(sql, inputData, function (err, data) {
      if (err) throw err;
           });
  var msg ="Your are successfully registered";
 }
 res.render('registration-form.ejs',{alertMsg:msg});
})
     
});
module.exports = router;

