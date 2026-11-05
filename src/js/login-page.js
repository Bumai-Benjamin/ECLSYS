// SEC-8 / UI-5: show or hide the password on the admin sign-in page (no inline
// handler, no inline styles). The button says what it will do next.
(function () {
  var toggle = document.getElementById('togglePassword');
  var field = document.getElementById('pswrd');
  if (!toggle || !field) return;
  toggle.addEventListener('click', function () {
    var show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
  });
})();
