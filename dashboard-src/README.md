# QA Release Management Cockpit — source

`../Testing_Report_Dashboard_v3.html` is a single self-contained file: it carries
its own asset bundle (Rubik fonts, SheetJS, PptxGenJS, React UMD and the imported
*Defect Center* view) as a gzip+base64 manifest, and the page itself is inlined as
a JSON string. That makes it awkward to edit directly, so the editable pieces live
here and `build.mjs` re-assembles the bundle.

```
src/01-head.html        <head>, design tokens, responsive + print CSS
src/02-body.html        the markup (DC template syntax — see below)
src/03-script-open.html the <script type="text/x-dc"> tag and its prop declarations
src/04-app.js           the Component class: all logic and the view-model
src/05-tail.html        closing tags
defect-center.dc.html   the embedded Defect Manager view
```

## Build

```sh
node check.mjs    # syntax-check src/04-app.js
node build.mjs    # rewrite ../Testing_Report_Dashboard_v3.html in place
```

`build.mjs` uses the existing built file as its asset base, so it only ever
rewrites the manifest line and the page line — every other byte is copied through.

## Template syntax

The page is a "DC" component: a `Component extends DCLogic` class whose
`renderVals()` returns a flat object, bound into the markup by:

| form | meaning |
|---|---|
| `{{ name }}` | interpolate a value from `renderVals()` |
| `<sc-if value="{{ flag }}">…</sc-if>` | conditional (there is no `else` — expose both booleans) |
| `<sc-for list="{{ rows }}" as="r">…</sc-for>` | repeat, `r.*` inside |
| `sc-camel-on-click="{{ handler }}"` | event binding (`onClick`, `onInput`, `onChange`, …) |
| `<sc-raw-select>` | a `<select>` that keeps its options |

## Release management layer

The report is the render engine; the release layer decides *which* release and
*which* environments it renders. Both live at the top of `src/04-app.js`.

**Data model** — `localStorage['qa-releases']`:

```js
{ v: 1, selectedId, releases: [{
    id, version, status, startDate, endDate, current, notes,
    environments: [{ id, name,
      testingStart, testingEnd, bugFixStart, bugFixEnd,
      retestStart, retestEnd, notes, includeWeekends }]
}]}
```

Releases sort newest-first by numeric version segments, so `26.10.00` outranks
`26.09.00` and future versions need no code change.

**Per-release isolation** — every key listed in `REL_SCOPED` (plus anything
starting `qa-bug-dump`) is transparently suffixed with `@<releaseId>` by
`lsGet` / `lsSet` / `lsDel`. Imported Jira and qTest data, comments, milestones,
bug dumps and history therefore belong to one release and can never overwrite
another's. Global settings — theme, users, PINs, session, section layout, the
Jira base URL — are deliberately *not* scoped. Deleting a release purges exactly
its own suffixed keys.

**Bridge into the existing report** — the report used to read hardcoded
`PHASES_SCHED`, `PHASE_COLORS` and `ACTIVE_PHASE_WINDOW` constants. These are now
getters derived from the selected release, so every downstream section became
release-aware without changing its logic:

| getter / helper | replaces |
|---|---|
| `PHASES_SCHED` | the hardcoded five-phase schedule |
| `PHASE_COLORS` | the per-phase colour map |
| `ACTIVE_PHASE_WINDOW` | the fixed "QC1 24.08 – 18.09" window |
| `relOrder()` | `['DF1','IR1','QC1','IR3','PC1']` literals |
| `relMeta()` | the `META` label/date/header map |
| `relPhaseDates()` | the `PHD` burn-down window map |
| `relRunsWeekends(id)` | `id === 'PC1'` checks |

**Status is always calculated from dates** (`relEnvPhase`, `relAutoStatus`):
Not Started → Planned → Testing → Bug Fixing → Retesting → Completed. Nothing is
hand-maintained.

`src/04-app.js` still contains a `SCAFFOLD_SRC` array. That is only the *plan
structure* (which test suites and teams an environment runs) used before a qTest
export is imported; an environment not listed there starts with one generic
suite, and a real import replaces all of it.

## What stays global on purpose

Users, roles and PIN hashes, the theme, the section layout and the Jira base URL
are properties of the installation, not of a release, so switching release leaves
them alone.
