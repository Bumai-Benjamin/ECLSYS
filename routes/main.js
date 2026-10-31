var express = require('express');
var router = express.Router();
/* GET users listing. */
// const express=require('express');
// const app=express()
var conn=require('../database');

router.get('/form', function(req, res, next) {
  // res.render('voter-registration.ejs');
  if(req.session.loggedinUser){
    res.render('voter-registration.ejs')
  }else{
    res.redirect('/login');
  }
});


var getAge = require('get-age');


var nodemailer = require('nodemailer');
var rand=Math.floor((Math.random() * 10000) + 54);
var transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

var account_address;
var data;

router.post('/registerdata',function(req,res){
    var dob=[];
    data=req.body.id_number;    //data stores aadhar no
    console.log(data);
    account_address=req.body.account_address;     //stores metamask acc address
    //console.log(data);
    let sql = "SELECT * FROM registration WHERE id_number = ?" ;   
    conn.query(sql, data, (error, results, fields) => {
        if (error) {
          return console.error(error.message);
        }
        //console.log(results)
        dob = results[0].Dob;
        var email=results[0].email_address;
        age = getAge(dob);
        is_registerd=results[0].is_registerd;
        if (is_registerd!='YES')
        {
          if (age>=18)
          {
            var mailOptions = {
                from: process.env.MAIL_FROM,
                to: email,
                subject : "ECL - Please confirm your Email account",
                text : "Hello, Your otp is "+rand+". Please enter this otp to verify your email address."
              };
            transporter.sendMail(mailOptions, function(error, info){
                if (error) {
                  console.log(error);
                } 
                else {
                  console.log('Email sent: ' + info.response);
                }
              });
            res.render('emailverify.ejs');
          }
          else
          {
            res.send('You cannot vote as your age is less than 18');
          }
        }
        else    //IF USER ALREADY REGISTERED
        {
          res.render('voter-registration.ejs',{alertMsg:"You are already registered. You cannot register again"});
        }
        
    });

})

router.post('/otpverify', (req, res) => {
    var otp = req.body.otp;
    if (otp==rand) 
    {
        var record= { Account_address: account_address, Is_registered : 'Yes' };
        var sql="INSERT INTO registered_users SET ?";
        conn.query(sql,record, function(err2,res2)
          {
              if (err2){
             throw err2;
            }
              else{
                var sql1="Update registration set Is_registered=?,account_address=?  Where id_number=?";
                var record1=['YES',record.Account_address,data]
                console.log(data)
                conn.query(sql1,record1, function(err1,res1)
                {
                   if (err1) {
                    res.render('voter-registration.ejs');
                   }
                   else{
                    console.log("1 record updated");
                    var msg = "You are successfully registered";
                    // res.send('You are successfully registered');
                    res.render('voter-registration.ejs',{alertMsg:msg});                 
                  }
                }); 
               
              }
          }); 
    }
    else 
    {
       res.render('voter-registration.ejs',{alertMsg:"Session Expired! , You have entered wronge OTP "});
    }
})


module.exports = router;