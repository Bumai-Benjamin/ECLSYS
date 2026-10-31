var expect = require('chai').expect;
var h = require('./helpers');

describe('API smoke', function () {
  it('serves the public pages', async function () {
    var a = h.agent();
    for (var p of ['/login', '/register', '/adlogin', '/result']) {
      var res = await a.get(p);
      expect(res.status, p).to.equal(200);
    }
  });

  it('runs against the migrated test database', async function () {
    var rows = await h.query('SELECT DATABASE() AS db');
    expect(rows[0].db).to.match(/_test$/);
  });
});
