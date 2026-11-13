// FE (Task 8): the pages talk to contract v2 and turn reverts into plain
// messages (Review Focus 4 and 5). src/js/errors.js runs in the browser and here.
var fs = require('fs');
var path = require('path');
var expect = require('chai').expect;
var Web3 = require('web3').Web3 || require('web3');
var ChainErrors = require('../../src/js/errors');

var SRC = path.join(__dirname, '..', '..', 'src');
var APP_JS = fs.readFileSync(path.join(SRC, 'js', 'app.js'), 'utf8');

function sel(signature) {
  return Web3.utils.sha3(signature).slice(0, 10);
}

// What a revert looks like by the time it reaches the page: the selector is
// somewhere in the serialized error (truffle-contract / MetaMask nest it).
function revert(signature) {
  return { message: 'execution reverted', data: { data: sel(signature) + '0'.repeat(64) } };
}

describe('FE readable chain errors', function () {
  it('WrongPhase during voting says voting is closed', function () {
    expect(ChainErrors.message(revert('WrongPhase(uint8,uint8)'), 'castVote')).to.equal('Voting is closed.');
  });

  it('WrongPhase elsewhere says the action is not allowed now', function () {
    expect(ChainErrors.message(revert('WrongPhase(uint8,uint8)'), 'addCandidate'))
      .to.equal('That action is not allowed in the current phase.');
    expect(ChainErrors.message(revert('WrongPhase(uint8,uint8)'))).to.equal('That action is not allowed in the current phase.');
  });

  [
    ['NotRegistered()', 'Your wallet is not registered to vote.'],
    ['AlreadyVoted()', 'You have already voted.'],
    ['InvalidContestant(uint256)', 'That candidate does not exist.'],
    ['AccessControlUnauthorizedAccount(address,bytes32)', 'This MetaMask account is not allowed to do that.'],
    ['AlreadyRegistered(address)', 'That wallet is already registered to vote.'],
    ['InvalidPhaseChange(uint8,uint8)', 'The phase can only move forward one step at a time.']
  ].forEach(function (pair) {
    it(pair[0] + ' -> "' + pair[1] + '"', function () {
      expect(ChainErrors.message(revert(pair[0]))).to.equal(pair[1]);
    });
  });

  it('finds the selector however deeply it is nested', function () {
    var err = { message: 'Internal JSON-RPC error.', data: { originalError: { data: sel('AlreadyVoted()') } } };
    expect(ChainErrors.message(err)).to.equal('You have already voted.');
    expect(ChainErrors.message(new Error('VM Exception while processing transaction: revert ' + sel('NotRegistered()'))))
      .to.equal('Your wallet is not registered to vote.');
  });

  it('MetaMask code 4001 says the request was cancelled', function () {
    expect(ChainErrors.message({ code: 4001, message: 'User denied transaction signature.' }))
      .to.equal('You cancelled the request in MetaMask.');
    expect(ChainErrors.message({ data: { originalError: { code: 4001 } } })).to.equal('You cancelled the request in MetaMask.');
  });

  it('anything else gets the generic message', function () {
    expect(ChainErrors.message(new Error('socket hang up'))).to.equal('Something went wrong talking to the blockchain.');
    expect(ChainErrors.message(undefined)).to.equal('Something went wrong talking to the blockchain.');
  });

  it('the hard-coded selectors match the contract errors', function () {
    Object.keys(ChainErrors.SELECTORS).forEach(function (s) {
      expect(ChainErrors.SELECTORS[s], s).to.equal(sel(s));
    });
  });
});

describe('FE app.js on contract v2', function () {
  it('asks for accounts with eth_requestAccounts only', function () {
    expect(APP_JS).to.contain("'eth_requestAccounts'");
    expect(APP_JS).to.not.contain('ethereum.enable(');
    expect(APP_JS).to.not.contain('_state.accounts');
  });

  it('checks for the Ganache chain (1337)', function () {
    expect(APP_JS).to.contain("'0x539'");
    // UI-6: the wrong-network message now comes from WalletStatus (spec §4.3), with a switch button
    expect(APP_JS).to.contain('WalletStatus.decide(');
    expect(APP_JS).to.contain('wallet_switchEthereumChain');
  });

  it('sends every transaction from App.account', function () {
    ['addContestant', 'voterRegisteration', 'changeState', 'vote'].forEach(function (fn) {
      var call = new RegExp('instance\\.' + fn + '\\(([^;]*)\\);');
      var m = call.exec(APP_JS);
      expect(m, fn).to.not.equal(null);
      expect(m[1], fn).to.contain('{ from: App.account }');
    });
  });

  it('changeState reads the phase from the chain (no global counter)', function () {
    expect(APP_JS).to.not.match(/phaseEnum\+\+/);
    expect(APP_JS).to.not.match(/var phaseEnum/);
  });

  it('reloads when the account or network changes', function () {
    expect(APP_JS).to.contain("'accountsChanged'");
    expect(APP_JS).to.contain("'chainChanged'");
  });

  // UI-6: the MetaMask status panel (#wallet-status) replaced the #chainError box
  it('every page that loads app.js loads errors.js, wallet-status.js, steps.js and pending.js first and has a #wallet-status panel', function () {
    var pages = fs.readdirSync(SRC).filter(function (f) { return /\.html$/.test(f); }).map(function (f) { return path.join(SRC, f); })
      .concat(fs.readdirSync(path.join(SRC, 'views')).map(function (f) { return path.join(SRC, 'views', f); }));
    var checked = 0;
    pages.forEach(function (f) {
      var html = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      var app = html.search(/<script[^>]+src="js\/app\.js"/);
      if (app === -1) return;
      checked++;
      var errs = html.search(/<script[^>]+src="js\/errors\.js"/);
      expect(errs, path.basename(f)).to.be.greaterThan(-1);
      expect(errs, path.basename(f)).to.be.lessThan(app);
      ['wallet-status', 'steps', 'pending'].forEach(function (mod) {
        var at = html.search(new RegExp('<script[^>]+src="js\/' + mod + '\.js"'));
        expect(at, path.basename(f) + ' ' + mod).to.be.greaterThan(-1);
        expect(at, path.basename(f) + ' ' + mod).to.be.lessThan(app);
      });
      expect(html, path.basename(f)).to.match(/<div id="wallet-status" class="status-panel" role="status" aria-live="polite"><\/div>/);
      expect(html, path.basename(f)).not.to.match(/id="chainError"/);
    });
    expect(checked).to.be.greaterThan(5);
  });
});
