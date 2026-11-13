// Turns a failed contract call into a message a voter or admin can read
// (Task 8, Review Focus 4 and 5). Custom errors arrive as a 4-byte selector
// somewhere inside the error that MetaMask or truffle-contract hands back.
// Works as a browser global (ChainErrors) and as a Node module (tests).
(function (root) {
  // keccak256(signature).slice(0, 10); checked against web3 in test/api/fe-errors.test.js
  var SELECTORS = {
    'WrongPhase(uint8,uint8)': '0x05fb5e1b',
    'NotRegistered()': '0xaba47339',
    'AlreadyVoted()': '0x7c9a1cf9',
    'InvalidContestant(uint256)': '0x1e2e1ff0',
    'AccessControlUnauthorizedAccount(address,bytes32)': '0xe2517d3f',
    'AlreadyRegistered(address)': '0x45ed80e9',
    'InvalidPhaseChange(uint8,uint8)': '0x7934da52'
  };

  var MESSAGES = {
    'NotRegistered()': 'Your wallet is not registered to vote.',
    'AlreadyVoted()': 'You have already voted.',
    'InvalidContestant(uint256)': 'That candidate does not exist.',
    'AccessControlUnauthorizedAccount(address,bytes32)': 'This MetaMask account is not allowed to do that.',
    'AlreadyRegistered(address)': 'That wallet is already registered to vote.',
    'InvalidPhaseChange(uint8,uint8)': 'The phase can only move forward one step at a time.'
  };

  var GENERIC = 'Something went wrong talking to the blockchain.';

  // Every string, and whether MetaMask's "user rejected" code 4001 appears,
  // anywhere in the (possibly nested, possibly circular) error.
  function inspect(err) {
    var texts = [];
    var rejected = false;
    var seen = [];
    (function walk(value, depth) {
      if (value == null || depth > 8) return;
      if (typeof value === 'string') { texts.push(value); return; }
      if (typeof value !== 'object') return;
      if (seen.indexOf(value) !== -1) return;
      seen.push(value);
      if (value.code === 4001) rejected = true;
      if (typeof value.message === 'string') texts.push(value.message);
      Object.keys(value).forEach(function (k) { walk(value[k], depth + 1); });
    })(err, 0);
    return { text: texts.join(' ').toLowerCase(), rejected: rejected };
  }

  // action: the App function that failed, e.g. 'castVote'
  function message(err, action) {
    var found = inspect(err);
    if (found.rejected) return 'You cancelled the request in MetaMask.';
    for (var signature in SELECTORS) {
      if (found.text.indexOf(SELECTORS[signature]) === -1) continue;
      if (signature === 'WrongPhase(uint8,uint8)') {
        return action === 'castVote' ? 'Voting is closed.' : 'That action is not allowed in the current phase.';
      }
      return MESSAGES[signature];
    }
    return GENERIC;
  }

  // UI-9: the bundled truffle-contract resolves even when the mined
  // transaction reverted, so callers check the receipt themselves.
  var REVERTED = 'The blockchain rejected the transaction. Nothing was changed.';

  function reverted(result) {
    var status = result && result.receipt ? result.receipt.status : undefined;
    if (status === undefined || status === null) return false;
    if (typeof status === 'boolean') return !status;
    return Number(status) === 0;
  }

  var api = { message: message, reverted: reverted, REVERTED: REVERTED, SELECTORS: SELECTORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChainErrors = api;
})(this);
