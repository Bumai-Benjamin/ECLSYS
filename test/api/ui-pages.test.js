// UI-5 to UI-8: static checks over every page (spec §8). These read the page
// files; behaviour that needs MetaMask is checked by hand (plan Task 9).
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;

var SRC = path.join(__dirname, '..', '..', 'src');
var VIEWS = path.join(SRC, 'views');

function pageFiles() {
  return fs.readdirSync(SRC).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return path.join(SRC, f); })
    .concat(fs.readdirSync(VIEWS).filter(function (f) { return /\.ejs$/.test(f); }).map(function (f) { return path.join(VIEWS, f); }));
}

// Sign-in pages have no nav (spec §2)
var NO_NAV = ['admin_login.ejs', 'login-form.ejs', 'registration-form.ejs'];

function read(f) {
  return fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
}

function each(fn) {
  var files = pageFiles();
  expect(files.length).to.be.at.least(17);
  files.forEach(function (f) { fn(path.basename(f), read(f)); });
}

var REMOVED_PLUGINS = ['jquery-jvectormap', 'nouislider', 'bootstrap-tagsinput', 'jasny-bootstrap',
  'bootstrap-notify', 'moment.min', 'jquery.validate', 'arrive.min'];

var TOKENS = ['--brand: #ec6363', '--brand-strong: #b93a3a', '--brand-tint: #fdecec', '--danger: #9b1c1c',
  '--success: #1e6b3a', '--warning: #8a5a00', '--warning-bg: #fff4d6', '--text: #1f2328', '--muted: #57606a',
  '--surface: #ffffff', '--page: #f6f7f9'];

describe('UI-5 page markup', function () {
  it('every page loads app.css after material-dashboard.css', function () {
    each(function (name, html) {
      var app = html.indexOf('/css/app.css');
      expect(app, name).to.be.greaterThan(-1);
      var md = html.indexOf('material-dashboard.css');
      if (md !== -1) expect(md, name).to.be.lessThan(app);
    });
  });

  it('pages with a nav have #app-shell, shell.js right after it, and data-nav', function () {
    each(function (name, html) {
      if (NO_NAV.indexOf(name) !== -1) return;
      expect(html, name).to.match(/<nav id="app-shell"[^>]*><\/nav>\s*<script src="\/js\/shell\.js"><\/script>/);
      expect(html, name).to.match(/<body[^>]+data-nav="(voter|admin|public)"[^>]+data-page="[a-z-]+"/);
    });
  });

  it('no hand-written sidebar is left', function () {
    each(function (name, html) {
      expect(html, name).not.to.match(/class="sidebar"/);
    });
  });

  it('exactly one <h1> and <html lang="en">', function () {
    each(function (name, html) {
      expect((html.match(/<h1[\s>]/g) || []).length, name).to.equal(1);
      expect(html, name).to.match(/<html lang="en">/);
    });
  });

  it('no style= attributes', function () {
    each(function (name, html) {
      expect(html, name).not.to.match(/\sstyle\s*=/i);
    });
  });

  it('no removed plugin scripts', function () {
    each(function (name, html) {
      REMOVED_PLUGINS.forEach(function (p) { expect(html, name + ' ' + p).not.to.contain(p); });
    });
  });

  it('every form field has a label or aria-label', function () {
    each(function (name, html) {
      var fields = html.match(/<(input|select|textarea)\b[^>]*>/g) || [];
      fields.forEach(function (tag) {
        if (/type="(hidden|submit|button)"/.test(tag)) return;
        if (/aria-label="[^"]+"/.test(tag)) return;
        var id = /\sid="([^"]+)"/.exec(tag);
        expect(id, name + ': ' + tag).to.not.equal(null);
        expect(html, name + ': no <label for="' + id[1] + '">').to.contain('for="' + id[1] + '"');
      });
    });
  });

  it('pages with a nav start with a skip link to #content, which exists', function () {
    each(function (name, html) {
      if (NO_NAV.indexOf(name) !== -1) return;
      var body = html.slice(html.search(/<body/));
      var firstLink = /<a\b[^>]*>/.exec(body);
      expect(firstLink && firstLink[0], name).to.match(/href="#content"/);
      expect(html, name).to.match(/id="content"/);
    });
  });

  it('app.css defines the brand tokens and wraps long words (Review Focus 4)', function () {
    var css = fs.readFileSync(path.join(SRC, 'css', 'app.css'), 'utf8');
    TOKENS.forEach(function (t) { expect(css).to.contain(t); });
    expect(css).to.contain('overflow-wrap: anywhere');
    for (var i = 0; i <= 100; i += 5) expect(css).to.contain('.bar-' + i + ' ');
    expect(css).to.contain(':focus-visible');
  });
});
