// UI-3: what the MetaMask status panel tells the voter or admin (spec §4.3).
// Runs in the browser (window.WalletStatus) and in Node for the tests.
(function (root) {
  var EXPECTED_CHAIN_ID = '0x539'; // Ganache, chain ID 1337

  function short(address) {
    var a = String(address || '');
    return a.length > 13 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
  }

  function result(state, message, action) {
    return { state: state, message: message, action: action || null };
  }

  // input: { hasEthereum, accounts, chainId, expectedWallet, role, isAdminAccount }
  function decide(input) {
    if (!input.hasEthereum) return result('no-metamask', 'You need the MetaMask browser extension to vote.', 'install');
    var accounts = input.accounts || [];
    if (!accounts.length) return result('not-connected', 'Connect MetaMask to continue.', 'connect');
    if (String(input.chainId || '').toLowerCase() !== EXPECTED_CHAIN_ID) {
      return result('wrong-network', 'MetaMask is on another network.', 'switch-network');
    }
    var account = String(accounts[0]);
    // Addresses differ only in letter case between the DB and MetaMask (Review Focus 1)
    if (input.role !== 'admin' && input.expectedWallet &&
        String(input.expectedWallet).toLowerCase() !== account.toLowerCase()) {
      return result('wrong-account', 'This MetaMask account isn\'t the wallet you registered (' +
        short(input.expectedWallet) + '). Switch account in MetaMask.');
    }
    if (input.role === 'admin' && input.isAdminAccount === false) {
      return result('not-admin', 'This MetaMask account isn\'t an election administrator.');
    }
    return result('ok', 'Connected: ' + short(account));
  }

  var api = { decide: decide, short: short, EXPECTED_CHAIN_ID: EXPECTED_CHAIN_ID };
  root.WalletStatus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
