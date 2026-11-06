// SEC-8: HTML for candidate data read from the contract. Every value is
// escaped, because anyone who can add a candidate controls these strings.
// Works as a browser global (Templates) and as a Node module (tests).
(function (root) {
  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };

  function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value).replace(/[&<>"'\/]/g, function (c) { return ENTITIES[c]; });
  }

  // Ids come from the contract as numbers; anything else is dropped.
  function safeId(id) {
    return String(id).replace(/[^0-9]/g, '');
  }

  // Card with a modal; the VOTE button carries data-candidate-id and is
  // wired up by app.js (no inline onclick).
  function candidateCard(c) {
    var id = safeId(c.id);
    var name = escapeHtml(c.name);
    return "<div class='card' style='width: 15rem; margin: 1rem;'><img class='card-img-top' src='../img/Sample_User_Icon.png' alt=''>" +
      "<div class='card-body text-center'><h4 class='card-title'>" + name + "</h4>" +
      "<button type='button' class='btn btn-info' data-toggle='modal' data-target='#modal" + id + "'>Click Here to Vote</button>" +
      "<div class='modal fade' id='modal" + id + "' tabindex='-1' role='dialog' aria-hidden='true'>" +
      "<div class='modal-dialog modal-dialog-centered' role='document'><div class='modal-content'>" +
      "<div class='modal-header'><h5 class='modal-title'><b>" + name + "</b></h5>" +
      "<button type='button' class='close' data-dismiss='modal' aria-label='Close'><span aria-hidden='true'>&times;</span></button></div>" +
      "<div class='modal-body'><b>Party : " + escapeHtml(c.party) + "<br>Age : " + escapeHtml(c.age) +
      "<br>Qualification : " + escapeHtml(c.qualification) + "<br></b></div>" +
      "<div class='modal-footer'>" +
      "<button class='btn btn-info js-vote' data-candidate-id=\"" + id + "\">VOTE</button>" +
      "<button type='button' class='btn btn-info' data-dismiss='modal'>Close</button></div>" +
      "</div></div></div></div></div>";
  }

  function candidateOption(c) {
    return "<option style='padding: auto;' value=\"" + safeId(c.id) + "\">" + escapeHtml(c.name) + "</option>";
  }

  // Table row: id, name, age, party, qualification (+ votes on result tables).
  function candidateRow(c, options) {
    // data-label: the column name shown beside each cell in the stacked phone layout
    var row = '<tr><th data-label="#">' + safeId(c.id) + '</th><td data-label="Name">' + escapeHtml(c.name) +
      '</td><td data-label="Age">' + escapeHtml(c.age) + '</td><td data-label="Party">' + escapeHtml(c.party) +
      '</td><td data-label="Qualification">' + escapeHtml(c.qualification) + '</td>';
    if (options && options.withVotes) row += '<td data-label="Votes">' + escapeHtml(c.voteCount) + '</td>';
    return row + "</tr>";
  }

  // UI-4: long hex values (hashes, addresses) as 0x1234…abcd
  function shortHash(value) {
    var s = String(value == null ? '' : value);
    return s.length > 13 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
  }

  // Results table data: most votes first (ties by number), share of all
  // votes in whole percent, and a bar class in steps of 5 (no inline style).
  function resultRows(candidates) {
    var total = 0;
    var rows = candidates.map(function (c) {
      var votes = Number(c.voteCount) || 0;
      total += votes;
      return { id: safeId(c.id), name: c.name, party: c.party, votes: votes };
    });
    rows.sort(function (a, b) { return b.votes - a.votes || Number(a.id) - Number(b.id); });
    rows.forEach(function (r) {
      r.share = total ? Math.round(r.votes * 100 / total) : 0;
      r.barClass = 'bar-' + Math.round(r.share / 5) * 5;
    });
    return rows;
  }

  // UI audit: who won (or tied) and how many votes were cast. Plain text:
  // the page sets it with .text(), so names are never parsed as HTML.
  function resultSummary(rows) {
    var total = rows.reduce(function (sum, r) { return sum + r.votes; }, 0);
    if (!total) return { total: 0, winners: [], text: 'No votes were cast.' };
    var top = rows[0].votes;
    var winners = rows.filter(function (r) { return r.votes === top; }).map(function (r) { return r.name; });
    var text = winners.length === 1
      ? winners[0] + ' won with ' + top + ' of ' + total + ' votes (' + rows[0].share + '%).'
      : 'Tie: ' + winners.slice(0, -1).join(', ') + ' and ' + winners[winners.length - 1] +
        ' have ' + top + ' votes each, out of ' + total + ' votes cast.';
    return { total: total, winners: winners, text: text };
  }

  // options.winners: names from resultSummary; those rows get a Winner badge
  function resultRow(r, options) {
    var won = !!(options && options.winners && options.winners.indexOf(r.name) !== -1 && r.votes > 0);
    return '<tr' + (won ? ' class="is-winner"' : '') + '><td data-label="Candidate">' + escapeHtml(r.name) +
      (won ? ' <span class="badge badge-yes">Winner</span>' : '') + '</td>' +
      '<td data-label="Party">' + escapeHtml(r.party) + '</td>' +
      '<td data-label="Votes">' + escapeHtml(r.votes) + '</td>' +
      '<td data-label="Share"><span class="share">' + escapeHtml(r.share) + '%</span>' +
      '<span class="bar-track" aria-hidden="true"><span class="bar ' + escapeHtml(r.barClass) + '"></span></span></td></tr>';
  }

  // A ballot card: the radio input sits inside its label, so the whole card
  // is clickable and the name is the input's accessible name.
  function candidateChoice(c) {
    var id = safeId(c.id);
    return '<label class="candidate-card" for="candidate-' + id + '">' +
      '<input type="radio" name="candidate" id="candidate-' + id + '" value="' + id + '">' +
      '<span class="candidate-name">' + escapeHtml(c.name) + '</span>' +
      '<span class="candidate-meta">' + escapeHtml(c.party) + ' · Age ' + escapeHtml(c.age) + '</span>' +
      '<span class="candidate-meta">' + escapeHtml(c.qualification) + '</span></label>';
  }

  // UI-4: the one next phase an admin can move to (the contract never goes back)
  var NEXT_PHASE = {
    0: { button: 'Open voting', word: 'OPEN', explain: 'No more candidates or voter registrations. Registered voters can vote.' },
    1: { button: 'Close voting', word: 'CLOSE', explain: 'Voting stops for good. Results and totals become public.' }
  };
  var PhaseFlow = {
    next: function (phase) {
      var n = NEXT_PHASE[Number(phase)];
      return n ? { button: n.button, word: n.word, explain: n.explain } : null;
    },
    // The phase to send: one after the phase the admin saw and confirmed, and
    // only if the chain is still there (another tab or admin may have moved it).
    target: function (shownPhase, chainPhase) {
      var shown = Number(shownPhase);
      if (shown !== Number(chainPhase) || !NEXT_PHASE[shown]) return null;
      return shown + 1;
    },
    confirmed: function (typed, word) {
      return String(typed == null ? '' : typed).trim().toUpperCase() === word;
    }
  };

  var api = {
    escapeHtml: escapeHtml,
    candidateCard: candidateCard,
    candidateOption: candidateOption,
    candidateRow: candidateRow,
    shortHash: shortHash,
    resultRows: resultRows,
    resultRow: resultRow,
    resultSummary: resultSummary,
    candidateChoice: candidateChoice,
    PhaseFlow: PhaseFlow
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Templates = api;
})(this);
