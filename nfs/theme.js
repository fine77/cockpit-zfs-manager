/* Theme sync via Cockpit shell preference (no inline JS/CSP-safe) */
(function () {
  function applyShellTheme() {
    var html = document.documentElement;
    var body = document.body;
    var pref = "auto";
    try { pref = localStorage.getItem("shell:style") || "auto"; } catch (e) {}
    var dark = pref === "dark" || (pref === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    var add = dark ? ["pf-theme-dark", "pf-v5-theme-dark", "ct-theme-dark"] : ["pf-theme-light", "pf-v5-theme-light", "ct-theme-light"];
    var del = dark ? ["pf-theme-light", "pf-v5-theme-light", "ct-theme-light"] : ["pf-theme-dark", "pf-v5-theme-dark", "ct-theme-dark"];
    del.forEach(function (c) { html.classList.remove(c); if (body) body.classList.remove(c); });
    add.forEach(function (c) { html.classList.add(c); if (body) body.classList.add(c); });
  }

  applyShellTheme();
  window.addEventListener("DOMContentLoaded", applyShellTheme);
  window.addEventListener("storage", applyShellTheme);
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyShellTheme);
  }
  window.setInterval(applyShellTheme, 1500);
})();
