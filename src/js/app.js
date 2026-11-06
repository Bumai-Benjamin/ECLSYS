// Page logic for every page that talks to the NamVoting contract through
// MetaMask. Needs jQuery, web3.min.js, truffle-contract.js, templates.js,
// errors.js, wallet-status.js, steps.js and pending.js loaded first, and
// shell.js (for ShellMe and the phase badge).

var GANACHE_CHAIN_ID = '0x539'; // 1337
var CHAIN_DOWN = 'The blockchain is not available. Ask an administrator to run npm run migrate.';

App = {
  contracts: {},
  account: null,
  me: null,          // GET /me (who is signed in)
  phase: null,       // 0 Registration, 1 Voting, 2 Done
  hasVoted: null,
  chainDown: false,
  walletInput: null,

  isAdminPage: function () {
    return document.body.getAttribute('data-nav') === 'admin';
  },

  init: async function () {
    App.me = await (window.ShellMe || Promise.resolve(null));
    App.renderSteps();
    return await App.initWeb3();
  },

  // UI-6: look before asking. eth_accounts doesn't open MetaMask; the panel
  // offers Connect when nothing is connected yet.
  initWeb3: async function () {
    var input = {
      hasEthereum: !!window.ethereum,
      accounts: null,
      chainId: null,
      expectedWallet: App.me && App.me.wallet,
      role: App.isAdminPage() ? 'admin' : 'voter',
      isAdminAccount: null
    };
    App.walletInput = input;
    if (!window.ethereum) {
      App.status(WalletStatus.decide(input));
      return App.chainUnavailable(false);
    }
    App.provider = window.ethereum;
    window.web3 = new Web3(window.ethereum);

    // A different account or network means different permissions: start over.
    window.ethereum.on('accountsChanged', function () { window.location.reload(); });
    window.ethereum.on('chainChanged', function () { window.location.reload(); });

    try {
      input.accounts = await window.ethereum.request({ method: 'eth_accounts' });
      input.chainId = await window.ethereum.request({ method: 'eth_chainId' });
    } catch (err) {
      App.chainUnavailable(false);
      return App.showError(err);
    }
    var decision = WalletStatus.decide(input);
    App.status(decision);
    if (decision.state === 'not-connected' || decision.state === 'wrong-network') {
      return App.chainUnavailable(false);
    }
    App.account = input.accounts[0];
    return App.initContract();
  },

  initContract: function () {
    $.getJSON('NamVoting.json', function (artifact) {
      App.contracts.Contest = TruffleContract(artifact);
      App.contracts.Contest.setProvider(App.provider);
      App.contracts.Contest.deployed().then(function (instance) {
        return App.readChainState(instance).then(function () { App.render(); });
      }).catch(function () {
        App.chainUnavailable(true);
      });
    }).fail(function () {
      App.chainUnavailable(true);
    });
  },

  // Phase, whether this wallet has voted, and (admin pages) whether it may
  // administer the election.
  readChainState: async function (instance) {
    App.phase = Number(await instance.state());
    var voter = await instance.voters(App.account);
    App.hasVoted = !!(voter.hasVoted !== undefined ? voter.hasVoted : voter[1]);
    if (App.isAdminPage()) {
      var role = await instance.ADMIN_ROLE();
      App.walletInput.isAdminAccount = !!(await instance.hasRole(role, App.account));
      App.status(WalletStatus.decide(App.walletInput));
    }
    App.renderSteps();
  },

  // Review Focus 2: no endless "Checking…" when the chain can't be read.
  // withMessage: the chain itself failed (not just MetaMask missing or locked).
  chainUnavailable: function (withMessage) {
    App.chainDown = true;
    $('#loader').hide();
    if (withMessage) App.alert(CHAIN_DOWN, 'error');
    App.renderSteps();
  },

  // ------------- status panel (UI-6, spec §4.3) -------------
  ensurePanel: function () {
    var panel = $('#wallet-status');
    if (!panel.children('.status-main').length) {
      panel.append($('<div class="status-main">'), $('<div class="status-alert" role="alert">'));
    }
    return panel;
  },

  status: function (decision) {
    var main = App.ensurePanel().children('.status-main').empty();
    if (decision.state === 'ok') {
      main.append($('<span class="status-chip">').text(decision.message));
      return;
    }
    var box = $('<div class="status-box is-problem">').append($('<p>').text(decision.message));
    if (decision.action === 'install') {
      box.append($('<a class="btn btn-primary" target="_blank" rel="noopener">')
        .attr('href', 'https://metamask.io/download/').text('Get MetaMask'));
    } else if (decision.action === 'connect') {
      box.append($('<button type="button" class="btn btn-primary" data-wallet-action="connect">').text('Connect MetaMask'));
    } else if (decision.action === 'switch-network') {
      box.append($('<button type="button" class="btn btn-primary" data-wallet-action="switch-network">').text('Switch to the election network'));
    }
    main.append(box);
  },

  // kind 'ok' or 'error'; an empty text clears the line
  alert: function (text, kind) {
    var line = App.ensurePanel().children('.status-alert').empty();
    if (!text) return;
    line.append($('<div class="alert">').addClass(kind === 'ok' ? 'alert-success' : 'alert-danger').text(text));
  },

  // kept for the existing callers
  showMessage: function (text, kind) {
    App.alert(text, kind === 'ok' ? 'ok' : 'error');
  },

  // action: the App function that failed, so WrongPhase can say "Voting is closed."
  showError: function (err, action) {
    console.error(err);
    App.alert(err && err.reverted ? ChainErrors.REVERTED : ChainErrors.message(err, action), 'error');
  },

  // UI-9: a mined transaction that reverted (truffle-contract doesn't throw)
  revertError: function () {
    var err = new Error(ChainErrors.REVERTED);
    err.reverted = true;
    return err;
  },

  clearMessage: function () {
    App.alert('');
  },

  connect: function () {
    return window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(function () { window.location.reload(); })
      .catch(function (err) { App.showError(err); });
  },

  switchNetwork: function () {
    return window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GANACHE_CHAIN_ID }] })
      .catch(function (err) {
        if (err && err.code === 4902) {
          return window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: GANACHE_CHAIN_ID,
              chainName: 'NamVoting (Ganache)',
              rpcUrls: ['http://127.0.0.1:7545'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
            }]
          });
        }
        throw err;
      })
      .catch(function (err) { App.showError(err); });
  },

  // ------------- step tracker (UI-6, spec §4.1) -------------
  renderSteps: function () {
    var me = App.me;
    var known = App.phase === 0 || App.phase === 1 || App.phase === 2;
    var result = Steps.compute({
      loggedIn: !!(me && me.loggedIn),
      walletVerified: !!(me && me.walletVerified),
      phase: known ? App.phase : null,
      hasVoted: App.hasVoted
    });
    if (App.chainDown && !known) result = Steps.unavailable(result);
    if (window.Shell && Shell.setPhase) Shell.setPhase(known || App.chainDown ? result.badge : '');

    var list = $('#steps');
    if (!list.length) return;
    if (!me || !me.loggedIn || me.role !== 'voter') { list.attr('hidden', true); return; }
    list.removeAttr('hidden').empty();
    result.steps.forEach(function (step) {
      var li = $('<li class="step">').addClass('is-' + step.status);
      var label = $('<span class="step-label">');
      if (step.status === 'current') {
        li.attr('aria-current', 'step');
        label.append($('<a>').attr('href', step.href).text(step.label));
      } else {
        label.text(step.label);
      }
      li.append(label);
      var note = step.reason || (step.status === 'done' ? 'Done' : step.status === 'checking' ? 'Checking…' : '');
      if (note) li.append($('<span class="step-reason">').text(note));
      list.append(li);
    });
  },

  // UI-7: one pass over the contract fills whatever this page has: the
  // candidate table (admin), the ballot (/voting), the results (/result) and
  // the phase lines.
  render: async function () {
    try {
      var instance = await App.contracts.Contest.deployed();
      var count = Number(await instance.contestantsCount());
      var ids = [];
      for (var i = 1; i <= count; i++) ids.push(i);
      var rows = await Promise.all(ids.map(function (id) { return instance.contestants(id); }));
      App.candidates = rows.map(App.toCandidate);
    } catch (err) {
      return App.showError(err);
    }
    $('#loader').hide();
    App.renderPhaseLines();
    App.renderCandidateTable();
    App.renderBallot();
    App.renderResults();
    App.renderCandidateForm();
    App.renderPhaseTimeline();
  },

  PHASE_LINES: ['Registration is open. Voting has not started yet.', 'Voting is open.', 'Voting is closed.'],
  PHASE_NAMES: ['Registration', 'Voting', 'Closed'],

  renderPhaseLines: function () {
    $('#currentPhase').empty().append($("<p class='phase-line'>").text(App.PHASE_LINES[App.phase] || ''));
    $('#currentPhaseAdmin').text('Current phase: ' + (App.PHASE_NAMES[App.phase] || ''));
  },

  // Admin candidate list (SEC-8: Templates escapes contract strings)
  renderCandidateTable: function () {
    var table = $('#contestantsResultsAdmin');
    if (!table.length) return;
    table.empty();
    App.candidates.forEach(function (c) {
      table.append(Templates.candidateRow(c, { withVotes: true }));
    });
    $('#candidates-empty').prop('hidden', App.candidates.length > 0);
    $('#chain-content').show();
  },

  // /voting: cards while voting is open; "You have voted" afterwards
  renderBallot: function () {
    var ballot = $('#ballot');
    if (!ballot.length) return;
    if (App.hasVoted) {
      $('#chain-content').attr('hidden', true);
      $('#already-voted').removeAttr('hidden');
      return;
    }
    if (App.phase !== 1) {
      $('#chain-content').attr('hidden', true);
      return;
    }
    ballot.find('.candidate-card').remove();
    App.candidates.forEach(function (c) { ballot.append(Templates.candidateChoice(c)); });
    $('#review-vote').prop('disabled', true);
    $('#chain-content').removeAttr('hidden').show();
  },

  // /result: totals only once voting is closed (SC-5)
  renderResults: function () {
    var body = $('#Results');
    if (!body.length) return;
    if (App.phase !== 2) return;
    body.empty();
    Templates.resultRows(App.candidates).forEach(function (r) { body.append(Templates.resultRow(r)); });
    $('#results-waiting').attr('hidden', true);
    $('#results-final').removeAttr('hidden');
  },

  candidateById: function (id) {
    return (App.candidates || []).filter(function (c) { return c.id === String(id); })[0];
  },

  // contestants(i) returns a tuple: id, name, voteCount, party, age, qualification
  toCandidate: function (contestant) {
    return {
      id: contestant[0].toString(),
      name: contestant[1],
      voteCount: contestant[2].toString(),
      party: contestant[3],
      age: contestant[4].toString(),
      qualification: contestant[5]
    };
  },

  // ------------- voting code (UI-7, spec §4.4) -------------
  castVote: function (id) {
    var contestantId = id || $('input[name="candidate"]:checked').val();
    var progress = $('#vote-progress');
    App.clearMessage();
    return Pending.run('vote', function () {
      $('#review-vote').prop('disabled', true);
      progress.text('Confirm the transaction in MetaMask…');
      return App.contracts.Contest.deployed().then(function (instance) {
        var sent = instance.vote(contestantId, { from: App.account });
        if (sent && typeof sent.on === 'function') {
          sent.on('transactionHash', function () { progress.text('Recording your vote…'); });
        }
        return sent;
      }).then(function (result) {
        if (ChainErrors.reverted(result)) throw App.revertError();
        progress.text('');
        App.hasVoted = true;
        App.renderSteps();
        App.showReceipt(result);
      }).catch(function (err) {
        progress.text('');
        $('#review-vote').prop('disabled', !$('input[name="candidate"]:checked').length);
        App.showError(err, 'castVote');
      });
    });
  },

  showReceipt: function (result) {
    var tx = (result && (result.tx || (result.receipt && result.receipt.transactionHash))) || '';
    var block = result && result.receipt ? result.receipt.blockNumber : '';
    $('#receipt-tx').text(Templates.shortHash(tx)).attr('title', tx);
    $('#receipt-block').text(String(block));
    $('#chain-content').attr('hidden', true);
    $('#receipt').removeAttr('hidden').trigger('focus');
  },

  // ------------- adding candidate code (UI-8, spec §5.2) -------------
  CANDIDATE_FIELDS: ['name', 'party', 'age', 'qualification'],

  // Outside Registration the contract would refuse, so say so up front
  renderCandidateForm: function () {
    var form = $('#candidate-form');
    if (!form.length) return;
    var locked = App.phase !== 0;
    $('#candidate-form-locked').prop('hidden', !locked);
    form.find('input, button').prop('disabled', locked);
  },

  showFieldErrors: function (errors) {
    var first = null;
    App.CANDIDATE_FIELDS.forEach(function (f) {
      var input = $('#' + f);
      var line = $('#' + f + '-error');
      if (errors[f]) {
        line.text(errors[f]).removeAttr('hidden');
        input.attr({ 'aria-invalid': 'true', 'aria-describedby': f + '-error' });
        if (!first) first = input;
      } else {
        line.text('').attr('hidden', true);
        input.removeAttr('aria-invalid').removeAttr('aria-describedby');
      }
    });
    if (first) first.trigger('focus');
    return !first;
  },

  addCandidate: function () {
    var values = {};
    App.CANDIDATE_FIELDS.forEach(function (f) { values[f] = String($('#' + f).val() || '').trim(); });
    App.clearMessage();
    $('#candidate-added').attr('hidden', true);
    if (!App.showFieldErrors(CandidateForm.validate(values))) return null;   // MetaMask never opens

    var progress = $('#candidate-progress');
    return Pending.run('candidate', function () {
      progress.text('Confirm the transaction in MetaMask…');
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.addContestant(values.name, values.party, values.age, values.qualification, { from: App.account });
      }).then(function (result) {
        if (ChainErrors.reverted(result)) throw App.revertError();
        progress.text('');
        App.CANDIDATE_FIELDS.forEach(function (f) { $('#' + f).val(''); });
        $('#candidate-added').removeAttr('hidden');
        $('#name').trigger('focus');
      }).catch(function (err) {
        progress.text('');
        App.showError(err, 'addCandidate');
      });
    });
  },

  // ------------- changing phase code (UI-8, spec §5.1) -------------
  renderPhaseTimeline: function () {
    var timeline = $('#phase-timeline');
    if (!timeline.length) return;
    timeline.children('li').each(function () {
      var p = Number($(this).data('phase'));
      $(this).toggleClass('is-past', p < App.phase);
      if (p === App.phase) $(this).attr('aria-current', 'step'); else $(this).removeAttr('aria-current');
    });
    var next = Templates.PhaseFlow.next(App.phase);
    if (next) {
      $('#next-phase').text(next.button).removeAttr('hidden');
      $('#next-phase-explain').text(next.explain);
    } else {
      $('#next-phase').attr('hidden', true);
      $('#next-phase-explain').text('The election is over. Results are public on the Results page.');
    }
  },

  // The contract only moves one step forward; it is asked for state + 1 of
  // the phase it reports now, not of what this page last saw.
  changeState: function () {
    var progress = $('#phase-progress');
    App.clearMessage();
    return Pending.run('phase', function () {
      $('#next-phase').prop('disabled', true);
      progress.text('Confirm the transaction in MetaMask…');
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.state().then(function (state) {
          var next = Number(state) + 1;
          var sent = instance.changeState(next, { from: App.account });
          return sent.then(function (result) {
            if (ChainErrors.reverted(result)) throw App.revertError();
            return next;
          });
        });
      }).then(function (next) {
        progress.text('');
        App.phase = next;
        App.renderPhaseLines();
        App.renderPhaseTimeline();
        App.renderSteps();
        App.alert(next === 1 ? 'Voting is now open.' : 'Voting is now closed.', 'ok');
        $('#next-phase').prop('disabled', false);
      }).catch(function (err) {
        progress.text('');
        $('#next-phase').prop('disabled', false);
        App.showError(err, 'changeState');
      });
    });
  },

  // ------------- registering voter code -------------
  // Admin recovery tool; voters are normally registered by the server (INT-1).
  registerVoter: function () {
    var add = $('#accadd').val();
    App.clearMessage();
    return Pending.run('register', function () {
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.voterRegisteration(add, { from: App.account });
      }).then(function (result) {
        if (ChainErrors.reverted(result)) throw App.revertError();
        App.showMessage('The wallet is now registered to vote.', 'ok');
      }).catch(function (err) {
        App.showError(err, 'registerVoter');
      })
    });
  }

};


