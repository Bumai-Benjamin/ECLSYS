// UI audit: the audit page's events in words an observer understands. The raw
// event name and arguments stay available under "Technical details".
var PHASES = ['Registration', 'Voting', 'Closed'];

// event: { event, args }; names: { contestantId: name }
function describe(e, names) {
  var args = e.args || {};
  var text;
  switch (e.event) {
    case 'VoteCast': {
      var id = Number(args.contestantId);
      text = names && names[id] ? 'Vote cast for ' + names[id] + ' (#' + id + ')' : 'Vote cast for candidate #' + id;
      break;
    }
    case 'ContestantAdded':
      text = 'Candidate added: ' + args.name + ' (#' + Number(args.id) + ')';
      break;
    case 'PhaseChanged':
      text = 'Election moved to: ' + (PHASES[Number(args.phase)] || String(args.phase));
      break;
    case 'VoterRegistered':
      text = 'Voter wallet registered';
      break;
    case 'RoleGranted':
      text = 'Administrator access granted';
      break;
    case 'RoleRevoked':
      text = 'Administrator access removed';
      break;
    case 'RoleAdminChanged':
      text = 'Administrator role settings changed';
      break;
    default:
      text = String(e.event);
  }
  return { text: text };
}

module.exports = { describe: describe, PHASES: PHASES };
