// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

// NamVoting v3: SC-1 to SC-8, plus anonymous voting (ANON-1 to ANON-5).
//
// Each voter has a Semaphore identity, made in their browser from a MetaMask
// signature. Registration puts the identity's public commitment into this
// election's Semaphore group. A vote is a zero-knowledge proof that says
// "a member of the group chose candidate N" without saying which member. The
// proof's nullifier is the same every time one identity votes in this
// election, so a second vote is refused, but it cannot be traced back to a
// commitment. The server's relayer account sends the proof, so the voter's
// wallet never appears in the vote transaction.
contract NamVoting is AccessControl {
	enum PHASE { reg, voting, done }

	struct Contestant {
		uint id;
		string name;
		string party;
		uint age;
		string qualification;
	}

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
	bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
	bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

	ISemaphore public immutable semaphore;
	uint256 public immutable groupId;

	PHASE public state;
	uint public contestantsCount;

	// SC-3: a wallet is registered or not. Nothing here says whether, or how,
	// it voted.
	mapping(address => bool) public registered;
	uint public votersCount;

	// Identity commitments in the order they joined the group. The browser
	// rebuilds the group's Merkle tree from them to make its proof.
	uint256[] private _commitments;

	mapping(uint256 => bool) public nullifierUsed;

	mapping(uint => Contestant) private _contestants;
	// SC-5: tallies by contestant id, only readable through the getters once done
	mapping(uint => uint) private _votes;

	error WrongPhase(PHASE expected, PHASE actual);
	error AlreadyVoted();
	error InvalidContestant(uint id);
	error InvalidPhaseChange(PHASE from, PHASE to);
	error AlreadyRegistered(address voter);
	error WrongElection(uint256 scope);
	error InvalidProof();
	error LengthMismatch();

	event ContestantAdded(uint indexed id, string name);
	event VoterRegistered(address indexed voter);
	event PhaseChanged(PHASE phase);
	// SC-4: no voter address. The nullifier lets a voter find their own vote
	// on the audit page (ANON-5); nobody else can tell whose vote it is.
	event VoteCast(uint indexed contestantId, uint256 nullifier);

	constructor(ISemaphore _semaphore) {
		_grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
		_grantRole(ADMIN_ROLE, msg.sender);
		semaphore = _semaphore;
		// This contract becomes the group admin, so only it can add members.
		groupId = _semaphore.createGroup();
	}

	modifier inPhase(PHASE expected) {
		if (state != expected) revert WrongPhase(expected, state);
		_;
	}

	// Registrars register voters; admins may too (e.g. as a recovery tool).
	modifier onlyRegistrar() {
		if (!hasRole(REGISTRAR_ROLE, msg.sender) && !hasRole(ADMIN_ROLE, msg.sender)) {
			revert AccessControlUnauthorizedAccount(msg.sender, REGISTRAR_ROLE);
		}
		_;
	}

	// The proofs' scope. Different for every deployment, so a proof (and its
	// nullifier) from one election means nothing in another.
	function electionId() public view returns (uint256) {
		return uint256(uint160(address(this)));
	}

	function addContestant(string calldata _name, string calldata _party, uint _age, string calldata _qualification)
		external onlyRole(ADMIN_ROLE) inPhase(PHASE.reg)
	{
		contestantsCount++;
		_contestants[contestantsCount] = Contestant(contestantsCount, _name, _party, _age, _qualification);
		emit ContestantAdded(contestantsCount, _name);
	}

	// ANON-1: one wallet, one identity commitment. Semaphore refuses a
	// commitment that is already in the group, zero, or outside the SNARK field.
	function voterRegisteration(address user, uint256 identityCommitment)
		external onlyRegistrar inPhase(PHASE.reg)
	{
		_register(user, identityCommitment);
	}

	// SC-7: several voters in one transaction
	function voterRegisterationBatch(address[] calldata users, uint256[] calldata identityCommitments)
		external onlyRegistrar inPhase(PHASE.reg)
	{
		if (users.length != identityCommitments.length) revert LengthMismatch();
		for (uint i = 0; i < users.length; i++) {
			_register(users[i], identityCommitments[i]);
		}
	}

	// SC-2: forward one step at a time, never back
	function changeState(PHASE x) external onlyRole(ADMIN_ROLE) {
		if (uint(x) != uint(state) + 1) revert InvalidPhaseChange(state, x);
		state = x;
		emit PhaseChanged(x);
	}

	// ANON-4: the only way to vote. The proof's message is the contestant id.
	// Anyone may send it (normally the relayer, ANON-3): the proof is the
	// permission, and sending it from a voter's own wallet would show who they
	// are. Semaphore's validateProof isn't used because anyone can call it, so
	// someone could spend a voter's nullifier there without the vote counting
	// here; this contract keeps its own nullifiers instead.
	function castVote(ISemaphore.SemaphoreProof calldata proof) external inPhase(PHASE.voting) {
		if (proof.scope != electionId()) revert WrongElection(proof.scope);
		uint contestantId = proof.message;
		if (contestantId == 0 || contestantId > contestantsCount) revert InvalidContestant(contestantId);
		if (nullifierUsed[proof.nullifier]) revert AlreadyVoted();
		if (!semaphore.verifyProof(groupId, proof)) revert InvalidProof();
		nullifierUsed[proof.nullifier] = true;
		_votes[contestantId]++;
		emit VoteCast(contestantId, proof.nullifier);
	}

	function members() external view returns (uint256[] memory) {
		return _commitments;
	}

	// Same fields and order as the v1 public mapping getter; voteCount stays 0
	// until voting is over (SC-5).
	function contestants(uint id) external view returns (
		uint id_, string memory name, uint voteCount, string memory party, uint age, string memory qualification
	) {
		if (id == 0 || id > contestantsCount) revert InvalidContestant(id);
		Contestant storage c = _contestants[id];
		return (c.id, c.name, state == PHASE.done ? _votes[id] : 0, c.party, c.age, c.qualification);
	}

	// Vote totals; index 0 is contestant 1.
	function results() external view inPhase(PHASE.done) returns (uint[] memory totals) {
		totals = new uint[](contestantsCount);
		for (uint i = 0; i < contestantsCount; i++) {
			totals[i] = _votes[i + 1];
		}
	}

	function _register(address user, uint256 identityCommitment) private {
		if (registered[user]) revert AlreadyRegistered(user);
		registered[user] = true;
		votersCount++;
		semaphore.addMember(groupId, identityCommitment);
		_commitments.push(identityCommitment);
		emit VoterRegistered(user);
	}
}
