// UI-6: one transaction at a time per action, so a double click can't send
// two (Review Focus 5).
var expect = require('chai').expect;
var Pending = require('../../src/js/pending');

function deferred() {
  var d = {};
  d.promise = new Promise(function (resolve, reject) { d.resolve = resolve; d.reject = reject; });
  return d;
}

describe('UI-6 pending guard', function () {
  it('second run with the same key while busy returns null and does not call fn', async function () {
    var d = deferred();
    var calls = 0;
    var first = Pending.run('vote-a', function () { calls += 1; return d.promise; });
    expect(Pending.busy('vote-a')).to.equal(true);
    var second = Pending.run('vote-a', function () { calls += 1; return Promise.resolve(); });
    expect(second).to.equal(null);
    expect(calls).to.equal(1);
    d.resolve('done');
    expect(await first).to.equal('done');
  });

  it('different keys run in parallel', function () {
    var d1 = deferred();
    var d2 = deferred();
    expect(Pending.run('k1', function () { return d1.promise; })).to.not.equal(null);
    expect(Pending.run('k2', function () { return d2.promise; })).to.not.equal(null);
    d1.resolve();
    d2.resolve();
    return Promise.all([d1.promise, d2.promise]);
  });

  it('key is free again after the promise settles, also after a rejection', async function () {
    await Pending.run('k3', function () { return Promise.resolve(1); });
    expect(Pending.busy('k3')).to.equal(false);
    try {
      await Pending.run('k3', function () { return Promise.reject(new Error('no')); });
    } catch (e) { /* expected */ }
    expect(Pending.busy('k3')).to.equal(false);
    expect(Pending.run('k3', function () { return Promise.resolve(2); })).to.not.equal(null);
  });

  it('a function that throws synchronously frees the key', function () {
    var p = Pending.run('k4', function () { throw new Error('sync'); });
    expect(Pending.busy('k4')).to.equal(false);
    return p.then(function () { throw new Error('should reject'); }, function (e) { expect(e.message).to.equal('sync'); });
  });
});
