// Source of src/js/semaphore.bundle.js (npm run build:zk). The bundle sets
// window.VoterKey, which the registration and voting pages use (ANON-1,
// ANON-2). Everything secret stays in the browser: the server only ever sees
// the identity commitment (at registration) and a proof (when voting).
import { Identity, Group, generateProof } from '@semaphore-protocol/core';

// One circuit size for every election: depth 16 holds 65,536 voters. The
// files are in src/zk (docs/anonymity.md says where they come from).
var DEPTH = 16;
var ARTIFACTS = { wasm: '/zk/semaphore-16.wasm', zkey: '/zk/semaphore-16.zkey' };

// What MetaMask asks the voter to sign. The signature is the identity's
// private key, so it names the election (a new contract gives a new key) and
// warns the voter not to sign it anywhere else.
function signMessage(contractAddress) {
  return [
    'NamVoting: create my private voting key.',
    '',
    'Election contract: ' + String(contractAddress).toLowerCase(),
    '',
    'This does not send a transaction or cost anything.',
    'Only sign this on the NamVoting site: anyone who has this signature can vote in your name.'
  ].join('\n');
}

function toHex(text) {
  var bytes = new TextEncoder().encode(text);
  var hex = '0x';
  for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// The same wallet signing the same message always gives the same signature
// (RFC 6979), so the voter gets the same identity back on any device.
async function identityFromWallet(ethereum, address, contractAddress) {
  var signature = await ethereum.request({
    method: 'personal_sign',
    params: [toHex(signMessage(contractAddress)), address]
  });
  return new Identity(signature);
}

// The proof castVote takes: message = contestant id, scope = election id.
// members: every identity commitment in the election, in order.
async function proveVote(identity, members, contestantId, electionId) {
  var group = new Group(members.map(String));
  if (group.indexOf(identity.commitment) === -1) {
    var err = new Error('This wallet\'s voting key is not registered in this election.');
    err.code = 'not_member';
    throw err;
  }
  var p = await generateProof(identity, group, String(contestantId), String(electionId), DEPTH, ARTIFACTS);
  return {
    merkleTreeDepth: String(p.merkleTreeDepth),
    merkleTreeRoot: String(p.merkleTreeRoot),
    nullifier: String(p.nullifier),
    message: String(p.message),
    scope: String(p.scope),
    points: p.points.map(String)
  };
}

window.VoterKey = {
  DEPTH: DEPTH,
  signMessage: signMessage,
  identityFromWallet: identityFromWallet,
  commitment: function (identity) { return identity.commitment.toString(); },
  proveVote: proveVote
};
