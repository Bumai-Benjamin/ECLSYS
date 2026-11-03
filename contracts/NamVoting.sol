// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

// NamVoting v2 (SC-1 to SC-8). Function names are kept from v1 so app.js
// keeps working, including the misspelled voterRegisteration.
contract NamVoting is AccessControl {
	enum PHASE { reg, voting, done }

	struct Contestant {
		uint id;
		string name;
		string party;
		uint age;
		string qualification;
	}

	// SC-3: no record of who voted for whom
	struct Voter {
		bool isRegistered;
		bool hasVoted;
	}

	bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
	bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
	bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

	PHASE public state;
	uint public contestantsCount;
	mapping(address => Voter) public voters;

	mapping(uint => Contestant) private _contestants;
	// SC-5: tallies by contestant id, only readable through the getters once done
	mapping(uint => uint) private _votes;

	error WrongPhase(PHASE expected, PHASE actual);
	error NotRegistered();
	error AlreadyVoted();
	error InvalidContestant(uint id);
	error InvalidPhaseChange(PHASE from, PHASE to);
	error AlreadyRegistered(address voter);

	event ContestantAdded(uint indexed id, string name);
	event VoterRegistered(address indexed voter);
	event PhaseChanged(PHASE phase);
	event VoteCast(uint indexed contestantId);   // SC-4: no voter address

	constructor() {
		_grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
		_grantRole(ADMIN_ROLE, msg.sender);
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

	function addContestant(string calldata _name, string calldata _party, uint _age, string calldata _qualification)
		external onlyRole(ADMIN_ROLE) inPhase(PHASE.reg)
	{
		contestantsCount++;
		_contestants[contestantsCount] = Contestant(contestantsCount, _name, _party, _age, _qualification);
		emit ContestantAdded(contestantsCount, _name);
	}

	function voterRegisteration(address user) external onlyRegistrar inPhase(PHASE.reg) {
		_register(user);
	}

	// SC-7: for the server, which registers voters after their email OTP
	function voterRegisterationBatch(address[] calldata users) external onlyRegistrar inPhase(PHASE.reg) {
		for (uint i = 0; i < users.length; i++) {
			_register(users[i]);
		}
	}

	// SC-2: forward one step at a time, never back
	function changeState(PHASE x) external onlyRole(ADMIN_ROLE) {
		if (uint(x) != uint(state) + 1) revert InvalidPhaseChange(state, x);
		state = x;
		emit PhaseChanged(x);
	}

	function vote(uint _contestantId) external inPhase(PHASE.voting) {
		Voter storage voter = voters[msg.sender];
		if (!voter.isRegistered) revert NotRegistered();
		if (voter.hasVoted) revert AlreadyVoted();
		if (_contestantId == 0 || _contestantId > contestantsCount) revert InvalidContestant(_contestantId);
		voter.hasVoted = true;
		_votes[_contestantId]++;
		emit VoteCast(_contestantId);
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

	function _register(address user) private {
		if (voters[user].isRegistered) revert AlreadyRegistered(user);
		voters[user].isRegistered = true;
		emit VoterRegistered(user);
	}
}
