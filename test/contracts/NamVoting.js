// NamVoting v3 (SC-1 to SC-8, ANON-1 to ANON-5). Every test deploys its own
// NamVoting (each gets its own Semaphore group) so the tests don't depend on
// each other's state; the first one checks the migration-deployed instance.
// Votes are real Semaphore proofs made with the depth-16 circuit in src/zk.
const NamVoting = artifacts.require('NamVoting');
const Semaphore = artifacts.require('Semaphore');
const assert = require('assert');
const { expectRevert } = require('./helpers');
const zk = require('./zk');

const PHASE = { reg: 0, voting: 1, done: 2 };
const ADMIN_ROLE = web3.utils.soliditySha3('ADMIN_ROLE');
const REGISTRAR_ROLE = web3.utils.soliditySha3('REGISTRAR_ROLE');
const RELAYER_ROLE = web3.utils.soliditySha3('RELAYER_ROLE');

contract('NamVoting', (accounts) => {
  const [ADMIN, REGISTRAR, RELAYER, V1, V2, V3, OUTSIDER] = accounts;
  const ID = { [V1]: zk.identity(1), [V2]: zk.identity(2), [V3]: zk.identity(3) };
  let semaphore;
  let c;

  before(async () => {
    semaphore = await Semaphore.deployed();
  });

  beforeEach(async () => {
    c = await NamVoting.new(semaphore.address, { from: ADMIN });
    await c.grantRole(REGISTRAR_ROLE, REGISTRAR, { from: ADMIN });
  });

  function commitment(voter) {
    return ID[voter].commitment.toString();
  }

  async function addTwo() {
    await c.addContestant('Alice', 'Party A', 45, 'MSc', { from: ADMIN });
    await c.addContestant('Bob', 'Party B', 52, 'PhD', { from: ADMIN });
  }

  async function openVoting(voters) {
    await addTwo();
    await c.voterRegisterationBatch(voters, voters.map(commitment), { from: REGISTRAR });
    await c.changeState(PHASE.voting, { from: ADMIN });
  }

  // A proof by `voter` for `contestantId`, against the group as it is on-chain
  async function proof(voter, contestantId, scope) {
    const members = (await c.members()).map(String);
    return zk.proofFor(ID[voter], members, contestantId, scope || (await c.electionId()).toString());
  }

  async function vote(voter, contestantId) {
    return c.castVote(await proof(voter, contestantId), { from: RELAYER });
  }

  // SC-1
  it('deployer has ADMIN_ROLE; accounts[1] has REGISTRAR_ROLE', async () => {
    const deployed = await NamVoting.deployed();
    assert.equal(await deployed.ADMIN_ROLE(), ADMIN_ROLE);
    assert.ok(await deployed.hasRole(ADMIN_ROLE, ADMIN));
    assert.ok(await deployed.hasRole(REGISTRAR_ROLE, process.env.REGISTRAR_ADDRESS || REGISTRAR));
    assert.ok(await deployed.hasRole(RELAYER_ROLE, process.env.RELAYER_ADDRESS || RELAYER));
    assert.equal(await deployed.semaphore(), semaphore.address);
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

  // ANON-1
  it('each contract gets its own Semaphore group, with itself as admin', async () => {
    const other = await NamVoting.new(semaphore.address, { from: ADMIN });
    assert.notEqual((await other.groupId()).toString(), (await c.groupId()).toString());
    assert.notEqual((await other.electionId()).toString(), (await c.electionId()).toString());
    assert.equal(await semaphore.getGroupAdmin(await c.groupId()), c.address);
  });

  it('the registrar registers a wallet and its commitment, emitting VoterRegistered', async () => {
    const tx = await c.voterRegisteration(V1, commitment(V1), { from: REGISTRAR });
    const log = tx.logs.find((l) => l.event === 'VoterRegistered');
    assert.ok(log, 'VoterRegistered emitted');
    assert.equal(log.args.voter, V1);
    assert.equal(await c.registered(V1), true);
    assert.deepEqual((await c.members()).map(String), [commitment(V1)]);
    assert.equal((await c.votersCount()).toString(), '1');
    assert.equal((await semaphore.getMerkleTreeSize(await c.groupId())).toString(), '1');
  });

  it('the admin can also register a voter', async () => {
    await c.voterRegisteration(V1, commitment(V1), { from: ADMIN });
    assert.equal(await c.registered(V1), true);
  });

  it('a voter cannot register themselves', async () => {
    await expectRevert(c.voterRegisteration(V1, commitment(V1), { from: V1 }), 'AccessControlUnauthorizedAccount(address,bytes32)');
  });

  it('registering a wallet twice reverts AlreadyRegistered', async () => {
    await c.voterRegisteration(V1, commitment(V1), { from: REGISTRAR });
    await expectRevert(c.voterRegisteration(V1, commitment(V2), { from: REGISTRAR }), 'AlreadyRegistered(address)');
  });

  it('the same commitment cannot join twice under another wallet', async () => {
    await c.voterRegisteration(V1, commitment(V1), { from: REGISTRAR });
    await expectRevert(c.voterRegisteration(V2, commitment(V1), { from: REGISTRAR }), 'LeafAlreadyExists()');
    assert.equal(await c.registered(V2), false);
  });

  it('registering during voting reverts WrongPhase', async () => {
    await c.changeState(PHASE.voting, { from: ADMIN });
    await expectRevert(c.voterRegisteration(V1, commitment(V1), { from: REGISTRAR }), 'WrongPhase(uint8,uint8)');
  });

  // SC-7
  it('a batch of 3 registers all 3', async () => {
    const tx = await c.voterRegisterationBatch([V1, V2, V3], [V1, V2, V3].map(commitment), { from: REGISTRAR });
    assert.equal(tx.logs.filter((l) => l.event === 'VoterRegistered').length, 3);
    for (const v of [V1, V2, V3]) assert.equal(await c.registered(v), true);
    assert.deepEqual((await c.members()).map(String), [V1, V2, V3].map(commitment));
  });

  it('a batch with unequal lists reverts LengthMismatch', async () => {
    await expectRevert(c.voterRegisterationBatch([V1, V2], [commitment(V1)], { from: REGISTRAR }), 'LengthMismatch()');
  });

  it('a non-registrar batch reverts', async () => {
    await expectRevert(c.voterRegisterationBatch([V1], [commitment(V1)], { from: OUTSIDER }), 'AccessControlUnauthorizedAccount(address,bytes32)');
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

  // ANON-2, ANON-3, ANON-4
  it('a member votes with a proof sent by the relayer', async () => {
    await openVoting([V1, V2]);
    const p = await proof(V1, 2);
    const tx = await c.castVote(p, { from: RELAYER });
    const log = tx.logs.find((l) => l.event === 'VoteCast');
    assert.ok(log, 'VoteCast emitted');
    assert.equal(log.args.contestantId.toString(), '2');
    assert.equal(log.args.nullifier.toString(), p.nullifier);
    assert.equal(await c.nullifierUsed(p.nullifier), true);
  });

  // SC-3, SC-4, the point of ANON: nothing in the vote transaction names the voter
  it('the vote transaction carries no voter wallet or commitment', async () => {
    await openVoting([V1, V2]);
    const tx = await vote(V1, 1);
    const raw = await web3.eth.getTransaction(tx.tx);
    assert.equal(raw.from.toLowerCase(), RELAYER.toLowerCase());
    const everything = JSON.stringify(raw).toLowerCase() + JSON.stringify(tx.receipt).toLowerCase();
    assert.ok(!everything.includes(V1.slice(2).toLowerCase()), 'the voter wallet must not appear');
    const commitmentHex = BigInt(commitment(V1)).toString(16);
    assert.ok(!everything.includes(commitmentHex), 'the voter commitment must not appear');
  });

  it('expectRevert tells custom errors apart', async () => {
    await openVoting([V1]);
    const p = await proof(V1, 1);
    await c.castVote(p, { from: RELAYER });
    let failed = false;
    try {
      await expectRevert(c.castVote(p, { from: RELAYER }), 'InvalidProof()');
    } catch (e) {
      failed = true;
    }
    assert.ok(failed, 'an AlreadyVoted revert must not satisfy expectRevert(..., InvalidProof())');
  });

  // SC-6
  it('a second vote by the same identity reverts AlreadyVoted, even for another candidate', async () => {
    await openVoting([V1, V2]);
    await vote(V1, 1);
    await expectRevert(vote(V1, 2), 'AlreadyVoted()');
  });

  it('someone outside the group cannot make a proof that verifies', async () => {
    await openVoting([V1, V2]);
    const members = (await c.members()).map(String);
    const outsider = zk.identity('outsider');
    // A proof against a group that includes the outsider has a root this
    // election never had.
    const p = await zk.proofFor(outsider, members.concat(outsider.commitment.toString()), 1, (await c.electionId()).toString());
    await expectRevert(c.castVote(p, { from: RELAYER }), 'Semaphore__MerkleTreeRootIsNotPartOfTheGroup()');
  });

  it('a proof whose message was changed reverts InvalidProof', async () => {
    await openVoting([V1, V2]);
    const p = await proof(V1, 1);
    await expectRevert(c.castVote(Object.assign({}, p, { message: '2' }), { from: RELAYER }), 'InvalidProof()');
  });

  it('a proof made for another election reverts WrongElection', async () => {
    await openVoting([V1]);
    const p = await proof(V1, 1, '12345');
    await expectRevert(c.castVote(p, { from: RELAYER }), 'WrongElection(uint256)');
  });

  it('castVote during reg reverts WrongPhase', async () => {
    await addTwo();
    await c.voterRegisteration(V1, commitment(V1), { from: REGISTRAR });
    await expectRevert(vote(V1, 1), 'WrongPhase(uint8,uint8)');
  });

  it('votes for contestant 0 and count+1 revert InvalidContestant', async () => {
    await openVoting([V1]);
    await expectRevert(vote(V1, 0), 'InvalidContestant(uint256)');
    await expectRevert(vote(V1, 3), 'InvalidContestant(uint256)');
  });

  // SC-5
  it('contestants(1).voteCount is 0 during voting even after votes', async () => {
    await openVoting([V1, V2]);
    await vote(V1, 1);
    await vote(V2, 1);
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
    await vote(V1, 1);
    await vote(V2, 2);
    await vote(V3, 1);
    await c.changeState(PHASE.done, { from: ADMIN });
    assert.deepEqual((await c.results()).map(String), ['2', '1']);
    assert.equal((await c.contestants(1)).voteCount.toString(), '2');
  });

  it('contestants(id) for an unknown id reverts InvalidContestant', async () => {
    await expectRevert(c.contestants(1), 'InvalidContestant(uint256)');
  });
});
