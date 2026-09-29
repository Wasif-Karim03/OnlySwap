// Shows <time datetime> values in the visitor's own time zone (share pages).
document.querySelectorAll('time[datetime]').forEach(function (t) {
  var d = new Date(t.getAttribute('datetime'));
  if (!isNaN(d)) {
    t.textContent = d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
});
