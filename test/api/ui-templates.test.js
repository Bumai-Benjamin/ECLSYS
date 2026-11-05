// UI-4: helpers for results, ballots, hashes and the phase change (spec §4.4,
// §4.5, §5.1).
var expect = require('chai').expect;
var Templates = require('../../src/js/templates');
var PhaseFlow = Templates.PhaseFlow;

function cand(id, votes, name, party) {
  return { id: String(id), name: name || 'C' + id, party: party || 'P' + id, voteCount: String(votes), age: '40', qualification: 'BA' };
}

describe('UI-4 template helpers', function () {
  it('resultRows sorts by votes then id', function () {
    var rows = Templates.resultRows([cand(1, 2), cand(2, 5), cand(3, 2)]);
    expect(rows.map(function (r) { return r.id; })).to.deep.equal(['2', '1', '3']);
    expect(rows[0].votes).to.equal(5);
  });

  it('shares round and bars snap to 5', function () {
    var rows = Templates.resultRows([cand(1, 1), cand(2, 2)]);
    expect(rows.map(function (r) { return r.share; })).to.deep.equal([67, 33]);
    expect(rows.map(function (r) { return r.barClass; })).to.deep.equal(['bar-65', 'bar-35']);
  });

  it('zero votes gives share 0 and bar-0', function () {
    var rows = Templates.resultRows([cand(1, 0), cand(2, 0)]);
    expect(rows.map(function (r) { return r.share; })).to.deep.equal([0, 0]);
    expect(rows[0].barClass).to.equal('bar-0');
  });

  it('resultRow and candidateChoice escape <script> in name and party', function () {
    var evil = cand(1, 3, '<script>alert(1)</script>', '<b>p</b>');
    var row = Templates.resultRow(Templates.resultRows([evil])[0]);
    var card = Templates.candidateChoice(evil);
    [row, card].forEach(function (html) {
      expect(html).to.contain('&lt;script&gt;');
      expect(html).not.to.contain('<script>');
      expect(html).not.to.contain('<b>p</b>');
    });
    expect(row).to.contain('class="bar bar-100"');
    expect(row).to.contain('data-label="Votes"');
  });

  it('candidateChoice uses the numeric id only', function () {
    var html = Templates.candidateChoice(cand('7" onfocus="x', 0, 'Alice', 'Independent'));
    expect(html).to.contain('value="7"');
    expect(html).not.to.contain('onfocus');
    expect(html).to.match(/<input type="radio" name="candidate"/);
  });

  it('shortHash', function () {
    var hash = '0x' + 'ab'.repeat(32);
    expect(Templates.shortHash(hash)).to.equal('0xabab…abab');
    expect(Templates.shortHash('0x1234')).to.equal('0x1234');
  });

  it('PhaseFlow.next', function () {
    expect(PhaseFlow.next(0)).to.deep.equal({
      button: 'Open voting', word: 'OPEN',
      explain: 'No more candidates or voter registrations. Registered voters can vote.'
    });
    expect(PhaseFlow.next(1)).to.deep.equal({
      button: 'Close voting', word: 'CLOSE',
      explain: 'Voting stops for good. Results and totals become public.'
    });
    expect(PhaseFlow.next(2)).to.equal(null);
  });

  it('confirmed accepts " open " and rejects "OPN"', function () {
    expect(PhaseFlow.confirmed(' open ', 'OPEN')).to.equal(true);
    expect(PhaseFlow.confirmed('OPN', 'OPEN')).to.equal(false);
    expect(PhaseFlow.confirmed('', 'CLOSE')).to.equal(false);
  });
});
