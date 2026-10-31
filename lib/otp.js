// SEC-4: one-time codes. Each request gets its own random 6-digit code. Only
// an HMAC-SHA256 of it (keyed with OTP_PEPPER) is stored. A code expires
// after 5 minutes, allows 5 attempts and can be used once. Times come from
// MySQL's NOW() so the app and DB clocks can't disagree.
var crypto = require('crypto');
var users = require('./users');

var TTL_MINUTES = 5;
var MAX_ATTEMPTS = 5;

function hashCode(regId, purpose, code) {
  if (!process.env.OTP_PEPPER) throw new Error('OTP_PEPPER is not set');
  return crypto.createHmac('sha256', process.env.OTP_PEPPER)
    .update(regId + ':' + purpose + ':' + code)
    .digest('hex');
}

// Creates a new code for (regId, purpose), retiring any earlier unused one,
// and returns the plain code for the email.
async function issue(regId, purpose) {
  var code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await users.query(
    'UPDATE otp_codes SET attempts = ? WHERE reg_id = ? AND purpose = ? AND used_at IS NULL',
    [MAX_ATTEMPTS, regId, purpose]
  );
  await users.query(
    'INSERT INTO otp_codes (reg_id, code_hash, purpose, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL ' + TTL_MINUTES + ' MINUTE)',
    [regId, hashCode(regId, purpose, code), purpose]
  );
  return code;
}

// Returns 'ok', 'wrong' (attempts remain), 'locked' (no attempts left) or
// 'expired' (no live code: expired, used, or never issued).
async function verify(regId, purpose, code) {
  var rows = await users.query(
    'SELECT id, code_hash FROM otp_codes WHERE reg_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW() ' +
    'ORDER BY id DESC LIMIT 1',
    [regId, purpose]
  );
  if (!rows.length) return 'expired';
  var row = rows[0];

  // Count the attempt before checking it, atomically, so parallel guesses
  // can't get past the limit.
  var counted = await users.query(
    'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ?',
    [row.id, MAX_ATTEMPTS]
  );
  if (counted.affectedRows !== 1) return 'locked';

  var given = Buffer.from(hashCode(regId, purpose, String(code).trim()), 'hex');
  var stored = Buffer.from(row.code_hash, 'hex');
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
    var left = await users.query('SELECT attempts FROM otp_codes WHERE id = ?', [row.id]);
    return left[0].attempts >= MAX_ATTEMPTS ? 'locked' : 'wrong';
  }

  var used = await users.query('UPDATE otp_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [row.id]);
  return used.affectedRows === 1 ? 'ok' : 'expired';
}

module.exports = { issue: issue, verify: verify, TTL_MINUTES: TTL_MINUTES, MAX_ATTEMPTS: MAX_ATTEMPTS };
