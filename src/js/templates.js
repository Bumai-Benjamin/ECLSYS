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
    var row = "<tr><th>" + safeId(c.id) + "</th><td>" + escapeHtml(c.name) + "</td><td>" + escapeHtml(c.age) +
      "</td><td>" + escapeHtml(c.party) + "</td><td>" + escapeHtml(c.qualification) + "</td>";
    if (options && options.withVotes) row += "<td>" + escapeHtml(c.voteCount) + "</td>";
    return row + "</tr>";
  }

  var api = {
    escapeHtml: escapeHtml,
    candidateCard: candidateCard,
    candidateOption: candidateOption,
    candidateRow: candidateRow
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Templates = api;
})(this);
