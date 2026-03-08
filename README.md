# Cockpit Storage Suite (Alpha)

PlanetOnyx fork of Cockpit storage modules:

- `zfs` (pool/filesystem/snapshot management)
- `nfs` (export management)
- `smb` (share management)

Status: **ALPHA**

This release is focused on:

- Cockpit theme integration
- UI/UX stabilization
- safe managed config writes
- visibility of external (read-only) NFS/SMB entries

## Versioning

Current alpha line:

- `v0.1.0-alpha.1`

## Requirements

- Cockpit 287+
- ZFS 0.8+
- NFS server (optional)
- Samba 4+ (optional)

## Install (manual)

```bash
sudo cp -r zfs /usr/share/cockpit/
sudo cp -r nfs /usr/share/cockpit/
sudo cp -r smb /usr/share/cockpit/
sudo systemctl restart cockpit
```

## Module behavior

### ZFS

- keeps core upstream workflow
- theme-compatible UI overrides for modern Cockpit
- SMART handling is host-dependent (LXC hosts may be limited)

### NFS

- managed file writing
- active export state rendering
- external entries shown read-only when not managed by module

### SMB

- managed file writing
- active share state rendering
- external entries shown read-only when not managed by module

## Safety

- No firewall/policy automation in this project.
- Root-required actions remain explicit in code.
- Managed writes are limited to module-owned paths.

## Alpha note

This is an alpha build. Some UI details and edge cases are still being refined.
Use in controlled environments first.
