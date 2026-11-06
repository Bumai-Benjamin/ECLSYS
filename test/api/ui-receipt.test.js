// UI-9: the bundled truffle-contract resolves even when a mined transaction
// reverted (receipt status 0), so the pages must check the receipt before
// they say "Your vote is recorded." or "Candidate added.".
var expect = require('chai').expect;
var ChainErrors = require('../../src/js/errors');

describe('UI-9 reverted receipts', function () {
  it('status 0 in any form is a failure', function () {
    [false, 0, '0x0', '0x00', '0'].forEach(function (status) {
      expect(ChainErrors.reverted({ receipt: { status: status } }), JSON.stringify(status)).to.equal(true);
    });
  });

  it('status 1 in any form is a success', function () {
    [true, 1, '0x1', '0x01', '1'].forEach(function (status) {
      expect(ChainErrors.reverted({ receipt: { status: status } }), JSON.stringify(status)).to.equal(false);
    });
  });

  it('no receipt or no status (pre-Byzantium nodes) is not called a failure', function () {
    expect(ChainErrors.reverted(undefined)).to.equal(false);
    expect(ChainErrors.reverted({})).to.equal(false);
    expect(ChainErrors.reverted({ receipt: {} })).to.equal(false);
  });

  it('has a plain message for it', function () {
    expect(ChainErrors.REVERTED).to.equal('The blockchain rejected the transaction. Nothing was changed.');
  });

  it('app.js checks the receipt before each success message', function () {
    var src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'js', 'app.js'), 'utf8');
    expect((src.match(/ChainErrors\.reverted\(/g) || []).length).to.be.at.least(4);
  });
});
