// UI audit fixes (2026-11-06): layout, public results without MetaMask,
// plain-language audit events, winner and turnout, admin wording.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');
var Templates = require('../../src/js/templates');
var WalletStatus = require('../../src/js/wallet-status');
var AuditEvents = require('../../lib/audit-events');
var ChainUnavailableError = require('../../config/contract').ChainUnavailableError;

var SRC = path.join(__dirname, '..', '..', 'src');
function read(rel) { return fs.readFileSync(path.join(SRC, rel), 'utf8'); }
var CSS = read('css/app.css');

var ADDRESS = '0x' + '1234abcd'.repeat(5);

function chainWith(data) {
  return fakes.fakeChain({ audit: function () { return Promise.resolve(data); } });
}

function closedElection() {
  return {
    contractAddress: ADDRESS,
    phase: 2,
    contestants: [{ id: 1, name: 'Alice Nangolo', party: 'Independent' }, { id: 2, name: 'Bob Shikongo', party: 'Party B' }],
    events: [],
    results: [3, 1]
  };
}

describe('UI audit: stylesheet', function () {
  it('sizes every box with border-box so inputs fit their columns', function () {
    expect(CSS).to.match(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box;?\s*\}/);
  });

  it('table headers never break inside a word', function () {
    expect(CSS).to.match(/\.table th\s*\{[^}]*white-space:\s*nowrap/);
    expect(CSS).to.match(/\.table th\s*\{[^}]*overflow-wrap:\s*normal/);
  });

  it('code is not the pink theme colour', function () {
    expect(CSS).to.match(/code, \.mono\s*\{[^}]*color:\s*var\(--text\)/);
  });

  it('has a dark colour scheme and respects reduced motion', function () {
    expect(CSS).to.contain('@media (prefers-color-scheme: dark)');
    expect(CSS).to.contain('@media (prefers-reduced-motion: reduce)');
  });

  it('a closed phase is neutral, not red', function () {
    expect(CSS).to.match(/\.phase-badge\.is-closed\s*\{[^}]*color:\s*var\(--text\)/);
    expect(CSS).to.match(/\.timeline li\.is-final\[aria-current="step"\]\s*\{[^}]*color:\s*var\(--text\)/);
  });

  it('the brand link is a 44px target', function () {
    expect(CSS).to.match(/\.shell-brand\s*\{[^}]*min-height:\s*44px/);
  });
});

describe('UI audit: results summary', function () {
  it('names the winner, total votes and share', function () {
    var rows = Templates.resultRows([
      { id: 1, name: 'Alice', party: 'A', voteCount: 3 },
      { id: 2, name: 'Bob', party: 'B', voteCount: 1 }
    ]);
    var s = Templates.resultSummary(rows);
    expect(s.total).to.equal(4);
    expect(s.winners).to.deep.equal(['Alice']);
    expect(s.text).to.equal('Alice won with 3 of 4 votes (75%).');
  });

  it('reports a tie', function () {
    var rows = Templates.resultRows([
      { id: 1, name: 'Alice', voteCount: 2 }, { id: 2, name: 'Bob', voteCount: 2 }, { id: 3, name: 'Cara', voteCount: 0 }
    ]);
    var s = Templates.resultSummary(rows);
    expect(s.winners).to.deep.equal(['Alice', 'Bob']);
    expect(s.text).to.equal('Tie: Alice and Bob have 2 votes each, out of 4 votes cast.');
  });

  it('no votes means no winner', function () {
    var s = Templates.resultSummary(Templates.resultRows([{ id: 1, name: 'Alice', voteCount: 0 }]));
    expect(s.winners).to.deep.equal([]);
    expect(s.text).to.equal('No votes were cast.');
  });

  it('marks the winning row and always draws the bar track', function () {
    var rows = Templates.resultRows([{ id: 1, name: 'Alice', voteCount: 3 }, { id: 2, name: 'Bob', voteCount: 0 }]);
    var winner = Templates.resultRow(rows[0], { winners: ['Alice'] });
    var other = Templates.resultRow(rows[1], { winners: ['Alice'] });
    expect(winner).to.contain('class="is-winner"');
    expect(winner).to.contain('<span class="badge badge-yes">Winner</span>');
    expect(other).not.to.contain('is-winner');
    expect(other).to.contain('<span class="bar-track" aria-hidden="true"><span class="bar bar-0"></span></span>');
  });

  it('winner names are escaped', function () {
    var rows = Templates.resultRows([{ id: 1, name: '<b>x</b>', voteCount: 1 }]);
    expect(Templates.resultSummary(rows).text).to.contain('<b>x</b>');   // text, set with .text()
    expect(Templates.resultRow(rows[0], { winners: ['<b>x</b>'] })).not.to.contain('<b>x</b>');
  });
});

