# Developing Cockpit Storage Suite (Alpha)

## Scope

- `zfs/`
- `nfs/`
- `smb/`

## Principles

1. Keep module behavior predictable.
2. Keep managed writes explicit and limited.
3. Keep external configs visible as read-only.
4. Keep UI aligned with Cockpit theme.

## Local test install

```bash
sudo cp -r zfs /usr/share/cockpit/
sudo cp -r nfs /usr/share/cockpit/
sudo cp -r smb /usr/share/cockpit/
sudo systemctl restart cockpit
```

## Review checklist

- No hardcoded secrets.
- No firewall/policy logic.
- No destructive write outside managed files.
- Theme readable in dark and light mode.
