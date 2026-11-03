// SEC-6: server-side input checks. Each returns an error message, or null
// when the input is fine.

var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var WALLET = /^0x[0-9a-fA-F]{40}$/;

function text(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function signup(body) {
  var idNumber = text(body.id_number);
  if (!/^\d{11}$/.test(idNumber)) return 'The ID number must be exactly 11 digits.';
  if (!text(body.first_name) || text(body.first_name).length > 150) return 'Please enter your first name (up to 150 characters).';
  if (!text(body.last_name) || text(body.last_name).length > 150) return 'Please enter your last name (up to 150 characters).';
  if (!text(body.gender) || text(body.gender).length > 10) return 'Please enter your gender (up to 10 characters).';
  var dob = text(body.Dob);
  if (!validDate(dob) || dob > new Date().toISOString().slice(0, 10) || dob < '1900-01-01') {
    return 'Please enter a valid date of birth.';
  }
  var email = text(body.email_address);
  if (!EMAIL.test(email) || email.length > 250) return 'Please enter a valid email address.';
  var password = body.password === undefined ? '' : String(body.password);
  if (password.length < 8) return 'The password must be at least 8 characters.';
  // bcrypt only uses the first 72 bytes; refuse longer rather than silently truncate
  if (Buffer.byteLength(password, 'utf8') > 72) return 'The password can be at most 72 bytes long.';
  if (String(body.confirm_password) !== password) return 'Password & Confirm Password is not Matched';
  return null;
}

function wallet(address) {
  return WALLET.test(text(address)) ? null : 'Please enter a valid wallet address (0x followed by 40 hex characters).';
}

module.exports = { signup: signup, wallet: wallet, text: text };
