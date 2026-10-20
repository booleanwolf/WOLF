// Applies the saved theme before first paint. Light is the default.
try {
  var t = localStorage.getItem('wolf-theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) {}
