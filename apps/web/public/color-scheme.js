(function () {
  try {
    var v = localStorage.getItem('mantine-color-scheme-value') || 'auto';
    if (v === 'auto') v = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-mantine-color-scheme', v);
  } catch (e) {}
})();
