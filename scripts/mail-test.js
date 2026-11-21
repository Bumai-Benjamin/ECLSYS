// npm run mail:test -- you@example.com
// Checks the SMTP settings in .env and sends one test email (no OTP code) to
// the given address, so the default sender can be tried before a voter needs it.
require('dotenv').config();
var mailer = require('../lib/mailer');

var to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
  console.error('Usage: npm run mail:test -- you@example.com');
  process.exit(1);
}

(async function () {
  var check = await mailer.verify();
  console.log(mailer.startupLine(check));
  if (!check.ok) process.exit(1);
  try {
    await mailer.sendMail({
      to: to,
      subject: 'ECN E-Vote test email',
      text: 'This is a test from ECN E-Vote. If you can read it, the system can send verification codes.'
    });
    console.log('[mail] Test email sent to ' + to + '. Check the inbox and the spam folder.');
  } catch (err) {
    console.error('[mail] The test email failed: ' + mailer.describeError(err));
    process.exit(1);
  }
})();
