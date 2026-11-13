// UI-5: the shared nav drawn by src/js/shell.js (spec §3.2).
var expect = require('chai').expect;
var Shell = require('../../src/js/shell');

describe('UI-5 shell nav', function () {
  it('public page, nobody signed in', function () {
    expect(Shell.navFor('public', null)).to.equal('public');
    expect(Shell.navFor('public', { loggedIn: false })).to.equal('public');
  });

  it('public page switches to the signed-in role', function () {
    expect(Shell.navFor('public', { loggedIn: true, role: 'voter' })).to.equal('voter');
    expect(Shell.navFor('public', { loggedIn: true, role: 'admin' })).to.equal('admin');
  });

  it('voter and admin pages keep their own nav even if /me failed (Review Focus 3)', function () {
    expect(Shell.navFor('voter', null)).to.equal('voter');
    expect(Shell.navFor('admin', null)).to.equal('admin');
    expect(Shell.navFor('voter', { loggedIn: false })).to.equal('voter');
  });

  it('public items never include Log out', function () {
    var ids = Shell.items('public').map(function (i) { return i.id; });
    expect(ids).to.deep.equal(['home', 'results', 'audit', 'signin']);
  });

  it('voter items', function () {
    expect(Shell.items('voter').map(function (i) { return i.id; }))
      .to.deep.equal(['dashboard', 'info', 'register', 'voting', 'results', 'logout']);
  });

  it('admin items in election order', function () {
    expect(Shell.items('admin').map(function (i) { return i.id; }))
      .to.deep.equal(['candidates', 'add', 'voters', 'phase', 'logout']);
    expect(Shell.items('admin').map(function (i) { return i.href; }))
      .to.deep.equal(['/candidateDetails', '/addCandidate', '/table_view', '/changePhase', '/logout']);
  });

  it('render marks the active page once', function () {
    var html = Shell.render('voter', 'voting');
    expect(html.match(/aria-current="page"/g)).to.have.length(1);
    expect(html).to.match(/href="\/voting"[^>]*aria-current="page"/);
    expect(html).to.contain('id="phase-badge"');
    expect(html).to.contain('aria-expanded="false"');
  });

  it('render with an unknown active page marks nothing', function () {
    expect(Shell.render('public', 'nothing')).not.to.contain('aria-current');
  });
});
