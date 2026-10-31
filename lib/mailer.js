// Sends mail through SMTP from .env. With MAIL_TRANSPORT=memory (the API
// tests) nothing leaves the machine: messages are kept in `outbox`.
var nodemailer = require('nodemailer');

var outbox = [];
var transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.MAIL_TRANSPORT === 'memory') {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

function sendMail(options) {
  var message = Object.assign({ from: process.env.MAIL_FROM }, options);
  if (process.env.MAIL_TRANSPORT === 'memory') outbox.push(message);
  return getTransporter().sendMail(message);
}

module.exports = { sendMail: sendMail, outbox: outbox };
