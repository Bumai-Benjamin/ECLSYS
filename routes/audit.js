// INT-4: public audit page. Everything on it comes from the contract (events,
// phase, totals); nothing comes from the database, so no voter personal data
// can appear here.
var express = require('express');
var router = express.Router();
var ChainUnavailableError = require('../config/contract').ChainUnavailableError;

var PHASE_NAMES = ['Registration', 'Voting', 'Done'];
var DONE = 2;
var MAX_EVENTS = 500;

// VoteCast events per contestant id
function recount(events) {
  var counts = {};
  events.forEach(function (e) {
    if (e.event !== 'VoteCast') return;
    var id = Number(e.args.contestantId);
    counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
}

// Every contestant's re-count equals results()[id - 1], and no votes were
// counted for an id the contract doesn't know.
function recountMatches(counts, results) {
  var ids = Object.keys(counts).map(Number);
  if (ids.some(function (id) { return id < 1 || id > results.length; })) return false;
  return results.every(function (total, i) { return (counts[i + 1] || 0) === Number(total); });
}

router.get('/audit', async function (req, res, next) {
  var data;
  try {
    data = await req.app.locals.chain.audit();
  } catch (err) {
    if (err instanceof ChainUnavailableError) {
      return res.status(503).render('audit.ejs', { unavailable: err.message });
    }
    return next(err);
  }

  var counts = recount(data.events);
  var done = data.phase === DONE && Array.isArray(data.results);
  var rows = data.contestants.map(function (c, i) {
    return { id: c.id, name: c.name, recount: counts[c.id] || 0, total: done ? Number(data.results[i]) : null };
  });

  res.render('audit.ejs', {
    unavailable: null,
    contractAddress: data.contractAddress,
    phaseName: PHASE_NAMES[data.phase] || String(data.phase),
    done: done,
    matches: done ? recountMatches(counts, data.results) : null,
    rows: rows,
    events: data.events.slice(-MAX_EVENTS).reverse()
  });
});

module.exports = router;
