// UI-6: one transaction at a time per action (Review Focus 5). While a run
// with the same key is in flight, another run is refused instead of sending a
// second transaction. Runs in the browser (window.Pending) and in Node.
(function (root) {
  var busy = {};

  // Returns fn's promise, or null (fn not called) when `key` is still running.
  function run(key, fn) {
    if (busy[key]) return null;
    var p;
    try {
      p = Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err);   // never became busy
    }
    busy[key] = true;
    var free = function () { delete busy[key]; };
    p.then(free, free);
    return p;
  }

  function isBusy(key) {
    return !!busy[key];
  }

  var api = { run: run, busy: isBusy };
  root.Pending = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
