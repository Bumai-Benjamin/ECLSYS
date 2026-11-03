// SEC-12: append-only log of security events in audit_log. Actions used:
// 'admin_login', 'voter_registered', 'chain_register_failed', 'chain_db_mismatch'.
// Recording never fails the request: a DB error is only logged.
var db = require('../database');

var MAX_DETAIL = 500;

function record(actorRegId, action, detail) {
  return new Promise(function (resolve) {
    var row = {
      actor_reg_id: actorRegId == null ? null : actorRegId,
      action: action,
      detail: detail == null ? null : String(detail).slice(0, MAX_DETAIL)
    };
    db.query('INSERT INTO audit_log SET ?', row, function (err) {
      if (err) console.error('[audit] could not record ' + action + ': ' + (err.code || err.message));
      resolve();
    });
  });
}

module.exports = { record: record };
