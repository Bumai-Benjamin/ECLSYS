// UI audit: public results for pages that have no wallet (anyone may read the
// totals once voting is closed). Same source as the audit page: the contract.
var express = require('express');
var router = express.Router();
var ChainUnavailableError = require('../config/contract').ChainUnavailableError;

var DONE = 2;

router.get('/results.json', async function (req, res, next) {
  var data;
  try {
    data = await req.app.locals.chain.audit();
  } catch (err) {
    if (err instanceof ChainUnavailableError) return res.status(503).json({ error: err.message });
    return next(err);
  }
  var done = data.phase === DONE && Array.isArray(data.results);
  res.json({
    phase: data.phase,
    // SC-5: no totals before voting is closed
    candidates: done ? data.contestants.map(function (c, i) {
      return { id: c.id, name: c.name, party: c.party, voteCount: Number(data.results[i]) };
    }) : null
  });
});

module.exports = router;
