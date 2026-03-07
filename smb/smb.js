(function () {
  "use strict";

  function setStatus(text) {
    var el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  function setShares(text) {
    var el = document.getElementById("shares");
    if (el) el.textContent = text || "";
  }

  cockpit.spawn(["bash", "-lc", "test -f /etc/samba/smb.conf && sed -n '/^\\[/,$p' /etc/samba/smb.conf || echo 'smb.conf not found'"], { superuser: "require" })
    .then(function (out) {
      setStatus("SMB share state loaded.");
      setShares(out.trim());
    })
    .catch(function (err) {
      setStatus("Failed to read SMB configuration.");
      setShares(String(err));
    });
}());
