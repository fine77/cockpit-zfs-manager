(function () {
  "use strict";

  var smartCache = {}; // by poolId
  var settings = loadSettings();
  var runtimeVirtType = "unknown";
  var runtimeSourceRecommended = "container";

  function loadSettings() {
    var d = {
      smartctlBin: "smartctl",
      smartNoCheckMode: "auto",
      smartSourceMode: "auto",
      mapPartitions: true,
      cacheMinutes: 5
    };
    try {
      var raw = window.localStorage.getItem("zfsEnhanceSettings");
      if (!raw) return d;
      var p = JSON.parse(raw);
      if (p && typeof p.smartctlBin === "string" && p.smartctlBin.trim()) d.smartctlBin = p.smartctlBin.trim();
      if (p && typeof p.smartNoCheckMode === "string" && p.smartNoCheckMode.trim()) d.smartNoCheckMode = p.smartNoCheckMode.trim();
      if (p && typeof p.smartSourceMode === "string" && p.smartSourceMode.trim()) d.smartSourceMode = p.smartSourceMode.trim();
      if (d.smartNoCheckMode === "standby,now") d.smartNoCheckMode = "auto";
      if (p && typeof p.mapPartitions === "boolean") d.mapPartitions = p.mapPartitions;
      if (p && Number.isFinite(Number(p.cacheMinutes)) && Number(p.cacheMinutes) >= 0) d.cacheMinutes = Number(p.cacheMinutes);
    } catch (e) {}
    return d;
  }

  function saveSettings() {
    window.localStorage.setItem("zfsEnhanceSettings", JSON.stringify(settings));
  }

  function detectRuntimeVirtualization() {
    return cockpit.spawn(["bash", "-lc", "systemd-detect-virt -c 2>/dev/null || true"], { superuser: "require" })
      .then(function (v) {
        runtimeVirtType = String(v || "").trim().toLowerCase() || "unknown";
        if (runtimeVirtType === "lxc") runtimeSourceRecommended = "host";
        else runtimeSourceRecommended = "container";
      })
      .catch(function () {
        runtimeVirtType = "unknown";
        runtimeSourceRecommended = "container";
      });
  }

  function ensureSetupModal() {
    var id = "zfs-enhance-setup-modal";
    if (byId(id)) return;

    var wrap = document.createElement("div");
    wrap.innerHTML =
      "<div id='" + id + "' class='modal fade' tabindex='-1' role='dialog' aria-hidden='true'>" +
      "  <div class='modal-dialog'>" +
      "    <div class='modal-content'>" +
      "      <div class='modal-header'>" +
      "        <button type='button' class='close' data-dismiss='modal' aria-label='Close'><span aria-hidden='true'>&times;</span></button>" +
      "        <h4 class='modal-title'>ZFS Module Setup</h4>" +
      "      </div>" +
      "      <div class='modal-body'>" +
      "        <div class='form-group'>" +
      "          <label for='zfs-setup-smartbin'>SMART binary path</label>" +
      "          <input id='zfs-setup-smartbin' class='form-control' type='text' placeholder='smartctl' />" +
      "        </div>" +
      "        <div class='form-group'>" +
      "          <label for='zfs-setup-source'>SMART source mode</label>" +
      "          <select id='zfs-setup-source' class='form-control'>" +
      "            <option value='auto'>auto</option>" +
      "            <option value='container'>container</option>" +
      "            <option value='host'>host-standard</option>" +
      "          </select>" +
      "          <div id='zfs-setup-source-detected' style='margin-top:6px; font-size:12px; opacity:.85;'>Recommended source method: checking...</div>" +
      "        </div>" +
      "        <div class='form-group'>" +
      "          <label for='zfs-setup-nmode'>SMART no-check mode</label>" +
      "          <select id='zfs-setup-nmode' class='form-control'>" +
      "            <option value='auto'>auto</option>" +
      "            <option value='standby'>standby</option>" +
      "            <option value='never'>never</option>" +
      "            <option value='plain'>plain</option>" +
      "            <option value='none'>none</option>" +
      "          </select>" +
      "          <div id='zfs-setup-detected' style='margin-top:6px; font-size:12px; opacity:.85;'>Detected profile: checking...</div>" +
      "        </div>" +
      "        <div class='form-group'>" +
      "          <label for='zfs-setup-cache'>SMART cache minutes</label>" +
      "          <input id='zfs-setup-cache' class='form-control' type='number' min='0' step='1' />" +
      "        </div>" +
      "        <div class='checkbox'>" +
      "          <label><input id='zfs-setup-map' type='checkbox' /> Map partitions to parent disk</label>" +
      "        </div>" +
      "      </div>" +
      "      <div class='modal-footer'>" +
      "        <button id='zfs-setup-cancel' type='button' class='btn btn-default' data-dismiss='modal'>Cancel</button>" +
      "        <button id='zfs-setup-save' type='button' class='btn btn-primary'>Save</button>" +
      "      </div>" +
      "    </div>" +
      "  </div>" +
      "</div>";
    document.body.appendChild(wrap.firstChild);

    byId("zfs-setup-save").addEventListener("click", function () {
      var smartctlBin = String((byId("zfs-setup-smartbin").value || "").trim() || "smartctl");
      var sourceMode = String((byId("zfs-setup-source").value || "auto").trim().toLowerCase());
      var noCheckMode = String((byId("zfs-setup-nmode").value || "auto").trim().toLowerCase());
      if (noCheckMode === "standby,now") noCheckMode = "auto";
      var cacheMinutes = Number(byId("zfs-setup-cache").value);
      var mapPartitions = !!byId("zfs-setup-map").checked;

      if (!/^(auto|container|host)$/.test(sourceMode)) {
        sourceMode = "auto";
      }
      if (!/^(auto|standby|never|none|plain)$/.test(noCheckMode)) {
        noCheckMode = "auto";
      }
      if (!Number.isFinite(cacheMinutes) || cacheMinutes < 0) {
        cacheMinutes = 5;
      }

      settings.smartctlBin = smartctlBin;
      settings.smartSourceMode = sourceMode;
      settings.smartNoCheckMode = noCheckMode;
      settings.mapPartitions = mapPartitions;
      settings.cacheMinutes = cacheMinutes;
      saveSettings();

      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) {
        window.jQuery("#" + id).modal("hide");
      } else {
        byId(id).style.display = "none";
      }
    });
  }

  function openSetupModal() {
    ensureSetupModal();

    byId("zfs-setup-smartbin").value = settings.smartctlBin || "smartctl";
    byId("zfs-setup-source").value = settings.smartSourceMode || "auto";
    byId("zfs-setup-nmode").value = settings.smartNoCheckMode || "auto";
    byId("zfs-setup-cache").value = String(settings.cacheMinutes == null ? 5 : settings.cacheMinutes);
    byId("zfs-setup-map").checked = !!settings.mapPartitions;
    detectSourceRecommendation();
    detectSmartProfile();

    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) {
      window.jQuery("#zfs-enhance-setup-modal").modal("show");
    } else {
      var el = byId("zfs-enhance-setup-modal");
      if (el) el.style.display = "block";
    }
  }

  function detectSourceRecommendation() {
    var el = byId("zfs-setup-source-detected");
    var sel = byId("zfs-setup-source");
    if (!el || !sel) return;
    el.textContent = "Recommended source method: checking...";
    Array.from(sel.options).forEach(function (o) { o.text = o.value === "host" ? "host-standard" : o.value; });

    detectRuntimeVirtualization().then(function () {
      var rec = runtimeSourceRecommended || "container";
      el.textContent = "Recommended source method: " + rec + (runtimeVirtType !== "unknown" ? " (detected:" + runtimeVirtType + ")" : "");
      Array.from(sel.options).forEach(function (o) {
        if (o.value === "host") {
          o.text = "host-standard" + (rec === "host" ? " (recommended)" : "");
        } else if (o.value === rec) {
          o.text = o.value + " (recommended)";
        }
      });
    });
  }

  function detectSmartProfile() {
    var el = byId("zfs-setup-detected");
    if (!el) return;
    el.textContent = "Detected profile: checking...";
    var sel = byId("zfs-setup-nmode");
    if (sel) {
      Array.from(sel.options).forEach(function (o) {
        o.text = o.value;
      });
    }
    var bin = String(settings.smartctlBin || "smartctl").replace(/'/g, "'\\''");
    var cmd = [
      "set +e",
      "SMARTBIN='" + bin + "'",
      "if \"$SMARTBIN\" -h 2>/dev/null | grep -q 'standby'; then echo standby; exit 0; fi",
      "if \"$SMARTBIN\" -h 2>/dev/null | grep -q 'never'; then echo never; exit 0; fi",
      "echo plain"
    ].join("; ");
    cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" })
      .then(function (out) {
        var p = String(out || "").trim() || "plain";
        el.textContent = "Recommended profile: " + p;
        if (sel) {
          Array.from(sel.options).forEach(function (o) {
            if (o.value === p) o.text = o.value + " (recommended)";
          });
        }
      })
      .catch(function () {
        el.textContent = "Recommended profile: plain";
        if (sel) {
          Array.from(sel.options).forEach(function (o) {
            if (o.value === "plain") o.text = o.value + " (recommended)";
          });
        }
      });
  }

  function byId(id) { return document.getElementById(id); }
  function text(el) { return (el && el.textContent || "").trim(); }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensureToolbar() {
    if (byId("zfs-enhance-toolbar")) return;
    var header = document.querySelector("#container section.ct-listing > header");
    if (!header) return;

    var wrap = document.createElement("div");
    wrap.id = "zfs-enhance-toolbar";
    wrap.style.display = "flex";
    wrap.style.gap = "0.45rem";
    wrap.style.alignItems = "center";
    wrap.style.marginTop = "0.5rem";
    wrap.style.flexWrap = "wrap";

    var search = document.createElement("input");
    search.id = "zfs-enhance-search";
    search.type = "text";
    search.placeholder = "Filter pools...";
    search.style.minWidth = "220px";
    search.style.padding = "0.35rem 0.5rem";

    var collapse = document.createElement("button");
    collapse.type = "button";
    collapse.textContent = "Collapse all";
    collapse.className = "btn btn-default";

    var expand = document.createElement("button");
    expand.type = "button";
    expand.textContent = "Expand all";
    expand.className = "btn btn-default";

    var stats = document.createElement("span");
    stats.id = "zfs-enhance-stats";
    stats.style.fontSize = "0.82rem";
    stats.style.opacity = "0.85";

    var setup = document.createElement("button");
    setup.type = "button";
    setup.textContent = "Setup";
    setup.className = "btn btn-default";

    wrap.appendChild(search);
    wrap.appendChild(collapse);
    wrap.appendChild(expand);
    wrap.appendChild(setup);
    wrap.appendChild(stats);
    header.appendChild(wrap);

    search.addEventListener("input", function () {
      var q = (search.value || "").toLowerCase();
      var rows = document.querySelectorAll("#table-storagepools > tbody > tr.listing-ct-item");
      rows.forEach(function (r) {
        var name = (r.getAttribute("data-pool-name") || "").toLowerCase();
        r.parentElement.style.display = (!q || name.indexOf(q) >= 0) ? "" : "none";
      });
      refreshStats();
    });

    collapse.addEventListener("click", function () {
      document.querySelectorAll("#table-storagepools > tbody.open > tr.listing-ct-item").forEach(function (r) { r.click(); });
    });

    expand.addEventListener("click", function () {
      document.querySelectorAll("#table-storagepools > tbody:not(.open) > tr.listing-ct-item").forEach(function (r) { r.click(); });
    });

    setup.addEventListener("click", openSetupModal);
  }

  function refreshStats() {
    var stats = byId("zfs-enhance-stats");
    if (!stats) return;

    var rows = Array.from(document.querySelectorAll("#table-storagepools > tbody > tr.listing-ct-item"))
      .filter(function (r) { return r.parentElement.style.display !== "none"; });

    var poolCount = rows.length;
    var poolBad = 0;
    rows.forEach(function (r) {
      var health = text(r.querySelector("td[data-title='Health'], td:nth-child(4)"));
      if (health && !/ONLINE|HEALTHY/i.test(health)) poolBad += 1;
    });

    stats.textContent = "Pools: " + poolCount + " | Pool warnings: " + poolBad;
  }

  function parseSmartOutput(out) {
    var rows = [];
    String(out || "").split("\n").forEach(function (line) {
      if (!line.trim()) return;
      var p = line.split("\t");
      if (p.length < 11) return;
      rows.push({
        dev: p[0] || "-",
        real: p[1] || "-",
        model: p[2] || "-",
        health: p[3] || "UNKNOWN",
        temp: p[4] || "-",
        poh: p[5] || "-",
        realloc: p[6] || "-",
        pending: p[7] || "-",
        offline: p[8] || "-",
        selftest: p[9] || "-",
        serial: p[10] || "-"
      });
    });
    return rows;
  }

  function renderPoolSmart(poolId, rows) {
    var body = byId("tbody-storagepool-smart-" + poolId);
    var hint = byId("hint-storagepool-smart-" + poolId);
    if (!body || !hint) return;

    if (!rows || !rows.length) {
      body.innerHTML = "<tr><td colspan='10'>No SMART-capable disks detected for this pool.</td></tr>";
      hint.textContent = "SMART loaded: no disks detected.";
      return;
    }

    body.innerHTML = "";
    var bad = 0;
    rows.forEach(function (r) {
      if (!/PASSED|OK|GOOD|HEALTHY/i.test(r.health)) bad += 1;
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td title='" + esc(r.serial) + "'>" + esc(r.dev) + "</td>" +
        "<td>" + esc(r.model) + "</td>" +
        "<td>" + esc(r.health) + "</td>" +
        "<td>" + esc(r.temp) + "</td>" +
        "<td>" + esc(r.poh) + "</td>" +
        "<td>" + esc(r.realloc) + "</td>" +
        "<td>" + esc(r.pending) + "</td>" +
        "<td>" + esc(r.offline) + "</td>" +
        "<td>" + esc(r.selftest) + "</td>" +
        "<td><button class='btn btn-default btn-smart-short' data-pool='" + esc(poolId) + "' data-real='" + esc(r.real) + "'>Run short test</button></td>";
      body.appendChild(tr);
    });

    hint.textContent = "SMART loaded for " + rows.length + " disk(s). Non-passed: " + bad;
  }

  function setHostUnsupported(poolId, body, detail) {
    var hint = byId("hint-storagepool-smart-" + poolId);
    cockpit.spawn(["bash", "-lc", "systemd-detect-virt -c 2>/dev/null || true"], { superuser: "require" })
      .then(function (v) {
        var virt = String(v || "").trim().toLowerCase();
        var src = "Host";
        if (virt === "lxc") src = "LXC Host";
        else if (virt === "docker" || virt === "containerd" || virt === "podman") src = "Container Host";
        else if (virt === "kvm" || virt === "qemu" || virt === "vmware" || virt === "xen" || virt === "microsoft") src = "VM Host";
        else if (virt === "none" || !virt) src = "Bare-metal Host";
        if (hint) hint.textContent = "Source switched: " + src + " (unsupported). " + detail + " detected:" + (virt || "unknown");
        if (body) body.innerHTML = "<tr><td colspan='10'>Use " + src + " Disk/SMART view for hardware SMART details.</td></tr>";
      })
      .catch(function () {
        if (hint) hint.textContent = "Source switched: Host (unsupported). " + detail + " detected:unknown";
        if (body) body.innerHTML = "<tr><td colspan='10'>Use Host Disk/SMART view for hardware SMART details.</td></tr>";
      });
  }

  function loadPoolSmart(poolId, poolName, force) {
    var body = byId("tbody-storagepool-smart-" + poolId);
    var hint = byId("hint-storagepool-smart-" + poolId);
    var sourceMode = String(settings.smartSourceMode || "auto");

    if (sourceMode === "host") {
      setHostUnsupported(poolId, body, "SMART is managed on host level, not inside this container.");
      return;
    }

    var cache = smartCache[poolId] || { loadedAt: 0, rows: [] };
    if (!force && settings.cacheMinutes > 0 && Date.now() - cache.loadedAt < settings.cacheMinutes * 60 * 1000 && cache.rows.length) {
      renderPoolSmart(poolId, cache.rows);
      return;
    }
    if (body) body.innerHTML = "<tr><td colspan='10'>Loading...</td></tr>";

    var poolEsc = String(poolName || "").replace(/'/g, "'\\''");
    var script = [
      "set +e",
      "POOL='" + poolEsc + "'",
      "SMARTBIN='" + String(settings.smartctlBin || "smartctl").replace(/'/g, "'\\''") + "'",
      "SMART_N_MODE='" + String(settings.smartNoCheckMode || "auto").replace(/'/g, "'\\''") + "'",
      "PROFILE='plain'",
      "NOPT=''",
      "if [ \"$SMART_N_MODE\" = 'auto' ]; then",
      "  if \"$SMARTBIN\" -h 2>/dev/null | grep -q 'standby'; then PROFILE='standby'; NOPT='standby';",
      "  elif \"$SMARTBIN\" -h 2>/dev/null | grep -q 'never'; then PROFILE='never'; NOPT='never';",
      "  else PROFILE='plain'; NOPT=''; fi;",
      "elif [ \"$SMART_N_MODE\" = 'none' ] || [ \"$SMART_N_MODE\" = 'plain' ]; then PROFILE='plain'; NOPT='';",
      "else PROFILE=\"$SMART_N_MODE\"; NOPT=\"$SMART_N_MODE\"; fi",
      "echo \"##SMART_PROFILE:${PROFILE}\"",
      "SMTO(){ if [ -n \"$NOPT\" ]; then timeout 2s \"$SMARTBIN\" -n \"$NOPT\" \"$@\" 2>/dev/null || true; else timeout 2s \"$SMARTBIN\" \"$@\" 2>/dev/null || true; fi; }",
      "get_attr(){ printf '%s\\n' \"$1\" | awk -v k=\"$2\" '$0 ~ k {print $10; exit}' || true; }",
      "map_disk(){ d=\"$1\"; [ -b \"$d\" ] || { ls -l \"$d\" 2>/dev/null | awk '{print $NF}' | sed 's#\\.\\./##' | awk '{print \"/dev/\"$0}'; return; };",
      (settings.mapPartitions
        ? "  p=$(lsblk -dn -o PKNAME \"$d\" 2>/dev/null | head -n1 || true); if [ -n \"$p\" ]; then echo \"/dev/$p\"; else echo \"$d\"; fi; }"
        : "  echo \"$d\"; }"),
      "zpool status -P \"$POOL\" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i ~ /^\\/dev\\//) print $i}' | sort -u | while read -r d; do",
      "  [ -n \"$d\" ] || continue",
      "  real=$(map_disk \"$d\")",
      "  dump=$(SMTO -a \"$real\")",
      "  model=$(printf '%s\\n' \"$dump\" | awk -F: '/Device Model|Model Number|Product/ {sub(/^ +/,\"\",$2); print $2; exit}')",
      "  serial=$(printf '%s\\n' \"$dump\" | awk -F: '/Serial Number/ {sub(/^ +/,\"\",$2); print $2; exit}')",
      "  health=$(printf '%s\\n' \"$dump\" | awk -F: '/SMART overall-health self-assessment test result|SMART Health Status/ {sub(/^ +/,\"\",$2); print $2; exit}' || true)",
      "  selftest=$(printf '%s\\n' \"$dump\" | awk '/# 1/{for(i=5;i<=NF;i++) printf $i\" \"; exit}' || true)",
      "  temp=$(get_attr \"$dump\" 'Temperature_Celsius|Temperature_Internal|Current_Drive_Temperature')",
      "  poh=$(get_attr \"$dump\" 'Power_On_Hours')",
      "  realloc=$(get_attr \"$dump\" 'Reallocated_Sector_Ct')",
      "  pending=$(get_attr \"$dump\" 'Current_Pending_Sector')",
      "  offline=$(get_attr \"$dump\" 'Offline_Uncorrectable')",
      "  [ -n \"$model\" ] || model=$(basename \"$real\" | sed 's/p\\?[0-9]\\+$//'); [ -n \"$serial\" ] || serial='-' ; [ -n \"$health\" ] || health='UNKNOWN'",
      "  [ -n \"$selftest\" ] || selftest='-' ; [ -n \"$temp\" ] || temp='-' ; [ -n \"$poh\" ] || poh='-' ; [ -n \"$realloc\" ] || realloc='-' ; [ -n \"$pending\" ] || pending='-' ; [ -n \"$offline\" ] || offline='-'",
      "  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' \"$d\" \"$real\" \"$model\" \"$health\" \"$temp\" \"$poh\" \"$realloc\" \"$pending\" \"$offline\" \"$selftest\" \"$serial\"",
      "done",
      "exit 0"
    ].join("\n");

    cockpit.spawn(["bash", "-lc", script], { superuser: "require" })
      .then(function (out) {
        var raw = String(out || "");
        var profile = "unknown";
        var match = raw.match(/^##SMART_PROFILE:([^\n\r]+)/m);
        if (match && match[1]) profile = match[1].trim();
        raw = raw.replace(/^##SMART_PROFILE:[^\n\r]*[\r\n]*/m, "");

        var rows = parseSmartOutput(raw);
        if ((!rows || !rows.length) && sourceMode === "auto") {
          setHostUnsupported(poolId, body, "Container SMART not available.");
          return;
        }

        smartCache[poolId] = { loadedAt: Date.now(), rows: rows };
        renderPoolSmart(poolId, rows);
        if (hint) hint.textContent += " | profile: " + profile + (String(settings.smartNoCheckMode || "auto") === "auto" ? " (recommended)" : "");
      })
      .catch(function (err) {
        var emsg = String(err || "").trim();
        if (sourceMode === "auto") {
          setHostUnsupported(poolId, body, "Container SMART failed." + (emsg ? " (" + emsg + ")" : ""));
        } else {
          if (hint) hint.textContent = "SMART partial/unsupported on one or more disks." + (emsg ? " (" + emsg + ")" : "");
          if (body) body.innerHTML = "<tr><td colspan='10'>Failed to load SMART values.</td></tr>";
        }
      });
  }

  function runShortTest(poolId, realDev) {
    var cmd = "'" + String(settings.smartctlBin || "smartctl").replace(/'/g, "'\\''") + "' -t short '" + String(realDev).replace(/'/g, "'\\''") + "' 2>&1";
    return cockpit.spawn(["bash", "-lc", cmd], { superuser: "require" })
      .then(function (out) {
        var hint = byId("hint-storagepool-smart-" + poolId);
        if (hint) hint.textContent = "Short test started on " + realDev + ". " + String(out || "").trim();
      });
  }

  function applyStatusProductFallback() {
    if (runtimeVirtType !== "lxc") return;
    document.querySelectorAll("table[id^='table-storagepool-status-config-'] td").forEach(function (td) {
      var head = td.querySelector("span.table-ct-head");
      if (!head) return;
      if ((head.textContent || "").trim() !== "Product:") return;
      var txt = (td.textContent || "").replace("Product:", "").trim();
      if (!txt || txt === "-") {
        td.innerHTML = "<span class='table-ct-head'>Product:</span>LXC unsupported";
      }
    });
  }

  function injectSmartTabForPool(poolId, poolName) {
    var tabId = "tab-storagepool-smart-" + poolId;
    if (byId(tabId)) return;

    var tabs = document.querySelector("#listingcthead-storagepool-" + poolId + " .nav-tabs");
    var content = document.querySelector("#listingctbody-storagepool-" + poolId + " .tab-content");
    if (!tabs || !content) return;

    var li = document.createElement("li");
    li.innerHTML = "<a id='" + tabId + "' class='nav-item' data-toggle='tab' href='#tabpanel-storagepool-smart-" + poolId + "' tabIndex='-1'>SMART</a>";
    tabs.appendChild(li);

    var pane = document.createElement("div");
    pane.id = "tabpanel-storagepool-smart-" + poolId;
    pane.className = "tab-pane";
    pane.setAttribute("role", "tabpanel");
    pane.innerHTML =
      "<div id='panel-storagepool-smart-" + poolId + "' class='panel panel-default'>" +
      "  <div class='panel-heading'>" +
      "    <div class='panel-ct-heading'><h2 class='panel-title'>SMART</h2></div>" +
      "    <div class='panel-actions panel-ct-actions'>" +
      "      <button id='btn-storagepool-smart-refresh-" + poolId + "' class='btn btn-default' tabIndex='-1'>Refresh</button>" +
      "    </div>" +
      "  </div>" +
      "  <div id='hint-storagepool-smart-" + poolId + "' style='padding:0.5rem 0.75rem; font-size:0.85rem; opacity:0.85;'>Loading SMART data...</div>" +
      "  <table class='table table-striped table-ct-status-config'>" +
      "    <thead><tr><th>Device</th><th>Model</th><th>Health</th><th>Temp C</th><th>Power-On Hours</th><th>Realloc</th><th>Pending</th><th>Offline Unc</th><th>Last Self-test</th><th>Action</th></tr></thead>" +
      "    <tbody id='tbody-storagepool-smart-" + poolId + "'><tr><td colspan='10'>Loading...</td></tr></tbody>" +
      "  </table>" +
      "</div>";
    content.appendChild(pane);

    var tabA = byId(tabId);
    if (tabA) {
      tabA.addEventListener("click", function () {
        loadPoolSmart(poolId, poolName, false);
      });
    }

    var refreshBtn = byId("btn-storagepool-smart-refresh-" + poolId);
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadPoolSmart(poolId, poolName, true);
      });
    }

    pane.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.classList.contains("btn-smart-short")) return;
      var real = t.getAttribute("data-real");
      if (!real) return;
      t.disabled = true;
      t.textContent = "Starting...";
      runShortTest(poolId, real)
        .then(function () {
          t.disabled = false;
          t.textContent = "Run short test";
        })
        .catch(function (err) {
          var hint = byId("hint-storagepool-smart-" + poolId);
          if (hint) hint.textContent = "Short test failed: " + String(err);
          t.disabled = false;
          t.textContent = "Run short test";
        });
    });
  }

  function injectSmartTabs() {
    document.querySelectorAll("#table-storagepools > tbody > tr.listing-ct-item").forEach(function (row) {
      var poolId = row.getAttribute("data-pool-id");
      var poolName = row.getAttribute("data-pool-name") || "";
      if (!poolId) return;
      injectSmartTabForPool(poolId, poolName);
    });
  }

  function tick() {
    ensureToolbar();
    refreshStats();
    injectSmartTabs();
    applyStatusProductFallback();
  }

  detectRuntimeVirtualization();
  setInterval(tick, 5000);
  window.addEventListener("load", tick);
})();
