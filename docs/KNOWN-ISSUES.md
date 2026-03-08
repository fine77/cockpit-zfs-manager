# Known Issues (Alpha)

Last updated: 2026-03-08

## ZFS module

- Detail-table button hover behavior is still being tuned.
  - Goal: only the directly hovered button should change state.
  - Current state: improved, but edge cases can still affect adjacent controls.
- Main table/detail table CSS overlap still has legacy interactions from upstream styles.

## NFS module

- Row density/typography can still look inconsistent after UI refresh in some views.
  - Goal: compact rows remain stable without style "bounce".
- Very long options strings can still reduce readability in narrow viewports.

## SMB module

- Managed vs external visibility is implemented, but UX can be improved.
  - External entries are read-only in table view by design.
- Flags readability has been improved; further visual polish is planned.

## General

- This release is Alpha and still under active UI hardening.
- Behavior is stable enough for controlled lab use, not yet production-grade UI quality.

## Next Fix Queue

1. Finalize ZFS detail button hover state isolation.
2. Finalize NFS compact table rendering consistency.
3. Add UI regression screenshots/tests for dark and light themes.
