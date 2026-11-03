// Page logic for every page that talks to the NamVoting contract through
// MetaMask. Needs jQuery, web3.min.js, truffle-contract.js, templates.js and
// errors.js loaded first.

var GANACHE_CHAIN_ID = '0x539'; // 1337

App = {
  contracts: {},
  account: null,

  init: async function () {
    return await App.initWeb3();
  },

  initWeb3: async function () {
    if (!window.ethereum) {
      App.showMessage('MetaMask is not installed. Install it from metamask.io to use this page.');
      return;
    }
    App.provider = window.ethereum;
    window.web3 = new Web3(window.ethereum);

    // A different account or network means different permissions: start over.
    window.ethereum.on('accountsChanged', function () { window.location.reload(); });
    window.ethereum.on('chainChanged', function () { window.location.reload(); });

    try {
      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      App.account = accounts[0];
      var chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== GANACHE_CHAIN_ID) {
        App.showMessage('Please switch MetaMask to the Ganache network (chain ID 1337).');
        return;
      }
    } catch (err) {
      return App.showError(err);
    }

    return App.initContract();
  },

  initContract: function () {
    $.getJSON('NamVoting.json', function (artifact) {
      App.contracts.Contest = TruffleContract(artifact);
      App.contracts.Contest.setProvider(App.provider);
      App.contracts.Contest.deployed().then(function () {
        App.render();
      }).catch(function () {
        App.showMessage('The blockchain is not available. Ask an administrator to run npm run migrate.');
      });
    }).fail(function () {
      App.showMessage('The blockchain is not available. Ask an administrator to run npm run migrate.');
    });
  },

  // ------------- messages -------------
  // kind 'ok' shows a success message; anything else is a problem
  showMessage: function (text, kind) {
    $('#chainError').text(text)
      .toggleClass('alert-success', kind === 'ok')
      .toggleClass('alert-danger', kind !== 'ok')
      .show();
  },

  // action: the App function that failed, so WrongPhase can say "Voting is closed."
  showError: function (err, action) {
    console.error(err);
    App.showMessage(ChainErrors.message(err, action));
  },

  clearMessage: function () {
    $('#chainError').text('').hide();
  },

  render: function () {

    var contestInstance;
    var loader = $("#loader");
    var content = $("#content");
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
      currentPhase.append($("<h1>").text(fetchedState));
      currentPhaseAdmin.append($("<h3>").text(" Current Phase : " + fetchedStateAdmin));
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
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.vote(contestantId, { from: App.account });
    }).then(function () {
      App.showMessage('Your vote was recorded.', 'ok');
    }).catch(function (err) {
      App.showError(err, 'castVote');
    })
  },

  // ------------- adding candidate code -------------
  addCandidate: function () {
    $("#loader").hide();
    var name = $('#name').val();
    var age = $('#age').val();
    var party = $('#party').val();
    var qualification = $('#qualification').val();
    App.clearMessage();

    App.contracts.Contest.deployed().then(function (instance) {
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
  },

  // ------------- changing phase code -------------
  // Reads the current phase from the chain and asks for the next one (the
  // contract only allows one step forward).
  changeState: function () {
    App.clearMessage();
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.state().then(function (state) {
        var next = Number(state) + 1;
        return instance.changeState(next, { from: App.account });
      });
    }).then(function () {
      $("#content").hide();
      $("#loader").show();
      App.render();
    }).catch(function (err) {
      App.showError(err, 'changeState');
    })
  },

  // ------------- registering voter code -------------
  // Admin recovery tool; voters are normally registered by the server (INT-1).
  registerVoter: function () {
    var add = $('#accadd').val();
    App.clearMessage();
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.voterRegisteration(add, { from: App.account });
    }).then(function () {
      App.showMessage('The wallet is now registered to vote.', 'ok');
    }).catch(function (err) {
      App.showError(err, 'registerVoter');
    })
  }

};


// VOTE buttons in candidate cards (Templates.candidateCard) carry
// data-candidate-id instead of an inline onclick.
$(document).on('click', '.js-vote', function () {
  App.castVote(String($(this).data('candidate-id')));
});

// SEC-8: forms name their action in data-action instead of an inline onsubmit.
var FORM_ACTIONS = { addCandidate: true, castVote: true, registerVoter: true, changeState: true };
$(document).on('submit', 'form[data-action]', function (event) {
  event.preventDefault();
  var action = $(this).data('action');
  if (FORM_ACTIONS[action]) App[action]();
});

$(function () {
  // .on('load'): jQuery 3 removed .load(fn) (SEC-11 uses the local jQuery 3)
  $(window).on('load', function () {
    App.init();
  });
});
