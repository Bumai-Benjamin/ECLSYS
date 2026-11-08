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

// ANON: Semaphore values are field elements of the BN254 curve.
var SNARK_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
var DECIMAL = /^\d{1,78}$/;

function fieldElement(v) {
  var s = text(v);
  if (!DECIMAL.test(s)) return false;
  return BigInt(s) < SNARK_FIELD;
}

function commitment(value) {
  var s = text(value);
  if (!fieldElement(s) || BigInt(s) === BigInt(0)) {
    return 'We could not create your voting key. Press "Send me a code" again and approve the signature in MetaMask.';
  }
  return null;
}

// The proof POSTed to /api/vote, as castVote takes it. Returns the cleaned
// proof (all decimal strings), or null when it isn't one.
function proof(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  var depth = Number(p.merkleTreeDepth);
  if (!Number.isInteger(depth) || depth < 1 || depth > 32) return null;
  var fields = ['merkleTreeRoot', 'nullifier', 'message', 'scope'];
  for (var i = 0; i < fields.length; i++) {
    if (!DECIMAL.test(text(p[fields[i]]))) return null;
  }
  if (!Array.isArray(p.points) || p.points.length !== 8) return null;
  if (!p.points.every(function (x) { return DECIMAL.test(text(x)); })) return null;
  return {
    merkleTreeDepth: String(depth),
    merkleTreeRoot: text(p.merkleTreeRoot),
    nullifier: text(p.nullifier),
    message: text(p.message),
    scope: text(p.scope),
    points: p.points.map(text)
  };
}

module.exports = { signup: signup, wallet: wallet, text: text, commitment: commitment, proof: proof };
