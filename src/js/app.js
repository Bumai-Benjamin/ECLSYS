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
    App.alert(ChainErrors.message(err, action), 'error');
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

  render: function () {

    var contestInstance;
    var loader = $("#loader");
    var content = $("#chain-content");
    loader.show();
    content.hide();
    $("#after").hide();

    $("#accountAddress").text("Your account: " + App.account);

    // ------------- fetching candidates to front end from blockchain code-------------
    App.contracts.Contest.deployed().then(function (instance) {
      contestInstance = instance;
      return contestInstance.contestantsCount();
    }).then(function (contestantsCount) {

      var contestantsResults = $("#test");
      contestantsResults.empty();
      var contestantsResultsAdmin = $("#contestantsResultsAdmin");
      contestantsResultsAdmin.empty();

      var contestantSelect = $("#contestantSelect");
      contestantSelect.empty();

      for (let i = 1; i <= contestantsCount; i++) {
        contestInstance.contestants(i).then(function (contestant) {
          // SEC-8: these strings come from the contract; Templates escapes them
          var c = App.toCandidate(contestant);
          contestantsResults.append(Templates.candidateCard(c));
          contestantSelect.append(Templates.candidateOption(c));
          contestantsResultsAdmin.append(Templates.candidateRow(c, { withVotes: true }));
        });
      }
      loader.hide();
      content.show();
    }).catch(function (err) {
      App.showError(err);
    });

    // ------------- fetching current phase code -------------
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.state();
    }).then(function (state) {
      var fetchedState;
      var fetchedStateAdmin;
      if (state == 0) {
        fetchedState = "Registration phase is on , go register yourself to vote !!";
        fetchedStateAdmin = "Registration";
      } else if (state == 1) {
        fetchedState = "Voting is now live !!!";
        fetchedStateAdmin = "Voting";
      } else {
        fetchedState = "Voting is now over !!!";
        fetchedStateAdmin = "Election over";
      }

      var currentPhase = $("#currentPhase");//for user
      currentPhase.empty();
      var currentPhaseAdmin = $("#currentPhaseAdmin");//for admin
      currentPhaseAdmin.empty();
      // one <h1> per page: the phase is a line of text, not a heading
      currentPhase.append($("<p class='phase-line'>").text(fetchedState));
      currentPhaseAdmin.text("Current phase: " + fetchedStateAdmin);
    }).catch(function (err) {
      App.showError(err);
    })

    // ------------- showing result -------------
    // Contract v2 reports vote counts only once the phase is "done" (SC-5).
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.state();
    }).then(function (state) {
      var result = $('#Results');
      if (state == 2) {
        $("#not").hide();
        contestInstance.contestantsCount().then(function (contestantsCount) {
          for (var i = 1; i <= contestantsCount; i++) {
            contestInstance.contestants(i).then(function (contestant) {
              result.append(Templates.candidateRow(App.toCandidate(contestant), { withVotes: true }));
            });
          }
        })

      } else {
        $("#renderTable").hide();
      }
    }).catch(function (err) {
      App.showError(err);
    })
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

  // ------------- voting code -------------
  castVote: function (id) {
    // from a VOTE button, or the ballot form's select
    var contestantId = id || $('#contestantSelect').val();
    App.clearMessage();
    return Pending.run('vote', function () {
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.vote(contestantId, { from: App.account });
      }).then(function () {
        App.showMessage('Your vote was recorded.', 'ok');
      }).catch(function (err) {
        App.showError(err, 'castVote');
      })
    });
  },

  // ------------- adding candidate code -------------
  addCandidate: function () {
    $("#loader").hide();
    var name = $('#name').val();
    var age = $('#age').val();
    var party = $('#party').val();
    var qualification = $('#qualification').val();
    App.clearMessage();

    return Pending.run('candidate', function () {
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.addContestant(name, party, age, qualification, { from: App.account });
      }).then(function () {
        $("#loader").show();
        $('#name').val('');
        $('#age').val('');
        $('#party').val('');
        $('#qualification').val('');
      }).catch(function (err) {
        App.showError(err, 'addCandidate');
      })
    });
  },

  // ------------- changing phase code -------------
  // Reads the current phase from the chain and asks for the next one (the
  // contract only allows one step forward).
  changeState: function () {
    App.clearMessage();
    return Pending.run('phase', function () {
      return App.contracts.Contest.deployed().then(function (instance) {
        return instance.state().then(function (state) {
          var next = Number(state) + 1;
          return instance.changeState(next, { from: App.account });
        });
      }).then(function () {
        $("#chain-content").hide();
        $("#loader").show();
        App.render();
      }).catch(function (err) {
        App.showError(err, 'changeState');
      })
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
      }).then(function () {
        App.showMessage('The wallet is now registered to vote.', 'ok');
      }).catch(function (err) {
        App.showError(err, 'registerVoter');
      })
    });
  }

};


// VOTE buttons in candidate cards (Templates.candidateCard) carry
// data-candidate-id instead of an inline onclick.
$(document).on('click', '.js-vote', function () {
  App.castVote(String($(this).data('candidate-id')));
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