// ------------- ballot (UI-7) -------------
$(document).on('change', 'input[name="candidate"]', function () {
  $('#review-vote').prop('disabled', Pending.busy('vote'));
});

$(document).on('click', '#review-vote', function () {
  var c = App.candidateById($('input[name="candidate"]:checked').val());
  var dialog = document.getElementById('confirm-vote');
  if (!c || !dialog) return;
  $('#confirm-text').text('You are voting for ' + c.name + ' (' + c.party + '). You can\'t change your vote afterwards.');
  dialog.showModal();
});

$(document).on('click', '#cancel-vote', function () {
  document.getElementById('confirm-vote').close();
});

$(document).on('click', '#cast-vote', function () {
  var dialog = document.getElementById('confirm-vote');
  dialog.dataset.casting = '1';
  dialog.close();
  App.castVote();
});

// Focus goes back to the button that opened the dialog (unless the vote is on
// its way). 'close' doesn't bubble, so it is bound on the dialog itself.
$(function () {
  $('#confirm-vote').on('close', function () {
    if (this.dataset.casting !== '1') $('#review-vote').trigger('focus');
    delete this.dataset.casting;
  });
});

// ------------- phase change confirmation (UI-8) -------------
$(document).on('click', '#next-phase', function () {
  var next = Templates.PhaseFlow.next(App.phase);
  var dialog = document.getElementById('confirm-phase');
  if (!next || !dialog) return;
  $('#confirm-phase-title').text(next.button + '?');
  $('#confirm-phase-text').text(next.explain);
  $('#confirm-word-target').text(next.word);
  $('#confirm-word').val('');
  $('#confirm-phase-ok').prop('disabled', true);
  dialog.dataset.word = next.word;
  dialog.showModal();
  $('#confirm-word').trigger('focus');
});