describe('UI audit: wallet panel on public pages', function () {
  it('public pages show only a good connection, never a MetaMask problem', function () {
    var problem = WalletStatus.decide({ hasEthereum: false });
    var ok = { state: 'ok', message: 'Connected: 0x1234…5678', action: null };
    expect(WalletStatus.shouldShow(problem, 'public')).to.equal(false);
    expect(WalletStatus.shouldShow(ok, 'public')).to.equal(true);
    expect(WalletStatus.shouldShow(problem, 'voter')).to.equal(true);
    expect(WalletStatus.shouldShow(problem, 'admin')).to.equal(true);
  });
});

describe('UI audit: GET /results.json', function () {
  it('before voting closes: phase and candidates, no totals', async function () {
    var data = closedElection();
    data.phase = 1;
    data.results = null;
    var res = await h.agent({ chain: chainWith(data) }).get('/results.json');
    expect(res.status).to.equal(200);
    expect(res.body.phase).to.equal(1);
    expect(res.body.candidates).to.equal(null);
  });

  it('after voting closes: every candidate with votes', async function () {
    var res = await h.agent({ chain: chainWith(closedElection()) }).get('/results.json');
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({
      phase: 2,
      candidates: [
        { id: 1, name: 'Alice Nangolo', party: 'Independent', voteCount: 3 },
        { id: 2, name: 'Bob Shikongo', party: 'Party B', voteCount: 1 }
      ]
    });
  });

  it('chain down: 503 with a message', async function () {
    var chain = fakes.fakeChain({ audit: function () { return Promise.reject(new ChainUnavailableError('down')); } });
    var res = await h.agent({ chain: chain }).get('/results.json');
    expect(res.status).to.equal(503);
    expect(res.body.error).to.be.a('string');
  });
});

describe('UI audit: audit events in plain language', function () {
  var names = { 1: 'Alice Nangolo' };

  it('describes each contract event', function () {
    expect(AuditEvents.describe({ event: 'VoteCast', args: { contestantId: 1 } }, names).text)
      .to.equal('Vote cast for Alice Nangolo (#1)');
    expect(AuditEvents.describe({ event: 'ContestantAdded', args: { id: 1, name: 'Alice Nangolo' } }, names).text)
      .to.equal('Candidate added: Alice Nangolo (#1)');
    expect(AuditEvents.describe({ event: 'PhaseChanged', args: { phase: 1 } }, names).text)
      .to.equal('Election moved to: Voting');
    expect(AuditEvents.describe({ event: 'PhaseChanged', args: { phase: 2 } }, names).text)
      .to.equal('Election moved to: Closed');
    expect(AuditEvents.describe({ event: 'VoterRegistered', args: { voter: ADDRESS } }, names).text)
      .to.equal('Voter wallet registered');
    expect(AuditEvents.describe({ event: 'RoleGranted', args: { role: '0x00', account: ADDRESS } }, names).text)
      .to.equal('Administrator access granted');
    expect(AuditEvents.describe({ event: 'RoleRevoked', args: {} }, names).text).to.equal('Administrator access removed');
    expect(AuditEvents.describe({ event: 'Mystery', args: {} }, names).text).to.equal('Mystery');
  });

  it('a vote for an unknown candidate still reads clearly', function () {
    expect(AuditEvents.describe({ event: 'VoteCast', args: { contestantId: 9 } }, names).text).to.equal('Vote cast for candidate #9');
  });

  it('the audit page shows the plain text, the full contract address and keeps raw details', async function () {
    var data = closedElection();
    data.events = [{ event: 'VoteCast', blockNumber: 4, args: { contestantId: 1 } }];
    var res = await h.agent({ chain: chainWith(data) }).get('/audit');
    expect(res.text).to.contain('Vote cast for Alice Nangolo (#1)');
    expect(res.text).to.match(new RegExp('<code class="full-hash">' + ADDRESS + '</code>'));
    expect(res.text).to.contain('<summary>Technical details</summary>');
    expect(res.text).to.contain('VoteCast');
  });
});

