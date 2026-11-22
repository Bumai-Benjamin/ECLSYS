// UI redesign (2026-11-14): rounded cards, sidebar with logo and icons, a
// shared page header card, home hero, skeleton loading. Visual only: routes,
// form fields and contract calls are covered by the existing tests.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var Shell = require('../../src/js/shell');
var HomePage = require('../../src/js/pages/home-page');

var SRC = path.join(__dirname, '..', '..', 'src');
var VIEWS = path.join(SRC, 'views');
function read(rel) { return fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); }
var CSS = fs.readFileSync(path.join(SRC, 'css', 'app.css'), 'utf8');

function pages() {
  return fs.readdirSync(SRC).filter(function (f) { return /\.html$/.test(f); })
    .concat(fs.readdirSync(VIEWS).filter(function (f) { return /\.ejs$/.test(f); }).map(function (f) { return 'views/' + f; }));
}

var AUTH = ['views/login-form.ejs', 'views/registration-form.ejs', 'views/admin_login.ejs'];

describe('UI redesign: sidebar', function () {
  it('shows the logo mark, the name and the commission under it', function () {
    var html = Shell.render('public', 'home');
    expect(html).to.match(/<span class="logo-mark" aria-hidden="true"><img src="\/img\/home_page\.webp" alt="" width="800" height="600"><\/span>/);
    expect(html).to.contain('<span class="shell-brand-name">ECN E-Vote</span>');
    expect(html).to.contain('<span class="shell-brand-sub">Electoral Commission of Namibia</span>');
  });

  it('every nav item has its own stroke icon', function () {
    ['public', 'voter', 'admin'].forEach(function (nav) {
      var html = Shell.render(nav, '');
      var links = html.match(/<a class="shell-link"/g).length;
      var icons = html.match(/<svg class="shell-icon"[^>]*aria-hidden="true"/g) || [];
      expect(icons.length, nav).to.equal(links);
    });
  });

  it('the public nav ends with the staff sign-in box; signed-in navs do not', function () {
    expect(Shell.render('public', 'home')).to.match(/<p class="shell-staff">Election staff\? <a href="\/adlogin">Staff sign-in<\/a><\/p>/);
    expect(Shell.render('voter', 'voting')).not.to.contain('shell-staff');
    expect(Shell.render('admin', 'phase')).not.to.contain('shell-staff');
  });

  it('the menu button still controls the collapsible links', function () {
    var html = Shell.render('public', 'home');
    expect(html).to.match(/<button type="button" class="shell-toggle" aria-expanded="false" aria-controls="shell-links">Menu<\/button>/);
    expect(html).to.match(/<div id="shell-links" class="shell-menu">/);
  });
});

describe('UI redesign: page header card', function () {
  it('names the page after its nav item, or the given label', function () {
    expect(Shell.crumbLabel('public', 'results', 'Results')).to.equal('Results');
    expect(Shell.crumbLabel('voter', 'audit', 'Election audit')).to.equal('Audit');
    expect(Shell.crumbLabel('admin', 'audit', 'Election audit')).to.equal('Audit');
    expect(Shell.crumbLabel('admin', 'phase', 'Election phase')).to.equal('Election phase');
    expect(Shell.crumbLabel('public', 'error', 'Something went wrong')).to.equal('Something went wrong');
    expect(Shell.crumbLabel('', '', 'Sign in to vote', 'Sign in')).to.equal('Sign in');
  });

  it('draws the coral logo panel and an escaped breadcrumb', function () {
    var parts = Shell.headParts('A <b>page</b>');
    expect(parts.logo).to.equal('<div class="page-head-logo" aria-hidden="true"><img src="/img/home_page.webp" alt="" width="800" height="600"></div>');
    expect(parts.crumb).to.equal('<nav class="crumb" aria-label="Breadcrumb"><a href="/">ECN E-Vote</a> <span aria-hidden="true">/</span> <span aria-current="page">A &lt;b&gt;page&lt;/b&gt;</span></nav>');
  });

  it('every page except home has a header.page-intro holding its h1', function () {
    pages().forEach(function (p) {
      if (p === 'index.html') return;
      var html = read(p);
      expect(html, p).to.match(/<header class="page-intro"[^>]*>\s*<h1[\s>]/);
    });
  });

  it('every page loads shell.js, so the header card and skeleton work everywhere', function () {
    pages().forEach(function (p) { expect(read(p), p).to.contain('<script src="/js/shell.js"></script>'); });
  });
});

describe('UI redesign: sign-in pages', function () {
  it('have a header card with a breadcrumb label, a form card, no sidebar and no old brand line', function () {
    var labels = { 'views/login-form.ejs': 'Sign in', 'views/registration-form.ejs': 'Register', 'views/admin_login.ejs': 'Staff sign-in' };
    AUTH.forEach(function (p) {
      var html = read(p);
      expect(html, p).to.contain('<header class="page-intro" data-crumb="' + labels[p] + '">');
      expect(html, p).to.contain('class="auth-card');
      expect(html, p).not.to.contain('id="app-shell"');
      expect(html, p).not.to.contain('brand-line');
    });
  });
});

