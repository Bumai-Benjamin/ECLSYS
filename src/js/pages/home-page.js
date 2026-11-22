// Home page: the status pill shows the election phase read from the contract
// (GET /results.json, the same public data as /result). The contract has no
// dates, so the pill names the phase only.
// TODO: show "Voting opens <date>" once the election has a schedule to read.
// Runs in the browser (window.HomePage) and in Node for the tests.
(function (root) {
  var TEXT = ['Registration open', 'Voting open', 'Voting closed'];

  function statusText(phase) {
    return (phase === 0 || phase === 1 || phase === 2) ? TEXT[phase] : '';
  }

  var api = { statusText: statusText };
  root.HomePage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // ---- browser only ----
  if (typeof document === 'undefined' || typeof fetch !== 'function') return;
  var pill = document.getElementById('election-status');
  if (!pill) return;

  fetch('/results.json', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var text = data ? statusText(Number(data.phase)) : '';
      // blockchain not reachable: no pill rather than a guess
      if (!text) return;
      pill.textContent = text;
      pill.classList.toggle('is-closed', text === TEXT[2]);
      pill.hidden = false;
    })
    .catch(function () { /* the pill stays hidden */ });
})(typeof window !== 'undefined' ? window : this);
