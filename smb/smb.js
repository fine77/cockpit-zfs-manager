(function () {
  "use strict";

  var MANAGED_FILE = "/etc/samba/smb.conf.d/cockpit-zfs-manager.conf";
  var rows = [];
  var managedCount = 0;
  var editIndex = -1;
  var query = "";
  var logLines = [];

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(text) {
    var el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  function setBadge(state) {
    var el = document.getElementById("svc-badge");
    if (el) el.textContent = "Service: " + state;
  }

  function logAction(text) {
    var ts = new Date().toISOString().replace("T", " ").replace("Z", " UTC");
    logLines.unshift("[" + ts + "] " + text);
    logLines = logLines.slice(0, 60);
    var el = document.getElementById("action-log");
    if (el) el.textContent = logLines.join("\n");
  }

  function parseBool(v, def) {
    var s = String(v || "").trim().toLowerCase();
    if (!s) return !!def;
    return ["yes", "true", "1", "on"].indexOf(s) >= 0;
  }

  function parseManaged(content, managedFlag) {
    if (typeof managedFlag !== "boolean") managedFlag = true;
    var current = null;
    var out = [];
    (content || "").split("\n").forEach(function (line) {
      var raw = line.trim();
      if (!raw || raw.indexOf("#") === 0 || raw.indexOf(";") === 0) return;
      var sec = raw.match(/^\[([^\]]+)\]$/);
      if (sec) {
        if (current) out.push(current);
        current = { name: sec[1].trim(), path: "", users: "", readOnly: false, browseable: true, guestOk: false, managed: managedFlag };
        return;
      }
      if (!current) return;
      var kv = raw.match(/^([^=]+)=(.*)$/);
      if (!kv) return;
      var k = kv[1].trim().toLowerCase();
      var v = kv[2].trim();
      if (k === "path") current.path = v;
      else if (k === "valid users") current.users = v;
      else if (k === "read only") current.readOnly = parseBool(v, false);
      else if (k === "browseable") current.browseable = parseBool(v, true);
      else if (k === "guest ok") current.guestOk = parseBool(v, false);
    });
    if (current) out.push(current);
    return out.filter(function (r) {
      return r && r.name && r.name.toLowerCase() !== "global" && !!r.path;
    });
  }

  function serializeManaged() {
    var lines = ["# Managed by cockpit-zfs-manager", "# File: " + MANAGED_FILE];
    rows.filter(function (r) { return r.managed !== false; }).forEach(function (r) {
      lines.push("");
      lines.push("[" + r.name + "]");
      lines.push("path = " + r.path);
      lines.push("browseable = " + (r.browseable ? "yes" : "no"));
      lines.push("read only = " + (r.readOnly ? "yes" : "no"));
      lines.push("guest ok = " + (r.guestOk ? "yes" : "no"));
      if ((r.users || "").trim()) lines.push("valid users = " + r.users.trim());
    });
    lines.push("");
    return lines.join("\n");
  }

  function render() {
    var body = document.getElementById("shares-body");
    if (!body) return;
    body.innerHTML = "";
    var shown = 0;
    rows.forEach(function (r, i) {
      var hay = [r.name, r.path, r.users].join(" ").toLowerCase();
      if (query && hay.indexOf(query) < 0) return;
      shown += 1;
      var flags = ["RO=" + (r.readOnly ? "yes" : "no"), "Browse=" + (r.browseable ? "yes" : "no"), "Guest=" + (r.guestOk ? "yes" : "no")].join(" | ");
      var actions = (r.managed === false)
        ? "<em>External (read-only)</em>"
        : "<button class='btn-edit' data-index='" + i + "'>Edit</button> <button class='btn-delete' data-index='" + i + "'>Delete</button>";
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(r.name) + "</td>" +
        "<td>" + escHtml(r.path) + "</td>" +
        "<td><code>" + escHtml(flags) + "</code></td>" +
        "<td>" + escHtml(r.users || "-") + "</td>" +
        "<td>" + actions + "</td>";
      body.appendChild(tr);
    });
    if (!shown) body.innerHTML = "<tr><td colspan='5'>No managed shares.</td></tr>";
  }

  function ensureManagedInclude() {
    var cmd = [
      "mkdir -p /etc/samba/smb.conf.d",
      "touch " + MANAGED_FILE,
      "grep -qF \"include = " + MANAGED_FILE + "\" /etc/samba/smb.conf || echo \"include = " + MANAGED_FILE + "\" >> /etc/samba/smb.conf"
    ].join(" ; ");
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" });
  }

  function readManaged() {
    var f = cockpit.file(MANAGED_FILE, { superuser: "require" });
    return f.read().then(function (content) {
      rows = parseManaged(content || "", true);
      managedCount = rows.length;
      render();
    }).catch(function () {
      rows = [];
      managedCount = 0;
      render();
    }).finally(function () { f.close(); });
  }

  function readExternalIfNeeded() {
    if (rows.length > 0) return Promise.resolve();
    return cockpit.spawn(["bash", "-lc", "cat /etc/samba/smb.conf 2>/dev/null || true"], { superuser: "require" })
      .then(function (content) {
        rows = parseManaged(content || "", false);
        render();
      });
  }

  function writeManaged() {
    var f = cockpit.file(MANAGED_FILE, { superuser: "require" });
    return f.replace(serializeManaged()).finally(function () { f.close(); });
  }

  function serviceCmd(action) {
    var cmd;
    if (action === "enable") cmd = "systemctl enable --now smbd 2>/dev/null || systemctl enable --now smb 2>/dev/null";
    else if (action === "disable") cmd = "systemctl disable --now smbd 2>/dev/null || systemctl disable --now smb 2>/dev/null";
    else cmd = "systemctl restart smbd 2>/dev/null || systemctl restart smb 2>/dev/null";
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" });
  }

  function getServiceState() {
    return cockpit.spawn(["bash", "-lc", "(systemctl is-active smbd 2>/dev/null || systemctl is-active smb 2>/dev/null || echo inactive) | head -n1"], { superuser: "require" })
      .then(function (out) { return String(out || "").trim() || "inactive"; });
  }

  function validateConfig() {
    return cockpit.spawn(["bash", "-lc", "testparm -s 2>&1 || true"], { superuser: "require" });
  }

  function backupManagedFile() {
    var cmd = "cp -a '" + MANAGED_FILE.replace(/'/g, "'\\''") + "' '" + MANAGED_FILE.replace(/'/g, "'\\''") + ".bak.'$(date -u +%Y%m%dT%H%M%SZ)'";
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" });
  }

  function readActive() {
    return cockpit.spawn(["bash", "-lc", "testparm -s 2>/dev/null | sed -n '/^\\[/,$p' || true"], { superuser: "require" })
      .then(function (out) {
        var el = document.getElementById("shares");
        if (el) el.textContent = (out || "").trim();
      });
  }

  function refreshAll() {
    setStatus("Refreshing SMB state...");
    return ensureManagedInclude()
      .then(readManaged)
      .then(readExternalIfNeeded)
      .then(readActive)
      .then(function () { return getServiceState(); })
      .then(function (state) {
        setBadge(state);
        var externalCount = rows.filter(function (r) { return r.managed === false; }).length;
        setStatus("SMB Service=" + state + " | Managed=" + managedCount + " | External=" + externalCount);
      })
      .catch(function (err) {
        setStatus("Refresh failed: " + err);
      });
  }

  function bindEvents() {
    var form = document.getElementById("add-form");
    var save = document.getElementById("btn-save");
    var refresh = document.getElementById("btn-refresh");
    var enable = document.getElementById("btn-enable");
    var disable = document.getElementById("btn-disable");
    var restart = document.getElementById("btn-restart");
    var body = document.getElementById("shares-body");
    var search = document.getElementById("search");

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var name = (document.getElementById("new-name").value || "").trim();
        var path = (document.getElementById("new-path").value || "").trim();
        var users = (document.getElementById("new-users").value || "").trim();
        var readOnly = !!document.getElementById("new-readonly").checked;
        var browseable = !!document.getElementById("new-browseable").checked;
        var guestOk = !!document.getElementById("new-guestok").checked;
        if (!name || !path) {
          setStatus("Share name and path are required.");
          return;
        }
        if (editIndex >= 0) {
          rows[editIndex] = { name: name, path: path, users: users, readOnly: readOnly, browseable: browseable, guestOk: guestOk, managed: true };
          editIndex = -1;
          form.querySelector("button[type='submit']").textContent = "Add Share";
          logAction("Updated share [" + name + "]");
        } else {
          rows.push({ name: name, path: path, users: users, readOnly: readOnly, browseable: browseable, guestOk: guestOk, managed: true });
          logAction("Added share [" + name + "]");
        }
        render();
        form.reset();
        document.getElementById("new-browseable").checked = true;
        setStatus("Share updated locally. Click 'Save + Apply'.");
      });
    }

    if (body) {
      body.addEventListener("click", function (event) {
        var t = event.target;
        if (!t) return;
        var idx = parseInt(t.getAttribute("data-index"), 10);
        if (isNaN(idx)) return;
        if (rows[idx] && rows[idx].managed === false) {
          setStatus("External shares are read-only in this table.");
          return;
        }
        if (t.classList.contains("btn-delete")) {
          rows.splice(idx, 1);
          render();
          setStatus("Share removed locally. Click 'Save + Apply'.");
          logAction("Removed share row #" + idx);
          return;
        }
        if (t.classList.contains("btn-edit")) {
          var r = rows[idx];
          if (!r) return;
          document.getElementById("new-name").value = r.name;
          document.getElementById("new-path").value = r.path;
          document.getElementById("new-users").value = r.users || "";
          document.getElementById("new-readonly").checked = !!r.readOnly;
          document.getElementById("new-browseable").checked = !!r.browseable;
          document.getElementById("new-guestok").checked = !!r.guestOk;
          editIndex = idx;
          form.querySelector("button[type='submit']").textContent = "Update Share";
          setStatus("Edit mode enabled.");
        }
      });
    }

    if (save) {
      save.addEventListener("click", function () {
        setStatus("Saving and applying SMB config...");
        logAction("Save + Apply requested.");
        writeManaged()
          .then(function () { return serviceCmd("restart"); })
          .then(refreshAll)
          .then(function () { logAction("SMB config applied."); })
          .catch(function (err) { setStatus("Save/apply failed: " + err); logAction("Save/apply failed: " + err); });
      });
    }

    if (refresh) refresh.addEventListener("click", function () { logAction("Manual refresh."); refreshAll(); });
    if (enable) enable.addEventListener("click", function () { setStatus("Enabling SMB..."); logAction("Enable service requested."); serviceCmd("enable").then(refreshAll).catch(function (e) { setStatus("Enable failed: " + e); logAction("Enable failed: " + e); }); });
    if (disable) disable.addEventListener("click", function () { setStatus("Disabling SMB..."); logAction("Disable service requested."); serviceCmd("disable").then(refreshAll).catch(function (e) { setStatus("Disable failed: " + e); logAction("Disable failed: " + e); }); });
    if (restart) restart.addEventListener("click", function () { setStatus("Restarting SMB..."); logAction("Restart service requested."); serviceCmd("restart").then(refreshAll).catch(function (e) { setStatus("Restart failed: " + e); logAction("Restart failed: " + e); }); });

    var validate = document.createElement("button");
    validate.id = "btn-validate";
    validate.type = "button";
    validate.textContent = "Validate Config";
    var backup = document.createElement("button");
    backup.id = "btn-backup";
    backup.type = "button";
    backup.textContent = "Backup Config";
    var actions = document.querySelector(".actions");
    if (actions) {
      actions.insertBefore(validate, document.getElementById("btn-refresh"));
      actions.insertBefore(backup, document.getElementById("btn-refresh"));
    }

    validate.addEventListener("click", function () {
      setStatus("Validating smb.conf...");
      validateConfig().then(function (out) {
        var el = document.getElementById("action-log");
        if (el && out && out.trim()) el.textContent = "Validation output:\n" + out.trim() + "\n\n" + el.textContent;
        logAction("Validate finished.");
        refreshAll();
      }).catch(function (e) { setStatus("Validate failed: " + e); logAction("Validate failed: " + e); });
    });

    backup.addEventListener("click", function () {
      setStatus("Creating backup...");
      backupManagedFile().then(function () { setStatus("Backup created."); logAction("Backup created for managed SMB file."); }).catch(function (e) { setStatus("Backup failed: " + e); logAction("Backup failed: " + e); });
    });

    if (search) {
      search.addEventListener("input", function () {
        query = (search.value || "").trim().toLowerCase();
        render();
      });
    }
  }

  bindEvents();
  refreshAll();
}());