$(document).on('input', '#confirm-word', function () {
  var word = document.getElementById('confirm-phase').dataset.word;
  $('#confirm-phase-ok').prop('disabled', !Templates.PhaseFlow.confirmed($(this).val(), word));
});

$(document).on('click', '#confirm-phase-cancel', function () {
  document.getElementById('confirm-phase').close();
});

$(document).on('click', '#confirm-phase-ok', function () {
  var dialog = document.getElementById('confirm-phase');
  if (!Templates.PhaseFlow.confirmed($('#confirm-word').val(), dialog.dataset.word)) return;
  dialog.dataset.changing = '1';
  dialog.close();
  App.changeState();
});

$(function () {
  $('#confirm-phase').on('close', function () {
    if (this.dataset.changing !== '1') $('#next-phase').trigger('focus');
    delete this.dataset.changing;
  });
});

// ------------- connect wallet on /form (UI-7, spec §4.2) -------------
$(document).on('click', '#use-wallet', function () {
  if (!window.ethereum) {
    App.alert('You need the MetaMask browser extension to vote.', 'error');
    return;
  }
  window.ethereum.request({ method: 'eth_requestAccounts' }).then(function (accounts) {
    var address = accounts && accounts[0];
    if (!address) return;
    $('#account_address').val(address).prop('readonly', true);
    $('#wallet-hint').text('Using ' + WalletStatus.short(address) + ' from MetaMask.');
    $('#change-wallet').removeAttr('hidden');
  }).catch(function (err) {
    App.showError(err);
  });
});

