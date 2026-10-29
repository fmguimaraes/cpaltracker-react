/* global localStorage, window, document */
// Resolve the stored theme (cpaltracker:theme: light | dark | system, default dark) before first paint.
// Loaded as a same-origin classic script from the <head> of index.html (no inline script: the
// production CSP is script-src 'self'). Keep in sync with src/app/theme.tsx.
;(function () {
  var theme = 'dark'
  try {
    var stored = localStorage.getItem('cpaltracker:theme')
    if (stored === 'light' || stored === 'dark' || stored === 'system') theme = stored
  } catch {
    // Storage unavailable (private mode, blocked): keep the default.
  }
  if (theme === 'system') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  document.documentElement.setAttribute('data-theme', theme)
})()
