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

// Review Focus 2, the reverse case: the chain call threw (timeout, dropped
// connection) but the transaction was mined. The wallet is then on-chain and
// not in the DB, and only a chain_register_failed row remembers it.
async function minedDespiteFailure(chain, failedRows, dbRows) {
  var inDb = {};
  dbRows.forEach(function (r) { inDb[String(r.Account_address).toLowerCase()] = true; });
  var wallets = {};
  failedRows.forEach(function (r) {
    var m = /^(0x[0-9a-fA-F]{40}): /.exec(r.detail || '');
    if (m && !inDb[m[1].toLowerCase()] && !wallets[m[1].toLowerCase()]) {
      wallets[m[1].toLowerCase()] = { detail: m[1], actor_reg_id: r.actor_reg_id, created_at: r.created_at };
    }
  });
  var candidates = Object.keys(wallets).map(function (k) { return wallets[k]; });
  var onChain = await mapLimit(candidates, CONCURRENCY, async function (c) {
    try {
      return await chain.isRegistered(c.detail);
    } catch (err) {
      return false;   // the column already says Unknown when the chain is down
    }
  });
  return candidates.filter(function (c, i) { return onChain[i]; });
}

router.get('/table_view', auth.requireAdmin, async function(req, res, next) {
  try {
    var data = await query('SELECT * FROM registered_users');
    var mismatches = await query(
      "SELECT actor_reg_id, detail, created_at FROM audit_log WHERE action = 'chain_db_mismatch' ORDER BY id DESC");
    var failed = await query(
      "SELECT actor_reg_id, detail, created_at FROM audit_log WHERE action = 'chain_register_failed' ORDER BY id DESC");
    var statuses = await onChainStatus(req.app.locals.chain, data);
    mismatches = mismatches.concat(await minedDespiteFailure(req.app.locals.chain, failed, data));
    data.forEach(function (row, i) { row.onChain = statuses[i]; });
    res.render('adminVoterReg', { title: 'Registered Users List', userData: data, mismatches: mismatches });
  } catch (err) {
    // SEC-7: hand errors to the central handler; throwing here crashed the server
    next(err);
  }
});
module.exports = router;
