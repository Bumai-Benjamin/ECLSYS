// UI-5: the shared navigation (spec §3.2). Pages have
//   <nav id="app-shell" aria-label="Main"></nav><script src="/js/shell.js"></script>
// and <body data-nav="voter|admin|public" data-page="...">. The script runs
// where it sits, so the nav is drawn before the rest of the page shows.
// Sign-in pages load it without a nav: they still get the page header card
// and the loading skeleton (UI redesign).
// Runs in the browser (window.Shell) and in Node for the tests.
(function (root) {
  var ITEMS = {
    voter: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
      { id: 'info', label: 'Information', href: '/userInfo' },
      { id: 'register', label: 'Voter registration', href: '/form' },
      { id: 'voting', label: 'Voting', href: '/voting' },
      { id: 'results', label: 'Results', href: '/result' },
      { id: 'audit', label: 'Audit', href: '/audit' },
      { id: 'logout', label: 'Log out', href: '/logout' }
    ],
    admin: [
      { id: 'candidates', label: 'Candidates', href: '/candidateDetails' },
      { id: 'add', label: 'Add candidate', href: '/addCandidate' },
      { id: 'voters', label: 'Voters', href: '/table_view' },
      { id: 'phase', label: 'Election phase', href: '/changePhase' },
      { id: 'audit', label: 'Audit', href: '/audit' },
      { id: 'logout', label: 'Log out', href: '/logout' }
    ],
    public: [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'results', label: 'Results', href: '/result' },
      { id: 'signin', label: 'Sign in', href: '/login' }
    ]
  };

  // 24×24 stroke icons, drawn in the link's text colour
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    results: '<path d="M4 20h16"/><path d="M7.5 16v-5"/><path d="M12 16V7"/><path d="M16.5 16v-7.5"/>',
    audit: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3z"/><path d="m8.8 12.2 2.2 2.2 4.2-4.4"/>',
    signin: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
    register: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M16 14.5h2"/>',
    voting: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>',
    logout: '<path d="M14 7l5 5-5 5"/><path d="M19 12H8"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/>',
    candidates: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.4c1.8.8 3 2.8 3 5.6"/>',
    add: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M19 8v6"/><path d="M16 11h6"/>',
    voters: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4"/><path d="M15 10h3"/><path d="M15 13.5h3"/>',
    phase: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'
  };

  var LOGO = '<img src="/img/home_page.webp" alt="" width="800" height="600">';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(id) {
    return '<svg class="shell-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (ICONS[id] || ICONS.home) + '</svg>';
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
      return '<li><a class="shell-link" href="' + esc(item.href) + '"' + current + '>' + icon(item.id) +
        '<span>' + esc(item.label) + '</span></a></li>';
    }).join('');
    var staff = nav === 'public'
      ? '<p class="shell-staff">Election staff? <a href="/adlogin">Staff sign-in</a></p>'
      : '';
    return '<div class="shell-bar">' +
      '<a class="shell-brand" href="/"><span class="logo-mark" aria-hidden="true">' + LOGO + '</span>' +
      '<span class="shell-brand-text"><span class="shell-brand-name">ECN E-Vote</span>' +
      '<span class="shell-brand-sub">Electoral Commission of Namibia</span></span></a>' +
      '<span id="phase-badge" class="phase-badge" hidden></span>' +
      '<button type="button" class="shell-toggle" aria-expanded="false" aria-controls="shell-links">Menu</button>' +
      '</div>' +
      '<div id="shell-links" class="shell-menu"><ul class="shell-links">' + links + '</ul>' + staff + '</div>';
  }

  // ---- page header card ----
  // The breadcrumb names the page as the nav does; a page outside the nav uses
  // the label it gives (data-crumb) or its own heading.
  function crumbLabel(nav, pageId, heading, given) {
    if (given) return given;
    var match = items(nav).filter(function (i) { return i.id === pageId && i.id !== 'logout'; })[0];
    return match ? match.label : heading;
  }

  function headParts(label) {
    return {
      logo: '<div class="page-head-logo" aria-hidden="true">' + LOGO + '</div>',
      crumb: '<nav class="crumb" aria-label="Breadcrumb"><a href="/">ECN E-Vote</a> <span aria-hidden="true">/</span> ' +
        '<span aria-current="page">' + esc(label) + '</span></nav>'
    };
  }

  // ---- loading skeleton: grey cards in the page's layout, shown until it loads ----
  function skeleton(kind) {
    var cards = '<div class="sk-row"><div class="sk sk-card"></div><div class="sk sk-card"></div><div class="sk sk-card"></div></div>';
    var inner;
    if (kind === 'home') {
      inner = '<div class="sk-hero"><div class="sk sk-hero-logo"></div><div class="sk sk-hero-copy"></div></div>' + cards;
    } else if (kind === 'auth') {
      inner = '<div class="sk sk-head"></div><div class="sk sk-form"></div><div class="sk sk-foot"></div>';
    } else {
      kind = 'page';
      inner = '<div class="sk sk-head"></div>' + cards + '<div class="sk sk-block"></div>';
    }
    return '<div class="app-skeleton is-' + kind + '" aria-hidden="true">' + inner + '</div>';
  }

  var api = { navFor: navFor, items: items, render: render, crumbLabel: crumbLabel, headParts: headParts, skeleton: skeleton };
  root.Shell = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // ---- browser only ----
  if (typeof document === 'undefined') return;
  var html = document.documentElement;
  var body = document.body;
  var shell = document.getElementById('app-shell');
  var script = document.currentScript;
  var pageNav = body.getAttribute('data-nav') || 'public';
  var page = body.getAttribute('data-page') || '';

  // A closed dialog is never where focus belongs. Chrome still applies the
  // autofocus meant for when the vote dialog opens (#cancel-vote) at page
  // load, which also scrolls the page; undo that. showModal() refocuses it.
  function leaveClosedDialog(e) {
    var el = e ? e.target : document.activeElement;
    if (el && el.closest && el.closest('dialog:not([open])')) {
      el.blur();
      if (!location.hash) window.scrollTo(0, 0);
    }
  }
  document.addEventListener('focusin', leaveClosedDialog, true);
  window.addEventListener('load', function () { leaveClosedDialog(); });

  // Skeleton first: the page below this script is hidden (CSS) until it has loaded.
  if (document.readyState !== 'complete' && script) {
    html.classList.add('is-loading');
    script.insertAdjacentHTML('afterend', skeleton(page === 'home' ? 'home' : (shell ? 'page' : 'auth')));
    var revealed = false;
    var reveal = function () {
      if (revealed) return;
      revealed = true;
      html.classList.remove('is-loading');
      html.classList.add('is-ready');
      var sk = document.querySelector('.app-skeleton');
      if (sk) sk.parentNode.removeChild(sk);
    };
    window.addEventListener('load', reveal);
    setTimeout(reveal, 4000);   // a slow font or script never keeps the page hidden
  }

  function drawHeader() {
    var header = document.querySelector('#content header.page-intro');
    if (!header || header.classList.contains('page-head')) return;
    var h1 = header.querySelector('h1');
    var parts = headParts(crumbLabel(pageNav, page, h1 ? h1.textContent.trim() : '', header.getAttribute('data-crumb')));
    var text = document.createElement('div');
    text.className = 'page-head-body';
    while (header.firstChild) text.appendChild(header.firstChild);
    text.insertAdjacentHTML('afterbegin', parts.crumb);
    header.appendChild(text);
    header.insertAdjacentHTML('afterbegin', parts.logo);
    header.classList.add('page-head');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', drawHeader);
  else drawHeader();

  if (!shell) return;
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
