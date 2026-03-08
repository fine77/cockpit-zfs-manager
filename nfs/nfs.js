(function () {
  "use strict";

  var MANAGED_FILE = "/etc/exports";
  var managedRows = [];
  var externalRows = [];
  var activeRows = [];
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

  function getNfsServiceState() {
    return cockpit.spawn(
      [
        "bash",
        "-lc",
        "(systemctl is-active nfs-server 2>/dev/null || systemctl is-active nfs-kernel-server 2>/dev/null || echo inactive) | head -n1"
      ],
      { superuser: "require" }
    ).then(function (out) {
      var state = String(out || "").trim();
      return state || "inactive";
    });
  }

  function ensureNfsServiceOnIfNeeded() {
    var hasExports = (managedRows && managedRows.length > 0) || (activeRows && activeRows.length > 0);
    if (!hasExports) return Promise.resolve("skipped");
    return cockpit.spawn(
      [
        "bash",
        "-lc",
        "systemctl enable --now nfs-server 2>/dev/null || systemctl enable --now nfs-kernel-server 2>/dev/null || true"
      ],
      { superuser: "require" }
    );
  }

  function syncZfsShareNfsFlags() {
    if (!managedRows || !managedRows.length) return Promise.resolve();
    var uniquePaths = {};
    managedRows.forEach(function (r) {
      if (r && r.path) uniquePaths[r.path] = true;
    });
    var script = Object.keys(uniquePaths).map(function (path) {
      var escaped = String(path).replace(/'/g, "'\\''");
      return (
        "ds=$(zfs list -H -o name,mountpoint 2>/dev/null | awk -v p='" + escaped + "' '$2==p{print $1; exit}'); " +
        "[ -n \"$ds\" ] && zfs set sharenfs=on \"$ds\" >/dev/null 2>&1 || true"
      );
    }).join("; ");
    if (!script.trim()) return Promise.resolve();
    return cockpit.spawn(["bash", "-lc", script], { superuser: "require" });
  }

  function parseExports(text) {
    var lines = (text || "").split("\n");
    var rows = [];

    lines.forEach(function (line) {
      var clean = line.trim();
      if (!clean || clean.indexOf("#") === 0) return;

      var firstSpace = clean.indexOf(" ");
      if (firstSpace <= 0) return;

      var path = clean.slice(0, firstSpace);
      var rest = clean.slice(firstSpace + 1).trim();
      if (!rest) return;

      rest.split(/\s+/).forEach(function (part) {
        var match = part.match(/^([^\(]+)\((.*)\)$/);
        if (match) {
          rows.push({ path: path, client: match[1], options: match[2] });
          return;
        }
        rows.push({ path: path, client: part, options: "-" });
      });
    });

    return rows;
  }

  function renderManagedRows() {
    var body = document.getElementById("managed-body");
    if (!body) return;

    body.innerHTML = "";
    var shown = 0;
    var combined = managedRows.concat(externalRows);
    combined.forEach(function (row, index) {
      var hay = [row.path, row.client, row.options].join(" ").toLowerCase();
      if (query && hay.indexOf(query) < 0) return;
      shown += 1;
      var actions = row.external
        ? "<em>External (read-only)</em>"
        : "<button class=\"btn-edit\" data-index=\"" + index + "\">Edit</button> " +
          "<button class=\"btn-delete\" data-index=\"" + index + "\">Delete</button>";
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(row.path) + "</td>" +
        "<td>" + escHtml(row.client) + "</td>" +
        "<td><code>" + escHtml(row.options) + "</code></td>" +
        "<td>" + actions + "</td>";
      body.appendChild(tr);
    });

    if (!shown) body.innerHTML = "<tr><td colspan=\"4\">No managed exports.</td></tr>";
  }

  function renderActiveRows(rows) {
    var body = document.getElementById("exports-body");
    if (!body) return;

    body.innerHTML = "";
    var shown = 0;
    rows.forEach(function (row) {
      var hay = [row.path, row.client, row.options].join(" ").toLowerCase();
      if (query && hay.indexOf(query) < 0) return;
      shown += 1;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(row.path) + "</td>" +
        "<td>" + escHtml(row.client) + "</td>" +
        "<td><code>" + escHtml(row.options) + "</code></td>";
      body.appendChild(tr);
    });

    if (!shown) body.innerHTML = "<tr><td colspan=\"3\">No active exports found.</td></tr>";
  }

  function serializeManagedRows() {
    var lines = [
      "# Managed by cockpit-zfs-manager",
      "# File: " + MANAGED_FILE
    ];

    managedRows.forEach(function (row) {
      lines.push(row.path + " " + row.client + "(" + row.options + ")");
    });

    lines.push("");
    return lines.join("\n");
  }

  function detectManagedFile() {
    return cockpit.spawn(
      ["bash", "-lc", "if [ -d /etc/exports.d ]; then echo /etc/exports.d/cockpit-zfs-manager.exports; else echo /etc/exports; fi"],
      { superuser: "require" }
    ).then(function (out) {
      var value = (out || "").trim();
      if (value) MANAGED_FILE = value;
    });
  }

  function readManagedFile() {
    var f = cockpit.file(MANAGED_FILE, { superuser: "require" });
    return f.read()
      .then(function (content) {
        managedRows = parseExports(content || "");
        renderManagedRows();
      })
      .catch(function () {
        managedRows = [];
        renderManagedRows();
      })
      .finally(function () {
        f.close();
      });
  }

  function writeManagedFile(content) {
    var f = cockpit.file(MANAGED_FILE, { superuser: "require" });
    return f.replace(content)
      .finally(function () {
        f.close();
      });
  }

  function reloadNfsExports() {
    return cockpit.spawn(
      ["bash", "-lc", "exportfs -ra && (systemctl reload nfs-kernel-server 2>/dev/null || systemctl reload nfs-server 2>/dev/null || true)"],
      { superuser: "require" }
    );
  }

  function nfsServiceAction(action) {
    var cmd;
    if (action === "enable") cmd = "systemctl enable --now nfs-server 2>/dev/null || systemctl enable --now nfs-kernel-server 2>/dev/null";
    else if (action === "disable") cmd = "systemctl disable --now nfs-server 2>/dev/null || systemctl disable --now nfs-kernel-server 2>/dev/null";
    else cmd = "systemctl restart nfs-server 2>/dev/null || systemctl restart nfs-kernel-server 2>/dev/null";
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" });
  }

  function validateConfig() {
    return cockpit.spawn(["bash", "-lc", "exportfs -ravn 2>&1 || true"], { superuser: "require" });
  }

  function backupManagedFile() {
    var cmd = "cp -a '" + MANAGED_FILE.replace(/'/g, "'\\''") + "' '" + MANAGED_FILE.replace(/'/g, "'\\''") + ".bak.'$(date -u +%Y%m%dT%H%M%SZ)'";
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" });
  }

  function readActiveExports() {
    return cockpit.spawn(["bash", "-lc", "exportfs -s 2>/dev/null || cat /etc/exports 2>/dev/null || true"], { superuser: "require" })
      .then(function (out) {
        activeRows = parseExports(out || "");
        renderActiveRows(activeRows);
      })
      .catch(function (err) {
        activeRows = [];
        renderActiveRows([]);
        setStatus("Failed to read active export state: " + err);
      });
  }

  function refreshAll() {
    setStatus("Refreshing export state...");
    return readManagedFile()
      .then(syncZfsShareNfsFlags)
      .then(readActiveExports)
      .then(function () {
        if (managedRows.length === 0 && activeRows.length > 0) {
          externalRows = activeRows.map(function (r) {
            return { path: r.path, client: r.client, options: r.options, external: true };
          });
        } else {
          externalRows = [];
        }
      })
      .then(ensureNfsServiceOnIfNeeded)
      .then(function () { return getNfsServiceState(); })
      .then(function (svcState) {
        var on = svcState === "active";
        setBadge(svcState);
        setStatus(
          "NFS Export State: " + (on ? "ON" : "OFF") +
          " | Service=" + svcState +
          " | Managed=" + managedRows.length +
          " | External=" + externalRows.length +
          " | Active=" + activeRows.length
        );
        renderManagedRows();
      })
      .catch(function (err) {
        setStatus("Refresh failed: " + err);
      });
  }

  function installHandlers() {
    var form = document.getElementById("add-form");
    var managedBody = document.getElementById("managed-body");
    var btnSave = document.getElementById("btn-save");
    var btnRefresh = document.getElementById("btn-refresh");
    var btnEnable = document.getElementById("btn-nfs-enable");
    var btnDisable = document.getElementById("btn-nfs-disable");
    var btnRestart = document.getElementById("btn-nfs-restart");
    var btnValidate = document.getElementById("btn-validate");
    var btnBackup = document.getElementById("btn-backup");
    var search = document.getElementById("search");

    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var path = (document.getElementById("new-path").value || "").trim();
        var client = (document.getElementById("new-client").value || "").trim();
        var options = (document.getElementById("new-options").value || "").trim();

        if (!path || !client || !options) {
          setStatus("Path, client, and options are required.");
          return;
        }

        if (editIndex >= 0) {
          managedRows[editIndex] = { path: path, client: client, options: options };
          editIndex = -1;
          form.querySelector("button[type='submit']").textContent = "Add Row";
          setStatus("Row updated. Click 'Save + Apply' to commit.");
          logAction("Updated export row: " + path + " -> " + client);
        } else {
          managedRows.push({ path: path, client: client, options: options });
          setStatus("Row added. Click 'Save + Apply' to commit.");
          logAction("Added export row: " + path + " -> " + client);
        }
        renderManagedRows();
        form.reset();
        document.getElementById("new-options").value = "rw,sync,no_subtree_check";
      });
    }

    if (managedBody) {
      managedBody.addEventListener("click", function (event) {
        var target = event.target;
        if (!target) return;
        var index = parseInt(target.getAttribute("data-index"), 10);
        if (isNaN(index)) return;
        if (managedRows.length === 0 && externalRows.length > 0) {
          setStatus("External exports are read-only in this table.");
          return;
        }

        if (target.classList.contains("btn-delete")) {
          managedRows.splice(index, 1);
          renderManagedRows();
          setStatus("Row removed. Click 'Save + Apply' to commit.");
          logAction("Removed export row #" + index);
          return;
        }

        if (target.classList.contains("btn-edit")) {
          var row = managedRows[index];
          if (!row) return;
          document.getElementById("new-path").value = row.path;
          document.getElementById("new-client").value = row.client;
          document.getElementById("new-options").value = row.options;
          editIndex = index;
          form.querySelector("button[type='submit']").textContent = "Update Row";
          setStatus("Edit mode enabled for selected row.");
        }
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", function () {
        setStatus("Saving managed exports...");
        logAction("Save + Apply requested.");
        writeManagedFile(serializeManagedRows())
          .then(function () {
            setStatus("Applying NFS exports...");
            return reloadNfsExports();
          })
          .then(function () { return syncZfsShareNfsFlags(); })
          .then(function () { return refreshAll(); })
          .then(function () {
            setStatus("Managed exports saved and applied.");
            logAction("Managed exports saved and applied.");
          })
          .catch(function (err) {
            setStatus("Save/apply failed: " + err);
            logAction("Save/apply failed: " + err);
          });
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener("click", function () {
        logAction("Manual refresh.");
        refreshAll();
      });
    }

    if (btnEnable) {
      btnEnable.addEventListener("click", function () {
        setStatus("Enabling NFS service...");
        logAction("Enable service requested.");
        nfsServiceAction("enable").then(refreshAll).catch(function (err) { setStatus("Enable failed: " + err); logAction("Enable failed: " + err); });
      });
    }

    if (btnDisable) {
      btnDisable.addEventListener("click", function () {
        setStatus("Disabling NFS service...");
        logAction("Disable service requested.");
        nfsServiceAction("disable").then(refreshAll).catch(function (err) { setStatus("Disable failed: " + err); logAction("Disable failed: " + err); });
      });
    }

    if (btnRestart) {
      btnRestart.addEventListener("click", function () {
        setStatus("Restarting NFS service...");
        logAction("Restart service requested.");
        nfsServiceAction("restart").then(refreshAll).catch(function (err) { setStatus("Restart failed: " + err); logAction("Restart failed: " + err); });
      });
    }

    if (btnValidate) {
      btnValidate.addEventListener("click", function () {
        setStatus("Validating exports...");
        validateConfig()
          .then(function (out) {
            logAction("Validate finished.");
            var el = document.getElementById("action-log");
            if (el && out && out.trim()) el.textContent = "Validation output:\n" + out.trim() + "\n\n" + el.textContent;
            return refreshAll();
          })
          .catch(function (err) {
            setStatus("Validate failed: " + err);
            logAction("Validate failed: " + err);
          });
      });
    }

    if (btnBackup) {
      btnBackup.addEventListener("click", function () {
        setStatus("Creating backup...");
        backupManagedFile()
          .then(function () { setStatus("Backup created."); logAction("Backup created for " + MANAGED_FILE); })
          .catch(function (err) { setStatus("Backup failed: " + err); logAction("Backup failed: " + err); });
      });
    }

    if (search) {
      search.addEventListener("input", function () {
        query = (search.value || "").trim().toLowerCase();
        renderManagedRows();
        renderActiveRows(activeRows);
      });
    }
  }

  installHandlers();
  detectManagedFile()
    .then(function () { return refreshAll(); })
    .catch(function (err) {
      setStatus("Managed file detection failed: " + err);
      return refreshAll();
    });
}());
