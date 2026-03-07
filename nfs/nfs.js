(function () {
  "use strict";

  function setStatus(text) {
    var el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  function setExports(text) {
    var el = document.getElementById("exports");
    if (el) el.textContent = text || "";
  }

  cockpit.spawn(["bash", "-lc", "exportfs -v 2>/dev/null || cat /etc/exports 2>/dev/null || true"], { superuser: "require" })
    .then(function (out) {
      setStatus("NFS export state loaded.");
      setExports(out.trim());
    })
    .catch(function (err) {
      setStatus("Failed to read NFS exports.");
      setExports(String(err));
    });
}());
