// The mail service: sends OTP emails through SMTP from .env. One sending
// account (SMTP_USER) is the system's default sender; voters see it as
// "ECN E-Vote" unless MAIL_FROM says otherwise.
// With MAIL_TRANSPORT=memory (the API tests) nothing leaves the machine:
// messages are kept in `outbox`.
// Never log a message body, a code or SMTP_PASS (SEC-7).
var nodemailer = require('nodemailer');

var SENDER_NAME = 'ECN E-Vote';
var REQUIRED = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];

var outbox = [];
var transporter;

function isMemory() {
  return process.env.MAIL_TRANSPORT === 'memory';
}

// MAIL_FROM if set, otherwise "ECN E-Vote" <the sending account>.
function fromAddress() {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.SMTP_USER) return '"' + SENDER_NAME + '" <' + process.env.SMTP_USER + '>';
  return undefined;
}

function missingSettings() {
  return REQUIRED.filter(function (k) { return !process.env[k]; });
}

// Timeouts: a mail server that never answers fails the request in seconds
// (the voter is told to try again) instead of hanging the page.
function smtpOptions() {
  var port = Number(process.env.SMTP_PORT);
  return {
    host: process.env.SMTP_HOST,
    port: port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  };
}

function getTransporter() {
  if (transporter) return transporter;
  transporter = isMemory()
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport(smtpOptions());
  return transporter;
}

function sendMail(options) {
  var message = Object.assign({ from: fromAddress() }, options);
  if (isMemory()) outbox.push(message);
  return getTransporter().sendMail(message);
}

// The OTP email: plain text for every mail client, HTML for the rest.
// `code` is six digits made by lib/otp.js, so it needs no escaping.
function otpMessage(code, minutes) {
  var expiry = minutes + ' minutes';
  return {
    subject: 'Your ECN E-Vote verification code',
    text: [
      'Hello,',
      '',
      'Your ECN E-Vote verification code is: ' + code,
      '',
      'Enter it on the voter registration page within ' + expiry + '. The code works once.',
      '',
      'If you did not ask for this code, ignore this email.',
      '',
      'Electoral Commission of Namibia e-voting'
    ].join('\n'),
    html:
      '<div style="font-family:Roboto,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2328">' +
      '<p style="margin:0 0 4px;font-weight:700;color:#b93a3a">ECN E-Vote</p>' +
      '<h1 style="margin:0 0 16px;font-size:20px">Your verification code</h1>' +
      '<p style="margin:0 0 16px">Enter this code on the voter registration page within ' + expiry + '. The code works once.</p>' +
      '<p style="margin:0 0 16px;padding:14px 0;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;' +
      'background:#fdecec;border-radius:12px;color:#1f2328">' + code + '</p>' +
      '<p style="margin:0;color:#57606a;font-size:14px">If you did not ask for this code, ignore this email.</p>' +
      '</div>'
  };
}

function sendOtp(to, code, minutes) {
  // through module.exports so tests can stand in for sendMail
  return module.exports.sendMail(Object.assign({ to: to }, otpMessage(code, minutes)));
}

// What went wrong, by error code only: SMTP replies can echo what was sent.
function describeError(err) {
  var code = (err && err.code) || 'unknown error';
  var detail = err && err.responseCode ? code + ' ' + err.responseCode : code;
  if (code === 'EAUTH') return 'the mail server rejected the login (' + detail + ')';
  if (/^(ETIMEDOUT|ECONNECTION|ECONNREFUSED|ENOTFOUND|ESOCKET|EDNS)$/.test(code)) return 'could not reach the mail server (' + detail + ')';
  return 'sending failed (' + detail + ')';
}

// Can the server send? Logs in to the SMTP server without sending anything.
function verify() {
  if (isMemory()) return Promise.resolve({ ok: true, skipped: true });
  var missing = missingSettings();
  if (missing.length) return Promise.resolve({ ok: false, reason: 'missing ' + missing.join(', ') + ' in .env' });
  return getTransporter().verify().then(
    function () { return { ok: true, from: fromAddress() }; },
    function (err) { return { ok: false, reason: describeError(err) }; }
  );
}

function startupLine(result) {
  return result.ok
    ? '[mail] OTP emails will be sent from ' + result.from
    : '[mail] OTP emails are NOT working: ' + result.reason + '. See SETUP.md, step 4.';
}

// Called once when the dev server starts (bs-config.js).
function checkAtStartup() {
  return verify().then(function (result) {
    if (result.skipped) return result;
    (result.ok ? console.log : console.error)(startupLine(result));
    return result;
  });
}

module.exports = {
  sendMail: sendMail,
  sendOtp: sendOtp,
  otpMessage: otpMessage,
  fromAddress: fromAddress,
  smtpOptions: smtpOptions,
  verify: verify,
  describeError: describeError,
  startupLine: startupLine,
  checkAtStartup: checkAtStartup,
  outbox: outbox
};
