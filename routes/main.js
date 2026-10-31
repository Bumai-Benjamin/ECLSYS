var express = require('express');
var router = express.Router();
var conn=require('../database');
var auth=require('../middleware/auth');
var otp=require('../lib/otp');
var mailer=require('../lib/mailer');
var getAge = require('get-age');

var OTP_PURPOSE = 'register_vote';

// SEC-2: voter registration is only for logged-in users
router.use(['/form', '/registerdata', '/otpverify'], auth.requireLogin);

router.get('/form', function(req, res, next) {
  res.render('voter-registration.ejs')
});

function query(sql, params) {
  return new Promise(function (resolve, reject) {
    conn.query(sql, params, function (err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// Marks the voter registered and records their wallet, both or neither.
function completeRegistration(pending) {
  return new Promise(function (resolve, reject) {
    conn.getConnection(function (err, c) {
      if (err) return reject(err);
      function fail(e) { c.rollback(function () { c.release(); reject(e); }); }
      c.beginTransaction(function (err) {
        if (err) { c.release(); return reject(err); }
        c.query('INSERT INTO registered_users SET ?', { Account_address: pending.accountAddress, Is_registered: 'Yes' }, function (err) {
          if (err) return fail(err);
          c.query('UPDATE registration SET Is_registered = ?, account_address = ? WHERE reg_id = ?',
            ['YES', pending.accountAddress, pending.regId], function (err) {
              if (err) return fail(err);
              c.commit(function (err) {
                if (err) return fail(err);
                c.release();
                resolve();
              });
            });
        });
      });
    });
  });
}

router.post('/registerdata', function(req, res, next){
    var idNumber = String(req.body.id_number || '');
    var accountAddress = String(req.body.account_address || '');

    // Only the logged-in user's own ID number; otherwise anyone could send
    // OTP emails to other people and try to attach a wallet to their ID.
    query('SELECT * FROM registration WHERE id_number = ? AND email_address = ?', [idNumber, req.session.emailAddress])
      .then(async function (results) {
        if (!results.length) {
          return res.render('voter-registration.ejs', { alertMsg: 'That ID number does not match your account.' });
        }
        var user = results[0];
        var is_registerd = user.is_registerd;
        if (is_registerd == 'YES') {    //IF USER ALREADY REGISTERED
          return res.render('voter-registration.ejs',{alertMsg:"You are already registered. You cannot register again"});
        }
        if (getAge(user.Dob) < 18) {
          return res.send('You cannot vote as your age is less than 18');
        }

        // SEC-4 / D7: the registration in progress belongs to this session only
        var code = await otp.issue(user.reg_id, OTP_PURPOSE);
        req.session.pendingRegistration = { regId: user.reg_id, accountAddress: accountAddress };

        mailer.sendMail({
          to: user.email_address,
          subject: "ECL - Please confirm your Email account",
          text: "Hello, Your otp is " + code + ". It expires in " + otp.TTL_MINUTES + " minutes. Please enter this otp to verify your email address."
        }).catch(function (err) {
          console.error('Sending the OTP email failed: ' + err.message);
        });
        res.render('emailverify.ejs');
      })
      .catch(next);
})

router.post('/otpverify', function(req, res, next) {
    var pending = req.session.pendingRegistration;
    if (!pending) {
      return res.render('voter-registration.ejs', { alertMsg: 'No registration is in progress. Please start the registration again.' });
    }

    otp.verify(pending.regId, OTP_PURPOSE, req.body.otp)
      .then(async function (result) {
        if (result === 'wrong') {
          return res.render('emailverify.ejs', { alertMsg: 'That code is wrong. Please try again.' });
        }
        if (result !== 'ok') {
          delete req.session.pendingRegistration;
          var why = result === 'locked' ? 'Too many wrong codes.' : 'The code has expired.';
          return res.render('voter-registration.ejs', { alertMsg: why + ' Please start the registration again to get a new code.' });
        }
        delete req.session.pendingRegistration;
        await completeRegistration(pending);
        res.render('voter-registration.ejs', { alertMsg: 'You are successfully registered' });
      })
      .catch(next);
})


module.exports = router;
