// UI-5: the shared navigation (spec §3.2). Pages have
//   <nav id="app-shell" aria-label="Main"></nav><script src="/js/shell.js"></script>
// and <body data-nav="voter|admin|public" data-page="...">. The script runs
// where it sits, so the nav is drawn before the rest of the page shows.
// Runs in the browser (window.Shell) and in Node for the tests.
(function (root) {
  var ITEMS = {
    voter: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
      { id: 'info', label: 'Information', href: '/userInfo' },
      { id: 'register', label: 'Voter registration', href: '/form' },
      { id: 'voting', label: 'Voting', href: '/voting' },
      { id: 'results', label: 'Results', href: '/result' },
      { id: 'logout', label: 'Log out', href: '/logout' }
    ],
    admin: [
      { id: 'candidates', label: 'Candidates', href: '/candidateDetails' },
      { id: 'add', label: 'Add candidate', href: '/addCandidate' },
      { id: 'voters', label: 'Voters', href: '/table_view' },
      { id: 'phase', label: 'Election phase', href: '/changePhase' },
      { id: 'logout', label: 'Log out', href: '/logout' }
    ],
    public: [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'results', label: 'Results', href: '/result' },
      { id: 'audit', label: 'Audit', href: '/audit' },
      { id: 'signin', label: 'Sign in', href: '/login' }
    ]
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // A public page shows the signed-in person's own nav; voter and admin pages
  // always keep theirs, even when /me failed (Review Focus 3).
  function navFor(pageNav, me) {
    if (pageNav !== 'public') return pageNav;
    if (me && me.loggedIn && (me.role === 'voter' || me.role === 'admin')) return me.role;
    return 'public';
  }

  function items(nav) {
    return (ITEMS[nav] || ITEMS.public).slice();
  }

  function render(nav, activeId) {
    var links = items(nav).map(function (item) {
      var current = item.id === activeId ? ' aria-current="page"' : '';
      return '<li><a class="shell-link" href="' + esc(item.href) + '"' + current + '>' + esc(item.label) + '</a></li>';
    }).join('');
    return '<div class="shell-bar">' +
      '<a class="shell-brand" href="/">ECN E-Vote</a>' +
      '<span id="phase-badge" class="phase-badge" hidden></span>' +
      '<button type="button" class="shell-toggle" aria-expanded="false" aria-controls="shell-links">Menu</button>' +
      '</div>' +
      '<ul id="shell-links" class="shell-links">' + links + '</ul>';
  }

  var api = { navFor: navFor, items: items, render: render };
  root.Shell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // ---- browser only ----
  if (typeof document === 'undefined') return;
  var shell = document.getElementById('app-shell');
  if (!shell) return;
  var body = document.body;
  var pageNav = body.getAttribute('data-nav') || 'public';
  var page = body.getAttribute('data-page') || '';
  var drawn = navFor(pageNav, null);
  var phaseText = '';

  function showPhase() {
    var badge = document.getElementById('phase-badge');
    if (!badge) return;
    badge.textContent = phaseText;
    badge.hidden = !phaseText;
    // a finished election is not an error: neutral colour, not red
    badge.classList.toggle('is-closed', phaseText === 'Voting closed');
  }

  function draw(nav) {
    drawn = nav;
    shell.innerHTML = render(nav, page);
    body.classList.add('has-shell', 'nav-' + nav);
    showPhase();   // a redraw (after /me) keeps the badge
  }

  function setOpen(open) {
    var toggle = shell.querySelector('.shell-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    shell.classList.toggle('open', open);
  }

  draw(drawn);

  shell.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains('shell-toggle')) {
      setOpen(t.getAttribute('aria-expanded') !== 'true');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && shell.classList.contains('open')) {
      setOpen(false);
      var toggle = shell.querySelector('.shell-toggle');
      if (toggle) toggle.focus();
    }
  });

  // Who is signed in: other scripts (the step tracker) reuse this answer.
  root.ShellMe = (typeof fetch === 'function'
    ? fetch('/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
    : Promise.resolve(null));

  root.ShellMe.then(function (me) {
    var nav = navFor(pageNav, me);
    if (nav !== drawn) {
      body.classList.remove('nav-' + drawn);
      draw(nav);
    }
  });

  // Phase badge: app.js calls Shell.setPhase(text) once it knows the phase.
  api.setPhase = function (text) {
    phaseText = text || '';
    showPhase();
  };
})(typeof window !== 'undefined' ? window : this);
