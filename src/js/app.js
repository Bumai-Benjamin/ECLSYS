
var phaseEnum; // for changing phases of voting

App = {
  //web3Provider: null,
  provider: null,
  contracts: {},
  account: 0x0,
  
  init: async function () {
    // Load pets.
    console.log('---------------------------------------------');
    console.log('App Initialized...');
    return await App.initWeb3();
  },

  initWeb3: async function () {
    if(window.ethereum) {
      console.log('MetaMask Installed...');
      App.web3provider = window.ethereum;
      window.web3 = new Web3(window.ethereum);
      window.ethereum.enable();
      
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      web3.eth.defaultAccount = ethereum._state.accounts[0];
      //setAccounts(accounts);
        //account = accounts[0];
        console.log(accounts);
        //console.log(account);
  } else {
      // Specify default instance if no web3 instance provided
      App.web3Provider = new Web3.providers.HttpProvider('http://localhost:7545');
      window.web3 = new Web3(window.ethereum);
  }

    return App.initContract();
  },

  initContract: function () {
    console.log('TEST initContract!');
    $.getJSON("NamVoting.json", function (contest) {
      App.contracts.Contest = TruffleContract(contest);

      App.contracts.Contest.setProvider(App.web3provider);
      App.contracts.Contest.deployed().then(function(instance) {
        console.log('DeElect Contract Address: ', instance.address);
        App.render();
        //App.listenForEvents();*
    });


      //return App.render();
    });
  },

  render: function () {

    var contestInstance;
    var loader = $("#loader");
    var content = $("#content");
    loader.show();
    content.hide();
    $("#after").hide();


    window.web3.eth.getCoinbase(function (err, account) {
      if (err === null) {
        App.account = account;
        console.log(App.account);
        $("#accountAddress").text("Your account: " + account);
      }
    });



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
        console.log('Count: ' + i)
        console.log('Contestants Count: ' + contestantsCount)
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
    }).catch(function (error) {
      console.warn(error);
    });

    // ------------- fetching current phase code -------------
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.state();
    }).then(function (state) {
      var fetchedState;
      var fetchedStateAdmin;
      phaseEnum = state.toString();
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
      console.error(err);
    })

    // ------------- showing result -------------
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
      console.error(err);
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
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.vote(contestantId, { from: App.account });
    }).then(function (result) {
      // $("#test").hide();
      // $("#after").show();
    }).catch(function (err) {
      console.error(err);
    })

  },

  // ------------- adding candidate code -------------
  addCandidate: function () {
    $("#loader").hide();
    var name = $('#name').val();
    var age = $('#age').val();
    var party = $('#party').val();
    var qualification = $('#qualification').val();

    

    App.contracts.Contest.deployed().then(function (instance) {
      return instance.addContestant(name, party, age, qualification, { from: App.account });
    }).then(function (result) {
      $("#loader").show();
      $('#name').val('');
      $('#age').val('');
      $('#party').val('');
      $('#qualification').val('');
    }).catch(function (err) {
      ///console.log(account);
      console.error(err);
    })
  },

  // ------------- changing phase code -------------

  changeState: function () {
    phaseEnum++;
    // console.log(phaseEnum);
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.changeState(phaseEnum, { from: App.account });
    }).then(function (result) {
      $("#content").hide();
      $("#loader").show();
    }).catch(function (err) {
      console.error(err);
    })
  },

  // ------------- registering voter code -------------
  registerVoter: function () {
    var add = $('#accadd').val();
    App.contracts.Contest.deployed().then(function (instance) {
      return instance.voterRegisteration(add);
    }).then(function (result) {
      $("#content").hide();
      $("#loader").show();
    }).catch(function (err) {
      console.error(err);
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
  $(window).load(function () {
    App.init();
  });
});