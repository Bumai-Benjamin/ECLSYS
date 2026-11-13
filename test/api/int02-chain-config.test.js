// INT-2: the server finds the deployed NamVoting contract through the Truffle
// artifact. When it can't (Ganache restarted with a fresh chain, contract not
// migrated) every chain call fails with one readable error (Review Focus 1).
var fs = require('fs');
var os = require('os');
var path = require('path');
var expect = require('chai').expect;
var contract = require('../../config/contract');
var fakes = require('./fakes');

var MESSAGE = 'The blockchain is not available. Ask an administrator to run npm run migrate.';

function expectUnavailable(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).to.be.instanceOf(contract.ChainUnavailableError);
    expect(err.message).to.equal(MESSAGE);
    expect(err.status).to.equal(503);
    return;
  }
  throw new Error('expected ChainUnavailableError');
}

async function expectRejectsUnavailable(promise) {
  try {
    await promise;
  } catch (err) {
    expect(err).to.be.instanceOf(contract.ChainUnavailableError);
    return;
  }
  throw new Error('expected ChainUnavailableError');
}

describe('INT-2 server-side contract access', function () {
  describe('config/contract.addressFor', function () {
    it('throws ChainUnavailableError when the network has no deployment', function () {
      expectUnavailable(function () {
        contract.addressFor({ networks: { 1234: { address: '0x' + '1'.repeat(40) } } }, '5777');
      });
    });

    it('throws ChainUnavailableError when there is no artifact', function () {
      expectUnavailable(function () { contract.addressFor(null, '5777'); });
    });

    it('returns the deployed address for the network', function () {
      var addr = '0x' + 'a'.repeat(40);
      expect(contract.addressFor({ networks: { 5777: { address: addr } } }, '5777')).to.equal(addr);
    });
  });

  describe('config/contract.loadArtifact', function () {
    it('throws ChainUnavailableError when the build file is missing', function () {
      expectUnavailable(function () {
        contract.loadArtifact(path.join(os.tmpdir(), 'no-such-dir-' + Date.now(), 'NamVoting.json'));
      });
    });

    it('reads the artifact JSON', function () {
      var file = path.join(os.tmpdir(), 'namvoting-artifact-' + Date.now() + '.json');
      fs.writeFileSync(file, JSON.stringify({ abi: [], networks: {} }));
      try {
        expect(contract.loadArtifact(file)).to.deep.equal({ abi: [], networks: {} });
      } finally {
        fs.unlinkSync(file);
      }
    });
  });

  describe('test/api/fakes.fakeChain', function () {
    it('registers voters in memory and records the calls', async function () {
      var chain = fakes.fakeChain();
      var wallet = '0x' + 'b'.repeat(40);
      expect(await chain.isRegistered(wallet)).to.equal(false);
      var res = await chain.registerVoter(wallet);
      expect(res.txHash).to.match(/^0x[0-9a-f]{64}$/);
      expect(chain.calls.registerVoter).to.deep.equal([wallet]);
      expect(await chain.isRegistered(wallet)).to.equal(true);
      expect(await chain.registerVoter(wallet)).to.deep.equal({ txHash: null, alreadyRegistered: true });
      var audit = await chain.audit();
      expect(audit.events.map(function (e) { return e.event; })).to.include('VoterRegistered');
    });

    it('rejects every method with ChainUnavailableError when unavailable', async function () {
      var chain = fakes.fakeChain({ unavailable: true });
      await expectRejectsUnavailable(chain.registerVoter('0x' + 'c'.repeat(40)));
      await expectRejectsUnavailable(chain.isRegistered('0x' + 'c'.repeat(40)));
      await expectRejectsUnavailable(chain.audit());
    });

    it('lets a test override a method', async function () {
      var chain = fakes.fakeChain({ isRegistered: async function () { return true; } });
      expect(await chain.isRegistered('0x' + 'd'.repeat(40))).to.equal(true);
    });
  });

  describe('lib/chain', function () {
    it('rejects with ChainUnavailableError when the RPC is unreachable', async function () {
      this.timeout(20000);
      // A real artifact, so the failure comes from the RPC and not the missing build
      var file = path.join(os.tmpdir(), 'namvoting-artifact-rpc-' + Date.now() + '.json');
      fs.writeFileSync(file, JSON.stringify({ abi: [], networks: { 5777: { address: '0x' + '1'.repeat(40) } } }));
      try {
        var chain = require('../../lib/chain').create({
          rpcUrl: 'http://127.0.0.1:1', registrarKey: '1'.repeat(64), artifactFile: file
        });
        await expectRejectsUnavailable(chain.isRegistered('0x' + 'e'.repeat(40)));
        await expectRejectsUnavailable(chain.registerVoter('0x' + 'e'.repeat(40)));
        await expectRejectsUnavailable(chain.audit());
      } finally {
        fs.unlinkSync(file);
      }
    });
  });

  describe('createApp', function () {
    it('uses the fake chain in API tests (CHAIN=fake)', function () {
      var app = require('../../server').createApp();
      expect(app.locals.chain.calls).to.be.an('object');
    });

    it('uses the chain passed in options', function () {
      var chain = fakes.fakeChain();
      var app = require('../../server').createApp({ chain: chain });
      expect(app.locals.chain).to.equal(chain);
    });
  });
});
