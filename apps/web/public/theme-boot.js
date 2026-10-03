try {
  var t = localStorage.getItem('naucto.theme');
  if (t === 'dark' || t === 'light') {
    document.documentElement.dataset.theme = t;
  }
} catch {
  // Storage can be blocked; the stylesheet's default theme then stands.
}
