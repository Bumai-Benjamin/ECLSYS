// UI-3: what the MetaMask status panel says (spec §4.3).
var expect = require('chai').expect;
var WalletStatus = require('../../src/js/wallet-status');

var ME = '0x1234567890abcdef1234567890abcdef12345678';
var OTHER = '0x9999999990abcdef1234567890abcdef12349999';

function decide(overrides) {
  return WalletStatus.decide(Object.assign({
    hasEthereum: true, accounts: [ME], chainId: '0x539', expectedWallet: ME, role: 'voter', isAdminAccount: null
  }, overrides));
}

describe('UI-3 wallet status', function () {
  it('no-metamask', function () {
    var r = decide({ hasEthereum: false });
    expect(r).to.deep.equal({ state: 'no-metamask', message: 'You need the MetaMask browser extension to vote.', action: 'install' });
  });

  it('not-connected', function () {
    expect(decide({ accounts: null })).to.deep.equal({ state: 'not-connected', message: 'Connect MetaMask to continue.', action: 'connect' });
  });

  it('locked MetaMask (accounts []) is not-connected', function () {
    expect(decide({ accounts: [] }).state).to.equal('not-connected');
  });

  it('wrong-network', function () {
    expect(decide({ chainId: '0x1' })).to.deep.equal({ state: 'wrong-network', message: 'MetaMask is on another network.', action: 'switch-network' });
  });

  it('chain id 0X539 counts as the right network', function () {
    expect(decide({ chainId: '0X539' }).state).to.equal('ok');
  });

  it('wrong-account', function () {
    expect(decide({ accounts: [OTHER] })).to.deep.equal({
      state: 'wrong-account',
      message: 'This MetaMask account isn\'t the wallet you registered (0x1234…5678). Switch account in MetaMask.',
      action: null
    });
  });

  it('address case differences are not a wrong account', function () {
    expect(decide({ expectedWallet: ME.toUpperCase().replace('0X', '0x'), accounts: [ME] }).state).to.equal('ok');
    expect(decide({ expectedWallet: ME, accounts: ['0x1234567890ABCDEF1234567890ABCDEF12345678'] }).state).to.equal('ok');
  });

  it('a voter with no registered wallet yet is ok', function () {
    expect(decide({ expectedWallet: null, accounts: [OTHER] }).state).to.equal('ok');
  });

  it('not-admin', function () {
    expect(decide({ role: 'admin', expectedWallet: null, isAdminAccount: false })).to.deep.equal({
      state: 'not-admin', message: 'This MetaMask account isn\'t an election administrator.', action: null
    });
  });

  it('admin with unknown admin status is ok', function () {
    expect(decide({ role: 'admin', expectedWallet: null, isAdminAccount: null }).state).to.equal('ok');
  });

  it('ok', function () {
    expect(decide({})).to.deep.equal({ state: 'ok', message: 'Connected: 0x1234…5678', action: null });
  });

  it('precedence: no MetaMask wins over everything', function () {
    expect(decide({ hasEthereum: false, accounts: [], chainId: '0x1' }).state).to.equal('no-metamask');
  });

  it('wrong network checked before wrong account', function () {
    expect(decide({ chainId: '0x1', accounts: [OTHER] }).state).to.equal('wrong-network');
  });

  it('short() gives 0x1234…abcd', function () {
    expect(WalletStatus.short('0x1234aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabcd')).to.equal('0x1234…abcd');
  });
});
