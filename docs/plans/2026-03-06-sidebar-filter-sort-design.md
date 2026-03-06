# Sidebar Filter & Sort Controls

## Overview

Add filter and sort icon buttons to the sidebar search bar, with dropdown popovers and dismissible filter chips.

## Layout

```
┌─────────────────────────────────────┐
│ Search...               [sort] [filter] │
├─────────────────────────────────────┤
│ running x │ claude x │ < 7d x      │  <- chip row (only when filters active)
├─────────────────────────────────────┤
│ PROJECTS                            │
│ ...                                 │
```

- **Sort icon** — dropdown with radio-select: Recency (default), Status, Name, Provider. Checkmark on current.
- **Filter icon** — dropdown with checkbox sections:
  - Status: Running, Idle, Errored
  - Provider: Claude, Codex
  - Flags: Yolo, Manager
  - Age: 1d / 7d / 30d / All (radio, mutually exclusive)
- **Filter icon badge** — small accent-colored dot when any filter is active.
- **Chip row** — appears below search bar when filters active. Each chip dismissible with x.

## Behavior

- Sort applies within each project group. Project groups sorted by most-recent-agent timestamp.
- Filter hides non-matching agents. Empty groups hidden entirely.
- Age filter replaces `sessionMaxAgeDays` cutoff when set. When no age chip, `sessionMaxAgeDays` still applies as default.
- Search stacks with sort/filter.
- Dropdowns close on outside click or Escape.
- State is local component state (not persisted). Resets on app restart.

## Components

- **Modify `SearchBar.tsx`** — add sort/filter icon buttons to right side of wrapper.
- **New `SortDropdown.tsx`** — radio-select popover for sort options.
- **New `FilterDropdown.tsx`** — checkbox popover with sections.
- **New `FilterChips.tsx`** — horizontal row of dismissible chips.
- **Modify `Sidebar.tsx`** — add state for sort/filter, apply in useMemo chain, render chip row.

No shared types or IPC changes needed. Purely frontend.
