var express = require('express');
var router = express.Router();
var users=require('../lib/users');
var validate=require('../lib/validate');

// to display registration form
router.get('/register', function(req, res, next) {
  res.render('registration-form.ejs');
});


// to store user input detail on post request
router.post('/register', function(req, res, next) {
    // SEC-6: validate on the server, not just in the browser
    var problem = validate.signup(req.body);
    if (problem) {
        return res.render('registration-form.ejs',{alertMsg:problem});
    }
    var inputData ={
        id_number: validate.text(req.body.id_number),
        first_name: validate.text(req.body.first_name),
        last_name: validate.text(req.body.last_name),
        email_address: validate.text(req.body.email_address),
        gender: validate.text(req.body.gender),
        Dob: validate.text(req.body.Dob),
        Is_registered:'No',
        account_address: '',
    }
    var taken = 'An account with this email address or ID number already exists.';

    users.query('SELECT reg_id FROM registration WHERE email_address = ? OR id_number = ?', [inputData.email_address, inputData.id_number])
      .then(async function (data) {
        if (data.length > 0) {     // D9: was > 1, which let the first duplicate through
            return res.render('registration-form.ejs',{alertMsg:taken});
        }
        // SEC-3: bcrypt; confirm_password is checked above but never stored
        inputData.password = await users.hashPassword(String(req.body.password));
        try {
            await users.query('INSERT INTO registration SET ?', inputData);
        } catch (err) {
            // two identical sign-ups at once: the unique index stops the second
            if (err.code === 'ER_DUP_ENTRY') return res.render('registration-form.ejs',{alertMsg:taken});
            throw err;
        }
        res.render('registration-form.ejs',{alertMsg:"Your are successfully registered"});
      })
      .catch(next);
});
module.exports = router;
