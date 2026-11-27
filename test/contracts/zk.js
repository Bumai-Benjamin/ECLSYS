// Semaphore helpers for the contract tests: identities, and proofs made with
// the same depth-16 circuit files the voting page uses (src/zk).
const path = require('path');
const { Identity, Group, generateProof } = require('@semaphore-protocol/core');

const DEPTH = 16;
const ARTIFACTS = {
  wasm: path.join(__dirname, '..', '..', 'src', 'zk', 'semaphore-' + DEPTH + '.wasm'),
  zkey: path.join(__dirname, '..', '..', 'src', 'zk', 'semaphore-' + DEPTH + '.zkey')
};

function identity(seed) {
  return new Identity('namvoting-test-' + seed);
}

// The proof as castVote takes it: decimal strings, points as an array of 8.
async function proofFor(id, commitments, contestantId, scope) {
  const group = new Group(commitments.map(String));
  const p = await generateProof(id, group, String(contestantId), String(scope), DEPTH, ARTIFACTS);
  return {
    merkleTreeDepth: String(p.merkleTreeDepth),
    merkleTreeRoot: String(p.merkleTreeRoot),
    nullifier: String(p.nullifier),
    message: String(p.message),
    scope: String(p.scope),
    points: p.points.map(String)
  };
}

module.exports = { identity, proofFor, DEPTH, ARTIFACTS };
