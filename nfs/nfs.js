(function () {
  "use strict";

  function setStatus(text) {
    var el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  function renderRows(rows) {
    var body = document.getElementById("exports-body");
    if (!body) return;

    body.innerHTML = "";

    if (!rows.length) {
      body.innerHTML = "<tr><td colspan=\"3\">No exports found.</td></tr>";
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + row.path + "</td>" +
        "<td>" + row.client + "</td>" +
        "<td><code>" + row.options + "</code></td>";
      body.appendChild(tr);
    });
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

      var parts = rest.split(/\s+/);
      parts.forEach(function (part) {
        var m = part.match(/^([^\(]+)\((.*)\)$/);
        if (m) {
          rows.push({ path: path, client: m[1], options: m[2] });
        } else {
          rows.push({ path: path, client: part, options: "-" });
        }
      });
    });

    return rows;
  }

  cockpit.spawn(["bash", "-lc", "cat /etc/exports 2>/dev/null || true"], { superuser: "require" })
    .then(function (out) {
      setStatus("NFS export state loaded.");
      renderRows(parseExports(out));
    })
    .catch(function (err) {
      setStatus("Failed to read NFS exports.");
      renderRows([]);
      var body = document.getElementById("exports-body");
      if (body) {
        body.innerHTML = "<tr><td colspan=\"3\">" + String(err) + "</td></tr>";
      }
    });
}());
