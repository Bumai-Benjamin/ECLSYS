// UI-3: Add candidate checks, run before MetaMask opens (spec §5.2).
// Runs in the browser (window.CandidateForm) and in Node for the tests.
(function (root) {
  function trim(v) { return v == null ? '' : String(v).trim(); }

  // values: { name, party, age, qualification } → { field: message } for each problem
  function validate(values) {
    var out = {};
    var name = trim(values.name);
    var party = trim(values.party);
    var age = trim(values.age);
    var qualification = trim(values.qualification);

    if (!name) out.name = 'Enter the candidate\'s name.';
    else if (name.length > 64) out.name = 'Name must be 64 characters or fewer.';

    if (!party) out.party = 'Enter the party.';
    else if (party.length > 64) out.party = 'Party must be 64 characters or fewer.';

    if (!/^\d+$/.test(age) || Number(age) < 18 || Number(age) > 120) {
      out.age = 'Age must be a whole number from 18 to 120.';
    }

    if (!qualification) out.qualification = 'Enter the qualification.';
    else if (qualification.length > 100) out.qualification = 'Qualification must be 100 characters or fewer.';

    return out;
  }

  var api = { validate: validate };
  root.CandidateForm = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
