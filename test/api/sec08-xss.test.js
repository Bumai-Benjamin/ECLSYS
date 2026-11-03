// SEC-8 / D14: candidate data from the contract is escaped before it reaches
// the page (threat-model surface 1: "script tag in a candidate name renders
// as text"). src/js/templates.js runs both in the browser and here.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var t = require('../../src/js/templates');

var EVIL = {
  id: 7,
  name: '<script>alert(1)</script>',
  party: '"><img src=x onerror=alert(2)>',
  age: "40' onmouseover='alert(3)",
  qualification: '<b>PhD</b> & more',
  voteCount: '<i>5</i>'
};

// Every page and view under src/.
function pages() {
  var root = path.join(__dirname, '..', '..', 'src');
  return fs.readdirSync(root).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return path.join(root, f); })
    .concat(fs.readdirSync(path.join(root, 'views')).map(function (f) { return path.join(root, 'views', f); }));
}

// The real tags in a snippet. Escaped text can't contain '<', so attack
// strings only show up here if escaping failed.
function tags(html) {
  return html.match(/<[^>]*>/g) || [];
}

function noRawMarkup(html) {
  var all = tags(html);
  expect(all.filter(function (t) { return /^<(script|img src=x|i>)/i.test(t); }), 'injected tags').to.have.length(0);
  expect(html).to.not.contain('<b>PhD');
  all.forEach(function (t) { expect(t, 'event handler in tag').to.not.match(/\son[a-z]+\s*=/i); });
}

describe('SEC-8 XSS-safe templates', function () {
  it('escapeHtml escapes & < > " \' and /', function () {
    expect(t.escapeHtml('& < > " \' /')).to.equal('&amp; &lt; &gt; &quot; &#39; &#x2F;');
    expect(t.escapeHtml(undefined)).to.equal('');
    expect(t.escapeHtml(12)).to.equal('12');
  });

  it('candidate card shows a script-tag name as text', function () {
    var html = t.candidateCard(EVIL);
    noRawMarkup(html);
    expect(html).to.contain('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
  });

  it('candidate card has no inline event handlers', function () {
    tags(t.candidateCard(EVIL)).forEach(function (tag) { expect(tag).to.not.match(/\son[a-z]+\s*=/i); });
    expect(t.candidateCard(EVIL)).to.contain('data-candidate-id="7"');
  });

  it('select option, admin row and result row escape every field', function () {
    [t.candidateOption(EVIL), t.candidateRow(EVIL), t.candidateRow(EVIL, { withVotes: true })].forEach(noRawMarkup);
  });

  it('a non-numeric id cannot break out of the modal id or data attribute', function () {
    var html = t.candidateCard(Object.assign({}, EVIL, { id: '1" onclick="alert(4)' }));
    tags(html).forEach(function (tag) { expect(tag).to.not.match(/onclick=/i); });
  });

  it('app.js no longer builds HTML by concatenating contract values', function () {
    var src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'app.js'), 'utf8');
    expect(src).to.not.match(/["']\s*\+\s*(name|fetchedParty|fetchedAge|fetchedQualification|voteCount|id)\s*\+/);
    expect(src).to.not.match(/onClick=/i);
    expect(src).to.not.match(/\.html\(\s*["'][^"']*["']\s*\+/);
  });

  it('no inline event handlers in pages', function () {
    pages().forEach(function (f) {
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).to.not.match(/\son(submit|click)\s*=/i);
    });
  });

  it('EJS views use escaped output for data', function () {
    pages().filter(function (f) { return /\.ejs$/.test(f); }).forEach(function (f) {
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).to.not.contain('<%-');
    });
  });

  it('app.js binds forms through data-action', function () {
    var src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'js', 'app.js'), 'utf8');
    expect(src).to.contain("'submit', 'form[data-action]'");
  });

  it('every page that loads app.js loads templates.js before it', function () {
    pages().forEach(function (f) {
      var src = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      var app = src.search(/<script[^>]+src="js\/app\.js"/);
      if (app === -1) return;
      var tpl = src.search(/<script[^>]+src="js\/templates\.js"/);
      expect(tpl, path.basename(f)).to.be.greaterThan(-1);
      expect(tpl, path.basename(f)).to.be.lessThan(app);
    });
  });
});
