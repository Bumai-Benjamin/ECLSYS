// SEC-2 / D3: admin pages need an admin session, voter pages need a login,
// and the raw .html files behind them can't be fetched directly.
var expect = require('chai').expect;
var h = require('./helpers');

var ADMIN_ROUTES = ['/addCandidate', '/changePhase', '/candidateDetails', '/table_view'];
var VOTER_ROUTES = ['/form', '/userInfo', '/voting', '/vote_area', '/dashboard'];

// Ways a static file server on Windows can be talked into serving a file.
var RAW_ADMIN_FILE_VARIANTS = [
  '/adminAddCandidate.html',
  '/ADMINADDCANDIDATE.HTML',
  '/%61dminAddCandidate.html',
  '/adminAddCandidate.html.',
  '/adminAddCandidate.html%20',
  '/adminAddCandidate.html::$DATA',
  '/%5CadminAddCandidate.html',
  '/./adminAddCandidate.html',
  '/css/../adminAddCandidate.html',
  '/adminChangePhase.html',
  '/adminCandidateDetails.html'
];

describe('SEC-2 route guards', function () {
  var voter, admin;

  before(async function () {
    voter = await h.createUser();
    admin = await h.createUser({ role: 'admin' });
  });

  describe('anonymous visitor', function () {
    ADMIN_ROUTES.forEach(function (p) {
      it('is sent to /adlogin from ' + p, async function () {
        var res = await h.agent().get(p);
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/adlogin');
      });
    });

    VOTER_ROUTES.forEach(function (p) {
      it('is sent to /login from ' + p, async function () {
        var res = await h.agent().get(p);
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/login');
      });
    });

    it('can still see /result', async function () {
      var res = await h.agent().get('/result');
      expect(res.status).to.equal(200);
    });

    RAW_ADMIN_FILE_VARIANTS.forEach(function (p) {
      it('cannot fetch the raw admin page ' + p, async function () {
        var res = await h.agent().get(p);
        expect(res.status).to.not.equal(200);
        expect(res.text || '').to.not.contain('Add Candidate Information');
      });
    });

    ['/userInfo.html', '/voting.html', '/vote_area.html', '/VOTING.HTML'].forEach(function (p) {
      it('cannot fetch the raw voter page ' + p, async function () {
        var res = await h.agent().get(p);
        expect(res.status).to.equal(302);
        expect(res.headers.location).to.equal('/login');
      });
    });

    ['/views/adminVoterReg.ejs', '/views/login-form.ejs', '/VIEWS/emailverify.ejs'].forEach(function (p) {
      it('cannot download template source ' + p, async function () {
        var res = await h.agent().get(p);
        expect(res.status).to.equal(404);
      });
    });

    it('cannot POST voter registration data', async function () {
      var res = await h.agent().post('/registerdata').type('form').send({ id_number: '1', account_address: '0x0' });
      expect(res.status).to.equal(302);
      expect(res.headers.location).to.equal('/login');
    });
  });

  describe('logged-in voter', function () {
    var a;
    before(async function () {
      a = h.agent();
      var res = await h.login(a, voter);
      expect(res.status).to.equal(302);
    });

    ADMIN_ROUTES.concat(['/adminAddCandidate.html']).forEach(function (p) {
      it('gets 403 from ' + p, async function () {
        var res = await a.get(p);
        expect(res.status).to.equal(403);
      });
    });

    VOTER_ROUTES.forEach(function (p) {
      it('can open ' + p, async function () {
        var res = await a.get(p);
        expect(res.status).to.equal(200);
      });
    });
  });

  describe('logged-in admin', function () {
    var a;
    before(async function () {
      a = h.agent();
      var res = await h.adminLogin(a, admin);
      expect(res.status).to.equal(302);
    });

    ADMIN_ROUTES.forEach(function (p) {
      it('can open ' + p, async function () {
        var res = await a.get(p);
        expect(res.status).to.equal(200);
      });
    });
  });
});
