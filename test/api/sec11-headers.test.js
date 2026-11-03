// SEC-11: helmet headers and a content security policy that only runs scripts
// from this site (threat-model surface 1). Pages may not load remote scripts
// or contain inline <script> blocks.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var h = require('./helpers');

var SRC = path.join(__dirname, '..', '..', 'src');

function pages() {
  return fs.readdirSync(SRC).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return path.join(SRC, f); })
    .concat(fs.readdirSync(path.join(SRC, 'views')).map(function (f) { return path.join(SRC, 'views', f); }));
}

function directive(csp, name) {
  var d = csp.split(';').map(function (s) { return s.trim(); }).filter(function (s) { return s.indexOf(name + ' ') === 0; })[0];
  return d || '';
}

describe('SEC-11 security headers', function () {
  it('sends CSP and helmet headers', async function () {
    var res = await h.agent().get('/login');
    var csp = res.headers['content-security-policy'];
    expect(csp).to.be.a('string');
    expect(directive(csp, 'script-src')).to.equal("script-src 'self'");
    expect(csp).to.contain("default-src 'self'");
    expect(csp).to.contain("object-src 'none'");
    expect(csp).to.contain("frame-ancestors 'none'");
    expect(directive(csp, 'connect-src')).to.contain('http://127.0.0.1:7545');
    expect(csp).to.not.contain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).to.equal('nosniff');
    expect(res.headers['x-powered-by']).to.equal(undefined);
  });

  it('sends the headers on static pages too', async function () {
    var res = await h.agent().get('/result');
    expect(res.headers['content-security-policy']).to.contain("script-src 'self'");
  });

  it('pages load no remote scripts', function () {
    pages().forEach(function (f) {
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).to.not.match(/<script[^>]*\ssrc\s*=\s*["']?(https?:)?\/\//i);
      expect(fs.readFileSync(f, 'utf8'), path.basename(f)).to.not.contain('src="http');
    });
  });

  it('pages have no inline script blocks', function () {
    pages().forEach(function (f) {
      var scripts = fs.readFileSync(f, 'utf8').match(/<script\b[^>]*>/gi) || [];
      scripts.forEach(function (tag) { expect(tag, path.basename(f)).to.match(/\ssrc\s*=/i); });
    });
  });

  it('the remote stylesheets and fonts the pages use are allowed by the CSP', async function () {
    var csp = (await h.agent().get('/login')).headers['content-security-policy'];
    var styleSrc = directive(csp, 'style-src');
    pages().forEach(function (f) {
      var links = fs.readFileSync(f, 'utf8').match(/<link[^>]+href="https?:\/\/[^/"]+/gi) || [];
      links.forEach(function (l) {
        var origin = /https?:\/\/[^/"]+/.exec(l)[0];
        expect(styleSrc, path.basename(f) + ' ' + origin).to.contain(origin);
      });
    });
  });
});