describe('UI redesign: skeleton', function () {
  it('one skeleton per layout, hidden from screen readers', function () {
    ['home', 'page', 'auth'].forEach(function (kind) {
      var html = Shell.skeleton(kind);
      expect(html, kind).to.match(/^<div class="app-skeleton is-[a-z]+" aria-hidden="true">/);
      expect((html.match(/class="sk /g) || []).length, kind).to.be.at.least(3);
    });
  });

  it('the stylesheet hides the page while loading and shimmers the skeleton', function () {
    expect(CSS).to.match(/html\.is-loading #content\s*\{[^}]*display:\s*none/);
    expect(CSS).to.match(/@keyframes sk-shimmer/);
    expect(CSS).to.match(/html:not\(\.is-loading\) \.app-skeleton\s*\{[^}]*display:\s*none/);
  });
});

describe('UI redesign: home page', function () {
  var html = read('index.html');

  it('has the hero with logo card, status pill, heading, lede and both buttons', function () {
    expect(html).to.match(/<div class="hero-logo">\s*<img src="img\/home_page\.webp"/);
    expect(html).to.match(/<p id="election-status" class="status-pill"[^>]*hidden><\/p>/);
    expect(html).to.contain('<h1>Electoral Commission of Namibia e-voting</h1>');
    expect(html).to.contain('Let your voice be heard. Create an account, register your MetaMask wallet, and vote when voting opens.');
    expect(html).to.match(/<a class="btn btn-primary" href="\/register">Register to vote<\/a>/);
    expect(html).to.match(/<a class="btn btn-secondary-outline" href="\/login">Sign in<\/a>/);
  });

  it('has three link cards and no staff link in the body', function () {
    [['/result', 'See results'], ['/audit', 'Check the count'], ['/userInfo', 'How it works']].forEach(function (c) {
      expect(html).to.match(new RegExp('<a class="link-card" href="' + c[0] + '">[\\s\\S]*?' + c[1]));
    });
    expect(html).not.to.contain('/adlogin');
    expect(html).to.contain('<script src="js/pages/home-page.js"></script>');
  });

  it('the status pill shows the real phase only', function () {
    expect(HomePage.statusText(0)).to.equal('Registration open');
    expect(HomePage.statusText(1)).to.equal('Voting open');
    expect(HomePage.statusText(2)).to.equal('Voting closed');
    expect(HomePage.statusText(7)).to.equal('');
    expect(HomePage.statusText(null)).to.equal('');
  });
});

describe('UI redesign: results page', function () {
  it('the waiting message is an empty-state card with a clock and a button to the audit page', function () {
    var html = read('result.html');
    expect(html).to.match(/<section id="results-waiting" class="panel empty-card">\s*<div class="empty-icon is-warning" aria-hidden="true"><svg/);
    expect(html).to.match(/<a class="btn btn-secondary-outline" href="\/audit">Go to the audit page<\/a>/);
  });
});

describe('UI redesign: stylesheet', function () {
  it('cards are 20px with a soft shadow in both colour schemes', function () {
    expect(CSS).to.contain('--radius-card: 20px;');
    expect((CSS.match(/--card-shadow:/g) || []).length).to.equal(2);
    expect(CSS).to.match(/\.panel\s*\{[^}]*border-radius:\s*var\(--radius-card\)/);
    expect(CSS).to.match(/\.panel\s*\{[^}]*box-shadow:\s*var\(--card-shadow\)/);
  });

  it('buttons are 48px with a 12px radius and no underline', function () {
    expect(CSS).to.match(/\.btn\s*\{[^}]*min-height:\s*48px/);
    expect(CSS).to.match(/\.btn\s*\{[^}]*border-radius:\s*12px/);
    expect(CSS).to.match(/\.btn\s*\{[^}]*text-decoration:\s*none/);
  });

  it('focus is a 3px brand outline', function () {
    expect(CSS).to.match(/:focus-visible[^{]*\{\s*outline:\s*3px solid var\(--brand\);\s*outline-offset:\s*2px;/);
  });

  it('the sidebar is 248px, has no thick red line, and collapses at 760px', function () {
    expect(CSS).to.contain('--shell-width: 248px;');
    expect(CSS).not.to.match(/\.shell-bar\s*\{[^}]*border-bottom:\s*4px/);
    expect(CSS).to.contain('@media (max-width: 760px)');
    expect(CSS).not.to.contain('991.98px');
  });

  it('in dark mode the logo gets a light outline so its black lines show', function () {
    var dark = CSS.slice(CSS.indexOf('@media (prefers-color-scheme: dark)'));
    dark = dark.slice(0, dark.indexOf('\n}\n'));
    expect(dark).to.match(/\.logo-mark img\s*\{\s*filter:\s*drop-shadow\(0 0 \.6px rgba\(255,\s*255,\s*255,\s*\.9\)\) drop-shadow\(0 0 \.6px rgba\(255,\s*255,\s*255,\s*\.6\)\)/);
  });

  it('the mobile top bar stays put: clip, not Material\'s overflow hidden, which breaks sticky', function () {
    expect(CSS).to.match(/html, body\s*\{\s*overflow-x:\s*clip;?\s*\}/);
  });
});

describe('UI redesign: page load focus', function () {
  it('focus that lands in a closed dialog at load (autofocus on #cancel-vote) is undone', function () {
    var shell = fs.readFileSync(path.join(SRC, 'js', 'shell.js'), 'utf8');
    expect(shell).to.contain("closest('dialog:not([open])')");
  });
});
