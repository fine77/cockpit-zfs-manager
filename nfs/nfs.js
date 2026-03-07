(function () {
  "use strict";

  var MANAGED_FILE = "/etc/exports";
  var managedRows = [];

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(text) {
    var el = document.getElementById("status");
    if (el) el.textContent = text;
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
    if (!managedRows.length) {
      body.innerHTML = "<tr><td colspan=\"4\">No managed exports.</td></tr>";
      return;
    }

    managedRows.forEach(function (row, index) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(row.path) + "</td>" +
        "<td>" + escHtml(row.client) + "</td>" +
        "<td><code>" + escHtml(row.options) + "</code></td>" +
        "<td><button class=\"btn-delete\" data-index=\"" + index + "\">Delete</button></td>";
      body.appendChild(tr);
    });
  }

  function renderActiveRows(rows) {
    var body = document.getElementById("exports-body");
    if (!body) return;

    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = "<tr><td colspan=\"3\">No active exports found.</td></tr>";
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + escHtml(row.path) + "</td>" +
        "<td>" + escHtml(row.client) + "</td>" +
        "<td><code>" + escHtml(row.options) + "</code></td>";
      body.appendChild(tr);
    });
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

  function readActiveExports() {
    return cockpit.spawn(["bash", "-lc", "exportfs -s 2>/dev/null || cat /etc/exports 2>/dev/null || true"], { superuser: "require" })
      .then(function (out) {
        renderActiveRows(parseExports(out || ""));
      })
      .catch(function (err) {
        renderActiveRows([]);
        setStatus("Failed to read active export state: " + err);
      });
  }

  function refreshAll() {
    setStatus("Refreshing export state...");
    return readManagedFile()
      .then(readActiveExports)
      .then(function () {
        setStatus("NFS export state loaded.");
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

        managedRows.push({ path: path, client: client, options: options });
        renderManagedRows();
        form.reset();
        document.getElementById("new-options").value = "rw,sync,no_subtree_check";
        setStatus("Row added. Click 'Save + Apply' to commit.");
      });
    }

    if (managedBody) {
      managedBody.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.classList.contains("btn-delete")) return;
        var index = parseInt(target.getAttribute("data-index"), 10);
        if (isNaN(index)) return;
        managedRows.splice(index, 1);
        renderManagedRows();
        setStatus("Row removed. Click 'Save + Apply' to commit.");
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", function () {
        setStatus("Saving managed exports...");
        writeManagedFile(serializeManagedRows())
          .then(function () {
            setStatus("Applying NFS exports...");
            return reloadNfsExports();
          })
          .then(function () {
            return refreshAll();
          })
          .then(function () {
            setStatus("Managed exports saved and applied.");
          })
          .catch(function (err) {
            setStatus("Save/apply failed: " + err);
          });
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener("click", function () {
        refreshAll();
      });
    }
  }

  installHandlers();
  detectManagedFile()
    .then(function () {
      return refreshAll();
    })
    .catch(function (err) {
      setStatus("Managed file detection failed: " + err);
      return refreshAll();
    });
}());
