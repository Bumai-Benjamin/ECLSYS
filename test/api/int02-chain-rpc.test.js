// INT-2: lib/chain against a fake JSON-RPC node (test/api/fake-rpc.js), for
// the behaviour that needs real web3 encoding but not a real Ganache.
var expect = require('chai').expect;
var fakeRpc = require('./fake-rpc');
var chainLib = require('../../lib/chain');

describe('INT-2 lib/chain over JSON-RPC', function () {
  var rpc;

  afterEach(function () {
    return rpc && rpc.close();
  });

  function chainFor(r) {
    return chainLib.create({ rpcUrl: r.url, registrarKey: '1'.repeat(64), artifactFile: r.artifactFile });
  }

  it('reads isRegistered from voters()', async function () {
    var wallet = '0x' + 'ab'.repeat(20);
    rpc = await fakeRpc.start({ registered: [wallet] });
    var chain = chainFor(rpc);
    expect(await chain.isRegistered(wallet)).to.equal(true);
    expect(await chain.isRegistered('0x' + 'cd'.repeat(20))).to.equal(false);
  });

  it('audit() returns every VoteCast event, not only the last 500 (review #1)', async function () {
    this.timeout(20000);
    var votes = [];
    for (var i = 0; i < 700; i++) votes.push((i % 2) + 1);
    rpc = await fakeRpc.start({ phase: 2, contestants: ['A', 'B'], votes: votes });
    var audit = await chainFor(rpc).audit();
    expect(audit.phase).to.equal(2);
    expect(audit.results).to.deep.equal([350, 350]);
    expect(audit.contestants).to.deep.equal([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    expect(audit.events.filter(function (e) { return e.event === 'VoteCast'; })).to.have.length(700);
    expect(audit.events[0].args).to.deep.equal({ contestantId: 1 });
  });

  it('concurrent lookups share one connection check (review #4)', async function () {
    rpc = await fakeRpc.start();
    var chain = chainFor(rpc);
    var lookups = [];
    for (var i = 0; i < 10; i++) lookups.push(chain.isRegistered('0x' + String(i).repeat(40)));
    await Promise.all(lookups);
    expect(rpc.counts.eth_call).to.equal(10);
    expect(rpc.counts.net_version).to.equal(1);
    expect(rpc.counts.eth_getCode).to.equal(1);
  });

  it('a page of lookups, 10 at a time, checks the deployment once (review #4)', async function () {
    rpc = await fakeRpc.start();
    var chain = chainFor(rpc);
    for (var batch = 0; batch < 5; batch++) {
      var lookups = [];
      for (var i = 0; i < 10; i++) lookups.push(chain.isRegistered('0x' + String(i).repeat(40)));
      await Promise.all(lookups);
    }
    expect(rpc.counts.eth_call).to.equal(50);
    expect(rpc.counts.net_version).to.equal(1);
  });

  it('checks the chain again on a later request (Ganache may have been reset)', async function () {
    rpc = await fakeRpc.start();
    var chain = chainLib.create({ rpcUrl: rpc.url, artifactFile: rpc.artifactFile, recheckMs: 0 });
    await chain.isRegistered('0x' + '1'.repeat(40));
    await chain.isRegistered('0x' + '2'.repeat(40));
    expect(rpc.counts.net_version).to.equal(2);
  });

  describe('serial()', function () {
    it('runs calls one at a time, in order, and keeps going after a failure (review #2)', async function () {
      var running = 0;
      var peak = 0;
      var order = [];
      var run = chainLib.serial(async function (n) {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise(function (r) { setTimeout(r, 5); });
        running -= 1;
        order.push(n);
        if (n === 2) throw new Error('boom');
        return n * 10;
      });
      var results = await Promise.allSettled([run(1), run(2), run(3)]);
      expect(peak).to.equal(1);
      expect(order).to.deep.equal([1, 2, 3]);
      expect(results[0].value).to.equal(10);
      expect(results[1].status).to.equal('rejected');
      expect(results[2].value).to.equal(30);
    });
  });
});
