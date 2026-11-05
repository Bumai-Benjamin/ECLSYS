var express = require('express');
var router = express.Router();
var db=require('../database');
var auth=require('../middleware/auth');

var CONCURRENCY = 10;
var STATUS = {
  yes: 'Yes',
  mismatch: 'No ⚠ mismatch',
  unknown: 'Unknown (blockchain unavailable)'
};

function query(sql, params) {
  return new Promise(function (resolve, reject) {
    db.query(sql, params, function (err, rows) {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// Runs fn over items with at most `limit` calls in flight; results keep their order.
async function mapLimit(items, limit, fn) {
  var results = new Array(items.length);
  var next = 0;
  async function worker() {
    while (next < items.length) {
      var i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(limit, items.length); w++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// INT-3: each DB wallet with its on-chain status (Review Focus 2). One failed
// lookup marks that row Unknown; the page itself never fails on the chain.
async function onChainStatus(chain, rows) {
  return mapLimit(rows, CONCURRENCY, async function (row) {
    try {
      return (await chain.isRegistered(row.Account_address)) ? STATUS.yes : STATUS.mismatch;
    } catch (err) {
      return STATUS.unknown;
    }
  });
}

router.get('/table_view', auth.requireAdmin, async function(req, res, next) {
  try {
    var data = await query('SELECT * FROM registered_users');
    var mismatches = await query(
      "SELECT actor_reg_id, detail, created_at FROM audit_log WHERE action = 'chain_db_mismatch' ORDER BY id DESC");
    var statuses = await onChainStatus(req.app.locals.chain, data);
    data.forEach(function (row, i) { row.onChain = statuses[i]; });
    res.render('adminVoterReg', { title: 'Registered Users List', userData: data, mismatches: mismatches });
  } catch (err) {
    // SEC-7: hand errors to the central handler; throwing here crashed the server
    next(err);
  }
});
module.exports = router;
