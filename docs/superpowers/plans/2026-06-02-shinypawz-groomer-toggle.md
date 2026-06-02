# ShinyPawz — Groomer / Dog-owner Toggle Implementation Plan

> **For agentic workers:** Implement task-by-task, TDD: write a failing test → run it to confirm it fails → implement → run to confirm it passes → commit. Checkboxes (`- [ ]`) track progress. **npm only.**

**Goal:** A top-bar Dog owner | Groomer toggle that switches between `/` and `/groomer`, remembers the last-used mode, and restores it on load. Remove the bottom-nav "Groomer" tab.

**Spec:** `docs/superpowers/specs/2026-06-02-shinypawz-groomer-toggle-design.md`.

**Constraint:** No DB/auth/RLS changes. Mode is derived from the route; persistence is local-only.

**Build order:** pure util first (Task 1), presentational toggle (Task 2), shell wiring (Task 3), App persistence/restore (Task 4).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/layout/modePreference.js` (new) | `loadPreferredMode` / `savePreferredMode` + `MODE_CUSTOMER` / `MODE_GROOMER`. |
| `apps/web/src/layout/modePreference.test.js` (new, jsdom docblock) | Round-trip / default / malformed tests. |
| `apps/web/src/layout/RoleToggle.jsx` (new) | Presentational Dog owner | Groomer segmented control. |
| `apps/web/src/layout/RoleToggle.test.jsx` (new) | Render + active state + onSwitch. |
| `apps/web/src/layout/AppShell.jsx` (modify) | Remove staff nav item; render `RoleToggle` when signed in. |
| `apps/web/src/layout/AppShell.test.jsx` (new or modify) | Toggle visibility + switch navigation + no staff tab. |
| `apps/web/src/App.jsx` (modify) | Persist mode on route change; restore on bare-root load. |
| `apps/web/src/App.test.jsx` (modify) | Redirect/persist rules. |
| `apps/web/src/styles/app.css` (modify) | Toggle styling. |

---

## Task 1: Mode preference util

- [ ] **Step 1:** Failing tests (`modePreference.test.js`, `// @vitest-environment jsdom`): `savePreferredMode(user,'groomer')` then `loadPreferredMode(user)` → `'groomer'`; default `'customer'` when nothing stored, when `user` is null, and when the stored value is unknown/malformed; per-user keys don't collide.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement over key `paw-status:preferred-mode:<userId>`; guard missing `window`/`localStorage`; validate the mode against `{customer,groomer}`.
- [ ] **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Commit (`feat(groomer): mode preference storage util`).

## Task 2: RoleToggle component

- [ ] **Step 1:** Failing tests: renders "Dog owner" and "Groomer"; the `mode` side is marked active (`aria-pressed=true`); clicking the inactive side fires `onSwitch` with the target; clicking the active side does not.
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement `RoleToggle({ mode, onSwitch })`.
- [ ] **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Add styling; build; commit (`feat(groomer): RoleToggle segmented control`).

## Task 3: AppShell wiring

- [ ] **Step 1:** Failing tests (`AppShell.test.jsx`): no "Groomer" item in the bottom nav; when signed in the toggle renders and clicking "Groomer" calls `onNavigate('/groomer')`, "Dog owner" calls `onNavigate('/')`; when signed out the toggle is absent. (Mock `useAuth`.)
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Remove the `staff` nav item; render `RoleToggle` in the top bar gated on `user`, mapping `route` → mode and wiring `onSwitch` to `onNavigate`.
- [ ] **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Build; commit (`feat(groomer): top-bar toggle replaces bottom-nav Groomer tab`).

## Task 4: App persistence + restore

- [ ] **Step 1:** Failing tests (`App.test.jsx`, extend existing): with a signed-in user and `loadPreferredMode → 'groomer'`, mounting at `/` redirects to `/groomer`; `'customer'` does not redirect; `/auth/callback?next=/dogs` and `/?step=results` do NOT trigger the mode redirect; navigating staff↔customer calls `savePreferredMode` with the right mode. (Mock `modePreference`.)
- [ ] **Step 2:** Run, confirm fail.
- [ ] **Step 3:** Implement the two effects (persist-on-route-change; restore-on-bare-root). Reuse the existing `isSafeNextPath`/callback guards so `?next` still wins.
- [ ] **Step 4:** Run, confirm pass.
- [ ] **Step 5:** Full suite + build; manual smoke (toggle switches, reload lands in last mode, magic-link still returns correctly); commit (`feat(groomer): remember and restore last-used mode`).

---

## Definition of done

- [ ] Top-bar Dog owner | Groomer toggle switches views; bottom nav has no Groomer tab.
- [ ] Last-used mode is remembered per user and restored on a bare-root load, without overriding deep links / `?next` / `?step`.
- [ ] Full Vitest suite green; `npm run build` clean; manual smoke done.
- [ ] All commits pushed to `agent/a7b8c9d0` (not main / live).
