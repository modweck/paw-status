# ShinyPawz — Groomer / Dog-owner Toggle Design

> **Status:** Approved design, ready for implementation planning
> **Date:** 2026-06-02
> **Repo:** `paw-status` (brand: ShinyPawz)
> **Branch:** `agent/a7b8c9d0`
> **Cluster:** Groomer side — sub-project **A** of A→B→C→D (role/toggle → profile & availability editing → business lookup/GBP → notifications)

---

## 1. Summary

Add a top-bar **Dog owner | Groomer** toggle so a signed-in user can switch
between the customer experience (`/`) and the groomer workspace (`/groomer`),
and remember the last-used mode so they land back in it next time. Remove the
now-redundant "Groomer" tab from the bottom nav — the top toggle is the only
entry point to the groomer side.

This is the foundational sub-project: it establishes "mode" as a first-class
concept and is the real fix behind the earlier magic-link-returns-to-the-wrong-
view symptom.

No database, auth-claim, or RLS changes. "Is this user actually a groomer"
(loading the `groomer_account`) is intentionally **out of scope** here — it
lands in sub-project B, where the profile editor needs it. The toggle shows for
all signed-in users; a user without a groomer account who switches to Groomer
sees the existing create/claim flow in `StaffDashboard`, unchanged.

---

## 2. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Who sees the toggle | All signed-in users | Lets customers discover/start the "become a groomer" flow |
| Placement | Top-bar segmented control **only** | User wants a single top entry point |
| Bottom-nav "Groomer" tab | **Removed** | Avoid two competing entry points |
| Mode memory | Persist last-used mode per user; land there next time | "Remember and route there"; complements the magic-link fix |
| Role model / DB | None | Mode is derived from the route; persistence is local-only |

---

## 3. Architecture

### 3.1 Mode preference util — `src/layout/modePreference.js`

Mirrors the existing `guestPrefill` / favorite-groomer local-storage patterns.

- `MODE_CUSTOMER = 'customer'`, `MODE_GROOMER = 'groomer'`.
- `loadPreferredMode(user)` → reads `paw-status:preferred-mode:<userId>`;
  returns `'customer'` when absent, malformed, or no user; never throws.
- `savePreferredMode(user, mode)` → writes the key when `user` and a valid mode
  are present; no-ops otherwise. Guards missing `window`/`localStorage`.

### 3.2 `RoleToggle` component — `src/layout/RoleToggle.jsx`

Presentational segmented control.

- Props: `mode` (`'customer' | 'groomer'`), `onSwitch(targetMode)`.
- Renders two buttons — "Dog owner" and "Groomer" — with the active one marked
  (`aria-pressed` + `is-active`).
- Clicking the inactive side calls `onSwitch(targetMode)`. Clicking the active
  side is a no-op.

### 3.3 `AppShell` wiring — `src/layout/AppShell.jsx`

- Remove the `{ id: 'staff', label: 'Groomer', ... }` entry from `navItems`
  (bottom nav becomes Explore / My Dog / Bookings / Account).
- Render `RoleToggle` in the top bar **only when `user` is signed in**, with
  `mode = route === 'staff' ? 'groomer' : 'customer'`.
- `onSwitch(targetMode)` → `onNavigate(targetMode === 'groomer' ? '/groomer' : '/')`.

### 3.4 `App` persistence + routing — `src/App.jsx`

- **Persist on route change** (when signed in): save the mode implied by the
  route — `staff → groomer`; `customer | dogs | bookings | account → customer`;
  `admin` is ignored (doesn't change the remembered mode). This means entering
  the groomer view *any* way persists it.
- **Restore on first load** (once, after the user resolves): if the path is the
  bare root (`pathname === '/'`, no `?step`, no `?next`) and the remembered mode
  is `groomer`, `navigate('/groomer')`. Deep links, `?step`, and the magic-link
  `?next` always win over the remembered mode.

---

## 4. Files

**New**
- `src/layout/modePreference.js` (+ `modePreference.test.js`, jsdom docblock)
- `src/layout/RoleToggle.jsx` (+ `RoleToggle.test.jsx`)

**Modified**
- `src/layout/AppShell.jsx` — remove staff nav item; render `RoleToggle`.
- `src/layout/AppShell.test.jsx` (if present) — update for the removed tab + toggle.
- `src/App.jsx` — persist-on-route-change + restore-on-load effects.
- `src/App.test.jsx` — coverage for the redirect rules.

---

## 5. Testing

- **modePreference**: round-trip; default `'customer'` when empty/malformed/no user.
- **RoleToggle**: renders both options; marks the active one; fires `onSwitch`
  with the target only when switching to the inactive side.
- **AppShell**: toggle hidden when signed out, shown when signed in; switching to
  Groomer calls `onNavigate('/groomer')` and back calls `onNavigate('/')`; the
  bottom nav no longer renders a "Groomer" item.
- **App**:
  - remembered `groomer` + bare `/` + signed in → redirects to `/groomer`;
  - remembered `customer` → no redirect;
  - `?next=` / `?step=` present → no mode redirect (those win);
  - navigating to a groomer/customer route persists the corresponding mode.

---

## 6. Non-goals

- Loading the `groomer_account` / "is a real groomer" gating (sub-project B).
- Any groomer profile, availability, business-lookup, or notification work.
- Server-side role/RBAC or new auth claims.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Auto-redirect hijacks intended navigation | Only fires at the bare root with no `?step`/`?next`, once per load |
| Toggle + magic-link `next` fight each other | `next` handling runs first and wins; mode redirect is gated to bare root |
| Mode memory leaks across users on a shared browser | Key is namespaced per `userId` |
| Removing the nav tab strands existing `/groomer` bookmarks | The route still works; only the nav affordance moved to the top toggle |