describe('UI audit: pages', function () {
  it('/vote_area sends signed-in voters to /voting', async function () {
    var a = h.agent();
    var user = await h.createUser();
    await h.login(a, user);
    var res = await a.get('/vote_area');
    expect(res.status).to.equal(301);
    expect(res.headers.location).to.equal('/voting');
  });

  it('the old vote_area page file is gone', function () {
    expect(fs.existsSync(path.join(SRC, 'vote_area.html'))).to.equal(false);
  });

  it('sign in and create account have a skip link to the form', function () {
    ['views/login-form.ejs', 'views/registration-form.ejs', 'views/admin_login.ejs'].forEach(function (f) {
      var html = read(f);
      expect(html, f).to.match(/<a class="skip-link" href="#([a-z-]+)">/);
      var target = /<a class="skip-link" href="#([a-z-]+)">/.exec(html)[1];
      expect(html, f).to.contain('id="' + target + '"');
    });
  });

  it('gender select has autocomplete', function () {
    expect(read('views/registration-form.ejs')).to.match(/<select[^>]*name="gender"[^>]*autocomplete="sex"|<select[^>]*autocomplete="sex"[^>]*name="gender"/);
  });

  it('the phase page links to results and keeps the current phase for screen readers only', function () {
    var html = read('adminChangePhase.html');
    expect(html).to.match(/<p id="currentPhaseAdmin" class="visually-hidden">/);
    expect(read('js/app.js')).to.contain("$('<a href=\"/result\">').text('Results page')");
  });

  it('the dashboard has a results summary slot', function () {
    expect(read('views/dashboard.ejs')).to.match(/<section id="results-summary" class="panel"[^>]*hidden>/);
  });

  it('home image is a small WebP', function () {
    var html = read('index.html');
    expect(html).to.match(/<img[^>]*src="[^"]*home_page\.webp"[^>]*width="\d+"[^>]*height="\d+"/);
    var size = fs.statSync(path.join(SRC, 'img', 'home_page.webp')).size;
    expect(size).to.be.below(60 * 1024);
  });
});

describe('UI audit: admin voters list', function () {
  it('numbers rows from 1 and says what a mismatch means', async function () {
    var wallet = h.newWallet();
    await h.query('INSERT INTO registered_users SET ?', { Account_address: wallet, Is_registered: 'Yes' });
    var admin = await h.createUser({ role: 'admin' });
    var a = h.agent({ chain: fakes.fakeChain() });
    await h.adminLogin(a, admin);
    var res = await a.get('/table_view');
    expect(res.text).to.match(/<td data-label="#">1<\/td>/);
    expect(res.text).not.to.match(/<td data-label="#">0<\/td>/);
    expect(res.text).to.contain('<td class="on-chain" data-label="On blockchain"><span class="badge badge-mismatch">Missing on blockchain</span></td>');
  });
});
