// ANON-2, ANON-3: the relayer. The voting page POSTs a Semaphore proof here
// and the server sends it to castVote from its relayer account, so the
// voter's wallet never appears in the vote transaction.
//
// The proof is the only permission: the route doesn't need a login, and the
// page sends the request without cookies, so the server never sees whose
// session a proof came from. Nothing about the request (IP, session, proof)
// is logged or stored. The web server still sees the connection's IP address
// while it answers; see docs/anonymity.md.
var express = require('express');
var router = express.Router();
var validate = require('../lib/validate');
var ChainUnavailableError = require('../config/contract').ChainUnavailableError;

var MESSAGES = {
  bad_request: 'That vote was not in the right format. Reload the page and try again.',
  already_voted: 'This voting key has already voted. Each voter can vote once.',
  voting_closed: 'Voting is not open.',
  invalid_candidate: 'That candidate is not on the ballot.',
  invalid_proof: 'The blockchain could not confirm that this vote comes from a registered voter. ' +
    'Reload the page and try again; if it keeps happening, check that you are using the wallet you registered.',
  unavailable: 'The blockchain is not available. Please try again later.',
  failed: 'Your vote could not be sent. Please try again.'
};

var STATUS = { bad_request: 400, invalid_candidate: 400, invalid_proof: 400, already_voted: 409, voting_closed: 409 };

function answer(res, status, code) {
  res.status(status).json({ error: code, message: MESSAGES[code] });
}

router.post('/api/vote', function (req, res) {
  var proof = validate.proof(req.body && req.body.proof);
  if (!proof) return answer(res, 400, 'bad_request');

  req.app.locals.chain.castVote(proof).then(function (receipt) {
    res.json({ txHash: receipt.txHash, blockNumber: receipt.blockNumber, nullifier: receipt.nullifier });
  }).catch(function (err) {
    if (err && err.name === 'VoteRejectedError' && STATUS[err.code]) return answer(res, STATUS[err.code], err.code);
    if (err instanceof ChainUnavailableError || (err && err.status === 503)) return answer(res, 503, 'unavailable');
    // No proof, IP or session in the log: only that a relay failed
    console.error('Relaying a vote failed: ' + (err && err.name));
    answer(res, 500, 'failed');
  });
});

module.exports = router;
