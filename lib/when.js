// A date and time for people to read on admin pages: "6 Nov 2026, 23:49".
// Uses the server's time zone, like the rest of the admin pages.
var FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
});

function formatWhen(value) {
  var d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return FORMAT.format(d);
}

module.exports = { formatWhen: formatWhen };
