# Developing the Storage Suite (ZFS + NFS + SMB)

## Module Structure

- `zfs/` existing module
- `nfs/` new module scaffold
- `smb/` new module scaffold

Each module is a cockpit package directory with:

- `manifest.json`
- `index.html`
- `<module>.js`
- `<module>.css`

## Local Install for Testing

From repo root:

```bash
sudo cp -r zfs /usr/share/cockpit/
sudo cp -r nfs /usr/share/cockpit/
sudo cp -r smb /usr/share/cockpit/
sudo systemctl restart cockpit
```

## Current Focus

1. Keep ZFS module compatible with current cockpit APIs.
2. Build first functional NFS management actions:
   - export list
   - export add/edit/remove
3. Build first functional SMB management actions:
   - share list
   - share add/edit/remove
   - `paperless/consume` quick-share template

## Safety Rules

- Never write firewall/policy logic here.
- Validate command exit codes and show errors in UI.
- Keep root-required actions explicit.
