// AI-slop audit fixes (2026-11-07): square corners, no resting shadows, a
// neutral navigation, no glyph icons, the next step in words, the ballot
// before voting opens, right-aligned numbers and readable admin dates.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var h = require('./helpers');
var fakes = require('./fakes');
var Steps = require('../../src/js/steps');
var Templates = require('../../src/js/templates');
var formatWhen = require('../../lib/when').formatWhen;

var SRC = path.join(__dirname, '..', '..', 'src');
function read(rel) { return fs.readFileSync(path.join(SRC, rel), 'utf8'); }
var CSS = read('css/app.css');

describe('Slop audit: stylesheet', function () {
  it('every corner is square; only the dialog casts a shadow', function () {
    expect(CSS).to.match(/--radius:\s*0;/);
    expect(CSS).not.to.match(/border-radius: (?!0;|0 |var\(--radius\);)/);
    var shadows = CSS.match(/box-shadow:[^;]+;/g) || [];
    shadows.forEach(function (s) { expect(s).to.match(/none|0 10px 40px/); });
  });

  it('a closed dialog stays hidden even with Material loaded', function () {
    expect(CSS).to.match(/dialog:not\(\[open\]\)\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('no gradients and no glyph icons from CSS', function () {
    expect(CSS).not.to.contain('gradient(');
    expect(CSS).not.to.match(/content:\s*"[⚠✓●]/);
  });

  it('the active nav item is a neutral row with no coloured bar', function () {
    var rule = /\.shell-link\[aria-current="page"\]\s*\{([^}]*)\}/.exec(CSS)[1];
    expect(rule).to.contain('var(--nav-active)');
    expect(rule).not.to.match(/brand|link|box-shadow/);
    expect(CSS).not.to.match(/\.shell-bar\s*\{[^}]*var\(--brand\)/);
  });

  it('the sign-in eyebrow is a sentence-case wordmark', function () {
    var rule = /\.auth-card \.brand-line\s*\{([^}]*)\}/.exec(CSS)[1];
    expect(rule).not.to.match(/uppercase|letter-spacing/);
  });

  it('numbers are right-aligned with tabular figures', function () {
    expect(CSS).to.match(/\.table \.num\s*\{[^}]*text-align:\s*right[^}]*tabular-nums/);
    expect(Templates.resultRow(Templates.resultRows([{ id: 1, name: 'A', voteCount: 2 }])[0])).to.contain('<td class="num" data-label="Votes">2</td>');
  });
});

describe('Slop audit: pages', function () {
  it('the wallet status comes after the page title, not above it', function () {
    ['voting.html', 'result.html', 'views/dashboard.ejs', 'views/adminVoterReg.ejs'].forEach(function (f) {
      var html = read(f);
      expect(html.indexOf('id="wallet-status"'), f).to.be.greaterThan(html.indexOf('</h1>'));
    });
  });

  it('the home heading is short and the slogan card is gone', function () {
    var html = read('index.html');
    expect(/<h1>([^<]*)<\/h1>/.exec(html)[1].length).to.be.at.most(32);
    expect(html).not.to.contain('tagline');
  });

  it('the dashboard has a next-step line and no help panel', function () {
    var html = read('views/dashboard.ejs');
    expect(html).to.contain('id="next-step"');
    expect(html).not.to.contain('Need help?');
  });

  it('results and voting pages have a ballot preview', function () {
    expect(read('result.html')).to.contain('id="ballot-preview"');
    expect(read('voting.html')).to.contain('id="ballot-preview"');
  });
});

describe('Slop audit: next step in words', function () {
  function next(input) { return Steps.nextStep(Steps.compute(input).steps); }

  it('points at the step to take', function () {
    expect(next({ loggedIn: true, walletVerified: false, phase: 0 })).to.deep.equal({ before: 'Next: ', link: 'verify your wallet', href: '/form', after: ' so you can vote.' });
    expect(next({ loggedIn: true, walletVerified: true, phase: 1, hasVoted: false }).link).to.equal('cast your vote');
    expect(next({ loggedIn: true, walletVerified: true, phase: 2, hasVoted: true }).link).to.equal('See the results');
  });

  it('says why there is nothing to do yet', function () {
    expect(next({ loggedIn: true, walletVerified: true, phase: 0 }).before)
      .to.equal('Nothing to do yet. Voting opens when the commission starts the voting phase.');
    expect(next({ loggedIn: true, walletVerified: true, phase: 1, hasVoted: true }).before)
      .to.equal('You have voted. Results appear when voting closes.');
    expect(next({ loggedIn: true, walletVerified: true, phase: null }).before).to.equal('Checking the blockchain…');
  });
});

describe('Slop audit: ballot before voting opens', function () {
  it('/results.json lists names and parties, never totals, before voting closes', async function () {
    var chain = fakes.fakeChain({ audit: function () {
      return Promise.resolve({ phase: 0, contestants: [{ id: 1, name: 'Alice', party: 'A' }], events: [], results: null });
    } });
    var res = await h.agent({ chain: chain }).get('/results.json');
    expect(res.body.ballot).to.deep.equal([{ id: 1, name: 'Alice', party: 'A' }]);
    expect(res.body.candidates).to.equal(null);
  });

  it('ballot items are escaped', function () {
    expect(Templates.ballotItem({ name: '<b>x</b>', party: 'P' })).not.to.contain('<b>x</b>');
  });
});

describe('Slop audit: admin dates', function () {
  it('formats a time for people', function () {
    var d = new Date(2026, 10, 6, 23, 49, 34);
    expect(formatWhen(d)).to.equal('6 Nov 2026, 23:49');
    expect(formatWhen('not a date')).to.equal('');
  });
});
