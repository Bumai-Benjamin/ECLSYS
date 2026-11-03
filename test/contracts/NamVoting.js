// NamVoting v2 (SC-1 to SC-8). Every test deploys its own contract so the
// tests don't depend on each other's state; the first one checks the
// migration-deployed instance and its role grants.
const NamVoting = artifacts.require('NamVoting');
const assert = require('assert');
const { expectRevert } = require('./helpers');

const PHASE = { reg: 0, voting: 1, done: 2 };
const ADMIN_ROLE = web3.utils.soliditySha3('ADMIN_ROLE');
const REGISTRAR_ROLE = web3.utils.soliditySha3('REGISTRAR_ROLE');
const RELAYER_ROLE = web3.utils.soliditySha3('RELAYER_ROLE');

contract('NamVoting', (accounts) => {
  const [ADMIN, REGISTRAR, RELAYER, V1, V2, V3, OUTSIDER] = accounts;
  let c;

  beforeEach(async () => {
    c = await NamVoting.new({ from: ADMIN });
    await c.grantRole(REGISTRAR_ROLE, REGISTRAR, { from: ADMIN });
  });

  async function addTwo() {
    await c.addContestant('Alice', 'Party A', 45, 'MSc', { from: ADMIN });
    await c.addContestant('Bob', 'Party B', 52, 'PhD', { from: ADMIN });
  }

  async function openVoting(voters) {
    await addTwo();
    await c.voterRegisterationBatch(voters, { from: REGISTRAR });
    await c.changeState(PHASE.voting, { from: ADMIN });
  }

  // SC-1
  it('deployer has ADMIN_ROLE; accounts[1] has REGISTRAR_ROLE', async () => {
    const deployed = await NamVoting.deployed();
    assert.equal(await deployed.ADMIN_ROLE(), ADMIN_ROLE);
    assert.ok(await deployed.hasRole(ADMIN_ROLE, ADMIN));
    assert.ok(await deployed.hasRole(REGISTRAR_ROLE, process.env.REGISTRAR_ADDRESS || REGISTRAR));
    assert.ok(await deployed.hasRole(RELAYER_ROLE, process.env.RELAYER_ADDRESS || RELAYER));
  });

  it('a non-admin addContestant reverts AccessControlUnauthorizedAccount', async () => {
    await expectRevert(c.addContestant('X', 'P', 40, 'Q', { from: OUTSIDER }), 'AccessControlUnauthorizedAccount(address,bytes32)');
  });

  // SC-2, SC-4
  it('addContestant emits ContestantAdded and increments contestantsCount', async () => {
    const tx = await c.addContestant('Alice', 'Party A', 45, 'MSc', { from: ADMIN });
    const log = tx.logs.find((l) => l.event === 'ContestantAdded');
    assert.ok(log, 'ContestantAdded emitted');
    assert.equal(log.args.id.toString(), '1');
    assert.equal(log.args.name, 'Alice');
    assert.equal((await c.contestantsCount()).toString(), '1');
  });

  it('addContestant in voting reverts WrongPhase', async () => {
    await c.changeState(PHASE.voting, { from: ADMIN });
    await expectRevert(c.addContestant('X', 'P', 40, 'Q', { from: ADMIN }), 'WrongPhase(uint8,uint8)');
  });

  it('the registrar can voterRegisteration, emitting VoterRegistered', async () => {
    const tx = await c.voterRegisteration(V1, { from: REGISTRAR });
    const log = tx.logs.find((l) => l.event === 'VoterRegistered');
    assert.ok(log, 'VoterRegistered emitted');
    assert.equal(log.args.voter, V1);
    assert.equal((await c.voters(V1)).isRegistered, true);
  });

  it('the admin can also register a voter', async () => {
    await c.voterRegisteration(V1, { from: ADMIN });
    assert.equal((await c.voters(V1)).isRegistered, true);
  });

  it('a voter cannot register themselves', async () => {
    await expectRevert(c.voterRegisteration(V1, { from: V1 }), 'AccessControlUnauthorizedAccount(address,bytes32)');
  });

  it('registering twice reverts AlreadyRegistered', async () => {
    await c.voterRegisteration(V1, { from: REGISTRAR });
    await expectRevert(c.voterRegisteration(V1, { from: REGISTRAR }), 'AlreadyRegistered(address)');
  });

  it('registering during voting reverts WrongPhase', async () => {
    await c.changeState(PHASE.voting, { from: ADMIN });
    await expectRevert(c.voterRegisteration(V1, { from: REGISTRAR }), 'WrongPhase(uint8,uint8)');
  });

  // SC-7
  it('a batch of 3 registers all 3', async () => {
    const tx = await c.voterRegisterationBatch([V1, V2, V3], { from: REGISTRAR });
    assert.equal(tx.logs.filter((l) => l.event === 'VoterRegistered').length, 3);
    for (const v of [V1, V2, V3]) assert.equal((await c.voters(v)).isRegistered, true);
  });

  it('a non-registrar batch reverts', async () => {
    await expectRevert(c.voterRegisterationBatch([V1], { from: OUTSIDER }), 'AccessControlUnauthorizedAccount(address,bytes32)');
  });

  // SC-2: one step forward only
  it('changeState(2) from reg reverts InvalidPhaseChange', async () => {
    await expectRevert(c.changeState(PHASE.done, { from: ADMIN }), 'InvalidPhaseChange(uint8,uint8)');
  });

  it('changeState(0) from voting reverts InvalidPhaseChange', async () => {
    await c.changeState(PHASE.voting, { from: ADMIN });
    await expectRevert(c.changeState(PHASE.reg, { from: ADMIN }), 'InvalidPhaseChange(uint8,uint8)');
  });

  it('a non-admin changeState reverts', async () => {
    await expectRevert(c.changeState(PHASE.voting, { from: REGISTRAR }), 'AccessControlUnauthorizedAccount(address,bytes32)');
  });

  it('changeState emits PhaseChanged', async () => {
    const tx = await c.changeState(PHASE.voting, { from: ADMIN });
    const log = tx.logs.find((l) => l.event === 'PhaseChanged');
    assert.equal(log.args.phase.toString(), String(PHASE.voting));
    assert.equal((await c.state()).toString(), String(PHASE.voting));
  });

  it('expectRevert tells custom errors apart', async () => {
    await openVoting([V1]);
    let failed = false;
    try {
      await expectRevert(c.vote(1, { from: OUTSIDER }), 'AlreadyVoted()');
    } catch (e) {
      failed = true;
    }
    assert.ok(failed, 'a NotRegistered revert must not satisfy expectRevert(..., AlreadyVoted())');
  });

  // SC-6
  it("an unregistered voter's vote reverts NotRegistered", async () => {
    await openVoting([V1]);
    await expectRevert(c.vote(1, { from: OUTSIDER }), 'NotRegistered()');
  });

  it('vote during reg reverts WrongPhase', async () => {
    await addTwo();
    await c.voterRegisteration(V1, { from: REGISTRAR });
    await expectRevert(c.vote(1, { from: V1 }), 'WrongPhase(uint8,uint8)');
  });

  it('vote(0) and vote(count+1) revert InvalidContestant', async () => {
    await openVoting([V1]);
    await expectRevert(c.vote(0, { from: V1 }), 'InvalidContestant(uint256)');
    await expectRevert(c.vote(3, { from: V1 }), 'InvalidContestant(uint256)');
  });

  it('a second vote reverts AlreadyVoted', async () => {
    await openVoting([V1]);
    await c.vote(1, { from: V1 });
    await expectRevert(c.vote(2, { from: V1 }), 'AlreadyVoted()');
  });

  // SC-3, SC-4
  it('vote emits VoteCast whose args contain no address', async () => {
    await openVoting([V1]);
    const tx = await c.vote(2, { from: V1 });
    const log = tx.logs.find((l) => l.event === 'VoteCast');
    assert.ok(log, 'VoteCast emitted');
    assert.equal(log.args.contestantId.toString(), '2');
    for (const v of Object.values(log.args)) {
      assert.ok(!/0x[0-9a-fA-F]{40}/.test(String(v)), 'VoteCast must not carry an address: ' + v);
    }
  });

  // SC-5
  it('contestants(1).voteCount is 0 during voting even after votes', async () => {
    await openVoting([V1, V2]);
    await c.vote(1, { from: V1 });
    await c.vote(1, { from: V2 });
    const c1 = await c.contestants(1);
    assert.equal(c1.voteCount.toString(), '0');
    assert.equal(c1.name, 'Alice');
    assert.equal(c1[0].toString(), '1');
  });

  it('results() reverts WrongPhase before done', async () => {
    await openVoting([V1]);
    await expectRevert(c.results(), 'WrongPhase(uint8,uint8)');
  });

  it('after done, results() and contestants() show the counts', async () => {
    await openVoting([V1, V2, V3]);
    await c.vote(1, { from: V1 });
    await c.vote(2, { from: V2 });
    await c.vote(1, { from: V3 });
    await c.changeState(PHASE.done, { from: ADMIN });
    assert.deepEqual((await c.results()).map(String), ['2', '1']);
    assert.equal((await c.contestants(1)).voteCount.toString(), '2');
  });

  it('contestants(id) for an unknown id reverts InvalidContestant', async () => {
    await expectRevert(c.contestants(1), 'InvalidContestant(uint256)');
  });

  // SC-3
  it('voters(addr) returns exactly 2 fields', async () => {
    await c.voterRegisteration(V1, { from: REGISTRAR });
    const v = await c.voters(V1);
    const positional = Object.keys(v).filter((k) => /^\d+$/.test(k));
    assert.deepEqual(positional, ['0', '1']);
    assert.equal(v.isRegistered, true);
    assert.equal(v.hasVoted, false);
  });
});
