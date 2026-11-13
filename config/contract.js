// INT-2: where the server finds the deployed NamVoting contract. Truffle writes
// the ABI and the address per network ID into build/contracts/NamVoting.json
// when `npm run migrate` runs.
var fs = require('fs');
var path = require('path');

var ARTIFACT = path.join(__dirname, '..', 'build', 'contracts', 'NamVoting.json');
var MESSAGE = 'The blockchain is not available. Ask an administrator to run npm run migrate.';

// Ganache not running, restarted with a fresh chain, or the contract not
// migrated: one error for all of them, which the pages show as it is.
class ChainUnavailableError extends Error {
  constructor(cause) {
    super(MESSAGE);
    this.name = 'ChainUnavailableError';
    this.status = 503;
    if (cause) this.cause = cause;
  }
}

function loadArtifact(file) {
  try {
    return JSON.parse(fs.readFileSync(file || ARTIFACT, 'utf8'));
  } catch (err) {
    throw new ChainUnavailableError(err);
  }
}

function addressFor(artifact, networkId) {
  var entry = artifact && artifact.networks && artifact.networks[String(networkId)];
  if (!entry || !entry.address) throw new ChainUnavailableError();
  return entry.address;
}

module.exports = {
  ARTIFACT: ARTIFACT,
  MESSAGE: MESSAGE,
  ChainUnavailableError: ChainUnavailableError,
  loadArtifact: loadArtifact,
  addressFor: addressFor
};
