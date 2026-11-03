// SEC-8: show/hide the password on the admin login page (was an inline onclick).
document.getElementById('togglePassword').addEventListener('click', function () {
  var pswrd = document.getElementById('pswrd');
  if (pswrd.type === 'password') {
    pswrd.type = 'text';
    pswrd.style.marginTop = '20px';
    this.style.color = '#7f2092';
  } else {
    pswrd.type = 'password';
    this.style.color = 'grey';
  }
});
