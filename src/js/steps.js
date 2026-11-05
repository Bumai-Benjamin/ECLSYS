// UI-2: the voter's four steps (Account, Verify wallet, Vote, Results) and the
// phase badge, worked out from /me and the contract. Runs in the browser
// (window.Steps) and in Node for the tests. Returns plain text only.
(function (root) {
  var BADGES = ['Registration', 'Voting open', 'Voting closed'];
  var REASONS = {
    regClosed: 'Registration is closed.',
    votingOpens: 'Voting opens when the commission starts the voting phase.',
    votingClosed: 'Voting is closed.',
    verifyFirst: 'Verify your wallet first.',
    resultsLater: 'Results appear when voting closes.',
    unavailable: 'The blockchain is not available right now.'
  };

  function step(id, label, href, status, reason) {
    var s = { id: id, label: label, href: href, status: status };
    if (reason) s.reason = reason;
    return s;
  }

  // input: { loggedIn, walletVerified, phase: 0|1|2|null, hasVoted: boolean|null }
  function compute(input) {
    var phase = input.phase === undefined ? null : input.phase;
    var known = phase === 0 || phase === 1 || phase === 2;
    var verified = !!input.walletVerified;

    var account = input.loggedIn ? step('account', 'Account', '/dashboard', 'done')
      : step('account', 'Account', '/dashboard', 'current');

    var wallet;
    if (verified) wallet = step('wallet', 'Verify wallet', '/form', 'done');
    else if (!known || phase === 0) wallet = step('wallet', 'Verify wallet', '/form', input.loggedIn ? 'current' : 'locked');
    else wallet = step('wallet', 'Verify wallet', '/form', 'locked', REASONS.regClosed);

    var vote;
    if (input.hasVoted === true) vote = step('vote', 'Vote', '/voting', 'done');
    else if (!known) vote = step('vote', 'Vote', '/voting', 'checking');
    else if (phase === 0) vote = step('vote', 'Vote', '/voting', 'locked', REASONS.votingOpens);
    else if (phase === 2) vote = step('vote', 'Vote', '/voting', 'locked', REASONS.votingClosed);
    else if (!verified) vote = step('vote', 'Vote', '/voting', 'locked', REASONS.verifyFirst);
    else if (input.hasVoted === false) vote = step('vote', 'Vote', '/voting', 'current');
    else vote = step('vote', 'Vote', '/voting', 'checking');

    var results;
    if (!known) results = step('results', 'Results', '/result', 'checking');
    else if (phase === 2) results = step('results', 'Results', '/result', 'current');
    else results = step('results', 'Results', '/result', 'locked', REASONS.resultsLater);

    return { badge: known ? BADGES[phase] : 'Checking…', steps: [account, wallet, vote, results] };
  }

  // The chain could not be reached: nothing will come to settle the
  // "checking" steps, so say why instead (Review Focus 2).
  function unavailable(result) {
    return {
      badge: 'Unavailable',
      steps: result.steps.map(function (s) {
        if (s.status !== 'checking') return s;
        return step(s.id, s.label, s.href, 'locked', REASONS.unavailable);
      })
    };
  }

  var api = { compute: compute, unavailable: unavailable, REASONS: REASONS };
  root.Steps = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