$(document).on('click', '#change-wallet', function () {
  $('#account_address').val('').prop('readonly', false).trigger('focus');
  $('#wallet-hint').text('Press the button to fill this in from MetaMask, or paste the address (it starts with 0x).');
  $(this).attr('hidden', true);
});

// SEC-8: forms name their action in data-action instead of an inline onsubmit.
// UI-6: buttons in the MetaMask status panel
$(document).on('click', '[data-wallet-action]', function () {
  var action = $(this).data('wallet-action');
  if (action === 'connect') App.connect();
  else if (action === 'switch-network') App.switchNetwork();
});

var FORM_ACTIONS = { addCandidate: true, castVote: true, registerVoter: true, changeState: true };
$(document).on('submit', 'form[data-action]', function (event) {
  event.preventDefault();
  var action = $(this).data('action');
  if (FORM_ACTIONS[action]) App[action]();
});

$(function () {
  // .on('load'): jQuery 3 removed .load(fn) (SEC-11 uses the local jQuery 3).
  // jQuery 3 runs ready callbacks asynchronously, so on a fast or cached load
  // the window load event can already have fired by now; start straight away
  // then, or the page never connects to the contract.
  if (document.readyState === 'complete') {
    App.init();
  } else {
    $(window).on('load', function () {
      App.init();
    });
  }
});
