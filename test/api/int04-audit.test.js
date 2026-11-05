// INT-4: a public page anyone can use to check the election: the contract's
// events, a re-count of VoteCast events, and (once voting is over) whether
// the re-count matches the contract's totals. No voter personal data.
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');

var ADDRESS = '0x' + '1234abcd'.repeat(5);

function voteCast(id, block) {
  return { event: 'VoteCast', blockNumber: block, args: { contestantId: id } };
}

// Two votes for contestant 1 and one for contestant 2
function auditData(phase, results) {
  return {
    contractAddress: ADDRESS,
    phase: phase,
    contestants: [{ id: 1, name: 'Alice Nangolo' }, { id: 2, name: 'Bob Shikongo' }],
    events: [
      { event: 'ContestantAdded', blockNumber: 1, args: { id: 1, name: 'Alice Nangolo' } },
      { event: 'ContestantAdded', blockNumber: 2, args: { id: 2, name: 'Bob Shikongo' } },
      { event: 'PhaseChanged', blockNumber: 3, args: { phase: 1 } },
      voteCast(1, 4), voteCast(2, 5), voteCast(1, 6)
    ].concat(phase === 2 ? [{ event: 'PhaseChanged', blockNumber: 7, args: { phase: 2 } }] : []),
    results: results
  };
}

function chainWith(data) {
  return fakes.fakeChain({ audit: function () { return Promise.resolve(data); } });
}

describe('INT-4 public audit page', function () {
  it('is public and shows the contract address and events', async function () {
    var res = await h.agent({ chain: chainWith(auditData(1, null)) }).get('/audit');
    expect(res.status).to.equal(200);
    expect(res.text).to.contain(ADDRESS);
    expect(res.text).to.contain('Voting');
    expect(res.text).to.contain('VoteCast');
  });

  it('lists events newest first', async function () {
    var res = await h.agent({ chain: chainWith(auditData(2, [2, 1])) }).get('/audit');
    expect(res.text.indexOf('ContestantAdded')).to.be.greaterThan(res.text.lastIndexOf('PhaseChanged'));
  });

  it('shows "matches" when the re-count equals the contract totals', async function () {
    var res = await h.agent({ chain: chainWith(auditData(2, [2, 1])) }).get('/audit');
    expect(res.text).to.contain('Re-count matches the contract totals.');
    expect(res.text).not.to.contain('WARNING');
  });

  it('shows WARNING when the re-count does not match', async function () {
    var res = await h.agent({ chain: chainWith(auditData(2, [2, 2])) }).get('/audit');
    expect(res.text).to.contain('WARNING: re-count does not match the contract totals.');
    expect(res.text).not.to.contain('Re-count matches');
  });

  it('says totals are hidden during voting', async function () {
    var res = await h.agent({ chain: chainWith(auditData(1, null)) }).get('/audit');
    expect(res.text).to.contain('Totals are hidden until voting ends.');
    expect(res.text).not.to.contain('Re-count matches');
    expect(res.text).not.to.contain('WARNING');
  });

  it('returns 503 with the ChainUnavailableError message when the chain is down', async function () {
    var res = await h.agent({ chain: fakes.fakeChain({ unavailable: true }) }).get('/audit');
    expect(res.status).to.equal(503);
    expect(res.text).to.contain('The blockchain is not available. Ask an administrator to run npm run migrate.');
  });

  it('shows no voter emails', async function () {
    var voter = await h.createUser();
    var res = await h.agent({ chain: chainWith(auditData(2, [2, 1])) }).get('/audit');
    expect(res.text).not.to.contain(voter.email_address);
    expect(res.text).not.to.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });

  it('escapes contestant names from the chain', async function () {
    var data = auditData(2, [2, 1]);
    data.contestants[0].name = '<script>alert(1)</script>';
    data.events[0].args.name = '<script>alert(1)</script>';
    var res = await h.agent({ chain: chainWith(data) }).get('/audit');
    expect(res.text).to.contain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.text).not.to.contain('<script>alert(1)</script>');
  });
});
