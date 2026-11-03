// Shared helpers for the contract tests.
const assert = require('assert');

// Awaits `promise`, expects it to revert, and checks the revert data carries
// the 4-byte selector of `errorSignature`, e.g. 'WrongPhase(uint8,uint8)'.
async function expectRevert(promise, errorSignature) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.ok(err, 'expected a revert with ' + errorSignature + ', but the call succeeded');
  const selector = web3.utils.sha3(errorSignature).slice(0, 10);
  const text = JSON.stringify(err) + ' ' + String(err && err.data && err.data.result || '') + ' ' + String(err && err.message);
  assert.ok(text.toLowerCase().includes(selector.toLowerCase()),
    'expected revert ' + errorSignature + ' (' + selector + '), got: ' + String(err.message).slice(0, 300));
}

module.exports = { expectRevert };
