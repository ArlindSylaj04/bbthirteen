class Component extends DCLogic {
  // ══════════════════════════════════════════════════════════════════════════
  //  RELEASE MANAGEMENT LAYER
  //  ----------------------------------------------------------------------
  //  The report below is the render engine; this layer decides WHICH release
  //  and WHICH environments it renders. Nothing here is release-specific:
  //  releases, their environments and their schedules live in localStorage
  //  ('qa-releases') and are created/edited through the admin UI, so future
  //  releases never require a source change.
  //
  //  Per-release data isolation is handled by lsGet/lsSet/lsDel: every key in
  //  REL_SCOPED is transparently suffixed with '@<releaseId>', so importing
  //  Jira/qTest data into one release can never overwrite another's.
  // ══════════════════════════════════════════════════════════════════════════
  REL_STORE = 'qa-releases';
  REL_MODEL_VERSION = 1;

  // Environments offered when creating a release. Admins may also type a custom
  // name, so this is a convenience list, not a limit.
  ENV_CATALOG = ['IR1', 'QC1', 'IR3', 'PC1', 'DF1'];
  ENV_META = {
    DF1: { label: 'Development Freeze 1', alias: '',        color: '#64748b', headerBg: 'linear-gradient(90deg,#334155,#475569)' },
    IR1: { label: 'Integration Release 1', alias: '',        color: '#2563eb', headerBg: 'linear-gradient(90deg,#1e40af,#2563eb)' },
    QC1: { label: 'Quality Check 1',       alias: 'Test 01', color: '#059669', headerBg: 'linear-gradient(90deg,#065f46,#059669)' },
    IR3: { label: 'Integration Release 3', alias: 'Test 02', color: '#7c3aed', headerBg: 'linear-gradient(90deg,#6d28d9,#7c3aed)' },
    PC1: { label: 'Production Cutover 1',  alias: 'CGHB',    color: '#b45309', headerBg: 'linear-gradient(90deg,#92400e,#b45309)' },
  };
  ENV_FALLBACK = [
    { color: '#0891b2', headerBg: 'linear-gradient(90deg,#0e7490,#0891b2)' },
    { color: '#c026d3', headerBg: 'linear-gradient(90deg,#a21caf,#c026d3)' },
    { color: '#ca8a04', headerBg: 'linear-gradient(90deg,#a16207,#ca8a04)' },
    { color: '#dc2626', headerBg: 'linear-gradient(90deg,#b91c1c,#dc2626)' },
    { color: '#4f46e5', headerBg: 'linear-gradient(90deg,#4338ca,#4f46e5)' },
    { color: '#15803d', headerBg: 'linear-gradient(90deg,#166534,#15803d)' },
  ];
  REL_STATUSES = ['Planned', 'In Progress', 'Completed', 'Archived'];
  // Responsibilities are part of a release, not of the installation: a new
  // release starts with none and they are filled in when it is created.
  RESP_COLORS = ['#2563eb', '#7c3aed', '#4caf2f', '#ef4444', '#0891b2', '#d97706'];
  RESP_SUGGEST = ['Release Management', 'Project Manager', 'Test Manager', 'Defect Manager'];

  // Keys that belong to ONE release. Everything not listed here (theme, users,
  // session, PINs, section layout, Jira base URL) stays global on purpose.
  REL_SCOPED = {
    'qa-jira-defects': 1, 'qa-jira-file': 1, 'qa-jira-sync': 1,
    'qa-jira-backlog': 1, 'qa-jira-backlog-file': 1, 'qa-jira-backlog-flags': 1,
    'qa-tcf-issues': 1, 'qa-tcf-file': 1,
    'qa-cases-latest': 1, 'qa-history': 1, 'qa-exec-ledger': 1, 'qa-chain-claims': 1,
    'qa-comments': 1, 'qa-topics': 1, 'qa-defect-notes': 1, 'qa-qtest-links': 1,
    'qa-milestone': 1, 'qa-milestone-date': 1, 'qa-info': 1,
    'qa-req-baseline': 1, 'qa-suite-order': 1, 'qa-testing-start': 1, 'qa-app-map': 1,
    // ('qa-resp-names' was the old global store — responsibilities now live on the release record)
  };
  relKeyIsScoped(k) { return !!this.REL_SCOPED[k] || String(k).indexOf('qa-bug-dump') === 0; }
  relKey(k) { const id = this.relSelectedId(); return this.relKeyIsScoped(k) ? (k + '@' + id) : k; }
  lsGet(k) { try { return localStorage.getItem(this.relKey(k)); } catch (e) { return null; } }
  lsSet(k, v) { try { localStorage.setItem(this.relKey(k), v); } catch (e) {} }
  // Same write, but it throws when the browser refuses (quota). Callers that can
  // shed data use this one — lsSet swallowing the error is what silently lost a
  // large qTest import: the trim-and-retry loops below never got to run.
  lsSetStrict(k, v) { localStorage.setItem(this.relKey(k), v); }
  lsDel(k) { try { localStorage.removeItem(this.relKey(k)); } catch (e) {} }
  // Screen preferences (view, finish, lights). Never release-scoped, and never
  // allowed to throw: a file:// page with storage switched off still has to render.
  prefRead(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  prefWrite(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ─── date helpers (single source — everything user-facing is DD.MM.YYYY) ───
  relParse(d) {
    if (d == null || d === '') return null;
    if (typeof d === 'number') return isNaN(d) ? null : d;
    if (d instanceof Date) { const t = d.getTime(); return isNaN(t) ? null : t; }
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
    const t = new Date(s).getTime();
    return isNaN(t) ? null : t;
  }
  relStart(d) { const t = this.relParse(d); if (t == null) return null; const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); }
  relEnd(d) { const t = this.relParse(d); if (t == null) return null; const x = new Date(t); x.setHours(23, 59, 59, 999); return x.getTime(); }
  relFmt(d) { const t = this.relParse(d); if (t == null) return '—'; const x = new Date(t);
    return String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0') + '.' + x.getFullYear(); }
  relFmtShort(d) { const t = this.relParse(d); if (t == null) return '—'; const x = new Date(t);
    return String(x.getDate()).padStart(2, '0') + '.' + String(x.getMonth() + 1).padStart(2, '0'); }
  relIso(d) { const t = this.relParse(d); if (t == null) return ''; const x = new Date(t);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }

  // ─── working time (an organisation-wide rule, not a per-release one) ──────
  // Countdowns and pacing count only real working time: the configured weekdays
  // between the configured start and end hour. Defaults to Mon–Fri 07:00–17:00.
  WORK_STORE = 'qa-work-hours';
  WORK_DEFAULT = { from: '07:00', to: '17:00', days: [1, 2, 3, 4, 5] };
  WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  loadWork() {
    try {
      const w = JSON.parse(localStorage.getItem(this.WORK_STORE) || 'null');
      if (w && w.from && w.to && Array.isArray(w.days)) return { from: w.from, to: w.to, days: w.days.slice() };
    } catch (e) {}
    return { from: this.WORK_DEFAULT.from, to: this.WORK_DEFAULT.to, days: this.WORK_DEFAULT.days.slice() };
  }
  workCfg() { return this.state.workHours || this.loadWork(); }
  saveWork(w) {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    try { localStorage.setItem(this.WORK_STORE, JSON.stringify(w)); } catch (e) {}
    this.setState({ workHours: w });
  }
  setWorkFrom = (e) => { const v = e.target.value; const w = { ...this.workCfg(), from: v || '07:00' }; if (this._hm(w.to) > this._hm(w.from)) this.saveWork(w); };
  setWorkTo = (e) => { const v = e.target.value; const w = { ...this.workCfg(), to: v || '17:00' }; if (this._hm(w.to) > this._hm(w.from)) this.saveWork(w); };
  toggleWorkDay = (d) => () => {
    const w = this.workCfg();
    const days = w.days.indexOf(d) >= 0 ? w.days.filter(x => x !== d) : w.days.concat([d]).sort();
    if (!days.length) return;   // at least one working day
    this.saveWork({ ...w, days });
  };
  resetWork = () => this.saveWork({ from: this.WORK_DEFAULT.from, to: this.WORK_DEFAULT.to, days: this.WORK_DEFAULT.days.slice() });
  _hm(t) { const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  workDayMinutes() { const w = this.workCfg(); return Math.max(1, this._hm(w.to) - this._hm(w.from)); }
  isWorkDay(dayIdx) { const w = this.workCfg(); return (w.days && w.days.length ? w.days : [1, 2, 3, 4, 5]).indexOf(dayIdx) >= 0; }
  workLabel() {
    const w = this.workCfg();
    const ds = (w.days && w.days.length ? w.days : [1, 2, 3, 4, 5]).slice().sort((a, b) => a - b);
    // contiguous runs render as Mon–Fri rather than Mon, Tue, Wed, Thu, Fri
    const parts = []; let i = 0;
    while (i < ds.length) {
      let j = i; while (j + 1 < ds.length && ds[j + 1] === ds[j] + 1) j++;
      parts.push(j > i ? (this.WEEKDAY_LABELS[ds[i]] + '–' + this.WEEKDAY_LABELS[ds[j]]) : this.WEEKDAY_LABELS[ds[i]]);
      i = j + 1;
    }
    return parts.join(', ') + ' ' + w.from + '–' + w.to;
  }
  // Working minutes between two instants, clipped to the configured windows.
  workMinutesBetween(fromMs, toMs) {
    if (!(toMs > fromMs)) return 0;
    const w = this.workCfg();
    const sMin = this._hm(w.from), eMin = this._hm(w.to);
    if (eMin <= sMin) return 0;
    let total = 0;
    const cur = new Date(fromMs); cur.setHours(0, 0, 0, 0);
    for (let guard = 0; guard < 3700; guard++) {
      if (cur.getTime() > toMs) break;
      if (this.isWorkDay(cur.getDay())) {
        const ws = new Date(cur); ws.setHours(Math.floor(sMin / 60), sMin % 60, 0, 0);
        const we = new Date(cur); we.setHours(Math.floor(eMin / 60), eMin % 60, 0, 0);
        const a = Math.max(ws.getTime(), fromMs), b = Math.min(we.getTime(), toMs);
        if (b > a) total += (b - a) / 60000;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return Math.floor(total);
  }
  // Whole working days between two instants (calendar days that are working days).
  workDaysBetween(aMs, bMs) {
    let n = 0;
    const cur = new Date(aMs); cur.setHours(0, 0, 0, 0);
    const end = new Date(bMs); end.setHours(0, 0, 0, 0);
    for (let guard = 0; guard < 3700 && cur < end; guard++) {
      if (this.isWorkDay(cur.getDay())) n++;
      cur.setDate(cur.getDate() + 1);
    }
    return n;
  }

  relEnvMeta(name) {
    const n = String(name || '').trim();
    if (this.ENV_META[n]) return { name: n, ...this.ENV_META[n] };
    let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    const f = this.ENV_FALLBACK[h % this.ENV_FALLBACK.length];
    return { name: n, label: n, alias: '', ...f };
  }

  // Sort key: newest release first. Numeric segments compare numerically so
  // 26.03.00 outranks 26.02.05 and 26.10.00 outranks 26.09.00.
  relSortKey(r) {
    const segs = String(r.version || '').split(/[^0-9]+/).filter(s => s !== '').map(Number);
    while (segs.length < 4) segs.push(0);
    return segs;
  }
  relCompare(a, b) {
    const ka = this.relSortKey(a), kb = this.relSortKey(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (kb[i] || 0) - (ka[i] || 0);
      if (d) return d;
    }
    const ta = this.relParse(b.startDate) || 0, tb = this.relParse(a.startDate) || 0;
    if (ta !== tb) return ta - tb;
    return String(a.version).localeCompare(String(b.version));
  }

  relNewId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // First run: lift the schedule that used to be hardcoded into a real release,
  // and adopt any data already in localStorage so nothing is lost on upgrade.
  relSeed() {
    let version = '26.02.00';
    try { version = localStorage.getItem('qa-release-version') || version; } catch (e) {}
    const id = this.relNewId();
    const envs = [
      { name: 'DF1', testingStart: '2026-07-02', testingEnd: '2026-07-20', bugFixStart: '', bugFixEnd: '', retestStart: '', retestEnd: '', notes: '' },
      { name: 'IR1', testingStart: '2026-07-23', testingEnd: '2026-08-14', bugFixStart: '2026-08-15', bugFixEnd: '2026-08-18', retestStart: '', retestEnd: '', notes: '' },
      { name: 'QC1', testingStart: '2026-08-24', testingEnd: '2026-09-08', bugFixStart: '2026-09-09', bugFixEnd: '2026-09-18', retestStart: '', retestEnd: '', notes: '' },
      { name: 'IR3', testingStart: '2026-09-29', testingEnd: '2026-10-15', bugFixStart: '2026-10-16', bugFixEnd: '2026-10-22', retestStart: '', retestEnd: '', notes: '' },
      { name: 'PC1', testingStart: '2026-10-24', testingEnd: '2026-10-27', bugFixStart: '2026-10-28', bugFixEnd: '2026-10-31', retestStart: '', retestEnd: '', notes: '', includeWeekends: true },
    ].map(e => ({ id: this.relNewId(), ...e }));
    // Responsibilities start empty; only names the user actually saved before
    // the release layer existed are carried over.
    let resp = [];
    try {
      const saved = JSON.parse(localStorage.getItem('qa-resp-names') || 'null');
      if (saved && typeof saved === 'object') {
        resp = Object.keys(saved)
          .filter(k => String(saved[k] || '').trim())
          .map((k, i) => ({ id: this.relNewId(), role: k, people: String(saved[k]).trim(),
            color: this.RESP_COLORS[i % this.RESP_COLORS.length] }));
      }
    } catch (e) {}
    const rel = { id, version, status: 'In Progress', startDate: '2026-07-02', endDate: '2026-10-31',
      current: true, notes: 'GC SAP Upgrade — migrated from the previous single-release report.',
      environments: envs, responsibilities: resp, createdAt: Date.now(), updatedAt: Date.now() };
    const store = { v: this.REL_MODEL_VERSION, selectedId: id, releases: [rel] };
    // Adopt pre-release-layer data so the existing report keeps its content.
    try {
      Object.keys(this.REL_SCOPED).concat(['qa-bug-dump', 'qa-bug-dump-DF1', 'qa-bug-dump-IR1', 'qa-bug-dump-QC1', 'qa-bug-dump-IR3'])
        .forEach(k => {
          const legacy = localStorage.getItem(k);
          if (legacy != null && localStorage.getItem(k + '@' + id) == null) localStorage.setItem(k + '@' + id, legacy);
          ['-file', '-sync'].forEach(sfx => {
            const lk = k + sfx, lv = localStorage.getItem(lk);
            if (lv != null && localStorage.getItem(lk + '@' + id) == null) localStorage.setItem(lk + '@' + id, lv);
          });
        });
    } catch (e) {}
    this.relWrite(store);
    return store;
  }

  relStore() {
    if (this._relStore) return this._relStore;
    let s = null;
    try { s = JSON.parse(localStorage.getItem(this.REL_STORE) || 'null'); } catch (e) { s = null; }
    if (!s || !Array.isArray(s.releases) || !s.releases.length) s = this.relSeed();
    s.releases = s.releases.filter(r => r && r.id).map(r => ({
      ...r,
      version: String(r.version || '').trim(),
      environments: (Array.isArray(r.environments) ? r.environments : []).map(e => ({ id: e.id || this.relNewId(), ...e })),
      responsibilities: (Array.isArray(r.responsibilities) ? r.responsibilities : []).map((x, i) => ({
        id: x.id || this.relNewId(), role: x.role || '', people: x.people || '',
        color: x.color || this.RESP_COLORS[i % this.RESP_COLORS.length] })),
    }));
    s.releases.sort((a, b) => this.relCompare(a, b));
    this._relStore = s;
    return s;
  }
  relWrite(store) {
    store.v = this.REL_MODEL_VERSION;
    store.releases.sort((a, b) => this.relCompare(a, b));
    this._relStore = store;
    try { localStorage.setItem(this.REL_STORE, JSON.stringify(store)); } catch (e) {}
  }
  relAll() { return this.relStore().releases; }
  relCurrent() { const a = this.relAll(); return a.find(r => r.current) || a[0] || null; }
  relSelectedId() {
    if (this._relSelId) return this._relSelId;
    const s = this.relStore();
    const pick = s.releases.find(r => r.id === s.selectedId) || s.releases.find(r => r.current) || s.releases[0];
    this._relSelId = pick ? pick.id : '';
    return this._relSelId;
  }
  relSelected() { const id = this.relSelectedId(); return this.relAll().find(r => r.id === id) || this.relCurrent(); }
  relEnvs(rel) { const r = rel || this.relSelected(); return (r && r.environments) || []; }

  // ─── automatic status from dates (never a hand-maintained value) ──────────
  relEnvPhase(env, nowMs) {
    const now = nowMs == null ? Date.now() : nowMs;
    const tS = this.relStart(env.testingStart), tE = this.relEnd(env.testingEnd);
    const bS = this.relStart(env.bugFixStart), bE = this.relEnd(env.bugFixEnd);
    const rS = this.relStart(env.retestStart), rE = this.relEnd(env.retestEnd);
    if (tS == null && bS == null && rS == null) return 'Not Started';
    const first = Math.min.apply(null, [tS, bS, rS].filter(v => v != null));
    const last = Math.max.apply(null, [tE, bE, rE, tS, bS, rS].filter(v => v != null));
    if (now < first) return 'Planned';
    if (tS != null && tE != null && now >= tS && now <= tE) return 'Testing';
    if (bS != null && bE != null && now >= bS && now <= bE) return 'Bug Fixing';
    if (rS != null && rE != null && now >= rS && now <= rE) return 'Retesting';
    if (now > last) return 'Completed';
    return 'Planned';
  }
  REL_PHASE_STYLE = {
    'Not Started': { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
    'Planned':     { color: '#64748b', bg: 'rgba(100,116,139,0.16)' },
    'Testing':     { color: '#2563eb', bg: 'rgba(37,99,235,0.16)' },
    'Bug Fixing':  { color: '#d97706', bg: 'rgba(217,119,6,0.16)' },
    'Retesting':   { color: '#7c3aed', bg: 'rgba(124,58,237,0.16)' },
    'Completed':   { color: '#4caf2f', bg: 'rgba(76,175,47,0.16)' },
  };
  relPhaseStyle(p) { return this.REL_PHASE_STYLE[p] || this.REL_PHASE_STYLE['Not Started']; }

  // Cutover-style environments are tested through the weekend; all others count
  // working days only. Configurable per environment, with a sensible default.
  relRunsWeekends(id) {
    const e = this.relEnvs().find(x => x.name === id);
    if (e && typeof e.includeWeekends === 'boolean') return e.includeWeekends;
    return /^(pc|cut|go-?live)/i.test(String(id || ''));
  }
  relEnvWindow(env) {
    const all = [env.testingStart, env.testingEnd, env.bugFixStart, env.bugFixEnd, env.retestStart, env.retestEnd]
      .map(d => this.relParse(d)).filter(v => v != null);
    if (!all.length) return { start: null, end: null };
    return { start: Math.min.apply(null, all), end: Math.max.apply(null, all) };
  }
  relEnvLast(env) {
    // last calendar day of the environment, as an ISO date string
    const w = this.relEnvWindow(env);
    return w.end == null ? '' : this.relIso(w.end);
  }
  relWindow(rel) {
    const r = rel || this.relSelected();
    if (!r) return { start: null, end: null };
    const pts = [];
    this.relEnvs(r).forEach(e => { const w = this.relEnvWindow(e); if (w.start != null) { pts.push(w.start, w.end); } });
    const s = this.relParse(r.startDate), e = this.relParse(r.endDate);
    if (s != null) pts.push(s); if (e != null) pts.push(e);
    if (!pts.length) return { start: null, end: null };
    return { start: Math.min.apply(null, pts), end: Math.max.apply(null, pts) };
  }
  relAutoStatus(rel) {
    const r = rel || this.relSelected();
    if (!r) return 'Planned';
    if (r.status === 'Archived') return 'Archived';
    const w = this.relWindow(r);
    const now = Date.now();
    if (w.start == null) return r.status || 'Planned';
    if (now < w.start) return 'Planned';
    if (now > w.end) return 'Completed';
    return 'In Progress';
  }
  REL_STATUS_STYLE = {
    'Planned':     { color: '#64748b', bg: 'rgba(100,116,139,0.16)' },
    'In Progress': { color: '#4caf2f', bg: 'rgba(76,175,47,0.16)' },
    'Completed':   { color: '#2563eb', bg: 'rgba(37,99,235,0.16)' },
    'Archived':    { color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  };
  relStatusStyle(s) { return this.REL_STATUS_STYLE[s] || this.REL_STATUS_STYLE['Planned']; }

  // The environment the report should treat as "now": the one whose window
  // contains today, else the next upcoming one, else the last finished one.
  relActiveEnv(rel) {
    const envs = this.relEnvs(rel).slice();
    if (!envs.length) return null;
    const now = Date.now();
    const withWin = envs.map(e => ({ e, w: this.relEnvWindow(e) })).filter(x => x.w.start != null);
    if (!withWin.length) return envs[0];
    withWin.sort((a, b) => a.w.start - b.w.start);
    const inNow = withWin.find(x => now >= x.w.start && now <= x.w.end);
    if (inNow) return inNow.e;
    const next = withWin.find(x => x.w.start > now);
    if (next) return next.e;
    return withWin[withWin.length - 1].e;
  }

  // ─── the bridge into the existing report ──────────────────────────────────
  // The report used to read a hardcoded PHASES_SCHED/PHASE_COLORS/
  // ACTIVE_PHASE_WINDOW. These getters produce the same shapes from the
  // selected release, so every downstream section became release-aware
  // without touching its logic.
  relPhasesSched(rel) {
    const r = rel || this.relSelected();
    return this.relEnvs(r).map(e => {
      const meta = this.relEnvMeta(e.name);
      const w = this.relEnvWindow(e);
      const hasGrey = !!(e.bugFixStart || e.retestStart);
      const greyNote = e.retestStart && e.bugFixStart ? 'Bug fixing & retest'
        : e.retestStart ? 'Retest' : e.bugFixStart ? 'Bug fixing & retest' : '';
      return {
        id: e.name, envId: e.id, label: meta.label, alias: meta.alias,
        start: this.relIso(e.testingStart || (w.start != null ? w.start : '')),
        end: this.relIso(w.end != null ? w.end : (e.testingEnd || '')),
        testEnd: hasGrey && e.testingEnd ? this.relIso(e.testingEnd) : '',
        greyNote, notes: e.notes || '',
      };
    }).filter(p => p.start).sort((a, b) => this.relParse(a.start) - this.relParse(b.start));
  }
  get PHASES_SCHED() { return this.relPhasesSched(); }
  get PHASE_COLORS() {
    const out = {};
    this.relEnvs().forEach(e => { out[e.name] = this.relEnvMeta(e.name).color; });
    return out;
  }
  get ACTIVE_PHASE_WINDOW() {
    const env = this.relActiveEnv();
    if (!env) return { label: '—', from: '', to: '', fromLabel: '—', toLabel: '—', testTo: '', testToLabel: '—', fixFrom: '' };
    const w = this.relEnvWindow(env);
    const from = this.relIso(env.testingStart || (w.start != null ? w.start : ''));
    const to = this.relIso(w.end != null ? w.end : env.testingEnd);
    return {
      label: env.name, from, to,
      fromLabel: this.relFmtShort(from), toLabel: this.relFmt(to),
      testTo: this.relIso(env.testingEnd || to), testToLabel: this.relFmtShort(env.testingEnd || to),
      fixFrom: this.relIso(env.bugFixStart || env.retestStart || ''),
    };
  }
  // Ordered environment ids of the selected release — replaces the old
  // hardcoded ['DF1','IR1','QC1','IR3','PC1'].
  relOrder() { return this.relPhasesSched().map(p => p.id); }
  // ── Carry-over ────────────────────────────────────────────────────────────
  // A defect belongs to the environment whose window contains the day it was
  // raised. One raised in QC1 and still open while IR3 runs is a carry-over:
  // it is not IR3's own finding, but it is still open work blocking IR3.
  relEnvSpans() {
    if (this._envSpanId === this.relSelectedId() && this._envSpans) return this._envSpans;
    const spans = this.relEnvs().map((e, i) => {
      const w = this.relEnvWindow(e);
      return { id: e.name, idx: i, from: w.start, to: w.end };
    }).filter(x => x.from != null);
    this._envSpans = spans; this._envSpanId = this.relSelectedId();
    return spans;
  }
  // Environment id a date falls into, or '' when it sits outside every window.
  relEnvOfMs(ms) {
    if (ms == null || isNaN(ms)) return '';
    const spans = this.relEnvSpans();
    for (const s of spans) { if (ms >= s.from && ms <= s.to + 86399999) return s.id; }
    return '';
  }
  // Jira CSV exports dates as "12/Aug/26" or "12/Aug/26 9:41 AM"; German Jira
  // uses "12/Aug/26" too but with localised month names. Also accept ISO and
  // dd.mm.yyyy so a hand-made CSV still works.
  MONTHS = { jan:1, feb:2, mar:3, mär:3, maer:3, apr:4, may:5, mai:5, jun:6, jul:7, aug:8,
             sep:9, sept:9, oct:10, okt:10, nov:11, dec:12, dez:12 };
  dateToIso(v) {
    const raw = String(v == null ? '' : v).trim();
    if (!raw) return '';
    let m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);                       // 2026-09-07
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    m = raw.match(/(\d{1,2})[.\/-]([A-Za-zÄÖÜäöü]{3,4})[.\/-](\d{2,4})/);   // 12/Aug/26
    if (m) {
      const mo = this.MONTHS[m[2].toLowerCase().replace(/\.$/, '')];
      if (mo) {
        let y = parseInt(m[3], 10); if (y < 100) y += 2000;
        return y + '-' + String(mo).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
      }
    }
    m = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);              // 12.08.2026
    if (m) { let y = parseInt(m[3], 10); if (y < 100) y += 2000;
      return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'); }
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return '';
  }
  relEnvIndex(id) {
    const o = this.relOrder(); const i = o.indexOf(id);
    return i < 0 ? -1 : i;
  }
  // Per-environment display metadata for the report's phase cards.
  relMeta() {
    const out = {};
    this.relPhasesSched().forEach(p => {
      const m = this.relEnvMeta(p.id);
      out[p.id] = { label: p.label, alias: m.alias, dateRange: this.relRangeLabel(p), headerBg: m.headerBg };
    });
    return out;
  }
  relRangeLabel(p) {
    if (!p.start) return '';
    const testEnd = p.testEnd || p.end;
    let s = this.relFmtShort(p.start) + ' – ' + this.relFmt(testEnd);
    if (p.testEnd && p.end && p.end !== p.testEnd) s += ' · ' + (p.greyNote || 'Fix & retest') + ' till ' + this.relFmtShort(p.end);
    return s;
  }
  // Testing-execution window per environment (burn-down x-axis).
  relPhaseDates() {
    const out = {};
    this.relEnvs().forEach(e => {
      const w = this.relEnvWindow(e);
      const s = this.relIso(e.testingStart || (w.start != null ? w.start : ''));
      const en = this.relIso(e.testingEnd || (w.end != null ? w.end : ''));
      if (s && en) out[e.name] = [s, en];
    });
    return out;
  }

  // ─── SHARED AUTH MODEL (single source — passed down into every imported view) ──
  // NOTE: the hashed PINs below (SHA-256 + per-user salt) are OBFUSCATION for an
  // internal report, NOT real security — anything truly confidential must not
  // live in a client-side file.
  USERS = [
    { name: 'Arlind Sylaj',      role: 'admin',  salt: 'qa26.arlindsylaj',      hash: 'c0eed4e4100c7d8a81bf54f8aa31aba80fa557daf5f1b7b10ac8b6e64b194fe0' },
  ];
  ROLE_RANK = { viewer: 0, editor: 1, admin: 2 };
  // PHASES_SCHED / PHASE_COLORS are now getters on the release layer above —
  // they are derived from the selected release's environments and schedule.

  // ---- E2E Chain Progress (qTest folder tree) ----
  CHAIN_COLORS = { 'Passed': '#4caf2f', 'Failed': '#ef4444', 'Blocked': '#3b82f6', 'Not relevant': '#a855f7', 'Unexecuted': '#cbd5e1' };
  CHAIN_BG = { 'Passed': 'rgba(76,175,47,0.12)', 'Failed': 'rgba(239,68,68,0.12)', 'Blocked': 'rgba(59,130,246,0.12)', 'Not relevant': 'rgba(168,85,247,0.12)', 'Unexecuted': 'var(--tile-bg)' };
  loadClaims() { try { const o = JSON.parse(this.lsGet('qa-chain-claims') || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
  saveClaims(o) { try { this.lsSet('qa-chain-claims', JSON.stringify(o)); } catch (e) {} this.setState({ chainClaims: o }); }
  toggleClaim = (key) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const c = { ...(this.state.chainClaims || this.loadClaims()) };
    if (c[key]) delete c[key];
    else c[key] = { by: this.state.editorName || 'Tester', ts: Date.now() };
    this.saveClaims(c);
  };
  setChainPhase = (p) => () => this.setState({ chainPhase: p });
  setChainQ = (e) => this.setState({ chainQ: e.target.value });
  toggleChainNode = (path) => (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const c = { ...(this.state.chainCollapsed || {}) };
    c[path] = !this._chainIsCollapsed(path);
    this.setState({ chainCollapsed: c });
  };
  _chainIsCollapsed(path, depth) {
    const c = this.state.chainCollapsed || {};
    if (Object.prototype.hasOwnProperty.call(c, path)) return !!c[path];
    return (depth == null ? 0 : depth) >= 1;
  }
  chainCopy = (text) => () => {
    try { navigator.clipboard.writeText(text); } catch (e) {}
    this.setState({ chainMsg: '✓ Copied to clipboard' });
    clearTimeout(this._chainMsgT);
    this._chainMsgT = setTimeout(() => this.setState({ chainMsg: '' }), 2200);
  };
  chainExpandAll = () => {
    const c = {}; (this._chainPaths || []).forEach(p => { c[p] = false; });
    this.setState({ chainCollapsed: c });
  };
  chainCollapseAll = () => {
    const c = {}; (this._chainPaths || []).forEach(p => { c[p] = true; });
    this.setState({ chainCollapsed: c });
  };
  chainVals() {
    const phase = (this.ACTIVE_PHASE_WINDOW && this.ACTIVE_PHASE_WINDOW.label) || (this.relOrder()[0] || '');
    const q = String(this.state.chainQ || '').trim().toLowerCase();
    const claims = this.state.chainClaims || this.loadClaims();
    const canClaim = this.can('editor');
    // Active environment only, E2E test chain folders only (no Regressionstest / Functional / Testautomation / Smoke).
    const inScope = (c) => {
      const segs = String(c.dir || '').split(' / ').map(s => s.trim()).filter(Boolean).slice(2);
      const top = segs[0] || '';
      return /e2e/i.test(top) && !/smoke/i.test(top);
    };
    const cases = (this.state.importedCases || []).filter(c => c && c.phase === phase && inScope(c));

    const trOf = (c) => {
      const s = String(c.id || '');
      const m = s.match(/([A-Za-z]{2,4})-?(\d{3,})/);
      if (m) return m[1].toUpperCase() + '-' + m[2];
      return c.runId ? 'TR-' + c.runId : (s || '—');
    };
    const keyOf = (c) => phase + '|' + trOf(c) + '|' + (c.name || '');

    const root = { name: '', path: '', kids: [], ix: {}, runs: [] };
    cases.forEach(c => {
      // Mirror the report: level 1 = test folder, level 2 = team, then the original sub-folders
      const segs = String(c.dir || '').split(' / ').map(s => s.trim()).filter(Boolean).slice(2);
      const top = segs[0] || '(no folder)';
      const team = c.team || c.module || '(no team)';
      const use = [top, team].concat(segs.slice(1));
      let node = root, path = '';
      use.forEach(s => {
        path = path ? path + ' / ' + s : s;
        let i = node.ix[s];
        if (i == null) { i = node.kids.length; node.ix[s] = i; node.kids.push({ name: s, path, kids: [], ix: {}, runs: [] }); }
        node = node.kids[i];
      });
      node.runs.push(c);
    });

    const runHit = (c) => !q || (trOf(c) + ' ' + (c.name || '') + ' ' + (c.tester || '') + ' ' + (c.status || '')).toLowerCase().indexOf(q) >= 0;
    const prune = (n, parentHit) => {
      const selfHit = parentHit || (!q) || n.name.toLowerCase().indexOf(q) >= 0;
      const runs = selfHit ? n.runs : n.runs.filter(runHit);
      const kids = n.kids.map(k => prune(k, selfHit)).filter(Boolean);
      if (!q || selfHit || runs.length || kids.length) return { name: n.name, path: n.path, kids, runs };
      return null;
    };
    const tree = { name: '', path: '', kids: root.kids.map(k => prune(k, false)).filter(Boolean), runs: root.runs.filter(runHit) };

    const stat = (n) => {
      const s = { total: 0, done: 0, passed: 0, failed: 0, blocked: 0, nr: 0, unex: 0, claimed: 0, next: null };
      n.runs.forEach(c => {
        const st = c.status || 'Unexecuted';
        s.total++;
        if (st === 'Unexecuted') { s.unex++; if (!s.next) s.next = c; } else s.done++;
        if (st === 'Passed') s.passed++; else if (st === 'Failed') s.failed++;
        else if (st === 'Blocked') s.blocked++; else if (st === 'Not relevant') s.nr++;
        if (claims[keyOf(c)]) s.claimed++;
      });
      n.kids.forEach(k => {
        const ks = stat(k);
        s.total += ks.total; s.done += ks.done; s.passed += ks.passed; s.failed += ks.failed;
        s.blocked += ks.blocked; s.nr += ks.nr; s.unex += ks.unex; s.claimed += ks.claimed;
        if (!s.next && ks.next) s.next = ks.next;
      });
      n.s = s;
      return s;
    };
    const total = stat(tree);

    const paths = [];
    const collect = (n) => n.kids.forEach(k => { paths.push(k.path); collect(k); });
    collect(tree);
    this._chainPaths = paths;

    const pctOf = (v, t) => t ? Math.round((v / t) * 1000) / 10 : 0;
    const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
    const folderText = (n) => {
      const s = n.s;
      let t = phase + ' · ' + n.name + ' — ' + s.done + '/' + s.total + ' done (' + s.passed + ' passed, ' + s.failed + ' failed';
      t += s.blocked ? ', ' + s.blocked + ' blocked)' : ')';
      if (s.next) {
        const cl = claims[keyOf(s.next)];
        t += '\nNext: ' + trOf(s.next) + ' ' + (s.next.name || '') + (cl ? ' (taken by ' + cl.by + ')' : ' — free to pick up');
      } else t += '\nChain complete ✓';
      return t;
    };

    const rows = [];
    const walk = (n, depth) => {
      n.runs.forEach(c => {
        const st = c.status || 'Unexecuted';
        const k = keyOf(c);
        const cl = claims[k];
        const isNext = n.s.next === c;
        rows.push({
          isFolder: false, isRun: true, pad: (depth * 18 + 30) + 'px',
          dot: this.CHAIN_COLORS[st] || '#cbd5e1', stBg: this.CHAIN_BG[st] || 'var(--tile-bg)',
          tr: trOf(c), trColor: isNext ? '#b26a00' : 'var(--tx-strong)',
          name: c.name || '—', status: st, tester: c.tester || '—',
          isNext, claimed: !!cl, claimBy: cl ? cl.by : '',
          canClaim: canClaim && st === 'Unexecuted',
          claimLabel: cl ? 'Release' : 'I take it',
          claimTitle: cl ? 'Release this test run' : 'Mark as taken so nobody doubles up',
          onClaim: () => this.toggleClaim(k),
          bg: isNext ? 'rgba(246,183,60,0.09)' : 'transparent'
        });
      });
      n.kids.forEach(kn => {
        const s = kn.s;
        const col = this._chainIsCollapsed(kn.path, depth);
        rows.push({
          isFolder: true, isRun: false, pad: (depth * 18 + 12) + 'px',
          caret: col ? '▸' : '▾', label: kn.name,
          fs: depth === 0 ? '13px' : '12px', fw: depth === 0 ? 800 : 600,
          bg: depth === 0 ? 'var(--card-bg2)' : 'transparent',
          doneLabel: s.done + '/' + s.total,
          wPass: pctOf(s.passed, s.total), wFail: pctOf(s.failed, s.total),
          wBlk: pctOf(s.blocked, s.total), wNr: pctOf(s.nr, s.total),
          nextLabel: s.next ? ('next · ' + trOf(s.next)) : (s.total ? 'complete ✓' : ''),
          nextColor: s.next ? '#b26a00' : '#4caf2f',
          onToggle: this.toggleChainNode(kn.path),
          onCopy: this.chainCopy(folderText(kn))
        });
        if (!col) walk(kn, depth + 1);
      });
    };
    walk(tree, 0);

    const nextUp = [];
    const gather = (n, trail) => {
      n.runs.forEach(c => {
        if (nextUp.length >= 5) return;
        if ((c.status || 'Unexecuted') !== 'Unexecuted') return;
        if (claims[keyOf(c)]) return;
        if (nextUp.some(x => x.folder === trail)) return;
        nextUp.push({ tr: trOf(c), name: short(c.name, 70), folder: short(trail, 60) });
      });
      n.kids.forEach(k => gather(k, trail ? trail + ' / ' + k.name : k.name));
    };
    gather(tree, '');

    const phaseTabs = [];

    const nextUpText = phase + ' — free test runs to pick up:\n' +
      (nextUp.length ? nextUp.map(n => '• ' + n.tr + ' ' + n.name + '  [' + n.folder + ']').join('\n') : 'none — everything is taken or done');

    return {
      chainPhase: phase, chainPhaseTabs: phaseTabs,
      chainQ: this.state.chainQ || '', setChainQ: this.setChainQ,
      chainExpandAll: this.chainExpandAll, chainCollapseAll: this.chainCollapseAll,
      chainRows: rows, chainHasData: total.total > 0, chainNoData: total.total === 0,
      chainTotal: total.total, chainDone: total.done, chainPassed: total.passed,
      chainFailed: total.failed, chainOpen: total.unex, chainClaimed: total.claimed,
      chainNextUp: nextUp, chainHasNext: nextUp.length > 0, copyNextUp: this.chainCopy(nextUpText),
      chainMsg: this.state.chainMsg || '', chainHasMsg: !!this.state.chainMsg
    };
  }

  // Reorderable / hideable page sections (CSS order inside their column)
  SECTIONS = [
    { k: 'relovw',    label: 'Release Overview (KPIs)',    col: 'Main column' },
    { k: 'reltl',     label: 'Release Timeline',           col: 'Main column' },
    { k: 'relsum',    label: 'Release Summary (schedule)', col: 'Main column' },
    { k: 'resp',      label: 'Responsibilities + Topics', col: 'Main column' },
    { k: 'phases',    label: 'Test Phase Timeline',       col: 'Main column' },
    { k: 'summary',   label: 'Overall Summary + Burn-down', col: 'Main column' },
    { k: 'envs',      label: 'Phase / Environment Cards', col: 'Main column' },
    { k: 'chains',    label: 'E2E Chain Progress',        col: 'Main column' },
    { k: 'tcf',       label: 'Testfallfinalisierung',     col: 'Main column' },
    { k: 'backlog',   label: 'Release Backlog × Testing Link', col: 'Main column' },
    { k: 'xenv',      label: 'Recurring Defects across Environments', col: 'Main column' },
    { k: 'countdown', label: 'Release Countdown',         col: 'Side column' },
    { k: 'workflow',  label: 'Testing Workflow Timeline', col: 'Side column' },
    { k: 'defects',   label: 'Defect Overview',           col: 'Side column' },
    { k: 'dump',      label: 'Bug Dump Report',           col: 'Side column' },
    { k: 'milestone', label: 'Next Milestone + Info',     col: 'Side column' },
  ];
  // The release blocks are administration context, not day-to-day reporting —
  // they are available in the layout settings but off by default.
  LAYOUT_VERSION = 2;
  DEFAULT_HIDDEN = { relovw: true, reltl: true, relsum: true };
  loadLayout() {
    let o = {};
    try { o = JSON.parse(this.lsGet('qa-section-layout') || '{}') || {}; } catch (e) { o = {}; }
    const order = Array.isArray(o.order) ? o.order.filter(k => this.SECTIONS.some(s => s.k === k)) : [];
    this.SECTIONS.forEach(s => { if (order.indexOf(s.k) < 0) order.push(s.k); });
    let hidden = (o.hidden && typeof o.hidden === 'object') ? o.hidden : {};
    if (o.v !== this.LAYOUT_VERSION) {
      // one-time: apply the defaults on top of whatever the user already had
      hidden = { ...this.DEFAULT_HIDDEN, ...hidden };
      try { this.lsSet('qa-section-layout', JSON.stringify({ order, hidden, v: this.LAYOUT_VERSION })); } catch (e) {}
    }
    return { order, hidden };
  }
  saveLayout(l) {
    try { this.lsSet('qa-section-layout', JSON.stringify({ ...l, v: this.LAYOUT_VERSION })); } catch (e) {}
    this.setState({ layoutRev: (this.state.layoutRev || 0) + 1 });
  }
  moveSection = (k, dir) => {
    if (!this.can('editor')) return;
    const l = this.loadLayout();
    const col = (this.SECTIONS.find(s => s.k === k) || {}).col;
    const sameCol = l.order.filter(x => (this.SECTIONS.find(s => s.k === x) || {}).col === col);
    const i = sameCol.indexOf(k), j = i + dir;
    if (i < 0 || j < 0 || j >= sameCol.length) return;
    sameCol[i] = sameCol[j]; sameCol[j] = k;
    let p = 0;
    const order = l.order.map(x => (this.SECTIONS.find(s => s.k === x) || {}).col === col ? sameCol[p++] : x);
    this.saveLayout({ order, hidden: l.hidden });
  };
  toggleSection = (k) => {
    if (!this.can('editor')) return;
    const l = this.loadLayout();
    if (l.hidden[k]) delete l.hidden[k]; else l.hidden[k] = true;
    this.saveLayout(l);
  };
  resetLayout = () => { if (!this.can('editor')) return; this.saveLayout({ order: this.SECTIONS.map(s => s.k), hidden: { ...this.DEFAULT_HIDDEN } }); };
  openLayout = () => this.setState({ layoutOpen: true });
  closeLayout = () => this.setState({ layoutOpen: false });

  // Active testing phase — Defect Overview only counts defects created inside this window.
  // ACTIVE_PHASE_WINDOW is a getter on the release layer: the environment of the
  // selected release whose window contains today (else the next upcoming one),
  // covering both its test-execution and its bug-fixing/retest days.

  state = { dark: true, module: 'test', collapsed: {}, commentOpen: false, commentText: '', commentSection: 'General', commenterName: '', importedRows: null, importInfo: 'No data imported yet', importError: '', role: 'viewer', editorName: '', comments: [], loginOpen: false, loginName: '', loginPin: '', loginError: '', inboxOpen: false, pinOpen: false, pinCurrent: '', pinNew1: '', pinNew2: '', pinMsg: 'idle', pinError: '', importedCases: [], tcModal: null, milestone: '', milestoneDate: '', infoNote: '', milestoneOpen: false, mMilestone: null, mDate: null, mInfo: null, topics: null, topicModal: null, history: [], historyOpen: false, viewingTs: null, calMonth: null };

  // Editors may retype the people on the card; the role list itself is managed
  // per release under Manage Releases.
  setRespPeople = (respId) => (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const val = e && e.target ? e.target.value : e;
    const store = this.relStore();
    const id = this.relSelectedId();
    store.releases = store.releases.map(r => r.id !== id ? r : ({
      ...r, updatedAt: Date.now(),
      responsibilities: (r.responsibilities || []).map(x => x.id === respId ? { ...x, people: val } : x),
    }));
    this.relWrite(store);
    this.forceUpdate();
  };
  moveSuite = (phaseId, names, idx, dir) => {
    const arr = names.slice();
    const j = idx + dir; if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const suiteOrder = { ...(this.state.suiteOrder || {}), [phaseId]: arr };
    try { this.lsSet('qa-suite-order', JSON.stringify(suiteOrder)); } catch (e) {}
    this.setState({ suiteOrder });
  };
  toggleDump = () => this.setState(s => ({ dumpOpen: !s.dumpOpen }));
  setDumpBucket = (b) => this.setState({ dumpBucket: b });
  get DUMP_SLOTS() { return ['General'].concat(this.relOrder()); }
  dumpKey(slot, suffix) {
    const s = slot || this.state.dumpSlot || 'General';
    const base = (s === 'General') ? 'qa-bug-dump' : ('qa-bug-dump-' + s);
    return suffix ? (base + '-' + suffix) : base;
  }
  setDumpSlot = (s) => () => this.setState({ dumpSlot: s, dumpError: '', dumpOpen: true });
  loadDump(slot) { try { const s = JSON.parse(this.lsGet(this.dumpKey(slot)) || 'null'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  loadDumpFile(slot) { try { return this.lsGet(this.dumpKey(slot, 'file')) || ''; } catch (e) { return ''; } }
  clearDump = () => {
    const slot = this.state.dumpSlot || 'General';
    try { this.lsDel(this.dumpKey(slot)); this.lsDel(this.dumpKey(slot, 'file')); this.lsDel(this.dumpKey(slot, 'scanned')); } catch (e) {}
    this.setState({ dumpBump: (this.state.dumpBump || 0) + 1, dumpError: '' });
  };
  onDumpFile = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target.result || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';'
          : ((text.split('\n')[0].indexOf('\t') >= 0) ? '\t' : ',');
        const grid = []; let row = [], cur = '', q = false;
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
          else if (c === '"') q = true;
          else if (c === sep) { row.push(cur); cur = ''; }
          else if (c === '\n') { row.push(cur); grid.push(row); row = []; cur = ''; }
          else cur += c;
        }
        row.push(cur); if (row.length > 1 || row[0]) grid.push(row);
        const rows = grid.filter(r => r.some(x => String(x).trim() !== ''));
        if (rows.length < 2) throw new Error('CSV has no data rows');
        const head = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\.]/g, ''));
        const find = (...names) => { for (const n of names) { const i = head.findIndex(h => h.indexOf(n) >= 0); if (i >= 0) return i; } return -1; };
        const ci = { key: find('issuekey', 'key', 'ticket', 'id', 'bugid'), summary: find('summary', 'title', 'subject', 'description', 'beschreib'),
          status: find('status', 'state', 'zustand'), priority: find('priority', 'severity', 'prio'),
          assignee: find('assignee', 'owner', 'responsible', 'bearbeiter'), created: find('created', 'date', 'datum', 'opened'),
          component: find('component', 'area', 'module', 'bereich', 'environment'),
          labels: find('label', 'tags'), descr: find('description', 'beschreib', 'detail', 'comment') };
        const g = (r, k) => (ci[k] >= 0 ? String(r[ci[k]] || '').trim() : '');
        const out = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const key = g(r, 'key'), summary = g(r, 'summary');
          if (!key && !summary) continue;
          out.push({ key: key || ('#' + i), summary: summary || '—', status: g(r, 'status') || 'Unknown',
            priority: g(r, 'priority') || 'Unprioritized', assignee: g(r, 'assignee') || 'Unassigned',
            created: g(r, 'created'), component: g(r, 'component'),
            labels: g(r, 'labels'), descr: g(r, 'descr') });
        }
        const slot = this.state.dumpSlot || 'General';
        const total = out.length;
        if (!total) throw new Error('No bug rows found');
        if (slot === 'General') {
          // General slot is a DUMP report: keep only tickets mentioning "dump"
          const dumps = out.filter(d => /dump/i.test((d.summary || '') + ' ' + (d.descr || '') + ' ' + (d.labels || '')));
          if (!dumps.length) throw new Error('No dump tickets found in ' + total + ' rows — no row mentions "dump" in summary, description or labels');
          out.length = 0; dumps.forEach(d => out.push(d));
        }
        out.forEach(d => { d.phaseSlot = slot; });
        try {
          this.lsSet(this.dumpKey(slot, 'scanned'), String(total));
          this.lsSet(this.dumpKey(slot), JSON.stringify(out));
          this.lsSet(this.dumpKey(slot, 'file'), file.name);
        } catch (er) {}
        this.setState({ dumpBump: (this.state.dumpBump || 0) + 1, dumpError: '', dumpOpen: true });
      } catch (err) { this.setState({ dumpError: err.message }); }
    };
    reader.onerror = () => this.setState({ dumpError: 'Could not read file' });
    reader.readAsText(file);
  };
  exportDumpCsv = () => {
    const rows = this.loadDump(this.state.dumpSlot || 'General');
    const cols = ['key', 'summary', 'status', 'priority', 'assignee', 'created', 'component'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => esc(r[c])).join(','))).join('\n');
    try {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = 'bug-dump.csv'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {}
  };
  DUMP_BUCKET(status) {
    const x = String(status || '').toLowerCase();
    if (/block|impedi|on hold|waiting|wartet/.test(x)) return 'Blocked';
    if (/done|closed|resolved|fixed|verified|complete|transport|reject|cancel|erledigt/.test(x)) return 'Done';
    if (/analy|investigat|review|triage|progress|clarif|pruef|prüf|bearbeit/.test(x)) return 'In Analysis';
    return 'Open';
  }
  onDumpQ = (e) => this.setState({ dumpQ: e.target.value });

  can(min) { return (this.ROLE_RANK[this.state.role] || 0) >= (this.ROLE_RANK[min] || 0); }
  async sha256(str) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
  // ─── User management: base admin + additional users stored locally ───────
  loadExtraUsers() { try { const a = JSON.parse(this.lsGet('qa-users') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  saveExtraUsers(list) { try { this.lsSet('qa-users', JSON.stringify(list)); } catch (e) {} }
  getUsers() { return this.USERS.concat(this.loadExtraUsers()); }
  userSalt(name) { return 'qa26.' + String(name).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  // The header version is the selected release's version — renaming happens in
  // Manage Releases, so the header and the release model can never drift apart.
  // super admin = the first (built-in) admin account; may create further admins/editors
  isSuperAdmin() { return (this.USERS[0] && this.state.editorName === this.USERS[0].name) && this.state.role === 'admin'; }
  addUser = async () => {
    if (!this.isSuperAdmin()) return;
    const name = (this.state.nuName || '').trim();
    const role = this.state.nuRole || 'editor';
    const pin = (this.state.nuPin || '').trim();
    if (name.length < 3) return this.setState({ nuMsg: 'error', nuError: 'Enter the full name.' });
    if (this.getUsers().some(u => u.name.toLowerCase() === name.toLowerCase())) return this.setState({ nuMsg: 'error', nuError: 'That user already exists.' });
    if (!/^\d{6}$/.test(pin)) return this.setState({ nuMsg: 'error', nuError: 'PIN must be 6 digits.' });
    const salt = this.userSalt(name);
    let hash = '';
    try { hash = await this.sha256(salt + ':' + pin); } catch (e) { return this.setState({ nuMsg: 'error', nuError: 'Secure crypto unavailable in this browser.' }); }
    const list = this.loadExtraUsers().concat([{ name, role, salt, hash }]);
    this.saveExtraUsers(list);
    this.setState({ nuName: '', nuPin: '', nuRole: 'editor', nuMsg: 'success', nuError: '', nuOk: name + ' added as ' + role + '.', usersRev: (this.state.usersRev || 0) + 1 });
  };
  resetUserPin = async (name) => {
    if (!this.isSuperAdmin()) return;
    const pin = window.prompt('New 6-digit PIN for ' + name + ':', '');
    if (pin === null) return;
    const p = pin.trim();
    if (!/^\d{6}$/.test(p)) return this.setState({ nuMsg: 'error', nuError: 'PIN must be 6 digits.' });
    const list = this.loadExtraUsers();
    const u = list.find(x => x.name === name); if (!u) return;
    u.hash = await this.sha256(u.salt + ':' + p);
    this.saveExtraUsers(list);
    try { const h = JSON.parse(this.lsGet('qa-pin-hashes') || '{}') || {}; delete h[name]; this.lsSet('qa-pin-hashes', JSON.stringify(h)); } catch (e) {}
    this.setState({ nuMsg: 'success', nuError: '', nuOk: 'PIN updated for ' + name + '.', usersRev: (this.state.usersRev || 0) + 1 });
  };
  removeUser = (name) => {
    if (!this.isSuperAdmin()) return;
    if (!window.confirm('Remove ' + name + '? They will no longer be able to sign in.')) return;
    this.saveExtraUsers(this.loadExtraUsers().filter(u => u.name !== name));
    this.setState({ nuMsg: 'success', nuError: '', nuOk: name + ' removed.', usersRev: (this.state.usersRev || 0) + 1 });
  };
  getPinHashes() { const base = {}; this.getUsers().forEach(u => { base[u.name] = u.hash; }); try { const s = JSON.parse(this.lsGet('qa-pin-hashes') || 'null'); if (s) return { ...base, ...s }; } catch (e) {} return base; }
  setPinHash(name, hash) { try { const s = JSON.parse(this.lsGet('qa-pin-hashes') || '{}') || {}; s[name] = hash; this.lsSet('qa-pin-hashes', JSON.stringify(s)); } catch (e) {} }
  saveSession(name, role) { try { if (!name || role === 'viewer') sessionStorage.removeItem('qa-session'); else sessionStorage.setItem('qa-session', JSON.stringify({ name, role })); } catch (e) {} }
  loadAppMap() { try { const s = JSON.parse(this.lsGet('qa-app-map') || 'null'); if (s && s.assign && s.rename) return s; } catch (e) {} return { assign: {}, rename: {} }; }
  saveAppMap(m) { try { this.lsSet('qa-app-map', JSON.stringify(m)); } catch (e) {} this.forceUpdate(); }
  openCoverage = (id) => { this.setState({ coverageEnv: id }); try { history.replaceState(null, '', '#coverage-' + id); } catch (e) {} };
  closeCoverage = () => { this.setState({ coverageEnv: null }); try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {} };
  openReqCov = () => this.setState({ reqCovOpen: true });
  closeReqCov = () => this.setState({ reqCovOpen: false });
  loadReqBaseline() { try { const n = parseInt(this.lsGet('qa-req-baseline') || '0', 10); return isNaN(n) ? 0 : n; } catch (e) { return 0; } }
  setReqBaseline = (e) => { if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; } const n = parseInt(e.target.value || '0', 10); try { this.lsSet('qa-req-baseline', String(isNaN(n) ? 0 : n)); } catch (er) {} this.setState({ reqBaseline: isNaN(n) ? 0 : n }); };
  covRenameApp = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const from = window.prompt('Application to rename:'); if (!from) return;
    const to = window.prompt('New name for "' + from + '" (blank clears the rename):'); if (to == null) return;
    const m = this.loadAppMap(); if (to.trim()) m.rename[from.trim()] = to.trim(); else delete m.rename[from.trim()];
    this.saveAppMap(m);
  };
  covAssignModule = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const mod = window.prompt('Module to (re)assign:'); if (!mod) return;
    const app = window.prompt('Assign "' + mod + '" to application (blank clears the override):'); if (app == null) return;
    const m = this.loadAppMap(); if (app.trim()) m.assign[mod.trim()] = app.trim(); else delete m.assign[mod.trim()];
    this.saveAppMap(m);
  };
  runDiagnostics = () => {
    const out = [];
    const img = document.querySelector('img[alt="Cordes & Graefe"]');
    out.push({ label: 'Logo asset resolved', ok: !!(img && img.complete && img.naturalWidth > 0) });
    out.push({ label: 'XLSX engine loaded', ok: typeof window.XLSX !== 'undefined' });
    let fontsOk = false; try { fontsOk = !!(document.fonts && document.fonts.check('16px Rubik')); } catch (e) {}
    out.push({ label: 'Rubik font loaded', ok: fontsOk });
    // probe the raw API — lsSet/lsDel swallow quota errors by design
    let ls = false; try { localStorage.setItem('qa-diag-probe', '1'); localStorage.removeItem('qa-diag-probe'); ls = true; } catch (e) {}
    out.push({ label: 'localStorage writable', ok: ls });
    const _rel = this.relSelected();
    out.push({ label: 'Release model loaded (' + this.relAll().length + ' release' + (this.relAll().length === 1 ? '' : 's') + ')', ok: !!_rel });
    out.push({ label: 'Selected release has environments', ok: !!(_rel && this.relEnvs(_rel).length) });
    let ss = false; try { sessionStorage.setItem('qa-diag-probe', '1'); sessionStorage.removeItem('qa-diag-probe'); ss = true; } catch (e) {}
    out.push({ label: 'sessionStorage writable', ok: ss });
    this.setState({ diag: out });
  };
  loadComments() { try { return JSON.parse(this.lsGet('qa-comments') || '[]'); } catch (e) { return []; } }
  persistComments(list) { try { this.lsSet('qa-comments', JSON.stringify(list)); } catch (e) {} this.setState({ comments: list }); }

  doLogin = async () => {
    const name = this.state.loginName;
    const pin = (this.state.loginPin || '').trim();
    if (!name) return this.setState({ loginError: 'Select a user.' });
    if (!/^\d{6}$/.test(pin)) return this.setState({ loginError: 'PIN must be 6 digits.' });
    const u = this.getUsers().find(x => x.name === name);
    if (!u) return this.setState({ loginError: 'Unknown user.' });
    let h = '';
    try { h = await this.sha256(u.salt + ':' + pin); } catch (e) { return this.setState({ loginError: 'Secure crypto unavailable in this browser.' }); }
    if (this.getPinHashes()[name] !== h) return this.setState({ loginError: 'Incorrect PIN.' });
    this.saveSession(name, u.role);
    try { this.lsDel('qa-role'); this.lsDel('qa-editor-name'); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('qa-role-sync', { detail: { name, role: u.role } })); } catch (e) {}
    this.setState({ role: u.role, editorName: name, loginOpen: false, loginPin: '', loginError: '' });
  };
  doLogout = () => {
    this.saveSession('', 'viewer');
    try { window.dispatchEvent(new CustomEvent('qa-role-sync', { detail: { name: '', role: 'viewer' } })); } catch (e) {}
    this.setState({ role: 'viewer', editorName: '', inboxOpen: false, pinOpen: false, diagOpen: false });
  };
  changePin = async () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const { pinCurrent, pinNew1, pinNew2, editorName } = this.state;
    const u = this.getUsers().find(x => x.name === editorName); if (!u) return;
    const cur = await this.sha256(u.salt + ':' + (pinCurrent || '').trim());
    if (this.getPinHashes()[editorName] !== cur) return this.setState({ pinMsg: 'error', pinError: 'Current PIN is incorrect.' });
    if (!/^\d{6}$/.test((pinNew1 || '').trim())) return this.setState({ pinMsg: 'error', pinError: 'New PIN must be 6 digits.' });
    if (pinNew1 !== pinNew2) return this.setState({ pinMsg: 'error', pinError: 'New PINs do not match.' });
    this.setPinHash(editorName, await this.sha256(u.salt + ':' + pinNew1.trim()));
    this.setState({ pinMsg: 'success', pinError: '', pinCurrent: '', pinNew1: '', pinNew2: '' });
  };
  submitComment = () => {
    const text = (this.state.commentText || '').trim();
    if (!text) return this.setState({ commentStatus: 'error', commentError: 'Please write a comment.' });
    const name = (this.state.commenterName || '').trim() || 'Anonymous';
    const section = this.state.commentSection || 'General';
    const entry = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name, section, text, date: new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) };
    this.persistComments([entry, ...this.loadComments()]);
    this.setState({ commentStatus: 'success', commentText: '' });
    setTimeout(() => this.setState({ commentOpen: false, commentStatus: 'idle' }), 1600);
  };
  deleteComment = (id) => { if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; } this.persistComments(this.loadComments().filter(c => c.id !== id)); };
  // Seed topics for a release that has none yet — written from its own schedule,
  // then freely editable per release.
  _defaultTopics() {
    const sched = this.relPhasesSched();
    const first = sched[0], last = sched[sched.length - 1];
    const out = [{ id: 't1', level: 'Info', title: 'Test schedule confirmed',
      text: sched.length
        ? (sched.length + ' environment' + (sched.length === 1 ? '' : 's') + ' scheduled from ' + this.relFmt(first.start) + ' to ' + this.relFmt(last.end) + '. No active blockers at kickoff.')
        : 'No environments configured for this release yet.', meta: '' }];
    if (last) out.push({ id: 't2', level: 'Watch', title: last.id + ' final gate',
      text: last.id + ' (' + last.label + ') is the final gate of this release, ending ' + this.relFmt(last.end) + '.', meta: '' });
    return out;
  }
  loadTopics() { try { const s = JSON.parse(this.lsGet('qa-topics') || 'null'); return Array.isArray(s) ? s : this._defaultTopics(); } catch (e) { return this._defaultTopics(); } }
  persistTopics(list) { try { this.lsSet('qa-topics', JSON.stringify(list)); } catch (e) {} this.setState({ topics: list }); }
  saveTopic = () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const m = this.state.topicModal || {}; const text = (m.text || '').trim(); if (!text) return;
    const level = m.level || 'Watch'; const title = (m.title || '').trim();
    const meta = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' · ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' · ' + (this.state.editorName || 'Editor');
    let list = (this.state.topics || this._defaultTopics()).slice();
    if (m.id) list = list.map(t => t.id === m.id ? { ...t, level, text, title, meta } : t);
    else list = [...list, { id: 't' + Date.now(), level, text, title, meta }];
    this.persistTopics(list); this.setState({ topicModal: null });
  };
  deleteTopic = (id) => { if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; } this.persistTopics((this.state.topics || this._defaultTopics()).filter(t => t.id !== id)); };
  // Application scope from "SAP Upgrade — Scope-Applications" (Arlind Doc) · e = [IR1, QC1, IR3, PC1]
  APP_SCOPE = [
    { name: 'Artikelstamm (inkl. FIS/mpm)', cc: 'Master Data Services', e: [1,1,1,1], al: ['artikelstamm','mpm'] },
    { name: 'Canon OMS (Drucker-Administration)', cc: 'CC Documents & Archiving', e: [1,1,1,1], al: ['canon','oms'] },
    { name: 'FIORI', cc: 'Identity & Access Management', e: [1,1,1,1], al: ['fiori','launchpad'] },
    { name: 'FIS/edc (Addon)', cc: 'CC Financial IT Services', e: [1,1,1,0], al: ['fisedc'] },
    { name: 'FIS/fci (Addon)', cc: 'CC Financial IT Services', e: [1,1,1,0], al: ['fisfci'] },
    { name: 'FIS/xee', cc: 'CC Sales & Distribution', e: [1,0,0,0], al: ['fisxee'] },
    { name: 'Gicom (AD & ANW)', cc: 'CC Strategic Procurement', e: [1,1,1,1], al: ['gicom'] },
    { name: 'LMS', cc: 'CC Warehouse', e: [1,1,1,1], al: ['lms'] },
    { name: 'LV MATCHER 2', cc: 'CC Sales Applications Service', e: [1,1,1,0], al: ['lvmatcher'] },
    { name: 'MPD-Client & MPD-Server (PAD)', cc: 'CC Operational Procurement', e: [1,1,1,1], al: ['mpd','pad'] },
    { name: 'Objektpool', cc: 'CC Sales & Distribution', e: [1,1,1,1], al: ['objektpool'] },
    { name: 'SAP API Management', cc: 'Enterprise Application Integration', e: [0,0,0,1], al: ['apimanagement'] },
    { name: 'SAP BCM', cc: 'CC Financial IT Services', e: [1,1,1,0], al: ['sapbcm'] },
    { name: 'SAP Business Partner (ehem. MDG)', cc: 'Master Data Services', e: [1,1,1,1], al: ['businesspartner','mdg'] },
    { name: 'SAP CCM', cc: 'CC Strategic Procurement', e: [1,1,1,1], al: ['sapccm'] },
    { name: 'SAP Cloud Integration (CPI)', cc: 'Enterprise Application Integration', e: [0,0,0,1], al: ['cloudintegration','cpi'] },
    { name: 'SAP CM GTM', cc: 'CC Strategic Procurement', e: [1,0,0,1], al: ['cmgtm','gtm'] },
    { name: 'Werke', cc: 'Master Data Services', e: [0,0,0,1], al: ['werke'] },
    { name: 'SAP embedded EWM', cc: 'CC Warehouse', e: [1,1,1,1], al: ['ewm'] },
    { name: 'SAP Finance', cc: 'CC Financial IT Services', e: [1,1,1,0], al: ['sapfinance','sapfi'] },
    { name: 'SAP MM', cc: 'CC Operational Procurement', e: [1,1,1,0], al: ['sapmm'] },
    { name: 'SAP SD', cc: 'CC Sales & Distribution', e: [1,1,1,1], al: ['sapsd'] },
    { name: 'DWH', cc: 'Data Warehouse', e: [0,0,1,0], al: ['dwh','datawarehouse'] },
    { name: 'SAP PI/PO', cc: 'Enterprise Application Integration', e: [0,0,0,1], al: ['pipo'] },
    { name: 'SAP Transportation Management (TM)', cc: 'CC Transportation', e: [1,1,1,1], al: ['saptm','transportationmanagement'] },
    { name: 'SAP xECM by OpenText', cc: 'CC Documents & Archiving', e: [1,1,1,1], al: ['xecm','opentext'] },
    { name: 'SAP XVAT (Addon)', cc: 'CC Financial IT Services', e: [1,0,0,0], al: ['xvat'] },
    { name: 'Soplex Suite (Addon)', cc: 'CC Financial IT Services', e: [1,1,1,0], al: ['soplex'] },
    { name: 'SOKL & Bruttopreisfindung', cc: 'CC Financial IT Services', e: [1,1,1,1], al: ['sokl','sortimentsklassifizierung','bruttopreis'] },
    { name: 'TM-on-street', cc: 'CC Transportation', e: [1,1,1,1], al: ['tmonstreet','tmos'] },
    { name: 'FIS/wws NG', cc: 'SD / MM', e: [1,1,1,0], al: ['fiswws','wwsng'] },
    { name: 'Virtusa EBICS', cc: 'CC Financial IT Services', e: [0,0,0,1], al: ['ebics','virtusa'] },
    { name: 'Seeburger BIS6 & Connector', cc: 'CC Operational Procurement', e: [0,1,1,1], al: ['seeburger','bis6'] },
    { name: 'KSEF → FIS/edc (Schnittstelle)', cc: 'CC Financial IT Services', e: [0,0,0,0], al: ['ksef'] },
    { name: 'Avantra (Monitoring)', cc: 'CC Enterprise Systems', e: [1,1,1,0], al: ['avantra'] },
    { name: 'SAP Address Directory', cc: 'Master Data Services', e: [1,1,1,1], al: ['addressdirectory'] },
    { name: 'SAP SCM Optimizer', cc: 'CC Enterprise Systems', e: [1,1,1,1], al: ['scmoptimizer'] },
    { name: 'Handelskalkulation', cc: 'Master Data Services', e: [1,1,1,1], al: ['handelskalkulation'] },
    { name: 'Listung', cc: 'Master Data Services', e: [0,0,0,1], al: ['listung'] },
    { name: 'GC-API', cc: 'Enterprise Application Integration', e: [0,0,0,1], al: ['gcapi'] },
    { name: 'Punkt-zu-Punkt Schnittstellen', cc: 'Enterprise Application Integration', e: [0,0,0,1], al: ['punktzupunkt'] },
    { name: 'ADS (Adobe Document Services)', cc: 'CC Enterprise Systems', e: [1,1,1,1], al: ['adobedocument'] },
    { name: 'Akzepta (Schnittstelle)', cc: 'CC Financial IT Services', e: [0,0,0,0], al: ['akzepta'] },
    { name: 'Exchange Server (Mailing aus SAP)', cc: 'CC Enterprise Systems', e: [1,1,1,1], al: ['exchange'] },
    { name: 'GC SAP Jobtool', cc: 'CC Enterprise Systems', e: [1,1,1,1], al: ['jobtool'] },
    { name: 'ITEK Produktdatenportal', cc: 'PDM International', e: [0,0,1,0], al: ['itek'] },
    { name: 'ONLINE PLUS', cc: 'eCommerce', e: [1,1,1,1], al: ['onlineplus'] },
    { name: 'SAP Concur', cc: 'CC Financial IT Services', e: [0,0,0,0], al: ['concur'] },
    { name: 'SAP Event Management on S/4HANA', cc: 'CC Transportation', e: [1,1,1,1], al: ['eventmanagement'] },
    { name: 'SAP HCM', cc: 'HR Services', e: [0,0,0,1], al: ['saphcm'] },
    { name: 'SAP Sales Cloud (C/4 S/4)', cc: 'CC CRM Services', e: [0,1,1,1], al: ['salescloud'] },
    { name: 'SAP Secure Login Server (SSO)', cc: 'CC Enterprise Systems', e: [1,1,1,1], al: ['securelogin','sso'] },
    { name: 'SigPad Server SAP', cc: 'CC Warehouse', e: [1,1,1,1], al: ['sigpad'] },
    { name: 'PTV Developer', cc: 'CC Transportation', e: [0,0,0,0], al: ['ptvdeveloper'] },
    { name: 'Microsoft Dynamics (D365)', cc: 'CC CRM Services', e: [0,0,1,1], al: ['dynamics','d365'] },
    { name: 'blau/weiße Seiten (Brötje)', cc: 'Master Data Services', e: [0,0,1,0], al: ['blauweisseseiten','brotje'] },
    { name: 'SAP ASS', cc: 'CC Sales & Distribution', e: [0,1,1,0], al: ['sapass'] },
    { name: 'Elements-a', cc: 'CC Sales Applications Services', e: [1,1,1,0], al: ['elementsa'], clar: true },
    { name: 'IDR (Ungarn)', cc: 'CC Financial IT Services', e: [0,1,0,0], al: ['idrungarn'], clar: true },
    { name: 'Scanner', cc: '—', e: [1,1,1,0], al: ['scanner'], clar: true },
    { name: 'Labelprinter', cc: '—', e: [1,1,1,0], al: ['labelprinter'], clar: true },
  ];

  // aggregate imported qTest runs matching a scope application for one environment
  APP_STOP = { sap: 1, test: 1, tests: 1, inkl: 1, ehem: 1, und: 1, der: 1, die: 1, das: 1, fur: 1, fuer: 1, neu: 1,
    schnittstelle: 1, schnittstellen: 1, monitoring: 1, service: 1, services: 1, system: 1, systeme: 1, client: 1, server: 1,
    data: 1, management: 1, integration: 1, cloud: 1, business: 1, adobe: 1, document: 1, documents: 1, directory: 1, ungarn: 1 };

  // every string an application name could plausibly appear in
  appNeedles(app) {
    if (app.__n) return app.__n;
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const set = {};
    const full = norm(app.name); if (full.length >= 4) set[full] = 1;
    const bare = norm(String(app.name).replace(/\([^)]*\)/g, ' ')); if (bare.length >= 4) set[bare] = 1;
    String(app.name).replace(/\([^)]*\)/g, ' ').split(/[^A-Za-z0-9]+/).forEach(w => {
      const t = norm(w); if (t.length >= 4 && !this.APP_STOP[t]) set[t] = 1;
    });
    (app.al || []).forEach(a => { const t = norm(a); if (t.length >= 3) set[t] = 1; });
    try { Object.defineProperty(app, '__n', { value: Object.keys(set), enumerable: false }); } catch (e) {}
    return Object.keys(set);
  }

  isSmoke(o) {
    if (!o) return false;
    return /smoke/i.test([o.test, o.dir, o.module, o.application, o.hay, o.name].filter(Boolean).join(' '));
  }
  scopeMatch(app, env, exSmoke) {
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const needles = this.appNeedles(app);
    const hit = (hay) => { const ns = norm(hay); return !!ns && needles.some(n => ns.indexOf(n) >= 0); };
    const skip = (o) => !!exSmoke && this.isSmoke(o);
    let planned = 0, executed = 0, bad = 0, any = false;

    // 1) explicit Application / Module columns, when the export has them
    (this.state.importedApps || []).forEach(r => {
      if (skip(r)) return;
      if (r.phase === env && (hit(r.application) || hit(r.module))) {
        any = true; planned += r.planned || 0; executed += r.executed || 0; bad += (r.failed || 0) + (r.blocked || 0);
      }
    });

    // 2) otherwise match the qTest directory path, suite, team and test-case names
    if (!any) (this.state.importedRows || []).forEach(r => {
      if (r.phase !== env || skip(r)) return;
      if (hit(r.hay) || hit(r.test) || hit(r.team)) {
        any = true; planned += r.planned || 0; executed += r.tested || 0; bad += (r.failed || 0) + (r.blocked || 0);
      }
    });

    // 3) last resort: individual executed runs (older snapshots without a haystack)
    if (!any) {
      const cs = (this.state.importedCases || []).filter(c => !c.unex && !skip(c)).filter(c => c.phase === env &&
        (hit(c.dir) || hit(c.name) || hit(c.test) || hit(c.team) || hit(c.application) || hit(c.module)));
      if (cs.length) {
        any = true; planned = cs.length; executed = cs.length;
        bad = cs.filter(c => c.status === 'Failed' || c.status === 'Blocked').length;
      }
    }
    return { planned, executed, bad, any };
  }

  // ═══ GO / NO-GO DECISION (any phase → its successor) ══════════════════
  // Default = the latest phase whose test execution has finished; admins can switch phase.
  gngDefaultPhase() {
    const P = this.PHASES_SCHED || [];
    const mk = (v) => { const p = String(v || '').split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getTime(); };
    const now = Date.now();
    let pick = null;
    P.forEach((p, i) => { if (i < P.length - 1 && mk(p.testEnd || p.end) <= now) pick = p.id; });
    return pick || (P[0] && P[0].id) || 'IR1';
  }
  gngPhases() {
    const P = this.PHASES_SCHED || [];
    return P.slice(0, Math.max(0, P.length - 1)).map(p => p.id);
  }
  get GNG() {
    const P = this.PHASES_SCHED || [];
    const from = this.state.gngPhase || this.gngDefaultPhase();
    const i = Math.max(0, P.findIndex(p => p.id === from));
    const nx = P[i + 1] || P[i] || { id: from, start: '' };
    const d = String(nx.start || '').split('-');
    const gate = d.length === 3 ? (d[2] + '.' + d[1] + '.' + d[0]) : '—';
    return { from: P[i] ? P[i].id : from, to: nx.id, gate };
  }
  setGngPhase = (id) => this.setState({ gngPhase: id });
  gngClosed(s) { return /done|closed|resolved|fixed|verified|complete|erledigt|abgeschlossen|reject|cancel|transport|fertig|gel\u00f6st|geloest|behoben|geschlossen|storniert|abgelehnt/i.test(String(s || '')); }
  // Robust Jira date parsing: "4/Aug/26 3:04 PM", "04.08.2026 14:22", "04/08/2026", ISO
  gngDate(raw) {
    const MON = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const s = String(raw || '').trim(); if (!s) return null;
    const yr = (y) => { y = +y; return y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y; };
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,})[\/\-. ](\d{2,4})/);
    if (m && MON[m[2].slice(0, 3).toLowerCase()] != null) return new Date(yr(m[3]), MON[m[2].slice(0, 3).toLowerCase()], +m[1]).getTime();
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) { let a = +m[1], b = +m[2]; if (!(a > 12 && b <= 12) && b > 12 && a <= 12) { const t = a; a = b; b = t; } return new Date(yr(m[3]), b - 1, a).getTime(); }
    const p = Date.parse(s); if (isNaN(p)) return null; const x = new Date(p); x.setHours(0, 0, 0, 0); return x.getTime();
  }
  gngPrio(p) {
    const x = String(p || '').toLowerCase();
    if (/block|critical|highest|sofort|1/.test(x) && !/high\b/.test(x)) return 'Blocker / Critical';
    if (/high|major|hoch|2/.test(x)) return 'High';
    if (/low|minor|niedrig|4|trivial/.test(x)) return 'Low';
    return 'Medium';
  }
  gngPhaseOf(d) {
    const m = String((d.labels || '') + ' ' + (d.environment || '') + ' ' + (d.release || '') + ' ' + (d.component || '') + ' ' + (d.summary || '')).match(/\b(DF-?1|IR-?1|IR-?2|IR-?3|QC-?1|PC-?1|UAT)\b/i);
    return m ? m[1].toUpperCase().replace('-', '') : null;
  }
  gngAgeDays(d) { const t = this.gngDate(d.created); return t == null ? null : Math.max(0, Math.round((Date.now() - t) / 864e5)); }

  gngModel() {
    const ENV = this.GNG.from;
    // Smoke tests are technical environment checks — not IR1 gate-relevant, excluded from the decision
    const allRows = (this.state.importedRows || []).filter(r => r.phase === ENV);
    const rows = allRows.filter(r => !this.isSmoke(r));
    const smokeRows = allRows.filter(r => this.isSmoke(r));
    const smokePlanned = smokeRows.reduce((a, r) => a + Number(r.planned || 0), 0);
    const cases = (this.state.importedCases || []).filter(c => !c.unex && c.phase === ENV && !this.isSmoke(c));
    const n = (v) => Number(v || 0);
    const agg = rows.reduce((a, r) => ({
      planned: a.planned + n(r.planned), tested: a.tested + n(r.tested), passed: a.passed + n(r.passed),
      failed: a.failed + n(r.failed), blocked: a.blocked + n(r.blocked), nr: a.nr + n(r.notRelevant),
    }), { planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0, nr: 0 });
    const planned = agg.planned, tested = agg.tested, passed = agg.passed, failed = agg.failed, blocked = agg.blocked;
    const execPct = planned ? Math.round(tested / planned * 100) : 0;
    const passPct = tested ? Math.round(passed / Math.max(1, tested - agg.nr) * 100) : 0;
    const open = Math.max(0, planned - tested);

    const defAll = this.state.jiraDefects || [];
    const defEnv = defAll.filter(d => { const p = this.gngPhaseOf(d); return !p || p === ENV; });
    const openDef = defEnv.filter(d => !this.gngClosed(d.status));
    const byP = { 'Blocker / Critical': 0, High: 0, Medium: 0, Low: 0 };
    openDef.forEach(d => { byP[this.gngPrio(d.priority)]++; });
    const blockers = openDef.filter(d => this.gngPrio(d.priority) === 'Blocker / Critical');
    // Agreed rule: open LOW defects are deferred and retested in QC1 — not IR1 gate-relevant
    const lowDef = openDef.filter(d => this.gngPrio(d.priority) === 'Low');
    const gateDef = openDef.filter(d => this.gngPrio(d.priority) !== 'Low');
    const gateTotal = defEnv.filter(d => this.gngPrio(d.priority) !== 'Low').length;
    const ages = gateDef.map(d => this.gngAgeDays(d)).filter(x => x != null);
    const avgAge = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;
    const aged = gateDef.filter(d => (this.gngAgeDays(d) || 0) > 14).length;
    const closedRate = gateTotal ? Math.round((gateTotal - gateDef.length) / gateTotal * 100) : 100;

    // criteria scorecard
    const mk = (name, target, actual, st, note) => ({ name, target, actual, st, note,
      stLabel: st === 'ok' ? 'MET' : st === 'warn' ? 'AT RISK' : 'NOT MET',
      stColor: st === 'ok' ? '#16a34a' : st === 'warn' ? '#d97706' : '#dc2626',
      stBg: st === 'ok' ? '#f0fdf4' : st === 'warn' ? '#fffbeb' : '#fef2f2' });
    const crit = [
      mk('Test execution completeness', '\u2265 95 % of planned runs executed', execPct + ' %  (' + tested + '/' + planned + ')',
        execPct >= 95 ? 'ok' : execPct >= 90 ? 'warn' : 'bad', open ? open + ' runs still open' : 'All planned runs executed'),
      mk('Pass rate of executed tests', '\u2265 95 % passed', passPct + ' %  (' + passed + ' passed)',
        passPct >= 95 ? 'ok' : passPct >= 90 ? 'warn' : 'bad', failed ? failed + ' test runs still failed' : 'No failing runs'),
      mk('Failed tests retested & green', '0 open failures', failed === 0 ? 'None open' : failed + ' open',
        failed === 0 ? 'ok' : failed <= 3 ? 'warn' : 'bad', 'Retest must turn every failure green'),
      mk('Blocked test cases', '0 blocked', blocked === 0 ? 'None' : blocked + ' blocked',
        blocked === 0 ? 'ok' : blocked <= 2 ? 'warn' : 'bad', blocked ? 'Blocking impediments to be cleared' : 'No impediments'),
      mk('Open Blocker / Critical defects', '0 open', byP['Blocker / Critical'] + ' open',
        byP['Blocker / Critical'] === 0 ? 'ok' : 'bad', 'Hard gate \u2014 no critical defect may travel to ' + this.GNG.to),
      mk('Open High defects', '\u2264 5 open', byP.High + ' open',
        byP.High <= 5 ? 'ok' : byP.High <= 10 ? 'warn' : 'bad', 'Remainder to be scheduled with fix plan'),
      mk('Defect closure rate (excl. Low)', '\u2265 80 % of gate-relevant defects closed', closedRate + ' %',
        closedRate >= 80 ? 'ok' : closedRate >= 60 ? 'warn' : 'bad', gateDef.length + ' of ' + gateTotal + ' still open'),
      mk('Low defects deferred to ' + this.GNG.to, 'agreed — retest in ' + this.GNG.to, lowDef.length + ' deferred',
        'ok', 'Not ' + ENV + ' gate-relevant per team agreement'),
      mk('Ageing defects (> 14 days)', 'none unattended', aged === 0 ? 'None' : aged + ' tickets',
        aged === 0 ? 'ok' : aged <= 3 ? 'warn' : 'warn', avgAge != null ? 'Average age ' + avgAge + ' days' : ''),
    ];
    const bad = crit.filter(c => c.st === 'bad').length, warn = crit.filter(c => c.st === 'warn').length;
    const hardFail = byP['Blocker / Critical'] > 0 || execPct < 90;
    const defGateOpen = gateDef.length;
    const verdict = (!planned) ? 'NO DATA' : hardFail || bad >= 3 ? 'NO-GO' : (bad || warn) ? 'CONDITIONAL GO' : 'GO';
    const vColor = verdict === 'GO' ? '#16a34a' : verdict === 'CONDITIONAL GO' ? '#d97706' : '#dc2626';
    const vText = verdict === 'GO'
      ? ENV + ' exit criteria are fully met. ' + this.GNG.to + ' may start as planned on ' + this.GNG.gate + '.'
      : verdict === 'CONDITIONAL GO'
      ? this.GNG.to + ' can start on ' + this.GNG.gate + ' provided the conditions on the next slide are closed and re-confirmed by the test lead.'
      : verdict === 'NO-GO'
      ? ENV + ' exit criteria are not met \u2014 entry into ' + this.GNG.to + ' is not recommended without a fix & retest cycle.'
      : 'No qTest data imported \u2014 the decision cannot be evidenced.';

    // team readiness
    const teams = {};
    rows.forEach(r => {
      const k = r.team || 'Unassigned';
      const o = teams[k] || (teams[k] = { name: k, planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0 });
      o.planned += n(r.planned); o.tested += n(r.tested); o.passed += n(r.passed); o.failed += n(r.failed); o.blocked += n(r.blocked);
    });
    const teamRows = Object.values(teams).sort((a, b) => b.planned - a.planned).slice(0, 9).map(t => {
      const ep = t.planned ? Math.round(t.tested / t.planned * 100) : 0;
      const st = (t.failed + t.blocked) > 0 ? 'bad' : ep >= 100 ? 'ok' : ep > 0 ? 'warn' : 'bad';
      return { ...t, execPct: ep, st, stColor: st === 'ok' ? '#16a34a' : st === 'warn' ? '#d97706' : '#dc2626',
        stLabel: (t.failed + t.blocked) > 0 ? 'Failures open' : ep >= 100 ? 'Complete' : ep > 0 ? 'Running' : 'Not started' };
    });

    // application readiness (scope apps active in this environment)
    const envIdx = { IR1: 0, QC1: 1, IR3: 2, PC1: 3 }[ENV];
    const appRows = this.APP_SCOPE.filter(a => envIdx == null || a.e[envIdx])
      .map(a => ({ a, s: this.scopeMatch(a, ENV, true) })).filter(x => x.s.any)
      .map(({ a, s }) => {
        const ep = s.planned ? Math.round(s.executed / s.planned * 100) : 0;
        const st = s.bad > 0 ? 'bad' : ep >= 100 ? 'ok' : ep > 0 ? 'warn' : 'bad';
        return { name: a.name, cc: a.cc, planned: s.planned, executed: s.executed, bad: s.bad, execPct: ep, st,
          stColor: st === 'ok' ? '#16a34a' : st === 'warn' ? '#d97706' : '#dc2626',
          stLabel: s.bad > 0 ? s.bad + ' failed/blocked' : ep >= 100 ? 'Green' : ep > 0 ? 'In progress' : 'Not started' };
      }).sort((x, y) => (y.bad - x.bad) || (x.execPct - y.execPct)).slice(0, 10);

    // top open defects
    const pOrder = { 'Blocker / Critical': 0, High: 1, Medium: 2, Low: 3 };
    const topDef = openDef.slice().sort((a, b) => (pOrder[this.gngPrio(a.priority)] - pOrder[this.gngPrio(b.priority)]) || ((this.gngAgeDays(b) || 0) - (this.gngAgeDays(a) || 0))).slice(0, 8)
      .map(d => ({ key: d.key || '\u2014', summary: String(d.summary || '').slice(0, 88), prio: this.gngPrio(d.priority),
        status: d.status || '\u2014', assignee: d.assignee || '\u2014', age: (this.gngAgeDays(d) != null ? this.gngAgeDays(d) + ' d' : '\u2014'),
        prioColor: this.gngPrio(d.priority) === 'Blocker / Critical' ? '#dc2626' : this.gngPrio(d.priority) === 'High' ? '#ea580c' : '#64748b' }));

    // defect course over the full IR1 phase window
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const dk = (v) => this.gngDate(v);
    const _ph = (this.PHASES_SCHED || []).find(p => p.id === this.GNG.from);
    const _mkD = (s) => { const p = String(s || '').split('-'); const x = new Date(+p[0], +p[1] - 1, +p[2]); x.setHours(0, 0, 0, 0); return x; };
    let cStart = _ph ? _mkD(_ph.start) : (() => { const x = new Date(t0); x.setDate(t0.getDate() - 13); return x; })();
    let cEnd = _ph ? _mkD(_ph.end) : new Date(t0);
    if (cEnd > t0) cEnd = new Date(t0);
    if (cStart > cEnd) cStart = new Date(cEnd);
    const days = []; for (let x = new Date(cStart); x <= cEnd; x.setDate(x.getDate() + 1)) days.push(new Date(x));
    const courseRange = days.length ? (days[0].toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) + ' \u2013 ' + days[days.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })) : '';
    const courseTitle = 'Defect course \u2013 ' + this.GNG.from + ' phase';
    const cM = {}, rM = {};
    const dFirst = days.length ? days[0].getTime() : null, dLast = days.length ? days[days.length - 1].getTime() : null;
    const inWin = (k) => k != null && dFirst != null && k >= dFirst && k <= dLast;
    // diagnostics — a zero resolved column must be attributable, never guessed
    let carriedIn = 0, closedTotal = 0, closedDated = 0, closedUndated = 0, closedOutside = 0;
    defEnv.forEach(d => {
      const c = dk(d.created);
      if (inWin(c)) cM[c] = (cM[c] || 0) + 1; else if (c != null) carriedIn++;
      if (!this.gngClosed(d.status)) return;
      closedTotal++;
      const r = dk(d.resolved) || dk(d.updated);
      if (r == null) { closedUndated++; return; }
      if (!inWin(r)) { closedOutside++; return; }
      closedDated++; rM[r] = (rM[r] || 0) + 1;
    });
    const courseNotes = [];
    if (carriedIn) courseNotes.push(carriedIn + ' carried in (created before the phase window)');
    if (closedUndated) courseNotes.push(closedUndated + ' closed without a resolution date in the export');
    if (closedOutside) courseNotes.push(closedOutside + ' closed outside the window');
    const courseSub = 'Created vs. resolved per day \u00b7 ' + courseRange + ' (' + days.length + ' days)';
    const courseDiag = defEnv.length + ' defects in scope \u00b7 ' + closedTotal + ' closed by status \u00b7 ' + closedDated + ' with a resolution date inside the window'
      + (courseNotes.length ? ' \u00b7 ' + courseNotes.join(' \u00b7 ') : '');
    const cArr = days.map(x => cM[x.getTime()] || 0), rArr = days.map(x => rM[x.getTime()] || 0);
    const peak = Math.max(1, ...cArr, ...rArr);
    const course = days.map((x, i) => ({ label: x.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }),
      c: cArr[i], r: rArr[i], cTxt: cArr[i] ? String(cArr[i]) : '', rTxt: rArr[i] ? String(rArr[i]) : '',
      cH: Math.round(cArr[i] / peak * 100), rH: Math.round(rArr[i] / peak * 100) }));
    const cSum = cArr.reduce((a, b) => a + b, 0), rSum = rArr.reduce((a, b) => a + b, 0);
    const trendNote = rSum > cSum ? 'Backlog shrinking \u2014 resolution outpaces new findings.'
      : rSum === cSum ? 'Backlog stable \u2014 inflow equals outflow.' : 'Backlog growing \u2014 new defects outpace fixes.';
    const trendColor = rSum > cSum ? '#16a34a' : rSum === cSum ? '#d97706' : '#dc2626';

    // conditions & risks
    const conds = [];
    if (byP['Blocker / Critical'] > 0) conds.push({ txt: 'Close or formally waive ' + byP['Blocker / Critical'] + ' open Blocker/Critical defect(s) before ' + this.GNG.gate + '.', st: 'bad' });
    if (failed > 0) conds.push({ txt: 'Retest ' + failed + ' failed test run(s) and confirm green results in qTest.', st: 'bad' });
    if (blocked > 0) conds.push({ txt: 'Clear ' + blocked + ' blocked test run(s) \u2014 environment/data impediments to be resolved.', st: 'warn' });
    if (open > 0) conds.push({ txt: 'Execute the remaining ' + open + ' planned test run(s) or de-scope them with documented rationale.', st: 'warn' });
    if (byP.High > 5) conds.push({ txt: byP.High + ' open High defects \u2014 fix plan with owner and date required per ticket.', st: 'warn' });
    if (aged > 0) conds.push({ txt: aged + ' defect(s) older than 14 days need re-triage or escalation.', st: 'warn' });
    if (lowDef.length) conds.push({ txt: lowDef.length + ' open Low defect(s) carried over to ' + this.GNG.to + ' for retest (agreed) — to be listed in the ' + this.GNG.to + ' entry scope.', st: 'info' });
    conds.push({ txt: this.GNG.to + ' entry checklist confirmed: environment available, test data loaded, transports imported.', st: 'info' });
    conds.push({ txt: 'Decision, conditions and owners minuted and distributed to the steering committee.', st: 'info' });
    const risks = (this.state.topics || this._defaultTopics()).slice(0, 5).map(t => ({
      level: t.level || 'Watch', title: t.title || '', text: String(t.text || '').slice(0, 150),
      color: /block|critical/i.test(t.level || '') ? '#dc2626' : /risk|warn/i.test(t.level || '') ? '#d97706' : '#2563eb' }));

    const hist = this.loadHistory()[0];
    const stamp = (ms) => ms ? new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'not imported';
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    return {
      env: ENV, next: this.GNG.to, gate: this.GNG.gate, today,
      smokePlanned, smokeExcluded: smokeRows.length > 0,
      scopeNote: smokeRows.length
        ? 'Scope: functional ' + ENV + ' tests only \u2014 ' + smokePlanned + ' smoke test run(s) excluded (technical environment check, not gate-relevant).'
        : 'Scope: functional ' + ENV + ' tests only \u2014 smoke tests are not gate-relevant.',
      qtestStamp: stamp(hist && hist.ts), jiraStamp: stamp(this.state.jiraSync),
      author: this.state.editorName || 'QA Test Management',
      planned, tested, passed, failed, blocked, open, execPct, passPct,
      defOpen: openDef.length, defTotal: defEnv.length, defGateOpen, defLowDeferred: lowDef.length, defBlockers: byP['Blocker / Critical'], defHigh: byP.High,
      defMed: byP.Medium, defLow: byP.Low, closedRate, avgAge: avgAge == null ? '\u2014' : avgAge + ' d', aged,
      crit, verdict, vColor, vText, teamRows, appRows, topDef, course, courseTitle, courseSub, courseDiag, courseRange, courseDays: days.length, cSum, rSum, trendNote, trendColor, conds, risks,
      blockerList: blockers.slice(0, 6).map(d => ({ key: d.key || '\u2014', summary: String(d.summary || '').slice(0, 70), status: d.status || '' })),
      hasData: planned > 0 || defEnv.length > 0,
    };
  }

  openGng = () => { if (!this.can('editor')) { console.warn('QA Cockpit: rejected \u2014 editor role required'); return; } this.setState({ gngOpen: true }); };
  closeGng = () => this.setState({ gngOpen: false });

  downloadGngPptx = async () => {
    if (!this.can('admin')) { this.setState({ gngMsg: 'Export is restricted to admins.' }); return; }
    const m = this.gngModel();
    if (!window.PptxGenJS) { this.setState({ gngMsg: 'PowerPoint engine not loaded \u2014 check your connection and retry.' }); return; }
    this.setState({ gngMsg: 'Building PowerPoint\u2026' });
    try {
      const P = new window.PptxGenJS();
      P.layout = 'LAYOUT_WIDE';   // 13.33 x 7.5 in — matches the coordinates used below
      P.author = m.author; P.company = 'QA Test Management'; P.title = m.env + ' Go / No-Go Decision';
      const NAVY = '0F172A', SLATE = '64748B', LINE = 'E2E8F0', ACC = '2563EB';
      const F = 'Arial';
      let LOGO = '';
      try { const _li = document.querySelector('img[src^="data:image/png"]'); LOGO = (_li && _li.src) || ''; } catch (er) {}
      const logoOnHead = (s) => {
        if (!LOGO) return;
        s.addShape(P.ShapeType.roundRect, { x: 11.68, y: 0.19, w: 1.15, h: 0.62, fill: { color: 'FFFFFF' }, rectRadius: 0.05 });
        s.addImage({ data: LOGO, x: 11.87, y: 0.3, w: 0.76, h: 0.4 });
      };
      const head = (s, t, sub) => {
        s.background = { color: 'FFFFFF' };
        s.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: NAVY } });
        s.addShape(P.ShapeType.rect, { x: 0, y: 1.0, w: 13.33, h: 0.05, fill: { color: '95C11F' } });
        s.addText(t, { x: 0.55, y: 0.16, w: 8.6, h: 0.38, fontFace: F, fontSize: 21, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle', wrap: false, fit: 'none' });
        if (sub) s.addText(sub, { x: 0.55, y: 0.58, w: 8.6, h: 0.28, fontFace: F, fontSize: 10.5, color: 'C7D2E5', margin: 0, valign: 'middle', wrap: false, fit: 'none' });
        s.addText(m.env + ' \u2192 ' + m.next + '  \u00b7  ' + m.today, { x: 8.2, y: 0.36, w: 3.3, h: 0.28, fontFace: F, fontSize: 10, color: '9FB0CC', align: 'right', margin: 0, valign: 'middle', wrap: false, fit: 'none' });
        logoOnHead(s);
      };
      const foot = (s, nr) => {
        s.addText('QA Test Management  \u00b7  SAP Upgrade 26.02.00  \u00b7  ' + m.env + ' Go/No-Go decision', { x: 0.55, y: 7.05, w: 8, h: 0.28, fontFace: F, fontSize: 8.5, color: SLATE, margin: 0 });
        s.addText(String(nr), { x: 12.3, y: 7.05, w: 0.5, h: 0.28, fontFace: F, fontSize: 8.5, color: SLATE, align: 'right' });
      };
      const kpi = (s, items, y) => {
        const L = 0.55, TOT = 13.33 - L * 2, gap = 0.16;
        const cw = (TOT - gap * (items.length - 1)) / items.length;
        items.forEach((it, i) => {
          const x = L + i * (cw + gap);
          s.addShape(P.ShapeType.roundRect, { x: x, y: y, w: cw, h: 1.22, fill: { color: 'F7F9FC' }, line: { color: LINE, width: 1 }, rectRadius: 0.06 });
          s.addText(String(it.v), { x: x + 0.14, y: y + 0.11, w: cw - 0.28, h: 0.48, fontFace: F, fontSize: 24, bold: true, color: (it.c || NAVY).replace('#', ''), margin: 0, valign: 'middle', wrap: false, fit: 'none' });
          s.addText(it.l.toUpperCase(), { x: x + 0.14, y: y + 0.63, w: cw - 0.28, h: 0.22, fontFace: F, fontSize: 8, bold: true, color: SLATE, charSpacing: 0.5, margin: 0, valign: 'middle', wrap: false, fit: 'none' });
          if (it.s) s.addText(it.s, { x: x + 0.14, y: y + 0.86, w: cw - 0.28, h: 0.24, fontFace: F, fontSize: 8, color: '94A3B8', margin: 0, valign: 'top', wrap: false, fit: 'none' });
        });
      };
      const table = (s, cols, rows, y, h) => {
        s.addTable([cols.map(c => ({ text: c.t, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 10, align: c.a || 'left' } }))]
          .concat(rows.map((r, ri) => r.map((cell, i) => ({
            text: String(cell.t), options: { color: (cell.c || '334155').replace('#', ''), bold: !!cell.b, fontSize: 10,
              align: cols[i].a || 'left', fill: { color: ri % 2 ? 'F7F9FC' : 'FFFFFF' } } })))),
          { x: 0.55, y: y, w: 12.23, colW: cols.map(c => c.w), rowH: h || 0.3, fontFace: F, margin: [2, 4, 2, 4],
            border: { type: 'solid', color: LINE, pt: 0.5 }, valign: 'middle', autoPage: false });
      };

      // 1 — cover
      let s = P.addSlide();
      s.background = { color: NAVY };
      s.addShape(P.ShapeType.rect, { x: 0, y: 3.05, w: 13.33, h: 0.07, fill: { color: '95C11F' } });
      if (LOGO) {
        s.addShape(P.ShapeType.roundRect, { x: 10.03, y: 0.6, w: 2.5, h: 1.32, fill: { color: 'FFFFFF' }, rectRadius: 0.08 });
        s.addImage({ data: LOGO, x: 10.32, y: 0.76, w: 1.92, h: 1.0 });
      }
      s.addText('SAP UPGRADE 26.02.00  \u00b7  QA TEST MANAGEMENT', { x: 0.8, y: 1.5, w: 11, h: 0.3, fontFace: F, fontSize: 12, color: '95C11F', bold: true, charSpacing: 2, margin: 0 });
      s.addText('Go / No-Go Decision', { x: 0.8, y: 1.95, w: 11, h: 0.7, fontFace: F, fontSize: 42, bold: true, color: 'FFFFFF' });
      s.addText('Exit ' + m.env + '  \u2192  Entry ' + m.next + '   \u00b7   Gate ' + m.gate, { x: 0.8, y: 2.6, w: 11, h: 0.4, fontFace: F, fontSize: 17, color: 'C7D2E5' });
      s.addShape(P.ShapeType.roundRect, { x: 0.8, y: 3.6, w: 4.2, h: 1.1, fill: { color: m.vColor.replace('#', '') }, rectRadius: 0.08 });
      s.addText('RECOMMENDATION', { x: 1.0, y: 3.72, w: 3.8, h: 0.25, fontFace: F, fontSize: 9, bold: true, color: 'FFFFFF', charSpacing: 1 });
      s.addText(m.verdict, { x: 1.0, y: 3.95, w: 3.8, h: 0.6, fontFace: F, fontSize: 26, bold: true, color: 'FFFFFF' });
      s.addText(m.vText, { x: 5.3, y: 3.6, w: 7.2, h: 1.1, fontFace: F, fontSize: 13, color: 'E2E8F0', valign: 'middle' });
      s.addText([
        { text: 'Prepared by ', options: { color: '8FA3CC' } }, { text: m.author + '\n', options: { color: 'FFFFFF', bold: true } },
        { text: 'qTest data ', options: { color: '8FA3CC' } }, { text: m.qtestStamp + '\n', options: { color: 'FFFFFF' } },
        { text: 'Jira defect data ', options: { color: '8FA3CC' } }, { text: m.jiraStamp, options: { color: 'FFFFFF' } },
      ], { x: 0.8, y: 5.2, w: 6, h: 1.2, fontFace: F, fontSize: 11, lineSpacing: 18 });
      s.addText(m.today, { x: 8.5, y: 6.1, w: 4, h: 0.3, fontFace: F, fontSize: 11, color: '8FA3CC', align: 'right' });

      // 2 — decision summary
      s = P.addSlide(); head(s, 'Decision at a glance', 'Evidence base for the ' + m.env + ' exit decision \u00b7 ' + m.scopeNote);
      kpi(s, [
        { l: 'Execution', v: m.execPct + '%', s: m.tested + ' of ' + m.planned + ' runs', c: m.execPct >= 95 ? '#16A34A' : '#D97706' },
        { l: 'Pass rate', v: m.passPct + '%', s: m.passed + ' passed', c: m.passPct >= 95 ? '#16A34A' : '#D97706' },
        { l: 'Failed / blocked', v: (m.failed + m.blocked), s: m.failed + ' failed \u00b7 ' + m.blocked + ' blocked', c: (m.failed + m.blocked) ? '#DC2626' : '#16A34A' },
        { l: 'Gate-relevant open', v: m.defGateOpen, s: m.defLowDeferred + ' Low deferred to ' + m.next, c: m.defGateOpen ? '#D97706' : '#16A34A' },
        { l: 'Blocker / Critical', v: m.defBlockers, s: 'hard gate', c: m.defBlockers ? '#DC2626' : '#16A34A' },
      ], 1.32);
      s.addShape(P.ShapeType.roundRect, { x: 0.55, y: 2.78, w: 12.23, h: 1.0, fill: { color: 'F7F9FC' }, line: { color: m.vColor.replace('#', ''), width: 1.5 }, rectRadius: 0.06 });
      s.addText(m.verdict, { x: 0.8, y: 2.96, w: 3, h: 0.6, fontFace: F, fontSize: 22, bold: true, color: m.vColor.replace('#', ''), valign: 'middle' });
      s.addText(m.vText, { x: 3.7, y: 2.96, w: 8.8, h: 0.65, fontFace: F, fontSize: 12, color: '334155', valign: 'middle' });
      table(s, [{ t: 'Signal', w: 4.2 }, { t: 'Reading', w: 4.0 }, { t: 'Assessment', w: 4.03 }], [
        [{ t: 'Test execution ' + m.env }, { t: m.tested + '/' + m.planned + ' runs (' + m.execPct + '%)' }, { t: m.open ? m.open + ' runs still open' : 'Complete', c: m.open ? '#D97706' : '#16A34A', b: true }],
        [{ t: 'Quality of executed tests' }, { t: m.passPct + '% pass \u00b7 ' + m.failed + ' failed \u00b7 ' + m.blocked + ' blocked' }, { t: (m.failed + m.blocked) ? 'Retest required' : 'Green', c: (m.failed + m.blocked) ? '#DC2626' : '#16A34A', b: true }],
        [{ t: 'Defect situation' }, { t: m.defGateOpen + ' gate-relevant open \u00b7 ' + m.defLowDeferred + ' Low deferred \u00b7 avg age ' + m.avgAge }, { t: m.defBlockers ? m.defBlockers + ' critical open' : 'No critical open', c: m.defBlockers ? '#DC2626' : '#16A34A', b: true }],
        [{ t: 'Defect trend (' + m.courseRange + ')' }, { t: m.cSum + ' created \u00b7 ' + m.rSum + ' resolved' }, { t: m.trendNote.split(' \u2014 ')[0], c: m.trendColor, b: true }],
      ], 4.05, 0.42);
      foot(s, 2);

      // 3 — exit criteria
      s = P.addSlide(); head(s, m.env + ' exit criteria scorecard', 'Agreed gate criteria measured against the imported qTest and Jira data \u00b7 ' + m.scopeNote);
      table(s, [{ t: 'Exit criterion', w: 3.9 }, { t: 'Target', w: 3.2 }, { t: 'Actual', w: 2.4 }, { t: 'Status', w: 1.5, a: 'center' }, { t: 'Note', w: 1.23 }],
        m.crit.map(c => [{ t: c.name, b: true }, { t: c.target }, { t: c.actual }, { t: c.stLabel, c: c.stColor, b: true }, { t: '' }]), 1.38, 0.5);
      m.crit.forEach((c, i) => { s.addText(c.note, { x: 11.6, y: 1.88 + i * 0.5, w: 1.18, h: 0.5, fontFace: F, fontSize: 7.5, color: SLATE, valign: 'middle' }); });
      foot(s, 3);

      // 4 — execution by team
      s = P.addSlide(); head(s, 'Test execution by team', m.env + ' \u00b7 planned vs. executed, failures and impediments');
      table(s, [{ t: 'Team', w: 4.0 }, { t: 'Planned', w: 1.4, a: 'right' }, { t: 'Executed', w: 1.4, a: 'right' }, { t: 'Passed', w: 1.4, a: 'right' }, { t: 'Failed', w: 1.3, a: 'right' }, { t: 'Blocked', w: 1.3, a: 'right' }, { t: 'Status', w: 1.43 }],
        m.teamRows.map(t => [{ t: t.name, b: true }, { t: t.planned }, { t: t.execPct + '% (' + t.tested + ')' }, { t: t.passed, c: '#16A34A' },
          { t: t.failed, c: t.failed ? '#DC2626' : '#94A3B8' }, { t: t.blocked, c: t.blocked ? '#D97706' : '#94A3B8' }, { t: t.stLabel, c: t.stColor, b: true }]), 1.38, 0.42);
      foot(s, 4);

      // 5 — application readiness
      s = P.addSlide(); head(s, 'Application readiness', 'Scope applications tested in ' + m.env);
      if (m.appRows.length) {
        table(s, [{ t: 'Application', w: 4.6 }, { t: 'Competence Center', w: 3.2 }, { t: 'Planned', w: 1.3, a: 'right' }, { t: 'Executed', w: 1.5, a: 'right' }, { t: 'Readiness', w: 1.63 }],
          m.appRows.map(a => [{ t: a.name, b: true }, { t: a.cc }, { t: a.planned }, { t: a.execPct + '% (' + a.executed + ')' }, { t: a.stLabel, c: a.stColor, b: true }]), 1.38, 0.44);
      } else {
        s.addText('No application-level mapping available in the current qTest export.', { x: 0.55, y: 1.6, w: 12, h: 0.4, fontFace: F, fontSize: 12, color: SLATE });
      }
      foot(s, 5);

      // 6 — defect situation
      s = P.addSlide(); head(s, 'Defect situation', 'Open defects attributable to ' + m.env);
      kpi(s, [
        { l: 'Open total', v: m.defOpen, s: m.defGateOpen + ' gate-relevant' },
        { l: 'Blocker / Critical', v: m.defBlockers, c: m.defBlockers ? '#DC2626' : '#16A34A' },
        { l: 'High', v: m.defHigh, c: m.defHigh > 5 ? '#D97706' : '#16A34A' },
        { l: 'Medium / Low', v: m.defMed + ' / ' + m.defLow, s: 'Low retested in ' + m.next },
        { l: 'Average age', v: m.avgAge, s: m.aged + ' older than 14 d' },
      ], 1.32);
      table(s, [{ t: 'Key', w: 1.5 }, { t: 'Summary', w: 5.9 }, { t: 'Priority', w: 1.7 }, { t: 'Status', w: 1.6 }, { t: 'Owner', w: 1.53 }],
        m.topDef.length ? m.topDef.map(d => [{ t: d.key, b: true }, { t: d.summary }, { t: d.prio, c: d.prioColor, b: true }, { t: d.status }, { t: d.assignee }])
          : [[{ t: '\u2014' }, { t: 'No open defects in the current Jira import.' }, { t: '' }, { t: '' }, { t: '' }]], 2.85, 0.42);
      foot(s, 6);

      // 7 — defect course
      s = P.addSlide(); head(s, m.courseTitle, m.courseSub);
      const bx = 0.75, bw = (11.9 / m.course.length), base = 5.1, maxH = 3.2;
      const lf = m.course.length > 20 ? 6.5 : 8, vf = m.course.length > 20 ? 7 : 8;
      m.course.forEach((d, i) => {
        const x = bx + i * bw;
        if (d.cH) s.addShape(P.ShapeType.rect, { x: x + 0.06, y: base - (d.cH / 100 * maxH), w: bw / 2 - 0.1, h: (d.cH / 100 * maxH), fill: { color: 'DC2626' } });
        if (d.rH) s.addShape(P.ShapeType.rect, { x: x + bw / 2 + 0.02, y: base - (d.rH / 100 * maxH), w: bw / 2 - 0.1, h: (d.rH / 100 * maxH), fill: { color: '16A34A' } });
        if (d.c) s.addText(String(d.c), { x: x + 0.02, y: base - (d.cH / 100 * maxH) - 0.24, w: bw / 2, h: 0.22, fontFace: F, fontSize: vf, bold: true, color: 'DC2626', align: 'center' });
        if (d.r) s.addText(String(d.r), { x: x + bw / 2 - 0.02, y: base - (d.rH / 100 * maxH) - 0.24, w: bw / 2, h: 0.22, fontFace: F, fontSize: vf, bold: true, color: '16A34A', align: 'center' });
        s.addText(d.label, { x: x - 0.1, y: base + 0.08, w: bw + 0.2, h: 0.3, fontFace: F, fontSize: lf, color: SLATE, align: 'center' });
        s.addText((d.c || 0) + ' / ' + (d.r || 0), { x: x - 0.1, y: base + 0.36, w: bw + 0.2, h: 0.26, fontFace: F, fontSize: lf, bold: true, color: '334155', align: 'center' });
      });
      s.addText('created / resolved', { x: 0.6, y: base + 0.62, w: 3, h: 0.24, fontFace: F, fontSize: 8, italic: true, color: SLATE });
      s.addShape(P.ShapeType.line, { x: 0.6, y: base, w: 12.2, h: 0, line: { color: LINE, width: 1 } });
      s.addShape(P.ShapeType.rect, { x: 0.75, y: 5.7, w: 0.2, h: 0.2, fill: { color: 'DC2626' } });
      s.addText('Created  ' + m.cSum, { x: 1.05, y: 5.66, w: 2.2, h: 0.28, fontFace: F, fontSize: 11, color: '334155' });
      s.addShape(P.ShapeType.rect, { x: 3.3, y: 5.7, w: 0.2, h: 0.2, fill: { color: '16A34A' } });
      s.addText('Resolved  ' + m.rSum, { x: 3.6, y: 5.66, w: 2.2, h: 0.28, fontFace: F, fontSize: 11, color: '334155' });
      s.addText(m.trendNote, { x: 6.2, y: 5.62, w: 6.6, h: 0.34, fontFace: F, fontSize: 12, bold: true, color: m.trendColor.replace('#', ''), align: 'right' });
      s.addText(m.courseDiag, { x: 0.75, y: 6.02, w: 12.05, h: 0.5, fontFace: F, fontSize: 8.5, color: SLATE, wrap: true, valign: 'top' });
      foot(s, 7);

      // 8 — conditions & risks
      s = P.addSlide(); head(s, 'Conditions & open risks', 'What must be true for ' + m.next + ' to start on ' + m.gate);
      s.addText('CONDITIONS FOR GO', { x: 0.55, y: 1.32, w: 6, h: 0.28, fontFace: F, fontSize: 10, bold: true, color: SLATE, charSpacing: 1 });
      m.conds.slice(0, 8).forEach((c, i) => {
        const col = c.st === 'bad' ? 'DC2626' : c.st === 'warn' ? 'D97706' : ACC;
        s.addShape(P.ShapeType.rect, { x: 0.55, y: 1.62 + i * 0.62, w: 0.05, h: 0.5, fill: { color: col } });
        s.addText(c.txt, { x: 0.75, y: 1.62 + i * 0.62, w: 6.1, h: 0.5, fontFace: F, fontSize: 11, color: '334155', valign: 'middle' });
      });
      s.addText('OPEN RISKS & TOPICS', { x: 7.1, y: 1.32, w: 5.7, h: 0.28, fontFace: F, fontSize: 10, bold: true, color: SLATE, charSpacing: 1 });
      m.risks.forEach((r, i) => {
        s.addShape(P.ShapeType.roundRect, { x: 7.1, y: 1.62 + i * 1.02, w: 5.7, h: 0.9, fill: { color: 'F7F9FC' }, line: { color: LINE, width: 1 }, rectRadius: 0.05 });
        s.addText(r.level.toUpperCase(), { x: 7.28, y: 1.72 + i * 1.02, h: 0.24, w: 2, fontFace: F, fontSize: 8, bold: true, color: r.color.replace('#', ''), charSpacing: 0.8 });
        s.addText(r.title, { x: 7.28, y: 1.95 + i * 1.02, w: 5.3, h: 0.26, fontFace: F, fontSize: 11, bold: true, color: NAVY });
        s.addText(r.text, { x: 7.28, y: 2.19 + i * 1.02, w: 5.3, h: 0.3, fontFace: F, fontSize: 8.5, color: SLATE });
      });
      foot(s, 8);

      // 9 — decision & sign-off
      s = P.addSlide(); head(s, 'Decision & sign-off', 'To be completed in the Go/No-Go meeting on ' + m.today);
      s.addShape(P.ShapeType.roundRect, { x: 0.55, y: 1.38, w: 12.23, h: 1.15, fill: { color: m.vColor.replace('#', '') }, rectRadius: 0.08 });
      s.addText('QA RECOMMENDATION', { x: 0.85, y: 1.53, w: 5, h: 0.25, fontFace: F, fontSize: 9, bold: true, color: 'FFFFFF', charSpacing: 1 });
      s.addText(m.verdict, { x: 0.85, y: 1.76, w: 4.5, h: 0.55, fontFace: F, fontSize: 24, bold: true, color: 'FFFFFF' });
      s.addText(m.vText, { x: 5.3, y: 1.53, w: 7.2, h: 0.9, fontFace: F, fontSize: 12, color: 'FFFFFF', valign: 'middle' });
      table(s, [{ t: 'Role', w: 3.4 }, { t: 'Name', w: 3.4 }, { t: 'Decision', w: 2.6, a: 'center' }, { t: 'Date / Signature', w: 2.83 }], [
        [{ t: 'Test Management', b: true }, { t: m.author }, { t: '\u25a1 Go   \u25a1 No-Go' }, { t: '' }],
        [{ t: 'Project Lead', b: true }, { t: '' }, { t: '\u25a1 Go   \u25a1 No-Go' }, { t: '' }],
        [{ t: 'Business / Key User', b: true }, { t: '' }, { t: '\u25a1 Go   \u25a1 No-Go' }, { t: '' }],
        [{ t: 'IT Operations', b: true }, { t: '' }, { t: '\u25a1 Go   \u25a1 No-Go' }, { t: '' }],
        [{ t: 'Steering Committee', b: true }, { t: '' }, { t: '\u25a1 Go   \u25a1 No-Go' }, { t: '' }],
      ], 2.95, 0.52);
      s.addText('Next milestone: ' + m.next + ' starts ' + m.gate + '  \u00b7  Decision valid on the data stamps shown on slide 1.',
        { x: 0.55, y: 5.9, w: 12.23, h: 0.3, fontFace: F, fontSize: 10, color: SLATE });
      foot(s, 9);

      await P.writeFile({ fileName: m.env + '-GoNoGo-Decision-' + new Date().toISOString().slice(0, 10) + '.pptx' });
      this.setState({ gngMsg: '\u2713 PowerPoint downloaded \u00b7 9 slides' });
    } catch (err) {
      this.setState({ gngMsg: 'Export failed \u2014 ' + (err && err.message ? err.message : 'unknown error') });
    }
  };

  loadQtestLinks() { try { const s = JSON.parse(this.lsGet('qa-qtest-links') || 'null'); return (s && typeof s === 'object') ? s : {}; } catch (e) { return {}; } }  loadQtestFolder() { try { return this.lsGet('qa-qtest-folder') || ''; } catch (e) { return ''; } }
  setQtestUrl = (e) => { if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; } const v = e.target.value; try { this.lsSet('qa-qtest-folder', v); } catch (_) {} this.setState({ qtestUrl: v }); };
  refreshFromQtest = async () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const url = (this.state.qtestUrl || '').trim();
    if (!url) { this.setState({ qsyncMsg: 'Paste your qTest folder URL for Rel. 26.02.00 first.', qsyncErr: true }); return; }
    if (!window.XLSX) { this.setState({ qsyncMsg: 'Spreadsheet engine not ready \u2014 try again in a moment.', qsyncErr: true }); return; }
    this.setState({ qsyncing: true, qsyncErr: false, qsyncMsg: 'Contacting qTest\u2026' });
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: 'array' });
      const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDataHead = (r) => r && (
        (r.some(c => norm(c) === 'directory') && r.some(c => norm(c) === 'status')) ||
        r.some(c => norm(c) === 'phase')
      );
      let grid = [], bestN = -1, bestHasHead = false;
      wb.SheetNames.forEach(n => {
        const g = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
        const hasHead = g.some(isDataHead);
        if ((hasHead && !bestHasHead) || (hasHead === bestHasHead && g.length > bestN)) {
          bestN = g.length; bestHasHead = hasHead; grid = g;
        }
      });
      const pseudo = { name: 'qTest \u00b7 Rel. ' + ((this.relSelected() || {}).version || '') };
      let hi = grid.findIndex(r => r && r.some(c => norm(c) === 'directory') && r.some(c => norm(c) === 'status'));
      if (hi >= 0) { this.parseQtest(grid, hi, pseudo); }
      else { hi = grid.findIndex(r => r && r.some(c => norm(c) === 'phase')); if (hi >= 0) this.parseTemplate(grid, hi, pseudo); else throw new Error('unrecognised'); }
      this.setState({ qsyncing: false, qsyncErr: false, qsyncMsg: '\u2713 Actualised from qTest \u00b7 ' + this.stamp() });
    } catch (err) {
      this.setState({ qsyncing: false, qsyncErr: true, qsyncMsg: 'Could not pull directly from qTest (browser CORS / login required, or the URL is a page rather than an export). Open the folder to sign in, or use \u201cImport XLS\u201d as a fallback.' });
    }
  };
  setQtestLink = (phaseId, testName) => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const key = phaseId + '||' + testName;
    const links = { ...(this.state.qtestLinks || this.loadQtestLinks()) };
    const cur = links[key] || '';
    const v = window.prompt('qTest link for "' + testName + '" (' + phaseId + ').\nPaste the qTest test-suite / module URL. Leave blank to remove.', cur);
    if (v === null) return;
    const url = v.trim();
    if (url) links[key] = url; else delete links[key];
    try { this.lsSet('qa-qtest-links', JSON.stringify(links)); } catch (e) {}
    this.setState({ qtestLinks: links });
  };
  saveQtestManager = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const draft = this._qtestDraft || {};
    const links = { ...(this.state.qtestLinks || {}) };
    Object.keys(draft).forEach(k => { const v = (draft[k] || '').trim(); if (v) links[k] = v; else delete links[k]; });
    try { this.lsSet('qa-qtest-links', JSON.stringify(links)); } catch (e) {}
    this.setState({ qtestLinks: links, qtestModal: false });
  };
  loadDefects() { try { const s = JSON.parse(this.lsGet('qa-jira-defects') || 'null'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  loadDefectNotes() { try { const o = JSON.parse(this.lsGet('qa-defect-notes') || 'null'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
  setDefectNote = (key, text) => {
    if (!key || !this.can('editor')) return;
    const notes = { ...(this.state.defectNotes || {}) };
    const t = String(text || '').trim();
    if (t) notes[key] = t; else delete notes[key];
    try { this.lsSet('qa-defect-notes', JSON.stringify(notes)); } catch (e) {}
    this.setState({ defectNotes: notes });
  };
  clearDefects = () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    try {
      this.lsDel('qa-jira-defects'); this.lsDel('qa-jira-file'); this.lsDel('qa-jira-sync');
      this.lsDel('qa-history'); this.lsDel('qa-cases-latest');
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('qa-defects-sync', { detail: [] })); } catch (e) {}
    this.setState({ jiraDefects: [], jiraFile: '', jiraSync: 0, jiraError: '',
      history: [], importedRows: null, importedCases: [], importedApps: [], viewingTs: null, importInfo: 'No data imported yet' });
  };
  loadJiraBase() { try { return this.lsGet('qa-jira-base') || ''; } catch (e) { return ''; } }
  jiraTicketUrl(base, key) {
    const b = String(base || '').trim();
    try { const u = new URL(b); if (/\/browse\//i.test(u.pathname)) return b.replace(/\/+$/, '') + '/' + key; return u.origin + '/browse/' + key; } catch (e) {}
    return b.replace(/\/+$/, '') + '/' + key;
  }
  openJira = (key) => {
    if (!key) return;
    let base = this.state.jiraBase || this.loadJiraBase();
    if (!base) {
      if (!this.can('editor')) { window.alert('Ask an editor/admin to set the Jira base URL first (click a ticket while signed in).'); return; }
      const v = window.prompt('One-time setup: paste your Jira base URL (any page from your Jira is fine).\nExample: https://jira.datpool.net/browse/', 'https://jira.datpool.net/browse/');
      if (v === null) return;
      const t = v.trim(); if (!t) return;
      base = t.replace(/\/+$/, '') + '/';
      try { this.lsSet('qa-jira-base', base); } catch (e) {}
      this.setState({ jiraBase: base });
    }
    window.open(this.jiraTicketUrl(base, key), '_blank', 'noopener');
  };
  setJiraBase = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const cur = this.state.jiraBase || this.loadJiraBase();
    const v = window.prompt('Jira browse base URL — the issue key is appended to it.\nExample: https://yourcompany.atlassian.net/browse/', cur || 'https://.atlassian.net/browse/');
    if (v === null) return;
    const t = v.trim();
    const base = t ? (t.replace(/\/+$/, '') + '/') : '';
    try { this.lsSet('qa-jira-base', base); } catch (e) {}
    this.setState({ jiraBase: base });
  };
  setJiraUrlInput = (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const v = e.target.value;
    const base = v.trim() ? (v.trim().replace(/\/+$/, '') + '/') : '';
    try { this.lsSet('qa-jira-base', base); } catch (er) {}
    this.setState({ jiraBaseDraft: v, jiraBase: base });
  };
  parseCsv(text) {
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
      else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; } else if (c !== '\r') field += c; }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length && r.some(c => String(c).trim() !== ''));
  }
  // Jira CSV headers vary by language and export flavour — match exact, then alias, then substring.
  jiraCols(head) {
    const ALIAS = {
      key: ['issuekey','key','vorgangsschlssel','schlssel','ticket','ticketkey'],
      summary: ['summary','zusammenfassung','titel','title','subject','betreff','kurzbeschreibung'],
      status: ['status','statusname','vorgangsstatus'],
      priority: ['priority','prioritt','prioritat','prio','prioritys','prioritaet'],
      assignee: ['assignee','assigneename','assigneedisplayname','assignedto','bearbeiter','zugewiesenan','zugewiesen','verantwortlicher','zustndiger'],
      reporter: ['reporter','reportername','reporterdisplayname','creator','autor','ersteller','melder','berichterstatter'],
      created: ['created','createddate','erstellt','erstellungsdatum','erstelltam','angelegtam'],
      updated: ['updated','updateddate','aktualisiert','zuletztaktualisiert','geandertam','gendertam'],
      resolved: ['resolved','resolutiondate','resolutiondated','erledigt','gelst','geloest','behoben','abgeschlossenam'],
      resolution: ['resolution','lsung','loesung','erledigungsart'],
      environment: ['environment','customfieldenvironment','umgebung'],
      issuetype: ['issuetype','type','vorgangstyp','vorgangsart','tickettyp'],
      component: ['components','component','komponenten','komponente','customfieldgcteam','gcteam','team'],
      release: ['fixversions','fixversion','release','releaseversion','zielversion','behobeninversion'],
    };
    const SUB = {
      key: ['issuekey','schlssel'], summary: ['summary','zusammenfassung','titel'],
      assignee: ['assignee','bearbeiter','zugewiesen'], reporter: ['reporter','autor','ersteller','melder'],
      status: ['status'], priority: ['priorit'], created: ['created','erstellt','angelegt'],
      updated: ['updated','aktualis','gendert'], resolved: ['resolutiondate','resolved','erledigt','behoben'],
      resolution: ['resolution'], environment: ['environment','umgebung'],
      issuetype: ['issuetype','vorgangstyp','vorgangsart'], component: ['component','komponent','gcteam'],
      release: ['fixversion','zielversion','release'],
    };
    const ci = {}; const src = {};
    Object.keys(ALIAS).forEach(f => {
      let ix = -1, how = '';
      for (const n of ALIAS[f]) { const i = head.indexOf(n); if (i >= 0) { ix = i; how = 'exact'; break; } }
      if (ix < 0) for (const p of (SUB[f] || [])) { const i = head.findIndex(h => h.indexOf(p) >= 0); if (i >= 0) { ix = i; how = 'fuzzy'; break; } }
      ci[f] = ix; src[f] = how;
    });
    ci._src = src;
    ci._missing = Object.keys(ALIAS).filter(f => ci[f] < 0);
    return ci;
  }
  // Parses one Jira CSV export into defect rows — shared by the QC1 import and the IR1 carry-over import.
  jiraDefectsFromText(text) {
      {
        const grid = this.parseCsv(String(text || ''));
        if (grid.length < 2) throw new Error('Empty CSV');
        const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const head = grid[0].map(norm);
        const find = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
        const labelCols = head.map((h, i) => h === 'labels' ? i : -1).filter(i => i >= 0);
        const findStart = (p) => head.findIndex(h => h.indexOf(p) === 0);
        const ci = this.jiraCols(head);
        const linkCols = head.map((h, i) => (h.indexOf('outwardissuelink') === 0 || h.indexOf('inwardissuelink') === 0 || h.indexOf('issuelink') === 0 || h === 'links' || (h.indexOf('link') >= 0 && h.indexOf('hyperlink') < 0)) ? i : -1).filter(i => i >= 0);
        if (ci.key < 0 && ci.summary < 0) throw new Error('No Issue key / Summary column — is this a Jira CSV export?');
        const g = (r, k) => (ci[k] >= 0 ? (r[ci[k]] || '') : '');
        const defects = [];
        for (let i = 1; i < grid.length; i++) {
          const r = grid[i]; if (!r) continue;
          const key = String(g(r, 'key')).trim(); const summary = String(g(r, 'summary')).trim();
          if (!key && !summary) continue;
          defects.push({ key, summary, status: String(g(r, 'status')).trim() || 'Unknown', priority: String(g(r, 'priority')).trim() || 'Unprioritized',
            assignee: String(g(r, 'assignee')).trim() || 'Unassigned', reporter: String(g(r, 'reporter')).trim() || '—',
            created: String(g(r, 'created')).trim(), updated: String(g(r, 'updated')).trim(), resolved: String(g(r, 'resolved')).trim(),
            environment: String(g(r, 'environment')).trim(), component: String(g(r, 'component')).trim(), release: String(g(r, 'release')).trim(),
            labels: labelCols.map(ix => String(r[ix] || '').trim()).filter(Boolean).join(', '),
            links: linkCols.map(ix => String(r[ix] || '').trim()).filter(Boolean).join(' '),
            issueType: String(g(r, 'issuetype')).trim() || 'Bug',
            resolution: String(g(r, 'resolution')).trim(),
            refText: (function () {
              const all = r.map(c => String(c == null ? '' : c)).join(' ');
              const out = (all.match(/\b(?:TR|TC)[\s\-#:]*\d{2,}\b/gi) || []).slice();
              let mm; const uRe = /test-?runs?[\/=#\s:]*(\d{2,})/gi;   // qTest deep links / "test run 68744"
              while ((mm = uRe.exec(all))) out.push('TR-' + mm[1]);
              const cRe = /test-?(?:case|fall)s?[\/=#\s:]*(\d{2,})/gi;
              while ((mm = cRe.exec(all))) out.push('TC-' + mm[1]);
              return Array.from(new Set(out.map(s => s.toUpperCase()))).join(' ');
            })() });
        }
        if (!defects.length) throw new Error('No defect rows found');
        const _watch = ['summary','assignee','reporter','created','priority','status'];
        const _rawHead = grid[0] || [];
        const _map = _watch.map(f => f + ' \u2192 ' + (ci[f] >= 0 ? '\u201c' + String(_rawHead[ci[f]] || '').trim() + '\u201d' + (ci._src[f] === 'fuzzy' ? ' (fuzzy)' : '') : 'not found'));
        const _miss = _watch.filter(f => ci[f] < 0);
        return { defects, warn: _miss.length ? ('Columns not found: ' + _miss.join(', ') + ' \u00b7 mapping: ' + _map.join(' \u00b7 ')) : '' };
      }
  }
  onCsvFile = (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const res = this.jiraDefectsFromText(ev.target.result);
        const defects = res.defects;
        const __sync = Date.now(); try { this.lsSet('qa-jira-defects', JSON.stringify(defects)); this.lsSet('qa-jira-file', file.name); this.lsSet('qa-jira-sync', String(__sync)); } catch (er) {}
        this.setState({ jiraDefects: defects, jiraFile: file.name, jiraSync: __sync, jiraError: '', jiraWarn: res.warn });
        try { window.dispatchEvent(new CustomEvent('qa-defects-sync', { detail: defects })); } catch (e) {}
      } catch (err) { this.setState({ jiraError: err.message }); }
    };
    reader.onerror = () => this.setState({ jiraError: 'Could not read file' });
    reader.readAsText(file);
  };
  loadBacklog() { try { const s = JSON.parse(this.lsGet('qa-jira-backlog') || 'null'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  loadBacklogFlags() { try { const s = JSON.parse(this.lsGet('qa-jira-backlog-flags') || 'null'); return (s && typeof s === 'object') ? s : {}; } catch (e) { return {}; } }
  toggleBacklogFlag = (key) => {
    if (!key) return;
    const flags = this.loadBacklogFlags();
    if (flags[key]) delete flags[key]; else flags[key] = true;
    try { this.lsSet('qa-jira-backlog-flags', JSON.stringify(flags)); } catch (er) {}
    this.forceUpdate();
  };
  clearBacklog = () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    try { this.lsDel('qa-jira-backlog'); this.lsDel('qa-jira-backlog-file'); } catch (e) {}
    this.setState({ backlogData: [], backlogFile: '', backlogError: '' });
  };
  loadTcf() { try { const s = JSON.parse(this.lsGet('qa-tcf-issues') || 'null'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  clearTcf = () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    try { this.lsDel('qa-tcf-issues'); this.lsDel('qa-tcf-file'); } catch (e) {}
    this.setState({ tcfData: [], tcfFile: '', tcfError: '' });
  };
  onTcfCsvFile = (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const grid = this.parseCsv(String(ev.target.result || ''));
        if (grid.length < 2) throw new Error('Leere CSV-Datei');
        const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const head = grid[0].map(norm);
        const find = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
        const findStart = (p) => head.findIndex(h => h.indexOf(p) === 0);
        const labelCols = head.map((h, i) => h === 'labels' ? i : -1).filter(i => i >= 0);
        const ci = {
          key: find('issuekey', 'key'), summary: find('summary'), status: find('status'),
          assignee: find('assignee'), created: find('created'), updated: find('updated'),
          component: (find('components', 'component') >= 0 ? find('components', 'component') : (find('customfieldgcteam', 'gcteam', 'team') >= 0 ? find('customfieldgcteam', 'gcteam', 'team') : (findStart('component') >= 0 ? findStart('component') : findStart('customfieldgcteam')))),
          issuetype: find('issuetype', 'type'), parent: find('parent', 'parentid', 'parentkey', 'parentsummary'),
        };
        if (ci.key < 0 && ci.summary < 0) throw new Error('Keine Spalte "Issue key" / "Summary" gefunden — ist das ein Jira-CSV-Export?');
        const g = (r, k) => (ci[k] >= 0 ? (r[ci[k]] || '') : '');
        const rows = [];
        for (let i = 1; i < grid.length; i++) {
          const r = grid[i]; if (!r) continue;
          const key = String(g(r, 'key')).trim(); const summary = String(g(r, 'summary')).trim();
          if (!key && !summary) continue;
          rows.push({ key, summary, status: String(g(r, 'status')).trim() || 'Unknown',
            assignee: String(g(r, 'assignee')).trim() || 'Unassigned',
            created: String(g(r, 'created')).trim(), updated: String(g(r, 'updated')).trim(),
            component: String(g(r, 'component')).trim(), parent: String(g(r, 'parent')).trim(),
            labels: labelCols.map(ix => String(r[ix] || '').trim()).filter(Boolean).join(', '),
            issueType: String(g(r, 'issuetype')).trim() || 'Task' });
        }
        if (!rows.length) throw new Error('Keine Task-/Sub-Task-Zeilen gefunden');
        const prev = (this.state.tcfData && this.state.tcfData.length) ? this.state.tcfData : this.loadTcf();
        const byKey = {}; const merged = [];
        prev.concat(rows).forEach(r => { const k = (r.key || r.summary || '').toUpperCase();
          if (k && byKey[k] != null) { merged[byKey[k]] = r; return; }
          if (k) byKey[k] = merged.length; merged.push(r); });
        const prevFiles = (this.state.tcfFile || (function () { try { return this.lsGet('qa-tcf-file') || ''; } catch (e) { return ''; } })())
          .split(' + ').map(s => s.trim()).filter(Boolean);
        if (prevFiles.indexOf(file.name) < 0) prevFiles.push(file.name);
        const fileLabel = prevFiles.join(' + ');
        try { this.lsSet('qa-tcf-issues', JSON.stringify(merged)); this.lsSet('qa-tcf-file', fileLabel); } catch (er) {}
        this.setState({ tcfData: merged, tcfFile: fileLabel, tcfError: '' });
      } catch (err) { this.setState({ tcfError: err.message }); }
    };
    reader.onerror = () => this.setState({ tcfError: 'Datei konnte nicht gelesen werden' });
    reader.readAsText(file);
    try { e.target.value = ''; } catch (er) {}
  };
  onBacklogCsvFile = (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const grid = this.parseCsv(String(ev.target.result || ''));
        if (grid.length < 2) throw new Error('Empty CSV');
        const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        const head = grid[0].map(norm);
        const find = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
        const labelCols = head.map((h, i) => h === 'labels' ? i : -1).filter(i => i >= 0);
        const findStart = (p) => head.findIndex(h => h.indexOf(p) === 0);
        const ci = this.jiraCols(head);
        const linkCols = head.map((h, i) => (h.indexOf('outwardissuelink') === 0 || h.indexOf('inwardissuelink') === 0 || h.indexOf('issuelink') === 0 || h === 'links' || (h.indexOf('link') >= 0 && h.indexOf('hyperlink') < 0)) ? i : -1).filter(i => i >= 0);
        if (ci.key < 0 && ci.summary < 0) throw new Error('No Issue key / Summary column — is this a Jira CSV export?');
        const g = (r, k) => (ci[k] >= 0 ? (r[ci[k]] || '') : '');
        const rows = [];
        for (let i = 1; i < grid.length; i++) {
          const r = grid[i]; if (!r) continue;
          const key = String(g(r, 'key')).trim(); const summary = String(g(r, 'summary')).trim();
          if (!key && !summary) continue;
          rows.push({ key, summary, status: String(g(r, 'status')).trim() || 'Unknown', priority: String(g(r, 'priority')).trim() || 'Unprioritized',
            assignee: String(g(r, 'assignee')).trim() || 'Unassigned', reporter: String(g(r, 'reporter')).trim() || '—',
            created: String(g(r, 'created')).trim(), updated: String(g(r, 'updated')).trim(),
            component: String(g(r, 'component')).trim(), release: String(g(r, 'release')).trim(),
            labels: labelCols.map(ix => String(r[ix] || '').trim()).filter(Boolean).join(', '),
            links: linkCols.map(ix => String(r[ix] || '').trim()).filter(Boolean).join(' '),
            issueType: String(g(r, 'issuetype')).trim() || 'Story' });
        }
        if (!rows.length) throw new Error('No Story/Bug rows found');
        try { this.lsSet('qa-jira-backlog', JSON.stringify(rows)); this.lsSet('qa-jira-backlog-file', file.name); } catch (er) {}
        this.setState({ backlogData: rows, backlogFile: file.name, backlogError: '' });
      } catch (err) { this.setState({ backlogError: err.message }); }
    };
    reader.onerror = () => this.setState({ backlogError: 'Could not read file' });
    reader.readAsText(file);
  };
  // Shared by every defect export so the three formats never drift apart.
  _defectExportCols() {
    return [
      { k: 'key', h: 'Issue key', w: 14 },
      { k: 'summary', h: 'Summary', w: 62 },
      { k: 'status', h: 'Status', w: 16 },
      { k: 'priority', h: 'Priority', w: 12 },
      { k: 'assignee', h: 'Assignee', w: 20 },
      { k: 'reporter', h: 'Reporter', w: 20 },
      { k: 'created', h: 'Created', w: 18 },
      { k: 'updated', h: 'Updated', w: 18 },
      { k: 'resolved', h: 'Resolved', w: 18 },
      { k: 'environment', h: 'Environment', w: 14 },
      { k: 'component', h: 'Component', w: 18 },
      { k: 'release', h: 'Fix version', w: 14 },
      { k: 'labels', h: 'Labels', w: 20 },
      { k: 'resolution', h: 'Resolution', w: 16 },
      { k: 'rt', h: 'Retest', w: 12 },
      { k: 'rtRuns', h: 'Retest runs', w: 12 },
      { k: 'rtBasis', h: 'Retest basis', w: 18 },
    ];
  }
  _defectExportName(ext) {
    const c = this._defectCtx || {};
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    return 'Defects_' + String(c.release || 'release').replace(/[^\w.-]/g, '') + '_' + stamp + '.' + ext;
  }

  exportDefectsXlsx = () => {
    const list = this._filteredDefects || this.state.jiraDefects || [];
    if (!window.XLSX) { this.setState({ jiraError: 'Spreadsheet engine not ready — try again in a moment.' }); return; }
    if (!list.length) { this.setState({ jiraError: 'Nothing to export — no defects match the current filters.' }); return; }
    const X = window.XLSX, c = this._defectCtx || {}, cols = this._defectExportCols();
    const wb = X.utils.book_new();

    // Sheet 1 — the rows exactly as filtered on screen
    const aoa = [cols.map(x => x.h)].concat(list.map(d => cols.map(x => {
      const v = d[x.k]; return v == null ? '' : String(v);
    })));
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map(x => ({ wch: x.w }));
    // (frozen panes are a SheetJS Pro feature — the bundled build ignores them)
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: cols.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws, 'Defects');

    // Sheet 2 — the context, so the file still makes sense a month later
    const sum = [
      ['QA Defect Export'], [],
      ['Release', c.release || '—'],
      ['Environment', (c.environment || '—') + (c.phase ? ' · ' + c.phase : '')],
      ['Exported', new Date().toLocaleString('en-GB')],
      ['Source file', c.jiraFile || '—'],
      ['Filters applied', c.filterNote || 'none'],
      [],
      ['Rows in this export', list.length],
      ['Defects in release', c.total || 0],
      ['Open', c.open || 0],
      ['Closed & Ready for Transport', c.closed || 0],
      [], ['By priority', 'Count'],
      ['Critical / Highest', (c.prCnt && c.prCnt.Highest) || 0],
      ['High', (c.prCnt && c.prCnt.High) || 0],
      ['Medium', (c.prCnt && c.prCnt.Medium) || 0],
      ['Low', (c.prCnt && c.prCnt.Low) || 0],
    ];
    if ((c.statusCounts || []).length) {
      sum.push([], ['By status', 'Count']);
      c.statusCounts.forEach(x => sum.push([x.name, x.count]));
    }
    const ws2 = X.utils.aoa_to_sheet(sum);
    ws2['!cols'] = [{ wch: 26 }, { wch: 46 }];
    X.utils.book_append_sheet(wb, ws2, 'Summary');

    X.writeFile(wb, this._defectExportName('xlsx'));
    this.setState({ jiraError: '' });
  };

  exportDefectsPptx = async () => {
    const list = this._filteredDefects || this.state.jiraDefects || [];
    if (!window.PptxGenJS) { this.setState({ jiraError: 'PowerPoint engine not loaded — check your connection and retry.' }); return; }
    if (!list.length) { this.setState({ jiraError: 'Nothing to export — no defects match the current filters.' }); return; }
    const c = this._defectCtx || {};
    const P = new window.PptxGenJS();
    P.layout = 'LAYOUT_WIDE';
    P.author = this.state.editorName || 'QA Test Management';
    P.company = 'QA Test Management';
    P.title = 'Defect Status ' + (c.release || '');
    const NAVY = '0F172A', SLATE = '64748B', LINE = 'E2E8F0', F = 'Arial';
    let LOGO = '';
    try { const li = document.querySelector('img[src^="data:image/png"]'); LOGO = (li && li.src) || ''; } catch (e) {}
    const head = (s, t, sub) => {
      s.background = { color: 'FFFFFF' };
      s.addShape(P.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: NAVY } });
      s.addShape(P.ShapeType.rect, { x: 0, y: 1.0, w: 13.33, h: 0.05, fill: { color: '95C11F' } });
      s.addText(t, { x: 0.55, y: 0.16, w: 8.6, h: 0.38, fontFace: F, fontSize: 21, bold: true, color: 'FFFFFF', margin: 0, valign: 'middle' });
      s.addText(sub, { x: 0.55, y: 0.56, w: 10.6, h: 0.3, fontFace: F, fontSize: 11, color: 'A8B4C8', margin: 0, valign: 'middle' });
      if (LOGO) {
        s.addShape(P.ShapeType.roundRect, { x: 11.68, y: 0.19, w: 1.15, h: 0.62, fill: { color: 'FFFFFF' }, rectRadius: 0.05 });
        s.addImage({ data: LOGO, x: 11.87, y: 0.3, w: 0.76, h: 0.4 });
      }
    };
    const ctx = (c.release || '—') + '  ·  ' + (c.environment || '—') + (c.phase ? ' · ' + c.phase : '')
      + '  ·  ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // ── slide 1: the numbers ──
    const s1 = P.addSlide();
    head(s1, 'Defect Status', ctx + (c.filterNote ? '   ·   ' + c.filterNote : ''));
    const kpi = [
      { l: 'Total defects', v: c.total || 0, col: NAVY },
      { l: 'Open', v: c.open || 0, col: 'DC2626' },
      { l: 'Closed & Ready for Transport', v: c.closed || 0, col: '16A34A' },
      { l: 'Critical', v: (c.prCnt && c.prCnt.Highest) || 0, col: 'B91C1C' },
      { l: 'High', v: (c.prCnt && c.prCnt.High) || 0, col: 'EA580C' },
    ];
    kpi.forEach((k, i) => {
      const x = 0.55 + i * 2.5;
      s1.addShape(P.ShapeType.roundRect, { x, y: 1.5, w: 2.3, h: 1.5, fill: { color: 'F8FAFC' }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
      s1.addText(String(k.v), { x, y: 1.68, w: 2.3, h: 0.72, fontFace: F, fontSize: 34, bold: true, color: k.col, align: 'center', margin: 0 });
      s1.addText(k.l, { x, y: 2.42, w: 2.3, h: 0.5, fontFace: F, fontSize: 11, color: SLATE, align: 'center', valign: 'top', margin: 0 });
    });
    const rows = [[
      { text: 'Status', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      { text: 'Count', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, align: 'right' } },
    ]].concat((c.statusCounts || []).filter(x => x.count > 0).map(x => [
      { text: x.name, options: { color: '1F2937' } },
      { text: String(x.count), options: { align: 'right', color: '1F2937' } },
    ]));
    if (rows.length > 1) {
      s1.addText('Breakdown by status', { x: 0.55, y: 3.3, w: 6, h: 0.3, fontFace: F, fontSize: 13, bold: true, color: NAVY, margin: 0 });
      s1.addTable(rows, { x: 0.55, y: 3.7, w: 6.0, fontFace: F, fontSize: 11, border: { pt: 0.5, color: LINE }, rowH: 0.3 });
    }
    s1.addText('Source: ' + (c.jiraFile || 'Jira import') + '  ·  ' + list.length + ' rows in this export',
      { x: 0.55, y: 7.0, w: 12.2, h: 0.3, fontFace: F, fontSize: 9, color: SLATE, margin: 0 });

    // ── slide 2+: the open defects that matter, worst first ──
    const rank = { Highest: 0, High: 1, Medium: 2, Low: 3 };
    const pOf = (d) => { const v = String(d.priority || '').toLowerCase();
      return v.indexOf('highest') >= 0 || v.indexOf('critical') >= 0 || v.indexOf('blocker') >= 0 ? 'Highest'
        : v.indexOf('high') >= 0 ? 'High' : v.indexOf('low') >= 0 ? 'Low' : 'Medium'; };
    const top = list.slice().sort((a, b) => rank[pOf(a)] - rank[pOf(b)]).slice(0, 36);
    const PER = 12;
    for (let i = 0; i < top.length; i += PER) {
      const chunk = top.slice(i, i + PER);
      const s = P.addSlide();
      head(s, 'Defects' + (top.length > PER ? '  ' + (Math.floor(i / PER) + 1) + '/' + Math.ceil(top.length / PER) : ''),
        ctx + '   ·   highest priority first');
      const body = [[
        { text: 'Key', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Summary', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Priority', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Status', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
        { text: 'Assignee', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY } } },
      ]].concat(chunk.map(d => {
        const pb = pOf(d);
        const pc = pb === 'Highest' ? 'B91C1C' : pb === 'High' ? 'EA580C' : pb === 'Medium' ? 'B45309' : '4D7C0F';
        return [
          { text: String(d.key || '—'), options: { color: '1D4ED8', bold: true } },
          { text: String(d.summary || '—').slice(0, 110), options: { color: '1F2937' } },
          { text: String(d.priority || '—'), options: { color: pc, bold: true } },
          { text: String(d.status || '—'), options: { color: '374151' } },
          { text: String(d.assignee || '—'), options: { color: '374151' } },
        ];
      }));
      s.addTable(body, { x: 0.55, y: 1.35, w: 12.2, colW: [1.35, 6.2, 1.35, 1.75, 1.55],
        fontFace: F, fontSize: 10, border: { pt: 0.5, color: LINE }, rowH: 0.36, valign: 'middle', autoPage: false });
    }
    try { await P.writeFile({ fileName: this._defectExportName('pptx') }); this.setState({ jiraError: '' }); }
    catch (e) { this.setState({ jiraError: 'PowerPoint export failed: ' + e.message }); }
  };

  exportDefectsCsv = () => {
    const list = this._filteredDefects || this.state.jiraDefects || [];
    const cols = ['key', 'summary', 'status', 'priority', 'assignee', 'reporter', 'created', 'updated', 'resolved', 'environment', 'component', 'release', 'labels', 'resolution', 'rt', 'rtRuns', 'rtBasis'];
    const esc = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const csv = [cols.join(',')].concat(list.map(d => cols.map(c => esc(d[c])).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'defects-export.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  // Durable slim copy of the newest qTest case set — survives qa-history quota trimming,
  // which used to silently drop per-case detail and blank the Test Runs column on every defect.
  CASE_FIELDS = ['phase','test','team','dir','application','module','id','name','runId','tcId','tester','status','rawStatus','ts','defects','unex'];
  saveCasesLatest(cases, file) {
    const slim = (cases || []).map(c => { const o = {}; this.CASE_FIELDS.forEach(k => { if (c[k] != null && c[k] !== '') o[k] = c[k]; }); return o; });
    // These few fields repeat across every run — a directory path or a team name is
    // stored thousands of times. Keep one copy of each and store an index instead.
    const pack = (list) => {
      const dict = {}, idx = {};
      this.CASE_DICT.forEach(f => { dict[f] = []; idx[f] = {}; });
      const rows = list.map(c => {
        const o = {};
        Object.keys(c).forEach(k => {
          if (idx[k]) {
            const v = String(c[k]);
            if (idx[k][v] == null) { idx[k][v] = dict[k].length; dict[k].push(v); }
            o[k] = idx[k][v];
          } else { o[k] = c[k]; }
        });
        return o;
      });
      return JSON.stringify({ v: 2, ts: Date.now(), file: file || '', dict, cases: rows });
    };
    // Shed detail in steps, keeping whatever still lets the qTest × Jira join work.
    const linked = (c) => c.defects || c.tcId || c.runId;
    const attempts = [
      () => pack(slim),
      () => pack(slim.map(c => linked(c) ? c : { ...c, name: undefined, dir: undefined })),
      () => pack(slim.filter(linked)),
      () => pack(slim.filter(c => c.defects)),
    ];
    for (let i = 0; i < attempts.length; i++) {
      try { this.lsSetStrict('qa-cases-latest', attempts[i]()); this.lsDel('qa-store-full'); return; }
      catch (e) { /* try the next, smaller shape */ }
    }
    // Nothing fits. Say so rather than pretending the import was kept.
    try { this.lsDel('qa-cases-latest'); } catch (e) {}
    try { this.lsSet('qa-store-full', String(Date.now())); } catch (e) {}
  }
  CASE_DICT = ['phase', 'test', 'team', 'dir', 'application', 'module', 'tester', 'status', 'rawStatus'];
  loadCasesLatest() {
    try {
      const s = JSON.parse(this.lsGet('qa-cases-latest') || 'null');
      if (!s || !Array.isArray(s.cases)) return [];
      if (s.v !== 2 || !s.dict) return s.cases;            // v1 payload, stored plain
      return s.cases.map(c => {
        const o = { ...c };
        this.CASE_DICT.forEach(f => { if (typeof o[f] === 'number' && s.dict[f]) o[f] = s.dict[f][o[f]]; });
        return o;
      });
    } catch (e) { return []; }
  }
  loadHistory() { try { const s = JSON.parse(this.lsGet('qa-history') || '[]'); return Array.isArray(s) ? s : []; } catch (e) { return []; } }
  persistHistory(list) {
    let arr = list.slice();
    for (let guard = 0; guard < 200; guard++) {
      try { this.lsSetStrict('qa-history', JSON.stringify(arr)); this.setState({ history: arr }); return; }
      catch (e) {
        // Storage full: first strip heavy per-case detail from older snapshots, then drop oldest.
        if (arr.some((s, i) => i > 0 && s.cases && s.cases.length)) arr = arr.map((s, i) => i === 0 ? s : { ...s, cases: [] });
        else if (arr[0] && arr[0].cases && arr[0].cases.length) arr = [{ ...arr[0], cases: [] }, ...arr.slice(1)];
        else if (arr.length > 1) arr = arr.slice(0, arr.length - 1);
        else { this.setState({ history: arr }); return; }
      }
    }
    this.setState({ history: arr });
  }
  PARTIES = ['Inhouse Berater', 'Key User', 'FIS'];
  partyOf(c) {
    const t = [c && c.tester, c && c.team, c && c.dir, c && c.test].join(' ').toLowerCase();
    if (/\bfis\b|fis[-_ ]/.test(t)) return 'FIS';
    if (/key.?user|keyuser|\bku\b|fachbereich|anwender/.test(t)) return 'Key User';
    if (/inhouse|berater|consult|ihb/.test(t)) return 'Inhouse Berater';
    return 'Sonstige';
  }
  loadLedger() { try { return JSON.parse(this.lsGet('qa-exec-ledger') || '{}') || {}; } catch (e) { return {}; } }
  saveLedger(l) { try { this.lsSet('qa-exec-ledger', JSON.stringify(l)); } catch (e) { /* full: keep in memory only */ } this._ledger = l; }
  ledgerKey(c) { const id = String(c.id == null || String(c.id).trim() === '' ? (c.name || '') : c.id).trim().toUpperCase(); return id + '||' + c.phase; }
  mergeLedger(cases, file) {
    const l = this.loadLedger();
    const now = Date.now();
    (cases || []).forEach(c => {
      if (!c.status) return;
      const k = this.ledgerKey(c); if (!k || k.indexOf('||') === 0) return;
      const arr = l[k] || (l[k] = []);
      const ts = c.ts || now;
      const sig = ts + '|' + (c.tester || '') + '|' + c.status;
      if (arr.some(e => (e.ts + '|' + (e.tester || '') + '|' + e.status) === sig)) return;
      arr.push({ ts, tester: c.tester || '—', status: c.status, dir: c.dir || '', src: file || '', party: this.partyOf(c) });
      if (arr.length > 24) { arr.sort((a, b) => (b.ts || 0) - (a.ts || 0)); arr.length = 24; }
    });
    this.saveLedger(l);
    return l;
  }
  addSnapshot(rows, cases, mode, file, apps) {
    const planned = rows.reduce((s, r) => s + (Number(r.planned) || 0), 0);
    const tested = rows.reduce((s, r) => s + (Number(r.tested) || 0), 0);
    const passed = rows.reduce((s, r) => s + (Number(r.passed) || 0), 0);
    const ts = Date.now(); const d = new Date(ts);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const snap = { ts, dateKey, file, mode, rows, cases: cases || [], apps: apps || [], planned, tested, passed };
    // Keep detailed test-case rows only on the newest snapshot to stay within storage limits.
    const prev = this.loadHistory().map(s => ({ ...s, cases: [] }));
    this.persistHistory([snap, ...prev].slice(0, 60));
    return snap;
  }
  loadSnapshot = (ts) => {
    const s = this.loadHistory().find(x => x.ts === ts); if (!s) return;
    this.setState({ importedRows: s.rows, importedCases: (s.cases && s.cases.length) ? s.cases : this.loadCasesLatest(), importedApps: s.apps || [], importMode: s.mode, viewingTs: ts, importError: '', importInfo: `${s.file} · ${s.tested}/${s.planned} · ${new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` });
  };
  deleteSnapshot = (ts) => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const list = this.loadHistory().filter(x => x.ts !== ts); this.persistHistory(list);
    if (this.state.viewingTs === ts) {
      if (list.length) this.loadSnapshot(list[0].ts);
      else this.setState({ importedRows: null, importedCases: [], importedApps: [], viewingTs: null, importInfo: 'No data imported yet' });
    }
  };
  saveMilestone = () => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const m = this.state.mMilestone != null ? this.state.mMilestone : '';
    const d = this.state.mDate != null ? this.state.mDate : '';
    const info = this.state.mInfo != null ? this.state.mInfo : '';
    try { this.lsSet('qa-milestone', m); this.lsSet('qa-milestone-date', d); this.lsSet('qa-info', info); } catch (e) {}
    this.setState({ milestone: m, milestoneDate: d, infoNote: info, milestoneOpen: false });
  };

  stamp() { return new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }

  parseTemplate(grid, hi, file) {
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const head = grid[hi].map(norm);
    const col = (n) => head.indexOf(n);
    const ci = { phase: col('phase'), test: col('test'), team: col('team'), planned: col('planned'), tested: col('tested'), passed: col('passed'), failed: col('failed'), blocked: col('blocked'), notrelevant: head.findIndex(h => h.startsWith('notrelevant') || h === 'nr') };
    if (ci.phase < 0 || ci.test < 0) throw new Error('Missing Phase/Test columns');
    const get = (r, k) => (ci[k] >= 0 ? r[ci[k]] : undefined);
    const rows = [];
    for (let i = hi + 1; i < grid.length; i++) {
      const r = grid[i]; if (!r || !r.length) continue;
      const phase = get(r, 'phase'); if (phase == null || String(phase).trim() === '') continue;
      rows.push({ phase, test: get(r, 'test'), team: get(r, 'team'), planned: get(r, 'planned'), tested: get(r, 'tested'), passed: get(r, 'passed'), failed: get(r, 'failed'), blocked: get(r, 'blocked'), notRelevant: get(r, 'notrelevant') });
    }
    if (!rows.length) throw new Error('No data rows found');
    // keep any previously imported qTest runs — a template import carries no runs, but the
    // defect↔run links must survive it
    const keepCases = (this.state.importedCases && this.state.importedCases.length) ? this.state.importedCases : this.loadCasesLatest();
    const snap = this.addSnapshot(rows, keepCases, 'template', file.name);
    this.setState({ importedRows: rows, importedCases: keepCases, importMode: 'template', viewingTs: snap.ts, importError: '', importInfo: `${file.name} · ${rows.length} rows · ${this.stamp()}` });
  }

  parseQtest(grid, hi, file) {
    const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const head = grid[hi].map(norm);
    const di = head.indexOf('directory'), si = head.indexOf('status');
    const idi = head.indexOf('id'), ni = head.indexOf('name');
    const exBy = head.findIndex(h => ['executedby','executor','testedby','runby'].includes(h));
    const ti = exBy >= 0 ? exBy : head.indexOf('assignedto');
    const ei = head.findIndex(h => ['executedend','executeddate','executiondate','executedon','executedstart','lastexecuted','lastrun'].includes(h));
    const appI = head.findIndex(h => h === 'application' || h === 'applicationname'); const modI = head.findIndex(h => h === 'module' || h === 'modulename');
    const reqI = head.findIndex(h => ['requirement','requirements','requirementid','requirementids','linkedrequirement','linkedrequirements','coveredrequirement','coveredrequirements','requirementkey'].includes(h));
    const reqNameI = head.findIndex(h => ['requirementname','requirementtitle','requirementsummary'].includes(h));
    // "Defect IDs" (keys) must win over "Defects" (a count column qTest also exports).
    const defPref = ['defectids','defectid','defectkeys','defectkey','linkeddefects','linkeddefect','bugids','bugid','jirakeys','jirakey','issuekeys','issuekey'];
    let defI = -1;
    for (const p of defPref) { const ix = head.indexOf(p); if (ix >= 0) { defI = ix; break; } }
    if (defI < 0) defI = head.findIndex(h => /^(defects?|bugs?|issues?|jira)$/.test(h));
    // Any extra column that could hold Jira keys (e.g. "Test Case Jira Requirement ID") is scanned too.
    const keyScanCols = head.map((h, i) => (i !== defI && /(defect|bug)/.test(h) && !/count|number|anzahl|requirement/.test(h)) ? i : -1).filter(i => i >= 0);
    const reqI2 = reqI >= 0 ? reqI : head.findIndex(h => /requirement/.test(h) && /id|key/.test(h));
    // Test Run ID and Test Case ID are the two join keys against the Jira CSV.
    const runI = head.findIndex(h => ['testrunid','testrunpid','runid','testrun','testrunkey'].includes(h));
    // Test-Case id: a dedicated column, else a TC-#### token in the Test Case / Name column.
    const tcI = head.findIndex(h => ['testcaseid','testcasepid','testcasekey','tcid','testcaseidpid','testcasenumber'].includes(h));
    const tcTxtI = tcI >= 0 ? tcI : head.findIndex(h => h === 'testcase' || h === 'testcasename');
    const tcTok = (v) => { const m = String(v == null ? '' : v).match(/\b([A-Za-z]{1,6})-(\d+)\b/); return m ? m[2] : ''; };
    const pidI = head.findIndex(h => h === 'pid' || h === 'idpid');
    const numOf = (v) => { const m = String(v == null ? '' : v).match(/(\d+)\s*$/); return m ? m[1] : ''; };
    const parseBugKeys = (raw) => { const m = String(raw == null ? '' : raw).match(/[A-Za-z][A-Za-z0-9]+-\d+/g); return m ? Array.from(new Set(m.map(x => x.toUpperCase()))) : []; };
    const parseReqs = (raw, nameRaw) => {
      const cell = String(raw == null ? '' : raw).trim(); if (!cell) return [];
      const nm = String(nameRaw == null ? '' : nameRaw).trim();
      return cell.split(/[;,\n|]+/).map(s => s.trim()).filter(Boolean).map(tok => {
        const m = tok.match(/^([A-Za-z][A-Za-z0-9]*-?\d+|\d+)\s*[:\-\u2013]?\s*(.*)$/);
        const id = m ? m[1] : tok; const name = (m && m[2]) ? m[2].trim() : nm;
        return { id: String(id).trim(), name: name || '' };
      }).filter(r => r.id);
    };
    const phaseRe = /(DF\s*-?1|IR\s*-?1|IR\s*-?3|QC\s*-?1|PC\s*-?1)/i;
    const phaseTok = (s) => { const m = String(s || '').match(phaseRe); return m ? m[1].toUpperCase().replace(/[\s-]/g, '') : null; };
    const parseTs = (s) => {
      const v = String(s == null ? '' : s).trim(); if (!v) return null;
      let m = v.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);            // ISO
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      m = v.match(/(\d{1,2})[.](\d{1,2})[.](\d{4})/);             // dd.mm.yyyy
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
      m = v.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);               // dd/mm/yyyy
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
      const d = new Date(v); return isNaN(d.getTime()) ? null : d.getTime();
    };
    const agg = {}; const appAgg = {}; const cases = []; let count = 0;
    const _unknownSt = {}; const _skippedDirs = []; let _skipped = 0;
    for (let i = hi + 1; i < grid.length; i++) {
      const r = grid[i]; if (!r || r[di] == null || String(r[di]).trim() === '') continue;
      const parts = String(r[di]).split(' / ').map(s => s.trim());
      const phase = phaseTok(parts[1] || '');
      if (!phase) { _skipped++; if (_skippedDirs.length < 3) _skippedDirs.push(String(r[di])); continue; }
      const rest = parts.slice(2);
      let test = 'Tests', team = '(All)';
      if (rest.length === 1) {
        const seg = rest[0];
        if (seg.includes('|')) { const p = seg.split('|'); team = p[0].trim(); test = (p[1] || 'Tests').trim(); }
        else { team = seg; }
      } else if (rest.length >= 2) {
        test = rest[0];
        team = rest[1].split(/\s*[|\-]\s*/)[0].trim();
      }
      const st = norm(r[si]);
      const key = phase + '||' + test + '||' + team;
      const o = agg[key] || (agg[key] = { phase, test, team, planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0, notRelevant: 0, _h: {} });
      o.planned += 1;
      o._h[String(r[di])] = 1;
      if (ni >= 0 && r[ni] && Object.keys(o._h).length < 400) o._h[String(r[ni])] = 1;
      let cat = '';
      if (/^(pass|passed|ok|erfolgreich|bestanden|success|successful)$/.test(st)) { o.passed++; o.tested++; cat = 'Passed'; }
      else if (/^(fail|failed|failure|fehlgeschlagen|nichtbestanden|error)$/.test(st)) { o.failed++; o.tested++; cat = 'Failed'; }
      else if (/^(block|blocked|blockiert|impediment)$/.test(st)) { o.blocked++; o.tested++; cat = 'Blocked'; }
      else if (/^(notrelevant|notapplicable|na|nichtrelevant|skip|skipped|entfaellt|entfallt)$/.test(st)) { o.notRelevant++; o.tested++; cat = 'Not relevant'; }
      else if (st) { (_unknownSt[String(r[si]).trim()] = (_unknownSt[String(r[si]).trim()] || 0) + 1); }
      const appName = appI >= 0 ? String(r[appI] == null ? '' : r[appI]).trim() : '';
      const modName = modI >= 0 ? String(r[modI] == null ? '' : r[modI]).trim() : '';
      if (appName || modName) {
        const ak = phase + '||' + appName + '||' + modName;
        const ao = appAgg[ak] || (appAgg[ak] = { phase, application: appName, module: modName || '(General)', planned: 0, executed: 0, passed: 0, failed: 0, blocked: 0 });
        ao.planned += 1;
        if (cat) { ao.executed += 1; if (cat === 'Passed') ao.passed += 1; else if (cat === 'Failed') ao.failed += 1; else if (cat === 'Blocked') ao.blocked += 1; }
      }
      const _defKeys = parseBugKeys([defI >= 0 ? r[defI] : ''].concat(keyScanCols.map(ix => r[ix])).join(' '));
      if (!cat) cases.push({ phase, test, team, dir: String(r[di]), application: appName, module: modName || (appName ? '(General)' : ''),
        id: idi >= 0 ? r[idi] : '', name: ni >= 0 ? r[ni] : '',
        runId: numOf(runI >= 0 ? r[runI] : (pidI >= 0 ? r[pidI] : (idi >= 0 ? r[idi] : ''))),
        tcId: (tcI >= 0 ? (numOf(r[tcI]) || tcTok(r[tcI])) : '') || (tcTxtI >= 0 ? tcTok(r[tcTxtI]) : '') || (ni >= 0 ? tcTok(r[ni]) : ''),
        tester: (ti >= 0 && r[ti]) ? r[ti] : '—', status: 'Unexecuted', rawStatus: String(r[si] == null ? '' : r[si]).trim(), ts: null, reqs: [], defects: _defKeys, unex: 1 });
      if (cat) cases.push({ phase, test, team, dir: String(r[di]), application: appName, module: modName || (appName ? '(General)' : ''), id: idi >= 0 ? r[idi] : '', name: ni >= 0 ? r[ni] : '',
        runId: numOf(runI >= 0 ? r[runI] : (pidI >= 0 ? r[pidI] : (idi >= 0 ? r[idi] : ''))),
        tcId: (tcI >= 0 ? (numOf(r[tcI]) || tcTok(r[tcI])) : '') || (tcTxtI >= 0 ? tcTok(r[tcTxtI]) : '') || (ni >= 0 ? tcTok(r[ni]) : ''),
        tcRaw: tcTxtI >= 0 ? String(r[tcTxtI] == null ? '' : r[tcTxtI]).trim() : '', tester: (ti >= 0 && r[ti]) ? r[ti] : '—', status: cat, ts: ei >= 0 ? parseTs(r[ei]) : null, reqs: reqI2 >= 0 ? parseReqs(r[reqI2], reqNameI >= 0 ? r[reqNameI] : '') : [], defects: _defKeys });
      count++;
    }
    const rows = Object.values(agg).map(o => { const hay = Object.keys(o._h || {}).join(' '); delete o._h; return Object.assign(o, { hay }); });
    if (!rows.length) throw new Error('Keine Zeile mit erkannter Phase (DF1/IR1/QC1/IR3/PC1) gefunden. Beispiel-Directory aus der Datei: "' + (_skippedDirs[0] || '(leer)') + '" — die Phase muss als Segment im Directory-Pfad stehen.');
    const _uk = Object.keys(_unknownSt);
    this._importWarn = [
      _skipped ? _skipped + ' Zeilen ohne erkennbare Phase übersprungen (z.B. "' + _skippedDirs[0] + '")' : '',
      _uk.length ? 'Unbekannte Status-Werte ignoriert: ' + _uk.slice(0, 6).join(', ') : '',
      ei < 0 ? 'Keine Ausführungs-Datumsspalte gefunden (Executed End / Execution Date)' : '',
      tcI < 0 && tcTxtI < 0 ? 'Keine Test-Case-ID-Spalte gefunden — Jira-Verknüpfung nur über Test-Run-ID/Defect-Spalte' : '',
      defI < 0 && !keyScanCols.length ? 'Keine Defect-ID-Spalte gefunden — Bug↔Test-Zuordnung nur über Jira-Links möglich' : '',
      exBy < 0 ? 'Keine Spalte "Executed By" — es wird "Assigned To" verwendet' : ''
    ].filter(Boolean).join(' · ');
    const apps = Object.values(appAgg);
    this.mergeLedger(cases, file.name);
    this.saveCasesLatest(cases, file.name);
    const snap = this.addSnapshot(rows, cases, 'qtest', file.name, apps);
    this.setState({ importedRows: rows, importedCases: cases, importedApps: apps, importMode: 'qtest', viewingTs: snap.ts, importError: '', importInfo: `${file.name} · ${count} tests · ${this.stamp()}` + (this._importWarn ? ' · ⚠ ' + this._importWarn : '') });
  }

  onFile = (e) => {
    if (!this.can('editor')) { console.warn('QA Cockpit: rejected — editor role required'); return; }
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
        let grid = [];
        if (isCsv) {
          grid = this.parseCsv(String(ev.target.result || ''));
        } else {
          if (!window.XLSX) throw new Error('Excel import unavailable in offline export — use CSV import');
          const wb = window.XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          // Prefer the sheet that actually holds the export data — a qTest export often
          // puts a summary/cover page on the FIRST tab and the real rows on a later tab.
          const isDataHead = (r) => r && (
            (r.some(c => norm(c) === 'directory') && r.some(c => norm(c) === 'status')) ||
            r.some(c => norm(c) === 'phase')
          );
          let bestN = -1, bestHasHead = false;
          wb.SheetNames.forEach(n => {
            const g = window.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
            const hasHead = g.some(isDataHead);
            // A sheet with recognised headers always beats one without; otherwise fall back to row count.
            if ((hasHead && !bestHasHead) || (hasHead === bestHasHead && g.length > bestN)) {
              bestN = g.length; bestHasHead = hasHead; grid = g;
            }
          });
        }
        let hi = grid.findIndex(r => r && r.some(c => norm(c) === 'directory') && r.some(c => norm(c) === 'status'));
        if (hi >= 0) return this.parseQtest(grid, hi, file);
        hi = grid.findIndex(r => r && r.some(c => norm(c) === 'phase'));
        if (hi >= 0) return this.parseTemplate(grid, hi, file);
        throw new Error('Unrecognised file — expected a qTest Test-Execution export (Directory + Status columns) or the import template (Phase/Test/Team), as .xlsx or .csv.');
      } catch (err) {
        this.setState({ importError: err.message });
      }
    };
    reader.onerror = () => this.setState({ importError: 'Could not read file' });
    if (isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  };

  // ─── per-release data load ────────────────────────────────────────────────
  // Everything a release owns (imported runs, defects, backlog, comments,
  // milestones, claims …) is read through the scoped keys, so calling this
  // after switching release swaps the whole report context — not just a title.
  loadReleaseData() {
    let milestone = '', milestoneDate = '', infoNote = '';
    try {
      milestone = this.lsGet('qa-milestone') || '';
      milestoneDate = this.lsGet('qa-milestone-date') || '';
      infoNote = this.lsGet('qa-info') || '';
    } catch (e) {}
    let suiteOrder = null;
    try { suiteOrder = JSON.parse(this.lsGet('qa-suite-order') || 'null'); } catch (e) {}
    const history = this.loadHistory();
    const latest = history[0];
    const jf = this.lsGet('qa-jira-file') || '';
    const jsSync = parseInt(this.lsGet('qa-jira-sync')) || 0;
    const jiraDefects = this.loadDefects();
    this.setState({
      milestone, milestoneDate, infoNote, suiteOrder: suiteOrder || {},
      comments: this.loadComments(), topics: this.loadTopics(),
      qtestLinks: this.loadQtestLinks(), qtestUrl: this.loadQtestFolder(), history,
      importedRows: latest ? latest.rows : null,
      importedCases: (latest && latest.cases && latest.cases.length) ? latest.cases : this.loadCasesLatest(),
      importedApps: latest ? (latest.apps || []) : [],
      importMode: latest ? latest.mode : 'template',
      viewingTs: latest ? latest.ts : null,
      defectNotes: this.loadDefectNotes(), chainClaims: this.loadClaims(),
      importInfo: latest ? `${latest.file} · ${latest.tested}/${latest.planned} · ${new Date(latest.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'No data imported yet',
      jiraDefects, jiraBase: this.loadJiraBase(), jiraFile: jf, jiraSync: jsSync, now: Date.now(),
      jiraError: '', importError: '', backlogError: '', tcfError: '', dumpError: '',
      // drop drill-downs that belonged to the previous release
      tcModal: null, coverageEnv: null, dmdDrill: null, execCalModal: false, bdOpen: null,
      dcPhase: null, gngPhase: null, chainQ: '', dumpSlot: 'General',
    });
    // keep the embedded Defect Center on the same release
    try { window.dispatchEvent(new CustomEvent('qa-defects-sync', { detail: jiraDefects })); } catch (e) {}
  }

  // Next schedule boundary of a release that is still ahead of today.
  relNextMilestonePoint(rel) {
    const now = Date.now();
    const pts = [];
    this.relEnvs(rel).forEach(e => {
      const add = (d, what) => { const t = this.relParse(d); if (t != null) pts.push({ t, label: e.name + ' — ' + what }); };
      add(e.testingStart, 'testing starts'); add(e.testingEnd, 'testing ends');
      add(e.bugFixStart, 'bug fixing starts'); add(e.bugFixEnd, 'bug fixing ends');
      add(e.retestStart, 'retest starts'); add(e.retestEnd, 'retest ends');
    });
    pts.sort((a, b) => a.t - b.t);
    return pts.find(p => p.t >= now) || null;
  }

  // ─── release navigation ───────────────────────────────────────────────────
  selectRelease = (id) => {
    if (!id || id === this.relSelectedId()) return;
    const store = this.relStore();
    if (!store.releases.some(r => r.id === id)) return;
    this._relSelId = id;
    store.selectedId = id;
    this.relWrite(store);
    this.setState({ collapsed: {}, navEnvFocus: null }, () => this.loadReleaseData());
  };
  // Scroll to an environment: its phase card when a qTest export has been
  // imported, otherwise its row in the Release Summary — so the navigation
  // always lands somewhere meaningful.
  focusEnvironment = (name) => {
    const all = {}; this.relPhasesSched().forEach(p => { all[p.id] = true; }); all[name] = false;
    this.setState({ collapsed: all, navEnvFocus: name }, () => setTimeout(() => {
      // First visible anchor wins: the environment card when a qTest export
      // exists, else its Release Summary row, else its card in the Test Phase
      // Timeline strip. Sections switched off in the layout settings are still
      // in the DOM but have no box, so they are skipped.
      const visible = (id) => {
        const n = document.getElementById(id);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return (r.width > 0 || r.height > 0) ? n : null;
      };
      const el = visible('phase-' + name) || visible('envrow-' + name) || visible('relenv-' + name) || visible('phasecard-' + name);
      if (!el) return;
      const box = el.getBoundingClientRect();
      window.scrollTo({ top: box.top + window.pageYOffset - 90, behavior: 'smooth' });
      // the phase strip scrolls sideways — bring the card into view there too,
      // without disturbing the vertical position
      let strip = el.parentElement;
      while (strip && strip.scrollWidth <= strip.clientWidth + 4) strip = strip.parentElement;
      if (strip && strip !== document.body && strip !== document.documentElement) {
        strip.scrollTo({ left: Math.max(0, el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' });
      }
    }, 80));
  };
  focusReleaseEnv = (relId, envName) => (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const go = () => this.focusEnvironment(envName);
    if (relId !== this.relSelectedId()) { this.selectRelease(relId); setTimeout(go, 120); } else go();
  };
  toggleNavRelease = (id) => (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    this.setState(s => {
      const o = { ...(s.navOpen || {}) };
      const isOpen = o[id] === undefined ? (id === this.relSelectedId()) : !!o[id];
      o[id] = !isOpen;
      return { navOpen: o };
    });
  };
  toggleNavPanel = () => this.setState(s => ({ navCollapsed: !s.navCollapsed }));

  // ─── release administration (admin role only) ─────────────────────────────
  relBlankResp(i) {
    return { id: this.relNewId(), role: '', people: '', color: this.RESP_COLORS[(i || 0) % this.RESP_COLORS.length] };
  }
  relResponsibilities(rel) {
    const r = rel || this.relSelected();
    return (r && Array.isArray(r.responsibilities)) ? r.responsibilities : [];
  }
  relBlankEnv(name) {
    return { id: this.relNewId(), name: name || '', testingStart: '', testingEnd: '',
      bugFixStart: '', bugFixEnd: '', retestStart: '', retestEnd: '', notes: '',
      includeWeekends: /^(pc|cut|go-?live)/i.test(String(name || '')) };
  }
  relBlankForm() {
    return { id: '', version: '', status: 'Planned', startDate: '', endDate: '',
      current: false, notes: '', environments: [], responsibilities: [] };
  }
  openRelManager = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    this.setState({ relModalOpen: true, relForm: null, relFormErr: '', relConfirm: null, relMsg: '' });
  };
  closeRelManager = () => {
    // an unsaved draft is never discarded silently
    if (this.state.relForm && this.state.relDirty &&
        !window.confirm('Discard the unsaved changes to this release?')) return;
    this.setState({ relModalOpen: false, relForm: null, relFormErr: '', relConfirm: null, relDirty: false });
  };
  relNew = () => {
    if (!this.can('admin')) return;
    this.setState({ relForm: this.relBlankForm(), relFormErr: '', relDirty: false, relMsg: '' });
  };
  relEdit = (id) => () => {
    if (!this.can('admin')) return;
    const r = this.relAll().find(x => x.id === id);
    if (!r) return;
    this.setState({ relForm: JSON.parse(JSON.stringify(r)), relFormErr: '', relDirty: false, relMsg: '' });
  };
  // Duplicate copies structure + schedule but never the imported data, so the
  // new release starts clean while keeping the shape of the one it came from.
  relDuplicate = (id) => () => {
    if (!this.can('admin')) return;
    const r = this.relAll().find(x => x.id === id);
    if (!r) return;
    const copy = JSON.parse(JSON.stringify(r));
    copy.id = '';
    copy.version = '';
    copy.current = false;
    copy.status = 'Planned';
    copy.environments = (copy.environments || []).map(e => ({ ...e, id: this.relNewId() }));
    this.setState({ relForm: copy, relFormErr: 'Give the duplicate a new version number, then save.', relDirty: true, relMsg: '' });
  };
  relAskDelete = (id) => () => {
    if (!this.can('admin')) return;
    this.setState({ relConfirm: id });
  };
  relCancelDelete = () => this.setState({ relConfirm: null });
  relConfirmDelete = () => {
    if (!this.can('admin')) return;
    const id = this.state.relConfirm;
    const store = this.relStore();
    if (store.releases.length <= 1) {
      this.setState({ relConfirm: null, relFormErr: 'The last remaining release cannot be deleted.' });
      return;
    }
    const gone = store.releases.find(r => r.id === id);
    store.releases = store.releases.filter(r => r.id !== id);
    if (gone && gone.current && !store.releases.some(r => r.current)) store.releases[0].current = true;
    if (store.selectedId === id) store.selectedId = store.releases[0].id;
    this.relWrite(store);
    // drop everything that release owned so it cannot resurface under a new id
    try {
      const suffix = '@' + id;
      Object.keys(localStorage).filter(k => k.slice(-suffix.length) === suffix)
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    this._relSelId = store.selectedId;
    this.setState({ relConfirm: null, relForm: null, relDirty: false,
      relMsg: 'Release ' + (gone ? gone.version : '') + ' deleted.', collapsed: {} },
      () => this.loadReleaseData());
  };
  relSetCurrent = (id) => () => {
    if (!this.can('admin')) return;
    const store = this.relStore();
    // exactly one current release, always
    store.releases.forEach(r => { r.current = (r.id === id); });
    const target = store.releases.find(r => r.id === id);
    if (target) { target.updatedAt = Date.now(); if (target.status === 'Planned') target.status = 'In Progress'; }
    store.selectedId = id;
    this.relWrite(store);
    this._relSelId = id;
    this.setState({ relMsg: 'Release ' + (target ? target.version : '') + ' is now the current release.', collapsed: {} },
      () => this.loadReleaseData());
  };

  // ─── release form editing ─────────────────────────────────────────────────
  relFormSet = (field) => (e) => {
    const v = (e && e.target) ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    this.setState(s => ({ relForm: { ...(s.relForm || this.relBlankForm()), [field]: v }, relDirty: true, relFormErr: '' }));
  };
  relEnvSet = (envId, field) => (e) => {
    const v = (e && e.target) ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    this.setState(s => {
      const f = s.relForm || this.relBlankForm();
      return { relForm: { ...f, environments: (f.environments || []).map(x => x.id === envId ? { ...x, [field]: v } : x) },
        relDirty: true, relFormErr: '' };
    });
  };
  relToggleEnv = (name) => () => {
    this.setState(s => {
      const f = s.relForm || this.relBlankForm();
      const envs = f.environments || [];
      const has = envs.some(e => e.name === name);
      return { relForm: { ...f, environments: has ? envs.filter(e => e.name !== name) : envs.concat([this.relBlankEnv(name)]) },
        relDirty: true, relFormErr: '' };
    });
  };
  relRemoveEnv = (envId) => () => {
    this.setState(s => {
      const f = s.relForm || this.relBlankForm();
      return { relForm: { ...f, environments: (f.environments || []).filter(e => e.id !== envId) }, relDirty: true, relFormErr: '' };
    });
  };
  relToggleForm = (field) => () => this.setState(s => {
    const f = s.relForm || this.relBlankForm();
    return { relForm: { ...f, [field]: !f[field] }, relDirty: true, relFormErr: '' };
  });
  relToggleEnvField = (envId, field) => () => this.setState(s => {
    const f = s.relForm || this.relBlankForm();
    return { relForm: { ...f, environments: (f.environments || []).map(x => x.id === envId ? { ...x, [field]: !x[field] } : x) },
      relDirty: true, relFormErr: '' };
  });
  relAddResp = (role) => () => this.setState(s => {
    const f = s.relForm || this.relBlankForm();
    const list = f.responsibilities || [];
    if (role && list.some(x => x.role.toLowerCase() === String(role).toLowerCase())) return { relFormErr: 'Role "' + role + '" is already listed.' };
    const row = this.relBlankResp(list.length);
    if (role) row.role = role;
    return { relForm: { ...f, responsibilities: list.concat([row]) }, relDirty: true, relFormErr: '' };
  });
  relRespSet = (rid, field) => (e) => {
    const v = (e && e.target) ? e.target.value : e;
    this.setState(s => {
      const f = s.relForm || this.relBlankForm();
      return { relForm: { ...f, responsibilities: (f.responsibilities || []).map(x => x.id === rid ? { ...x, [field]: v } : x) },
        relDirty: true, relFormErr: '' };
    });
  };
  relRemoveResp = (rid) => () => this.setState(s => {
    const f = s.relForm || this.relBlankForm();
    return { relForm: { ...f, responsibilities: (f.responsibilities || []).filter(x => x.id !== rid) }, relDirty: true, relFormErr: '' };
  });
  setRelEnvNew = (e) => this.setState({ relEnvNew: e.target.value });
  relAddCustomEnv = () => {
    const name = String(this.state.relEnvNew || '').trim();
    if (!name) return;
    const f = this.state.relForm || this.relBlankForm();
    if ((f.environments || []).some(e => e.name.toLowerCase() === name.toLowerCase())) {
      this.setState({ relFormErr: 'Environment "' + name + '" is already part of this release.' });
      return;
    }
    this.setState(s => ({ relForm: { ...(s.relForm || this.relBlankForm()),
      environments: ((s.relForm || {}).environments || []).concat([this.relBlankEnv(name)]) },
      relEnvNew: '', relDirty: true, relFormErr: '' }));
  };

  relValidate(f) {
    const v = String(f.version || '').trim();
    if (!v) return 'Release version cannot be empty.';
    if (this.relAll().some(r => r.id !== f.id && r.version.toLowerCase() === v.toLowerCase()))
      return 'A release with version "' + v + '" already exists.';
    const bad = (d) => d && this.relParse(d) == null;
    if (bad(f.startDate)) return 'Release start date is not a valid date.';
    if (bad(f.endDate)) return 'Release end date is not a valid date.';
    if (f.startDate && f.endDate && this.relParse(f.endDate) < this.relParse(f.startDate))
      return 'Release end date cannot be before the release start date.';
    const seenRole = {};
    for (const x of (f.responsibilities || [])) {
      const rn = String(x.role || '').trim();
      if (!rn && String(x.people || '').trim()) return 'Give every responsibility a role name.';
      if (!rn) continue;
      const rk = rn.toLowerCase();
      if (seenRole[rk]) return 'Responsibility "' + rn + '" appears twice — roles must be unique within a release.';
      seenRole[rk] = 1;
    }
    const seen = {};
    for (const e of (f.environments || [])) {
      const n = String(e.name || '').trim();
      if (!n) return 'Every environment needs a name.';
      const k = n.toLowerCase();
      if (seen[k]) return 'Environment "' + n + '" appears twice — names must be unique within a release.';
      seen[k] = 1;
      const pairs = [
        ['testingStart', 'testingEnd', 'Testing'],
        ['bugFixStart', 'bugFixEnd', 'Bug fixing'],
        ['retestStart', 'retestEnd', 'Retest'],
      ];
      for (const [a, b, label] of pairs) {
        if (bad(e[a])) return n + ': ' + label + ' start date is not a valid date.';
        if (bad(e[b])) return n + ': ' + label + ' end date is not a valid date.';
        if (e[a] && e[b] && this.relParse(e[b]) < this.relParse(e[a]))
          return n + ': ' + label + ' end date cannot be before its start date.';
        if (e[b] && !e[a]) return n + ': ' + label + ' end date needs a start date.';
      }
      if (!e.testingStart && !e.bugFixStart && !e.retestStart)
        return n + ': give the environment at least a testing window.';
    }
    return '';
  }
  relSave = () => {
    if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
    const f = this.state.relForm;
    if (!f) return;
    const err = this.relValidate(f);
    if (err) { this.setState({ relFormErr: err }); return; }
    const store = this.relStore();
    const isNew = !f.id;
    const id = f.id || this.relNewId();
    const rec = {
      id,
      version: String(f.version).trim(),
      status: f.status || 'Planned',
      startDate: this.relIso(f.startDate),
      endDate: this.relIso(f.endDate),
      current: !!f.current,
      notes: f.notes || '',
      responsibilities: (f.responsibilities || [])
        .filter(x => String(x.role || '').trim() || String(x.people || '').trim())
        .map((x, i) => ({ id: x.id || this.relNewId(), role: String(x.role || '').trim(),
          people: String(x.people || '').trim(), color: x.color || this.RESP_COLORS[i % this.RESP_COLORS.length] })),
      environments: (f.environments || []).map(e => ({
        id: e.id || this.relNewId(), name: String(e.name).trim(),
        testingStart: this.relIso(e.testingStart), testingEnd: this.relIso(e.testingEnd),
        bugFixStart: this.relIso(e.bugFixStart), bugFixEnd: this.relIso(e.bugFixEnd),
        retestStart: this.relIso(e.retestStart), retestEnd: this.relIso(e.retestEnd),
        notes: e.notes || '', includeWeekends: !!e.includeWeekends,
      })),
      createdAt: isNew ? Date.now() : (store.releases.find(r => r.id === id) || {}).createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    // Edits only ever replace the record being edited — a save can never write
    // over a different release.
    store.releases = isNew ? store.releases.concat([rec]) : store.releases.map(r => r.id === id ? rec : r);
    if (rec.current) store.releases.forEach(r => { if (r.id !== id) r.current = false; });
    else if (!store.releases.some(r => r.current)) store.releases[0].current = true;
    this.relWrite(store);
    const switching = isNew || rec.current;
    if (switching) { store.selectedId = id; this.relWrite(store); this._relSelId = id; }
    this.setState({ relForm: null, relDirty: false, relFormErr: '',
      relMsg: 'Release ' + rec.version + (isNew ? ' created.' : ' saved.'), collapsed: {} },
      () => { if (switching) this.loadReleaseData(); else this.forceUpdate(); });
  };

  componentDidMount() {
    // One-off cleanup: the separate IR1 carry-over import was replaced by the single Jira CSV import.
    try {
      const stale = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('qa-ir1-') === 0) stale.push(k); }
      stale.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {}
    try { const t = this.lsGet('qa-theme'); if (t === 'dark' || t === 'light') this.setState({ dark: t === 'dark' }); } catch (e) {}
    try { const o = JSON.parse(this.lsGet('qa-suite-order') || 'null'); if (o) this.setState({ suiteOrder: o }); } catch (e) {}
    this._themeSync = (ev) => { const t = ev && ev.detail; if (t === 'dark' || t === 'light') this.setState(s => (s.dark === (t === 'dark') ? null : { dark: t === 'dark' })); };
    window.addEventListener('qa-theme-sync', this._themeSync);
    let role = 'viewer', editorName = '', milestone = '', milestoneDate = '', infoNote = '';
    try {
      const saved = this.lsGet('qa-commenter-name');
      if (saved) this.setState({ commenterName: saved });
      const sess = JSON.parse(sessionStorage.getItem('qa-session') || 'null');
      if (sess && sess.name) { const u = this.getUsers().find(x => x.name === sess.name); if (u) { role = u.role; editorName = u.name; } }
      milestone = this.lsGet('qa-milestone') || '';
      milestoneDate = this.lsGet('qa-milestone-date') || '';
      infoNote = this.lsGet('qa-info') || '';
    } catch (e) {}
    this.setState({ role, editorName, workHours: this.loadWork() });
    this.loadReleaseData();
    this._timer = setInterval(() => this.setState({ now: Date.now() }), 15000);
    this._onKey = (e) => {
      if (e.key === 'Escape') { if (this.state.coverageEnv) this.closeCoverage(); if (this.state.diagOpen) this.setState({ diagOpen: false }); }
      if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        if (!this.can('admin')) return;
        if (this.state.diagOpen) this.setState({ diagOpen: false });
        else { this.runDiagnostics(); this.setState({ diagOpen: true }); }
      }
    };
    window.addEventListener('keydown', this._onKey);
    // XLSX/PptxGenJS are injected by the bundler after the first render — refresh
    // once they land so the "Excel unavailable" notice does not stick around.
    if (typeof window.XLSX === 'undefined') {
      let tries = 0;
      this._libPoll = setInterval(() => {
        if (typeof window.XLSX !== 'undefined' || ++tries > 40) { clearInterval(this._libPoll); this._libPoll = null; this.forceUpdate(); }
      }, 250);
    }
    this._wheel = (e) => {
      if ((this.state.module || 'test') !== 'test') return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 40) {
        if (e.deltaX > 0) this.setState({ module: 'defect' });
      }
    };
    window.addEventListener('wheel', this._wheel, { passive: true });
    this._defSync = (ev) => { const d = ev && ev.detail; if (Array.isArray(d)) this.setState({ jiraDefects: d, jiraError: '' }); };
    window.addEventListener('qa-defects-sync', this._defSync);
    this._modNav = (ev) => { const m = ev && ev.detail; if (m === 'test' || m === 'defect') this.setState({ module: m }); };
    window.addEventListener('qa-module-nav', this._modNav);
    this._drillIn = (ev) => { const d = ev && ev.detail; if (d && Array.isArray(d.list)) this.setState({ dmdDrill: d }); };
    window.addEventListener('qa-drill-open', this._drillIn);
    const covHash = (window.location.hash || '').match(/^#coverage-([A-Za-z0-9]+)/);
    if (covHash) this.setState({ coverageEnv: covHash[1] });
  }
  componentWillUnmount() { if (this._timer) clearInterval(this._timer); if (this._libPoll) clearInterval(this._libPoll); if (this._onKey) window.removeEventListener('keydown', this._onKey); if (this._defSync) window.removeEventListener('qa-defects-sync', this._defSync); if (this._modNav) window.removeEventListener('qa-module-nav', this._modNav); if (this._drillIn) window.removeEventListener('qa-drill-open', this._drillIn); if (this._wheel) window.removeEventListener('wheel', this._wheel); }
  focusPhase = (id) => {
    const all = {}; this.PHASES_SCHED.forEach(p => { all[p.id] = true; }); all[id] = false;
    this.setState({ collapsed: all }, () => setTimeout(() => { const el = document.getElementById('phase-' + id) || document.getElementById('envrow-' + id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 90, behavior: 'smooth' }); }, 70));
  };
  bizDays(aMs, bMs) { return this.workDaysBetween(aMs, bMs); }
  // The index-based "edit any text" override layer was removed: report texts now
  // come from the release model and the imported data, so an override keyed by
  // DOM position could only ever drift. The old qa-text-overrides key is left
  // untouched in storage and simply ignored.

  renderVals() {
    const dark = this.state.dark;
    const theme = dark ? 'dark' : 'light';
    try { document.documentElement.setAttribute('data-theme', theme); } catch (e) {}
    // Screen preferences below are stored per browser, not per release — they
    // say how this page looks, not what a release contains.
    // Compact is the default: the bar length means something there. The full
    // colour cards stay one click away for anyone who prefers them.
    const envCompact = (this._envv == null ? (this._envv = (this.prefRead('qa-envview') !== 'cards')) : this._envv);
    const envCards = !envCompact;
    const envViewLabel = envCompact ? 'Compact' : 'Cards';
    const toggleEnvView = () => { this._envv = !envCompact; this.prefWrite('qa-envview', this._envv ? 'compact' : 'cards'); this.forceUpdate(); };
    // Optional glass finish.
    const vfxGlass = (this._vfx == null ? (this._vfx = (this.prefRead('qa-vfx') !== 'flat')) : this._vfx);
    const vfxFlat = !vfxGlass;
    const vfxLabel = vfxGlass ? 'Glass' : 'Flat';
    try { document.documentElement.setAttribute('data-vfx', vfxGlass ? 'glass' : 'flat'); } catch (e) {}
    const toggleVfx = () => { this._vfx = !vfxGlass; this.prefWrite('qa-vfx', this._vfx ? 'glass' : 'flat'); this.forceUpdate(); };
    // The lights behind the page switch on their own, so you can keep the frosted
    // panels without the colour, or the colour without the frost.
    const auroraOn = (this._aur == null ? (this._aur = (this.prefRead('qa-aurora') !== 'off')) : this._aur);
    const auroraLabel = auroraOn ? 'On' : 'Off';
    try { document.documentElement.setAttribute('data-aurora', auroraOn ? 'on' : 'off'); } catch (e) {}
    const toggleAurora = () => { this._aur = !auroraOn; this.prefWrite('qa-aurora', this._aur ? 'on' : 'off'); this.forceUpdate(); };
    const toggleTheme = () => this.setState(s => { const nd = !s.dark; try { this.lsSet('qa-theme', nd ? 'dark' : 'light'); } catch (e) {} try { window.dispatchEvent(new CustomEvent('qa-theme-sync', { detail: nd ? 'dark' : 'light' })); } catch (e) {} return { dark: nd }; });
    const _collapsedRaw = this.state.collapsed || {};
    // Environment cards start collapsed; an id the user never touched is absent.
    const collapsed = new Proxy({}, { get: (_t, k) => (_collapsedRaw[k] === undefined ? true : !!_collapsedRaw[k]) });
    const toggleCollapse = (id) => this.setState(s => {
      const c = s.collapsed || {};
      const isCollapsed = c[id] === undefined ? true : !!c[id];
      return { collapsed: { ...c, [id]: !isCollapsed } };
    });
    const themeIcon = dark ? '☀' : '☾';
    const themeLabel = dark ? 'Light Mode' : 'Dark Mode';

    const reportDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const onFile = this.onFile;
    const importInfo = this.state.importInfo;
    const importError = this.state.importError;

    const ps = (s) => {
      if (s === 'COMPLETE')    return { color: '#2e7d32', bg: '#eaf5e6', border: '#b6ddab', badgeBg: '#d8efce' };
      if (s === 'IN PROGRESS') return { color: '#4caf2f', bg: '#f2fae8', border: '#c9e59a', badgeBg: '#e6f3c9' };
      if (s === 'AT RISK')     return { color: '#d97706', bg: '#fffbeb', border: '#fde68a', badgeBg: '#fef9c3' };
      if (s === 'OFF TRACK')   return { color: '#ef4444', bg: '#fef2f2', border: '#fecaca', badgeBg: '#fee2e2' };
      return { color: '#94a3b8', bg: dark ? '#1f2d45' : '#f8fafc', border: dark ? '#263655' : '#e2e8f0', badgeBg: dark ? '#263655' : '#f1f5f9' };
    };

    // Phase strip = the environments configured for the selected release.
    const RELSCHED = this.relPhasesSched();
    let phases = RELSCHED.map(p => ({ id: p.id, label: p.label, dateRange: this.relRangeLabel(p),
      status: 'PENDING', pct: 0, paPct: 0, ...ps('PENDING') }));

    const ts = (s) => {
      if (s === 'GREEN') return { color: '#4caf2f', badgeBg: '#eaf3cf' };
      if (s === 'AMBER') return { color: '#d97706', badgeBg: '#fef9c3' };
      if (s === 'RED')   return { color: '#ef4444', badgeBg: '#fee2e2' };
      return { color: '#94a3b8', badgeBg: dark ? '#263655' : '#f1f5f9' };
    };

    const teamStatusStyle = (s) => {
      if (s === 'PASS')         return { statusColor: '#4caf2f', statusBg: '#eaf3cf' };
      if (s === 'FAIL')         return { statusColor: '#ef4444', statusBg: '#fee2e2' };
      if (s === 'BLOCKED')      return { statusColor: '#3b82f6', statusBg: '#dbeafe' };
      if (s === 'NOT RELEVANT') return { statusColor: '#a855f7', statusBg: '#ede9fe' };
      return { statusColor: '#94a3b8', statusBg: dark ? '#263655' : '#f1f5f9' };
    };

    const mkTeam = (name, tested = '—', planned = '—', status = 'PENDING') => ({
      name, tested, planned, status,
      passed: 0, failed: 0, blocked: 0, notRelevant: 0,
      onOpenCases: () => {},
      ...teamStatusStyle(status),
    });

    const mkTest = (name, teamNames = [], opts = {}) => {
      const { tested = '—', planned = '—', passed = 0, failed = 0, blocked = 0, notRelevant = 0, pct = 0, status = 'PENDING', folderLabel = '' } = opts;
      return {
        name, tested, planned, passed, failed, blocked, notRelevant, pct, execPct: 0, passPct: 0, folderLabel,
        status, ...ts(status),
        onOpenCases: () => {}, onPassed: () => {}, onFailed: () => {}, onBlocked: () => {}, onNr: () => {},
        teams: teamNames.map(n => mkTeam(n)),
      };
    };

    // Suite scaffold per environment name. It only supplies the plan STRUCTURE
    // (which test suites and teams an environment runs) — a release that uses an
    // environment not listed here simply starts with a single generic suite, and
    // an imported qTest export replaces all of it with real data.
    const SCAFFOLD_SRC = [
      {
        id: 'DF1', label: 'Development Freeze 1', alias: '',
        headerBg: 'linear-gradient(90deg,#334155,#475569)',
        gridCols: '1fr',
        tests: [
          { ...mkTest('Functional Test', [], { planned: 30 }),
            teams: [
              mkTeam('gicom',   '—', 22),
              mkTeam('SAP CCM', '—',  8),
            ]
          },
        ],
      },
      {
        id: 'IR1', label: 'Integration Release 1', alias: '',
        headerBg: 'linear-gradient(90deg,#1e40af,#2563eb)',
        gridCols: 'repeat(auto-fit,minmax(min(300px,100%),1fr))',
        tests: [
          { ...mkTest('Smoke Test IT', [], { planned: 149 }),
            teams: [
              mkTeam('TMWW90',  '—', 28),
              mkTeam('SD',      '—', 12),
              mkTeam('SAP HCM', '—', 10),
              mkTeam('TM S/4',  '—', 38),
              mkTeam('MM',      '—',  9),
              mkTeam('PAD',     '—', 51),
              mkTeam('FIORI',   '—',  1),
            ]
          },
          mkTest('Functional Test IT', ['gicom', 'SAP CCM', 'PAD', 'CM', 'TMWW90', 'SD', 'ASS', 'TM S/4']),
          { ...mkTest('Regression Test IT', [], { planned: '—' }),
            teams: [
              mkTeam('gicom',   '—', '—'),
              mkTeam('SAP CCM', '—', '—'),
              mkTeam('PAD',     '—', '—'),
              mkTeam('CM',      '—', '—'),
              mkTeam('TMWW90',  '—', 185),
              mkTeam('SD',      '—', 103),
              mkTeam('EWM',     '—',  25),
              mkTeam('ASS',     '—', '—'),
              mkTeam('TM S/4',  '—', 111),
              mkTeam('MM',      '—',  87),
            ]
          },
        ],
      },
      {
        id: 'QC1', label: 'Quality Check 1', alias: 'Test 01',
        headerBg: 'linear-gradient(90deg,#065f46,#059669)',
        gridCols: 'repeat(auto-fit,minmax(min(300px,100%),1fr))',
        tests: [
          { ...mkTest('Smoke Test IT', [], { planned: 83 }),
            teams: [
              mkTeam('SD',      '—', 12),
              mkTeam('SAP HCM', '—', 10),
              mkTeam('MM',      '—',  9),
              mkTeam('PAD',     '—', 51),
              mkTeam('FIORI',   '—',  1),
            ]
          },
          mkTest('SIT Business',            []),
          mkTest('Regression Test IT',      []),
          mkTest('Regression Test Business',[]),
          mkTest('Test Automation',         []),
        ],
      },
      {
        id: 'IR3', label: 'Integration Release 3', alias: 'Test 02',
        headerBg: 'linear-gradient(90deg,#6d28d9,#7c3aed)',
        gridCols: 'repeat(auto-fit,minmax(min(300px,100%),1fr))',
        tests: [
          { ...mkTest('Smoke Test IT', [], { planned: 73 }),
            teams: [
              mkTeam('SD',    '—', 12),
              mkTeam('MM',    '—',  9),
              mkTeam('PAD',   '—', 51),
              mkTeam('FIORI', '—',  1),
            ]
          },
          mkTest('Regression Test IT',      []),
          mkTest('Regression Test Business',[]),
          mkTest('Test Automation',         []),
          { ...mkTest('E2E Test Chains - Business', [], { planned: 535, folderLabel: 'SD 02C' }),
            teams: [
              mkTeam('Verkauf ab Lager - Zustellung',              '—',  71),
              mkTeam('Verkauf ab Lager - Abholung (ABEX)',         '—',  18),
              mkTeam('Verkauf ab Lager - Kundeneinzel',            '—',  82),
              mkTeam('Verkauf per Umlagerung/Direktlieferung',     '—', 151),
              mkTeam('Verkauf per Strecke',                        '—',  22),
              mkTeam('Verkauf mit Anzahlung',                      '—',  51),
              mkTeam('Angebot / Objektanlage',                     '—',  46),
              mkTeam('Rahmenvereinbarung',                         '—',   8),
              mkTeam('WW90 - SAP',                                 '—',  86),
            ]
          },
        ],
      },
      {
        id: 'PC1', label: 'Production Cutover 1', alias: 'CGHB',
        headerBg: 'linear-gradient(90deg,#92400e,#b45309)',
        gridCols: '1fr',
        tests: [
          { ...mkTest('Smoke Test', [], { planned: 78 }),
            teams: [
              mkTeam('CC Sales & Distribution Services',     '—', 12),
              mkTeam('SAP HCM',                             '—', 10),
              mkTeam('CC Operational Procurement - SAP MM',  '—',  4),
              mkTeam('FIORI',                               '—',  1),
              mkTeam('PAD',                                 '—', 51),
            ]
          },
        ],
      },
    ];
    const _scaffoldBy = {}; SCAFFOLD_SRC.forEach(sc => { _scaffoldBy[sc.id] = sc; });
    let phaseDetails = RELSCHED.map(p => {
      const meta = this.relEnvMeta(p.id);
      const sc = _scaffoldBy[p.id];
      return { id: p.id, label: p.label, alias: meta.alias, dateRange: this.relRangeLabel(p),
        headerBg: meta.headerBg, gridCols: sc ? sc.gridCols : '1fr',
        tests: sc ? sc.tests : [mkTest('Test Execution', [])] };
    });

    // Template scaffold shows the plan STRUCTURE only — planned/tested counts stay blank until
    // an XLS is imported (the imported branch below fully rebuilds phaseDetails from real data).
    phaseDetails.forEach(pd => (pd.tests || []).forEach(t => {
      t.planned = '—'; t.tested = '—'; t.passed = 0; t.failed = 0; t.blocked = 0; t.notRelevant = 0; t.pct = 0;
      (t.teams || []).forEach(tm => { tm.planned = '—'; tm.tested = '—'; });
    }));

    // ─── COMMENTS — Power Automate config ──────────────────────────────────
    // 📌 Paste your Power Automate "HTTP POST URL" between the quotes below:
    const POWER_AUTOMATE_URL = '';   // ← paste flow URL here

    const team = [
      { name: 'Arlind Sylaj',    email: 'arlind.sylaj@gc-gruppe.de',          role: 'Defect Manager'  },
      { name: 'Max Mustermann',  email: 'max.mustermann@gc-gruppe.de',        role: 'QA Responsible'  },
      { name: 'Max Mustermann',  email: 'max.mustermann@gc-gruppe.de',        role: 'Release Mgmt'    },
      { name: 'Max Mustermann',  email: 'max.mustermann@gc-gruppe.de',        role: 'Release Mgmt'    },
      { name: 'Max Mustermann',  email: 'max.mustermann@gc-gruppe.de',        role: 'Project Manager' },
    ];
    const sections = [
      'General',
      'DF1 – Development Freeze 1',
      'IR1 – Integration Release 1',
      'QC1 – Quality Check 1',
      'IR3 – Integration Release 3',
      'PC1 – Production Cutover',
      'Defects',
      'Risks',
    ];

    const commentOpen    = !!this.state.commentOpen;
    const commentClosed  = !commentOpen;
    const commentText    = this.state.commentText || '';
    const commentSection = this.state.commentSection || 'General';
    const commenterName  = this.state.commenterName || '';
    const commentTags    = this.state.commentTags || [];

    const openComment  = () => this.setState({ commentOpen: true });
    const closeComment = () => this.setState({ commentOpen: false });
    const setText     = (e) => this.setState({ commentText: e.target.value });
    const setSection  = (e) => this.setState({ commentSection: e.target.value });
    const setName     = (e) => {
      try { this.lsSet('qa-commenter-name', e.target.value); } catch (err) {}
      this.setState({ commenterName: e.target.value });
    };
    const toggleTag = (name) => this.setState(s => {
      const tags = s.commentTags || [];
      return { commentTags: tags.includes(name) ? tags.filter(t => t !== name) : [...tags, name] };
    });
    const sendComment = async () => {
      const tagged = team.filter(t => (this.state.commentTags || []).includes(t.name));
      if (tagged.length === 0) { this.setState({ commentStatus: 'error', commentError: 'Please tag at least one person.' }); return; }
      if (!this.state.commentText || !this.state.commentText.trim()) { this.setState({ commentStatus: 'error', commentError: 'Please write a comment.' }); return; }
      const toAddr = tagged.map(t => t.email).join(';');
      const section = this.state.commentSection || 'General';
      const text = this.state.commentText || '';
      const fromName = this.state.commenterName || '(anonymous)';
      const subject = `[QA Report] ${section} — comment from ${fromName}`;
      const body =
        `<p><strong>Section:</strong> ${section}</p>` +
        `<p><strong>From:</strong> ${fromName}</p>` +
        `<p><strong>Comment:</strong></p>` +
        `<p>${text.replace(/\n/g, '<br>')}</p>` +
        `<hr><p style="color:#888;font-size:12px;">QA Test Status Report — GC SAP Upgrade Rel. 26.02.00</p>`;

      // Fallback: if Power Automate URL not set, open Outlook with mailto:
      if (!POWER_AUTOMATE_URL) {
        const plainBody =
          `Section: ${section}\n\nFrom: ${fromName}\n\nComment:\n${text}\n\n---\nQA Test Status Report — GC SAP Upgrade Rel. 26.02.00`;
        window.location.href = `mailto:${toAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
        this.setState({ commentOpen: false, commentText: '', commentTags: [], commentStatus: 'idle' });
        return;
      }

      // Send via Power Automate
      this.setState({ commentStatus: 'sending', commentError: '' });
      try {
        const res = await fetch(POWER_AUTOMATE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: toAddr, subject, body, fromName }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this.setState({ commentStatus: 'success' });
        setTimeout(() => {
          this.setState({ commentOpen: false, commentText: '', commentTags: [], commentStatus: 'idle' });
        }, 1800);
      } catch (err) {
        this.setState({ commentStatus: 'error', commentError: 'Send failed: ' + err.message });
      }
    };

    const commentStatus = this.state.commentStatus || 'idle';
    const commentError = this.state.commentError || '';
    const isSending = commentStatus === 'sending';
    const isSuccess = commentStatus === 'success';
    const hasError  = commentStatus === 'error';

    const teamWithSelected = team.map(t => {
      const selected = commentTags.includes(t.name);
      return {
        ...t,
        selected,
        bg:     selected ? '#dbeafe' : (dark ? '#1f2d45' : '#f8fafc'),
        color:  selected ? '#2563eb' : (dark ? '#a8b8d8' : '#475569'),
        border: selected ? '#93c5fd' : (dark ? '#2d3f60' : '#e2e8f0'),
        onToggle: () => toggleTag(t.name),
      };
    });

    const tagCountLabel =
      commentTags.length === 0 ? 'No one tagged yet' :
      commentTags.length === 1 ? '1 person tagged'  :
      `${commentTags.length} people tagged`;

    // ─── AUTH + COMMENT STORE ──────────────────────────────────────────────
    const role = this.state.role || 'viewer';
    const isAdmin = role === 'admin';
    const isEditor = isAdmin || role === 'editor';
    const isViewer = !isEditor;
    const roleBadge = (this.state.editorName ? this.state.editorName + ' · ' : '') + (isAdmin ? 'Admin' : 'Editor');
    const xlsxOk = typeof window.XLSX !== 'undefined';
    const importAccept = xlsxOk ? '.xlsx,.xls,.csv' : '.csv';
    const importBtnLabel = xlsxOk ? 'Import XLS / CSV' : 'Import CSV';
    const xlsxNoticeShow = isEditor && !xlsxOk;
    const qLinks = this.state.qtestLinks || this.loadQtestLinks();
    const attachQtest = (pd) => { (pd.tests || []).forEach(t => {
      const url = qLinks[pd.id + '||' + t.name] || '';
      t.qtestUrl = url; t.hasQtest = !!url;
      t.onOpenQtest = () => { if (url) window.open(url, '_blank', 'noopener'); else if (isAdmin) this.setQtestLink(pd.id, t.name); };
      t.onSetQtest = () => this.setQtestLink(pd.id, t.name);
    }); };
    const editorName = this.state.editorName || '';
    const editors = this.getUsers().map(u => u.name);

    const toggleSuperEdit = this.toggleSuperEdit;
    const focusPhase = this.focusPhase;

    const loginOpen = !!this.state.loginOpen;
    const openLogin = () => this.setState({ loginOpen: true, loginError: '', loginPin: '' });
    const closeLogin = () => this.setState({ loginOpen: false });
    const loginName = this.state.loginName || '';
    const loginPin = this.state.loginPin || '';
    const loginError = this.state.loginError || '';
    const loginHasError = !!loginError;
    const setLoginName = (e) => this.setState({ loginName: e.target.value });
    const setLoginPin = (e) => this.setState({ loginPin: e.target.value.replace(/\D/g, '').slice(0, 6) });
    const doLogin = this.doLogin;
    const doLogout = this.doLogout;

    const resetLocalPins = () => {
      try { this.lsDel('qa-pin-hashes'); } catch (e) {}
      this.setState({ loginError: 'PIN reset to the built-in default. Try again.', loginPin: '' });
    };
    const pinOpen = !!this.state.pinOpen;
    const openPin = () => this.setState({ pinOpen: true, pinMsg: 'idle', pinError: '', pinCurrent: '', pinNew1: '', pinNew2: '' });
    const closePin = () => this.setState({ pinOpen: false });
    const pinCurrent = this.state.pinCurrent || '';
    const pinNew1 = this.state.pinNew1 || '';
    const pinNew2 = this.state.pinNew2 || '';
    const setPinCurrent = (e) => this.setState({ pinCurrent: e.target.value.replace(/\D/g, '').slice(0, 6) });
    const setPinNew1 = (e) => this.setState({ pinNew1: e.target.value.replace(/\D/g, '').slice(0, 6) });
    const setPinNew2 = (e) => this.setState({ pinNew2: e.target.value.replace(/\D/g, '').slice(0, 6) });
    const changePin = this.changePin;
    const pinMsg = this.state.pinMsg || 'idle';
    const pinError = this.state.pinError || '';
    const pinSuccess = pinMsg === 'success';
    const pinHasError = pinMsg === 'error';
    // User management (admin only)
    const isSuperAdmin = this.isSuperAdmin();
    const _extra = this.loadExtraUsers();
    const managedUsers = _extra.map(u => ({
      name: u.name, role: u.role,
      roleBg: u.role === 'admin' ? '#ede9fe' : '#dbeafe',
      roleColor: u.role === 'admin' ? '#7c3aed' : '#2563eb',
      onReset: () => this.resetUserPin(u.name),
      onRemove: () => this.removeUser(u.name),
    }));
    const hasManagedUsers = managedUsers.length > 0;
    const noManagedUsers = managedUsers.length === 0;
    const nuName = this.state.nuName || '';
    const nuPin = this.state.nuPin || '';
    const nuRole = this.state.nuRole || 'editor';
    const setNuName = (e) => this.setState({ nuName: e.target.value, nuMsg: 'idle' });
    const setNuPin = (e) => this.setState({ nuPin: e.target.value.replace(/\D/g, '').slice(0, 6), nuMsg: 'idle' });
    const setNuRole = (e) => this.setState({ nuRole: e.target.value });
    const addUser = this.addUser;
    const nuMsg = this.state.nuMsg || 'idle';
    const nuError = this.state.nuError || '';
    const nuOk = this.state.nuOk || '';
    const nuHasError = nuMsg === 'error';
    const nuSuccess = nuMsg === 'success';

    const submitComment = this.submitComment;
    const rawComments = this.state.comments || [];
    const commentCount = rawComments.length;
    const inboxComments = (isEditor ? rawComments : []).map(c => ({ ...c, onDelete: () => this.deleteComment(c.id) }));
    const hasComments = inboxComments.length > 0;
    const noComments = !hasComments;
    const inboxOpen = !!this.state.inboxOpen;
    const openInbox = () => this.setState({ inboxOpen: true });
    const closeInbox = () => this.setState({ inboxOpen: false });
    const inboxCountLabel = commentCount === 1 ? '1 comment' : `${commentCount} comments`;
    const showCommentFab = isViewer && !commentOpen;
    const showInboxFab = isEditor && !inboxOpen;

    // Attach collapse state to each phase
    for (const pd of phaseDetails) {
      pd.collapsed = collapsed[pd.id];
      pd.expanded = !pd.collapsed;
      pd.onToggle = () => toggleCollapse(pd.id);
      pd.chevronRotate = pd.collapsed ? -90 : 0;
      pd.testCount = pd.tests.length;
      attachQtest(pd);
    }

    // ─── APPLY IMPORTED XLS DATA ──────────────────────────────────────────
    const imported = !!(this.state.importedRows && this.state.importedRows.length);
    const hasEnvData = imported; const noEnvData = !imported;
    const importMode = this.state.importMode || 'template';
    let envCharts = [], overallEnv = null, hasCharts = false;
    const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
    const teamStat = (tm) => {
      const t = num(tm.tested);
      if (t === 0) return 'PENDING';
      if (num(tm.failed) > 0) return 'FAIL';
      if (num(tm.blocked) > 0) return 'BLOCKED';
      if (num(tm.passed) > 0) return 'PASS';
      if (num(tm.notRelevant) > 0) return 'NOT RELEVANT';
      return 'PENDING';
    };
    if (imported && importMode === 'qtest') {
      // Environment metadata and order come from the selected release, so an
      // imported qTest export only ever renders the environments that release owns.
      const META = this.relMeta();
      const ORDER = this.relOrder();
      // Previous snapshot (day-over-day delta source)
      const _hist = this.state.history || [];
      const _curIdx = _hist.findIndex(s => s.ts === this.state.viewingTs);
      const _prevSnap = _curIdx >= 0 ? _hist[_curIdx + 1] : _hist[1];
      const prevMap = {};
      if (_prevSnap && _prevSnap.rows) _prevSnap.rows.forEach(r => {
        const k = (r.phase || '') + '||' + (r.test || '');
        const o = prevMap[k] || (prevMap[k] = { passed: 0, failed: 0, blocked: 0 });
        o.passed += Number(r.passed) || 0; o.failed += Number(r.failed) || 0; o.blocked += Number(r.blocked) || 0;
      });
      const hasPrev = !!_prevSnap;
      const fmtDelta = (n) => n > 0 ? ('+' + n) : (n < 0 ? String(n) : '+/-0');
      const tree = {};
      this.state.importedRows.forEach(r => {
        const ph = r.phase; (tree[ph] = tree[ph] || {});
        const tn = r.test || 'Tests'; (tree[ph][tn] = tree[ph][tn] || {});
        const tm = r.team || '(All)';
        const o = tree[ph][tn][tm] || (tree[ph][tn][tm] = { planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0, notRelevant: 0 });
        o.planned += num(r.planned); o.tested += num(r.tested); o.passed += num(r.passed); o.failed += num(r.failed); o.blocked += num(r.blocked); o.notRelevant += num(r.notRelevant);
      });
      const accum = (obj) => Object.values(obj).reduce((a, o) => ({ planned: a.planned + o.planned, tested: a.tested + o.tested, passed: a.passed + o.passed, failed: a.failed + o.failed, blocked: a.blocked + o.blocked, notRelevant: a.notRelevant + o.notRelevant }), { planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0, notRelevant: 0 });
      const suiteOrder = this.state.suiteOrder || {};
      const orderedNames = (id, names) => {
        const saved = suiteOrder[id];
        if (!saved || !saved.length) return names;
        const rest = names.filter(n => saved.indexOf(n) < 0);
        return saved.filter(n => names.indexOf(n) >= 0).concat(rest);
      };
      phaseDetails = ORDER.filter(id => tree[id]).map(id => {
        const meta = META[id] || { label: id, alias: '', dateRange: '', headerBg: 'linear-gradient(90deg,#334155,#475569)' };
        const defaultNames = Object.keys(tree[id]).sort((a, b) => accum(tree[id][b]).planned - accum(tree[id][a]).planned);
        const tests = orderedNames(id, defaultNames).map(tn => {
          const teamsObj = tree[id][tn];
          const teams = Object.keys(teamsObj).filter(t => t !== '(All)').sort((a, b) => teamsObj[b].planned - teamsObj[a].planned).map(tm => {
            const o = teamsObj[tm]; const st = teamStat(o);
            return { name: tm, tested: o.tested, planned: o.planned, passed: o.passed, failed: o.failed, blocked: o.blocked, notRelevant: o.notRelevant, status: st, ...teamStatusStyle(st), onOpenCases: () => this.setState({ tcModal: { phase: id, test: tn, team: tm } }) };
          });
          const a = accum(teamsObj);
          const pct = a.planned > 0 ? Math.min(100, Math.round(a.tested / a.planned * 100)) : 0;
          let st = 'PENDING'; if (a.tested > 0) { const pr = a.passed / a.tested; st = pr >= 0.9 ? 'GREEN' : pr >= 0.6 ? 'AMBER' : 'RED'; }
          const pv = prevMap[id + '||' + tn] || { passed: 0, failed: 0, blocked: 0 };
          const execPct = a.planned > 0 ? Math.round(a.tested / a.planned * 100) : 0;
          const passPct = a.tested > 0 ? Math.round(a.passed / a.tested * 100) : 0;
          return { name: tn, tested: a.tested, planned: a.planned, passed: a.passed, failed: a.failed, blocked: a.blocked, notRelevant: a.notRelevant, pct, execPct, passPct, folderLabel: '', status: st, ...ts(st), teams, hasPrev, dPassed: fmtDelta(a.passed - pv.passed), dFailed: fmtDelta(a.failed - pv.failed), dBlocked: fmtDelta(a.blocked - pv.blocked), onOpenCases: () => this.setState({ tcModal: { phase: id, test: tn } }), onPassed: () => this.setState({ tcModal: { phase: id, test: tn, status: 'Passed' } }), onFailed: () => this.setState({ tcModal: { phase: id, test: tn, status: 'Failed' } }), onBlocked: () => this.setState({ tcModal: { phase: id, test: tn, status: 'Blocked' } }), onNr: () => this.setState({ tcModal: { phase: id, test: tn, status: 'Not relevant' } }) };
        });
        const n = tests.length; const gridCols = n >= 2 ? 'repeat(auto-fit,minmax(min(300px,100%),1fr))' : '1fr';
        const namesNow = tests.map(t => t.name);
        tests.forEach((t, i) => {
          t.canMove = n > 1;
          t.leftDisabled = i === 0; t.rightDisabled = i === n - 1;
          t.leftOp = i === 0 ? 0.35 : 1; t.rightOp = i === n - 1 ? 0.35 : 1;
          t.onMoveLeft = i > 0 ? () => this.moveSuite(id, namesNow, i, -1) : null;
          t.onMoveRight = i < n - 1 ? () => this.moveSuite(id, namesNow, i, 1) : null;
        });
        return { id, label: meta.label, alias: meta.alias, dateRange: meta.dateRange, headerBg: meta.headerBg, gridCols, tests, onOpenRuns: () => this.setState({ tcModal: { phase: id } }) };
      });
      phases = ORDER.map(id => {
        const meta = META[id]; const pd = phaseDetails.find(p => p.id === id);
        if (!pd) return { id, label: meta.label, dateRange: meta.dateRange, status: 'PENDING', pct: 0, paPct: 0, ...ps('PENDING') };
        const pl = pd.tests.reduce((s, t) => s + t.planned, 0), te = pd.tests.reduce((s, t) => s + t.tested, 0), pa = pd.tests.reduce((s, t) => s + t.passed, 0);
        const pct = pl > 0 ? Math.min(100, Math.round(te / pl * 100)) : 0;
        const paPct = te > 0 ? Math.round(pa / te * 100) : 0;
        const st = pct >= 100 ? 'COMPLETE' : pct > 0 ? 'IN PROGRESS' : 'PENDING';
        return { id, label: meta.label, dateRange: meta.dateRange, status: st, pct, paPct, ...ps(st) };
      });
      for (const pd of phaseDetails) { pd.collapsed = collapsed[pd.id]; pd.expanded = !pd.collapsed; pd.onToggle = () => toggleCollapse(pd.id); pd.chevronRotate = pd.collapsed ? -90 : 0; pd.testCount = pd.tests.length; attachQtest(pd); }
      // ─── Burn-down charts per environment + overall ───────────────────────
      const PHD = this.relPhaseDates();
      const allCases = (this.state.importedCases || []).filter(c => !c.unex);
      // A burn-down without axes is unreadable — you cannot tell a day from a
      // month. The SVG carries the lines and gridlines; the number and date
      // labels are HTML positioned by percentage of the same viewBox, because
      // the template runtime cannot render interpolated text inside SVG <text>.
      const BDW = 316, BDH = 120, _bx0 = 40, _bx1 = 296, _by0 = 12, _by1 = 104;
      const _bdDay = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const mkChart = (planned, phaseCases, startMs, endMs, weekendsOff) => {
        const x0 = _bx0, x1 = _bx1, y0 = _by0, y1 = _by1;
        const sx = (t) => { if (endMs === startMs) return x0; const c = Math.max(startMs, Math.min(endMs, t)); return x0 + (c - startMs) / (endMs - startMs) * (x1 - x0); };
        const sy = (v) => y0 + (1 - (planned ? v / planned : 0)) * (y1 - y0);
        const idealPts = `${x0},${sy(planned).toFixed(1)} ${x1},${sy(0).toFixed(1)}`;
        const sorted = phaseCases.filter(c => c.ts).sort((a, b) => a.ts - b.ts);
        const now = Date.now();
        let rem = planned; const pts = [`${x0},${sy(planned).toFixed(1)}`];
        sorted.forEach(c => { if (c.ts > now) return; rem -= 1; pts.push(`${sx(c.ts).toFixed(1)},${sy(rem).toFixed(1)}`); });
        pts.push(`${sx(Math.min(now, endMs)).toFixed(1)},${sy(rem).toFixed(1)}`);
        let timeBurnPct;
        if (weekendsOff) { const total = this.bizDays(startMs, endMs + 86400000) || 1; const elapsed = this.bizDays(startMs, Math.min(now, endMs + 86400000)); timeBurnPct = Math.max(0, Math.min(100, Math.round(elapsed / total * 100))); }
        else { timeBurnPct = endMs > startMs ? Math.max(0, Math.min(100, Math.round((now - startMs) / (endMs - startMs) * 100))) : (now >= endMs ? 100 : 0); }

        // ── axes ──
        const yPct = (v) => (sy(v) / BDH * 100).toFixed(2);
        const xPct = (t) => (sx(t) / BDW * 100).toFixed(2);
        const _round = (v) => { if (v <= 0) return 0; const mag = Math.pow(10, Math.floor(Math.log10(v))); return Math.round(v / mag) * mag; };
        const gridVals = planned > 0
          ? [planned, _round(planned * 0.5), 0].filter((v, i, a) => a.indexOf(v) === i)
          : [0];
        const bdGrid = gridVals.map(v => ({
          key: 'g' + v, label: v >= 1000 ? (Math.round(v / 100) / 10) + 'k' : String(v),
          y: sy(v).toFixed(1), topPct: yPct(v),
        }));
        const span = Math.max(1, endMs - startMs);
        const nTicks = span > 86400000 * 45 ? 5 : span > 86400000 * 10 ? 4 : 3;
        const bdTicks = [];
        for (let i = 0; i < nTicks; i++) {
          const t = startMs + span * (i / (nTicks - 1));
          bdTicks.push({ key: 't' + i, label: _bdDay(t), leftPct: xPct(t),
            align: i === 0 ? 'left' : (i === nTicks - 1 ? 'right' : 'center') });
        }
        const inWindow = now >= startMs && now <= endMs;
        return { idealPts, actualPts: pts.join(' '), remaining: rem, timeBurnPct,
          bdGrid, bdTicks, bdPlotL: _bx0, bdPlotR: _bx1,
          bdGutterPct: (_bx0 / BDW * 100).toFixed(2),
          bdTodayShow: inWindow, bdTodayPct: xPct(now), bdTodayX: sx(now).toFixed(1),
          bdStartLabel: _bdDay(startMs), bdEndLabel: _bdDay(endMs),
          bdRemainLabel: rem + ' of ' + planned + ' left' };
      };
      const _bdFd = (t) => { const dt = new Date(t); return String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + dt.getFullYear(); };
      const bdOpen = this.state.bdOpen || null;
      envCharts = phaseDetails.map(pd => {
        const planned = pd.tests.reduce((s, t) => s + t.planned, 0);
        const executed = pd.tests.reduce((s, t) => s + t.tested, 0);
        const passed = pd.tests.reduce((s, t) => s + t.passed, 0);
        const _relWin = this.relWindow();
        const d = PHD[pd.id] || [this.relIso(_relWin.start), this.relIso(_relWin.end)];
        const sMs = this.relStart(d[0]), eMs = this.relStart(d[1]);
        // The cutover environment runs through the weekend; every other one does not.
        const wkOff = !this.relRunsWeekends(pd.id);
        const cs = allCases.filter(c => c.phase === pd.id);
        const chart = mkChart(planned, cs, sMs, eMs, wkOff);
        const failed = cs.filter(c => c.status === 'Failed').length;
        const blocked = cs.filter(c => c.status === 'Blocked').length;
        const nowT = Date.now();
        const _wd = (a, b) => wkOff ? this.bizDays(a, b) : Math.max(0, Math.round((b - a) / 86400000));
        const wdTotal = Math.max(1, _wd(sMs, eMs + 86400000));
        const wdElapsed = Math.max(0, Math.min(wdTotal, _wd(sMs, Math.min(nowT, eMs + 86400000))));
        const wdLeft = Math.max(0, wdTotal - wdElapsed);
        const remaining = Math.max(0, planned - executed);
        const pace = wdElapsed > 0 ? Math.round(executed / wdElapsed * 10) / 10 : 0;
        const needPerDay = wdLeft > 0 ? Math.ceil(remaining / wdLeft) : remaining;
        const idealDone = Math.round(planned * wdElapsed / wdTotal);
        const delta = executed - idealDone;
        const onTrack = remaining === 0 || (wdLeft > 0 && pace >= needPerDay);
        const gapColor = remaining === 0 ? '#4caf2f' : (wdLeft === 0 ? '#ef4444' : (onTrack ? '#4caf2f' : '#f6b73c'));
        const dayUnit = wkOff ? 'working day' : 'day';
        const verdict = remaining === 0
          ? ('All ' + planned + ' tests executed \u2014 ' + passed + ' passed, ' + failed + ' failed, ' + blocked + ' blocked.')
          : wdLeft === 0
            ? ('Window closed on ' + _bdFd(eMs) + ' \u2014 ' + remaining + ' test' + (remaining === 1 ? '' : 's') + ' never executed.')
            : (needPerDay + ' test' + (needPerDay === 1 ? '' : 's') + ' per ' + dayUnit + ' to finish the remaining ' + remaining + ' by ' + _bdFd(eMs)
               + ' \u00b7 current pace \u00d8 ' + pace + '/' + dayUnit + ' \u00b7 '
               + (delta >= 0 ? (delta + ' ahead of the ideal line') : (Math.abs(delta) + ' behind the ideal line')) + '.');
        const tsList = cs.filter(c => c.ts && c.ts <= nowT).map(c => c.ts);
        const lastExecLabel = tsList.length ? ('Last execution ' + _bdFd(Math.max.apply(null, tsList))) : 'No executions recorded yet';
        const open = bdOpen === pd.id;
        return { id: pd.id, label: pd.label, dateRange: pd.dateRange, planned, executed, passed, failed, blocked, remaining,
          executedPct: planned ? Math.round(executed / planned * 100) : 0, passedPct: executed ? Math.round(passed / executed * 100) : 0,
          lineColor: '#2563eb', ...chart,
          open, span: open ? '1 / -1' : 'auto', chartH: open ? 150 : 76, chevron: open ? '\u25be' : '\u25b8',
          toggleTitle: open ? 'Collapse ' + pd.id : 'Show detail for ' + pd.id,
          onToggle: () => this.setState(s => ({ bdOpen: s.bdOpen === pd.id ? null : pd.id })),
          winLabel: _bdFd(sMs) + ' \u2013 ' + _bdFd(eMs),
          dayLabel: wkOff
            ? (wdTotal + ' working days \u00b7 day ' + wdElapsed + ' of ' + wdTotal + ' \u00b7 ' + wdLeft + ' left')
            : (wdTotal + ' days \u00b7 day ' + wdElapsed + ' of ' + wdTotal + ' \u00b7 ' + wdLeft + ' left'),
          lastExecLabel, pace, needPerDay, gapColor, verdict };
      });
      const aP = envCharts.reduce((s, e) => s + e.planned, 0);
      const aE = envCharts.reduce((s, e) => s + e.executed, 0);
      const aPa = envCharts.reduce((s, e) => s + e.passed, 0);
      const _ovWin = this.relWindow();
      const _ovStart = _ovWin.start == null ? now : _ovWin.start, _ovEnd = _ovWin.end == null ? now : _ovWin.end;
      overallEnv = { id: 'ALL', label: 'Overall — All Environments', dateRange: this.relFmt(_ovStart) + ' – ' + this.relFmt(_ovEnd), planned: aP, executed: aE, passed: aPa, executedPct: aP ? Math.round(aE / aP * 100) : 0, passedPct: aE ? Math.round(aPa / aE * 100) : 0, lineColor: '#22c55e', ...mkChart(aP, allCases, _ovStart, _ovEnd, true) };
      hasCharts = true;
    } else if (imported) {
      const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const map = new Map();
      this.state.importedRows.forEach(r => {
        map.set(norm(r.phase) + '|' + norm(r.test) + '|' + norm(r.team), r);
      });
      const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
      for (const pd of phaseDetails) {
        for (const t of pd.tests) {
          if (t.teams && t.teams.length) {
            t.teams.forEach(tm => {
              const r = map.get(norm(pd.id) + '|' + norm(t.name) + '|' + norm(tm.name));
              if (r) {
                tm.tested = num(r.tested); tm.passed = num(r.passed); tm.failed = num(r.failed);
                tm.blocked = num(r.blocked); tm.notRelevant = num(r.notRelevant);
                if (r.planned != null && String(r.planned).trim() !== '') tm.planned = num(r.planned);
                tm.status = teamStat(tm);
                Object.assign(tm, teamStatusStyle(tm.status));
              }
            });
            t.tested = sum(t.teams, 'tested'); t.passed = sum(t.teams, 'passed');
            t.failed = sum(t.teams, 'failed'); t.blocked = sum(t.teams, 'blocked');
            t.notRelevant = sum(t.teams, 'notRelevant');
            const pl = sum(t.teams, 'planned'); if (pl) t.planned = pl;
          } else {
            const r = map.get(norm(pd.id) + '|' + norm(t.name) + '|');
            if (r) {
              t.tested = num(r.tested); t.passed = num(r.passed); t.failed = num(r.failed);
              t.blocked = num(r.blocked); t.notRelevant = num(r.notRelevant);
              if (r.planned != null && String(r.planned).trim() !== '') t.planned = num(r.planned);
            }
          }
          const pl = Number(t.planned) || 0;
          const tp = num(t.tested);
          t.pct = pl > 0 ? Math.min(100, Math.round(tp / pl * 100)) : 0;
          if (tp > 0) {
            const pr = num(t.passed) / tp;
            const st = pr >= 0.9 ? 'GREEN' : pr >= 0.6 ? 'AMBER' : 'RED';
            t.status = st; Object.assign(t, ts(st));
          }
        }
      }
      // Update timeline phases from aggregates
      phases.forEach(ph => {
        const pd = phaseDetails.find(p => p.id === ph.id);
        if (!pd) return;
        const pPlanned = pd.tests.reduce((s, t) => s + (Number(t.planned) || 0), 0);
        const pTested = pd.tests.reduce((s, t) => s + (Number(t.tested) || 0), 0);
        if (pPlanned > 0) {
          ph.pct = Math.min(100, Math.round(pTested / pPlanned * 100));
          const st = ph.pct >= 100 ? 'COMPLETE' : ph.pct > 0 ? 'IN PROGRESS' : 'PENDING';
          ph.status = st; Object.assign(ph, ps(st));
        }
      });
    }

    // Summary aggregation
    let sumPlanned = 0, sumTested = 0, sumPassed = 0, sumFailed = 0, sumBlocked = 0, sumNR = 0;
    for (const pd of phaseDetails) {
      for (const t of pd.tests) {
        sumPlanned  += Number(t.planned)      || 0;
        sumTested   += Number(t.tested)       || 0;
        sumPassed   += Number(t.passed)       || 0;
        sumFailed   += Number(t.failed)       || 0;
        sumBlocked  += Number(t.blocked)      || 0;
        sumNR       += Number(t.notRelevant)  || 0;
      }
    }
    const circ = 2 * Math.PI * 38;
    const testedPct = sumPlanned > 0 ? Math.round(sumTested / sumPlanned * 100) : 0;
    const passedPct = sumPlanned > 0 ? Math.round(sumPassed / sumPlanned * 100) : 0;
    const summary = {
      planned: sumPlanned || '—', tested: sumTested || '—',
      passed: sumPassed, failed: sumFailed, blocked: sumBlocked, notRelevant: sumNR,
      testedPct, passedPct,
      testedDash: ((testedPct / 100) * circ).toFixed(1),
      passedDash: ((passedPct / 100) * circ).toFixed(1),
      testedColor: testedPct >= 80 ? '#22c55e' : testedPct >= 40 ? '#f59e0b' : '#94a3b8',
      passedColor: passedPct >= 80 ? '#22c55e' : passedPct >= 40 ? '#f59e0b' : '#ef4444',
      pendingCnt: Math.max(0, (sumPlanned || 0) - (sumTested || 0)),
      wPassed: sumPlanned > 0 ? (sumPassed / sumPlanned * 100).toFixed(1) : 0,
      wFailed: sumPlanned > 0 ? (sumFailed / sumPlanned * 100).toFixed(1) : 0,
      wBlocked: sumPlanned > 0 ? (sumBlocked / sumPlanned * 100).toFixed(1) : 0,
      wNr: sumPlanned > 0 ? (sumNR / sumPlanned * 100).toFixed(1) : 0,
    };

    // Overall status derived from imported data
    let overallStatus, headerAccent;
    if (!imported) {
      overallStatus = 'AWAITING IMPORT'; headerAccent = '#94a3b8';
    } else if (summary.failed > summary.passed && summary.passedPct < 50) {
      overallStatus = 'AT RISK'; headerAccent = '#d97706';
    } else {
      overallStatus = 'ON TRACK'; headerAccent = '#95c11f';
    }

    const defects = [
      { label: 'Critical', count: 0, color: '#ef4444', bg: '#fef2f2' },
      { label: 'High',     count: 0, color: '#ea580c', bg: '#fff7ed' },
      { label: 'Medium',   count: 0, color: '#d97706', bg: '#fffbeb' },
      { label: 'Low',      count: 0, color: '#65a30d', bg: '#f7fee7' },
    ];
    const maxCount = Math.max(...defects.map(d => d.count), 1);
    const totalDefects = defects.reduce((s, d) => s + d.count, 0);
    const defectsWithBar = defects.map(d => ({ ...d, barWidth: Math.round(d.count / maxCount * 100) }));

    const topicColors = (lv) => {
      const dk = theme === 'dark';
      if (lv === 'Info') return { color: '#3b82f6', bg: dk ? 'rgba(59,130,246,0.08)' : '#eff6ff' };
      if (lv === 'Watch') return { color: '#f6b73c', bg: dk ? 'rgba(246,183,60,0.07)' : '#fffbeb' };
      if (lv === 'Risk' || lv === 'Blocker') return { color: '#ef4444', bg: dk ? 'rgba(239,68,68,0.08)' : '#fef2f2' };
      if (lv === 'Decision') return { color: '#95c11f', bg: dk ? 'rgba(149,193,31,0.08)' : '#f0fdf4' };
      return { color: '#8b95ab', bg: dk ? 'rgba(139,149,171,0.08)' : '#f1f5f9' };
    };
    const topicsData = this.state.topics || this._defaultTopics();
    const risks = topicsData.map(t => ({ id: t.id, level: t.level, text: t.text, title: t.title || '', hasTitle: !!t.title, meta: t.meta || '', hasMeta: !!t.meta, ...topicColors(t.level), onEdit: () => this.setState({ topicModal: { id: t.id, level: t.level, text: t.text, title: t.title || '' } }), onDelete: () => this.deleteTopic(t.id) }));
    const topicModalOpen = !!this.state.topicModal;
    const _tm = this.state.topicModal || {};
    const tmLevel = _tm.level || 'Watch';
    const tmText = _tm.text || '';
    const tmTitle = _tm.title || '';
    const setTmTitle = (e) => this.setState({ topicModal: { ...(this.state.topicModal || {}), title: e.target.value } });
    const tmIsEdit = !!_tm.id;
    const tmIsNew = topicModalOpen && !_tm.id;
    const topicLevels = ['Info', 'Watch', 'Risk', 'Blocker', 'Decision'];
    const setTmLevel = (e) => this.setState({ topicModal: { ...(this.state.topicModal || {}), level: e.target.value } });
    const setTmText = (e) => this.setState({ topicModal: { ...(this.state.topicModal || {}), text: e.target.value } });
    const openTopicNew = () => this.setState({ topicModal: { level: 'Watch', text: '', title: '' } });
    const closeTopic = () => this.setState({ topicModal: null });
    const saveTopic = this.saveTopic;

    // ─── ADMIN MILESTONE / INFO + TC MODAL exposure ───────────────────────
    // Default to the next real schedule boundary of this release; an editor may
    // still override it by hand.
    const _msDefault = this.relNextMilestonePoint();
    const adminMilestone = this.state.milestone || _msDefault && _msDefault.label
      || this.props.nextMilestone || 'No upcoming milestone';
    const adminMilestoneDate = this.state.milestoneDate || _msDefault && this.relFmt(_msDefault.t)
      || this.props.nextMilestoneDate || '—';
    const infoNote = this.state.infoNote || '';
    const hasInfo = !!infoNote;
    const milestoneOpen = !!this.state.milestoneOpen;
    const openMilestone = () => this.setState({ milestoneOpen: true, mMilestone: adminMilestone, mDate: adminMilestoneDate, mInfo: infoNote });
    const closeMilestone = () => this.setState({ milestoneOpen: false });
    const mMilestone = this.state.mMilestone != null ? this.state.mMilestone : adminMilestone;
    const mDate = this.state.mDate != null ? this.state.mDate : adminMilestoneDate;
    const mInfo = this.state.mInfo != null ? this.state.mInfo : infoNote;
    const setMMilestone = (e) => this.setState({ mMilestone: e.target.value });
    const setMDate = (e) => this.setState({ mDate: e.target.value });
    const setMInfo = (e) => this.setState({ mInfo: e.target.value });
    const saveMilestone = this.saveMilestone;

    const tcStatusStyle = (s) => {
      if (s === 'Unexecuted') return { stColor: '#64748b', stBg: 'var(--chip-bg)' };
      if (s === 'Passed') return { stColor: '#4caf2f', stBg: '#eaf3cf' };
      if (s === 'Failed') return { stColor: '#ef4444', stBg: '#fee2e2' };
      if (s === 'Blocked') return { stColor: '#3b82f6', stBg: '#dbeafe' };
      if (s === 'Not relevant') return { stColor: '#a855f7', stBg: '#ede9fe' };
      return { stColor: '#64748b', stBg: '#f1f5f9' };
    };
    const tcModalOpen = !!this.state.tcModal;
    const tcSel = this.state.tcModal || {};
    const _caseSrc = this.state.importedCases || [];
    const _allCases = _caseSrc.filter(c => !c.unex);      // executed runs (history/statistics)
    const _unexCases = _caseSrc.filter(c => c.unex);      // planned but not yet executed
    const _tcJb = this.state.jiraBase || this.loadJiraBase() || '';
    const _tcDefs = this.state.jiraDefects || [];
    const _trMap = {};
    _tcDefs.forEach(d => { const mm = String(d.links || '').match(/TR-(\d+)/gi); if (mm) mm.forEach(t => { const n = t.replace(/TR-/i, ''); (_trMap[n] = _trMap[n] || []).push(String(d.key).toUpperCase()); }); });
    const _bugMeta = {}; _tcDefs.forEach(d => { _bugMeta[String(d.key).toUpperCase()] = d; });
    const _bugsFor = (c) => {
      const keys = (c.defects || []).map(k => String(k).toUpperCase());
      const rid = String(c.id == null ? '' : c.id).trim();
      if (rid && _trMap[rid]) _trMap[rid].forEach(k => keys.push(k));
      return Array.from(new Set(keys)).map(k => {
        const dm = _bugMeta[k];
        return { key: k, imported: !!dm, status: dm ? (dm.status || '') : '', href: _tcJb ? this.jiraTicketUrl(_tcJb, k) : '#', onOpen: (e) => { if (!_tcJb) { if (e && e.preventDefault) e.preventDefault(); this.openJira(k); } } };
      });
    };
    const _hkOf = (c) => String(c.id == null || String(c.id).trim() === '' ? (c.name || '') : c.id).trim().toUpperCase() + '||' + c.phase;
    const _histIdx = {};
    _allCases.forEach(c => { const k = _hkOf(c); (_histIdx[k] = _histIdx[k] || []).push(c); });
    const _fmtD = (t) => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
    const _tcHistKey = this.state.tcHistKey || null;
    const _ledger = this._ledger || (this._ledger = this.loadLedger());
    const _PTY_C = { 'Inhouse Berater': '#2563eb', 'Key User': '#7c3aed', 'FIS': '#0891b2' };
    const _histFor = (c) => {
      const hk = _hkOf(c);
      const fromImport = (_histIdx[hk] || [c]).map(r => ({ ts: r.ts, tester: r.tester, status: r.status, dir: r.dir, party: this.partyOf(r) }));
      const fromLedger = (_ledger[hk] || []);
      const seen = {}; const runs = [];
      fromLedger.concat(fromImport).forEach(r => {
        const sig = (r.ts || 0) + '|' + (r.tester || '') + '|' + r.status;
        if (seen[sig]) return; seen[sig] = 1; runs.push(r);
      });
      runs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const testers = Array.from(new Set(runs.map(r => r.tester).filter(t => t && t !== '—')));
      const done = {}; runs.forEach(r => { done[r.party] = (done[r.party] || 0) + 1; });
      const partyChips = this.PARTIES.map(p => ({
        label: p, count: done[p] || 0, tested: !!done[p],
        bg: done[p] ? 'rgba(76,175,47,0.14)' : 'var(--card-bg2)',
        color: done[p] ? '#3f7d20' : 'var(--tx-fnt)',
        brd: done[p] ? '#4caf2f' : 'var(--brd-2)',
        mark: done[p] ? '✓' : '○'
      }));
      const missing = this.PARTIES.filter(p => !done[p]);
      const open = _tcHistKey === hk;
      return {
        runCount: runs.length, lastExec: _fmtD(runs[0] && runs[0].ts), partyChips,
        partyGap: missing.length ? 'offen: ' + missing.join(', ') : 'alle Parteien getestet',
        partyGapColor: missing.length ? '#d97706' : '#3f7d20',
        partyDone: this.PARTIES.length - missing.length,
        runsBg: runs.length > 1 ? 'rgba(217,119,6,0.14)' : 'var(--card-bg)',
        runsColor: runs.length > 1 ? '#d97706' : 'var(--tx-mut)',
        testerAll: testers.length ? testers.join(', ') : '—',
        histOpen: open, histClosed: !open,
        onHist: () => this.setState({ tcHistKey: open ? null : hk }),
        histRows: runs.map((r, i) => ({ n: runs.length - i, when: _fmtD(r.ts), tester: r.tester || '—', status: r.status, dir: r.dir || '—', party: r.party || 'Sonstige', partyColor: _PTY_C[r.party] || 'var(--tx-fnt)', ...tcStatusStyle(r.status) }))
      };
    };
    const _tcScope = (c) => c.phase === tcSel.phase && (!tcSel.test || c.test === tcSel.test) && (!tcSel.team || c.team === tcSel.team) && (!tcSel.module || c.module === tcSel.module);
    const tcShowUnex = this.state.tcShowUnex !== false;
    const _tcExec = tcModalOpen ? _allCases.filter(c => _tcScope(c) && (!tcSel.status || c.status === tcSel.status)) : [];
    // a status drill-down (Passed/Failed/…) is by definition executed — unexecuted only in the unfiltered list
    const _tcUnex = (tcModalOpen && !tcSel.status && tcShowUnex) ? _unexCases.filter(_tcScope) : [];
    const _tcAll = _tcExec.concat(_tcUnex).map(c => { const bugs = _bugsFor(c); const unex = !!c.unex; return { ...c, ...tcStatusStyle(unex ? 'Unexecuted' : c.status), ..._histFor(c), unex, executed: !unex, statusLabel: unex ? 'Not executed' : (c.status || '—'), bugs, hasBugs: bugs.length > 0, noBugs: bugs.length === 0 }; });

    // ─── filters over the opened list ────────────────────────────────────
    // Options are built from the rows actually in scope, so a dropdown never
    // offers a value that would return nothing.
    const trfQ = String(this.state.trfQ || '').trim().toLowerCase();
    const trfStatus = this.state.trfStatus || 'All statuses';
    const trfTeam = this.state.trfTeam || 'All teams';
    const trfTester = this.state.trfTester || 'All testers';
    const trfRuns = this.state.trfRuns || 'Any runs';
    const trfBug = this.state.trfBug || 'Any bug';
    const _uniq = (arr) => arr.filter(v => v && String(v).trim()).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => String(a).localeCompare(String(b)));
    const trfStatusOpts = ['All statuses'].concat(_uniq(_tcAll.map(c => c.statusLabel)));
    const trfTeamOpts = ['All teams'].concat(_uniq(_tcAll.map(c => c.team)));
    const trfTesterOpts = ['All testers'].concat(_uniq(_tcAll.map(c => c.tester)));
    const trfRunsOpts = ['Any runs', 'Not executed', 'Executed once', 'Retried (2+)'];
    const trfBugOpts = ['Any bug', 'With linked bug', 'Without bug'];
    const _trfMatchRuns = (c) => trfRuns === 'Any runs' ? true
      : trfRuns === 'Not executed' ? c.unex
      : trfRuns === 'Executed once' ? (!c.unex && (c.runCount || 0) <= 1)
      : (c.runCount || 0) > 1;
    const _trfMatchQ = (c) => !trfQ || [c.name, c.test, c.team, c.tester, c.id, (c.bugs || []).map(b => b.key).join(' ')]
      .some(v => String(v == null ? '' : v).toLowerCase().indexOf(trfQ) >= 0);
    const tcCases = _tcAll.filter(c =>
      (trfStatus === 'All statuses' || c.statusLabel === trfStatus) &&
      (trfTeam === 'All teams' || c.team === trfTeam) &&
      (trfTester === 'All testers' || c.tester === trfTester) &&
      (trfBug === 'Any bug' || (trfBug === 'With linked bug' ? c.hasBugs : !c.hasBugs)) &&
      _trfMatchRuns(c) && _trfMatchQ(c));
    const trfActive = !!trfQ || trfStatus !== 'All statuses' || trfTeam !== 'All teams'
      || trfTester !== 'All testers' || trfRuns !== 'Any runs' || trfBug !== 'Any bug';
    const trfClear = () => this.setState({ trfQ: '', trfStatus: 'All statuses', trfTeam: 'All teams', trfTester: 'All testers', trfRuns: 'Any runs', trfBug: 'Any bug' });
    const trfCountLabel = trfActive
      ? (tcCases.length + ' of ' + _tcAll.length + ' runs')
      : (_tcAll.length + ' run' + (_tcAll.length === 1 ? '' : 's'));
    const trfHasTeams = trfTeamOpts.length > 2;
    const trfHasTesters = trfTesterOpts.length > 2;

    const tcTitle = tcModalOpen ? [tcSel.phase, tcSel.test, tcSel.team, tcSel.module, tcSel.status].filter(Boolean).join(' · ') : '';
    const tcCount = _tcExec.length;
    const tcUnexTotal = tcModalOpen && !tcSel.status ? _unexCases.filter(_tcScope).length : 0;
    const tcHasUnex = tcUnexTotal > 0;
    const tcUnexLabel = (tcShowUnex ? 'Hide' : 'Show') + ' ' + tcUnexTotal + ' not executed';
    const toggleTcUnex = () => this.setState({ tcShowUnex: !tcShowUnex });
    const tcHasCases = tcCases.length > 0;
    const tcNoCases = tcModalOpen && tcCases.length === 0;
    const tcNoMatch = tcModalOpen && tcCases.length === 0 && _tcAll.length > 0;
    const tcTrulyEmpty = tcModalOpen && _tcAll.length === 0;
    const closeTcModal = () => this.setState({ tcModal: null, tcHistKey: null,
      trfQ: '', trfStatus: 'All statuses', trfTeam: 'All teams', trfTester: 'All testers', trfRuns: 'Any runs', trfBug: 'Any bug' });

    // ─── qTEST LINKS MANAGER ──────────────────────────────────────────────
    const qtestModalOpen = !!this.state.qtestModal;
    const qtestGroups = (phaseDetails || []).map(pd => ({
      id: pd.id, label: pd.label,
      suites: (pd.tests || []).map(t => {
        const key = pd.id + '||' + t.name;
        return { name: t.name, url: qLinks[key] || '', onInput: (e) => { this._qtestDraft = this._qtestDraft || {}; this._qtestDraft[key] = e.target.value; } };
      }),
    }));
    const qtestHasSuites = qtestGroups.length > 0;
    const qtestNoSuites = qtestModalOpen && !qtestHasSuites;
    const openQtestManager = () => { this._qtestDraft = { ...qLinks }; this.setState({ qtestModal: true }); };
    const closeQtestManager = () => this.setState({ qtestModal: false });
    const saveQtestManager = this.saveQtestManager;

    // ─── RELEASE COUNTDOWN + WORKFLOW TIMELINE ────────────────────────────────
    const now = this.state.now || Date.now();
    const dayMs = 86400000;
    const pStart = (d) => { const t = this.relStart(d); return t == null ? NaN : t; };
    const pEnd = (d) => { const t = this.relEnd(d); return t == null ? NaN : t; };
    const fmtD = (d) => this.relFmtShort(d);
    const pad2 = (n) => String(n).padStart(2, '0');
    const SCHED = this.PHASES_SCHED, PC = this.PHASE_COLORS;
    let cdPhase = null; for (const ph of SCHED) { if (pEnd(ph.end) >= now) { cdPhase = ph; break; } }
    let countdown;
    const _workLabel = this.workLabel();
    if (!cdPhase) {
      // no environments at all is not the same as every phase being finished
      countdown = SCHED.length
        ? { active: false, id: '✓', label: 'Released', note: 'All phases complete', days: '00', hours: '00', mins: '00', dayWord: '', hint: _workLabel }
        : { active: false, id: '—', label: 'Not scheduled', note: 'No test environments configured for this release', days: '00', hours: '00', mins: '00', dayWord: '', hint: 'Add environments under Manage Releases' };
    }
    else {
      const started = pStart(cdPhase.start) <= now;
      const _tEnd = pEnd(cdPhase.testEnd || cdPhase.end);
      const inGrey = !!cdPhase.testEnd && now > _tEnd;
      const target = started ? (inGrey ? pEnd(cdPhase.end) : _tEnd) : pStart(cdPhase.start);
      // A cutover environment is worked round the clock; everything else counts
      // only the configured working time, so the clock does not tick overnight.
      const roundClock = this.relRunsWeekends(cdPhase.id);
      let dd, hh, mm;
      if (roundClock) {
        let diff = Math.max(0, target - now);
        dd = Math.floor(diff / dayMs); diff -= dd * dayMs;
        hh = Math.floor(diff / 3600000); diff -= hh * 3600000;
        mm = Math.floor(diff / 60000);
      } else {
        const perDay = this.workDayMinutes();
        const wm = this.workMinutesBetween(now, target);
        dd = Math.floor(wm / perDay);
        const rest = wm - dd * perDay;
        hh = Math.floor(rest / 60);
        mm = rest % 60;
      }
      countdown = { active: true, id: cdPhase.id, label: cdPhase.label, started,
        dayWord: roundClock ? '' : ' work',
        hint: roundClock ? 'Round-the-clock cutover window' : _workLabel,
        note: started ? (inGrey ? ((cdPhase.greyNote || 'Fix & retest') + ' till ' + fmtD(cdPhase.end)) : ('Test execution ends ' + fmtD(cdPhase.testEnd || cdPhase.end))) : ('Starts ' + fmtD(cdPhase.start)),
        days: pad2(dd), hours: pad2(hh), mins: pad2(mm) };
    }
    const _relBounds = this.relWindow();
    const tlStart = SCHED.length ? pStart(SCHED[0].start) : (_relBounds.start == null ? now : _relBounds.start);
    const tlEnd = SCHED.length ? pEnd(SCHED[SCHED.length - 1].end) : (_relBounds.end == null ? now + dayMs : _relBounds.end);
    const tlSpan = tlEnd - tlStart || 1;
    const timeline = SCHED.map(ph => { const s = pStart(ph.start), e = pEnd(ph.end);
      const te = ph.testEnd ? pEnd(ph.testEnd) : null;
      const cur = !!(cdPhase && cdPhase.id === ph.id);
      const segColor = cur ? '#95c11f' : (PC[ph.id] || '#64748b');
      return { id: ph.id, label: ph.label, color: segColor, onFocus: () => this.focusPhase(ph.id),
        left: ((s - tlStart) / tlSpan * 100).toFixed(2), width: ((e - s) / tlSpan * 100).toFixed(2),
        isCur: cur, done: e < now,
        hasGrey: !!te, greyLeft: te ? ((te - s) / (e - s) * 100).toFixed(2) : '0', greyWidth: te ? ((e - te) / (e - s) * 100).toFixed(2) : '0',
        op: e < now ? 0.5 : 1, ring: cur ? ('0 0 0 2px var(--card-bg), 0 0 0 4px ' + segColor) : 'none',
        dateRange: fmtD(ph.start) + ' – ' + fmtD(ph.testEnd || ph.end) + (ph.testEnd ? ' · ' + (ph.greyNote || 'Fix & retest') + ' till ' + fmtD(ph.end) : ''), days: Math.round((e - s) / dayMs) + 1 }; });
    const todayPct = Math.max(0, Math.min(100, (now - tlStart) / tlSpan * 100)).toFixed(2);
    const todayInRange = now >= tlStart && now <= tlEnd;
    (phases || []).forEach(p => { p.onFocus = () => this.focusPhase(p.id); });
    const openTimelineModal = () => this.setState({ timelineModal: true });
    const closeTimelineModal = () => this.setState({ timelineModal: false });
    const timelineModalOpen = !!this.state.timelineModal;

    // ─── EXECUTION CALENDAR (tests executed per day · per environment) ────
    const execCalPhase = this.state.execCalPhase || null;
    (phaseDetails || []).forEach(pd => { pd.onOpenCalendar = (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ execCalModal: true, execCalPhase: pd.id, execCalDay: null, execCalMonth: null, execArea: null, execTeam: null, execSelStatus: null }); }; pd.hasExecDates = (_allCases || []).some(c => c.ts && c.phase === pd.id); });

    // Area (application / test-suite) filter + pacing suggestion
    const _execScope = _allCases.filter(c => !execCalPhase || c.phase === execCalPhase);
    const _appRows = (this.state.importedApps || []).filter(a => !execCalPhase || a.phase === execCalPhase);
    const _suiteRows = (this.state.importedRows || []).filter(r => !execCalPhase || r.phase === execCalPhase);
    const _useApps = _appRows.length > 0;
    const areaOf = (c) => _useApps ? (c.application || '(Unassigned)') : (c.test || 'Tests');
    const _plannedByArea = {};
    if (_useApps) _appRows.forEach(a => { const k = a.application || '(Unassigned)'; _plannedByArea[k] = (_plannedByArea[k] || 0) + num(a.planned || 0); });
    else _suiteRows.forEach(r => { const k = r.test || 'Tests'; _plannedByArea[k] = (_plannedByArea[k] || 0) + num(r.planned || 0); });
    const _execByArea = {};
    _execScope.forEach(c => { const k = areaOf(c); _execByArea[k] = (_execByArea[k] || 0) + 1; });
    const _areaNames = (Object.keys(_plannedByArea).length ? Object.keys(_plannedByArea) : Object.keys(_execByArea))
      .sort((a, b) => (_plannedByArea[b] || 0) - (_plannedByArea[a] || 0) || String(a).localeCompare(String(b)));
    const execArea = (this.state.execArea && _areaNames.indexOf(this.state.execArea) >= 0) ? this.state.execArea : null;
    const execAreaKind = _useApps ? 'application' : 'test suite';
    const _totPlanned = _areaNames.reduce((a, k) => a + (_plannedByArea[k] || 0), 0);
    const _totExec = _execScope.length;
    const execAreaChips = [{ key: '', label: 'All areas', ex: _totExec, pl: _totPlanned }]
      .concat(_areaNames.map(k => ({ key: k, label: k, ex: _execByArea[k] || 0, pl: _plannedByArea[k] || 0 })))
      .map(a => { const act = (execArea || '') === a.key;
        return { ...a, active: act, chipBg: act ? '#1a3360' : 'var(--card-bg)', chipColor: act ? '#ffffff' : 'var(--tx)',
          chipBrd: act ? '#1a3360' : 'var(--brd-2)',
          onClick: () => this.setState({ execArea: a.key || null, execTeam: null, execCalDay: null, execSelStatus: null }) }; });
    const _areaLabel = execArea || 'All areas';
    // Team filter (2nd level) — teams inside the selected area
    const _teamScope = _execScope.filter(c => !execArea || areaOf(c) === execArea);
    const _plannedByTeam = {};
    _suiteRows.forEach(r => {
      if (execArea) {
        const rowArea = _useApps ? (r.application || r.module || '') : (r.test || 'Tests');
        if (rowArea !== execArea) return;
      }
      const k = (r.team && r.team !== '(All)') ? r.team : (r.module || '(Unassigned)');
      _plannedByTeam[k] = (_plannedByTeam[k] || 0) + num(r.planned || 0); });
    const teamOf = (c) => c.team || c.module || '(Unassigned)';
    const _execByTeam = {};
    _teamScope.forEach(c => { const k = teamOf(c); _execByTeam[k] = (_execByTeam[k] || 0) + 1; });
    if (!Object.keys(_plannedByTeam).length) Object.keys(_execByTeam).forEach(k => { _plannedByTeam[k] = _execByTeam[k]; });
    const _teamNames = (Object.keys(_plannedByTeam).length ? Object.keys(_plannedByTeam) : Object.keys(_execByTeam))
      .sort((a, b) => (_plannedByTeam[b] || 0) - (_plannedByTeam[a] || 0) || String(a).localeCompare(String(b)));
    const execTeam = (this.state.execTeam && _teamNames.indexOf(this.state.execTeam) >= 0) ? this.state.execTeam : null;
    const _tTotPl = _teamNames.reduce((a, k) => a + (_plannedByTeam[k] || 0), 0) || _totPlanned;
    const execTeamChips = [{ key: '', label: 'All teams', ex: _teamScope.length, pl: _tTotPl }]
      .concat(_teamNames.map(k => ({ key: k, label: k, ex: _execByTeam[k] || 0, pl: _plannedByTeam[k] || 0 })))
      .map(a => { const act = (execTeam || '') === a.key;
        return { ...a, chipBg: act ? '#4caf2f' : 'var(--card-bg)', chipColor: act ? '#ffffff' : 'var(--tx)',
          chipBrd: act ? '#4caf2f' : 'var(--brd-2)',
          onClick: () => this.setState({ execTeam: a.key || null, execCalDay: null, execSelStatus: null }) }; });
    const execHasTeams = _teamNames.length > 1;
    const execAreaLabel = _areaLabel + (execTeam ? ' \u00b7 ' + execTeam : '');
    const execDated = _execScope.filter(c => c.ts && (!execArea || areaOf(c) === execArea) && (!execTeam || teamOf(c) === execTeam));

    const execPlanned = execTeam ? (_plannedByTeam[execTeam] || 0) : (execArea ? (_plannedByArea[execArea] || 0) : _totPlanned);
    const execExecuted = execTeam ? (_execByTeam[execTeam] || 0) : (execArea ? (_execByArea[execArea] || 0) : _totExec);
    const execRemaining = Math.max(0, execPlanned - execExecuted);
    const _ph = execCalPhase ? SCHED.find(p => p.id === execCalPhase) : SCHED[SCHED.length - 1];
    const _isPC = !!_ph && this.relRunsWeekends(_ph.id);
    const _wdBetween = (fromTs, toTs) => { let n = 0; const d0 = new Date(fromTs); d0.setHours(0, 0, 0, 0);
      for (let t = d0.getTime(); t <= toTs; t += dayMs) { const wd = new Date(t).getDay(); if (_isPC || (wd !== 0 && wd !== 6)) n++; } return n; };
    const _endTs = _ph ? pEnd(_ph.testEnd || _ph.end) : now;
    const _startTs = _ph ? pStart(_ph.start) : now;
    const execDaysLeft = (_ph && now <= _endTs) ? _wdBetween(Math.max(now, _startTs), _endTs) : 0;
    const execSuggest = execDaysLeft > 0 ? Math.ceil(execRemaining / execDaysLeft) : execRemaining;
    const _elapsedWd = _ph ? Math.max(1, _wdBetween(_startTs, Math.min(now, _endTs))) : 1;
    const execPace = Math.round(execExecuted / _elapsedWd * 10) / 10;
    const execOnTrack = execRemaining === 0 || (execDaysLeft > 0 && execPace >= execSuggest);
    const execPaceColor = execOnTrack ? '#4caf2f' : '#b45309';
    const execVerdict = execRemaining === 0
      ? 'All ' + execPlanned + ' planned tests executed \u2014 nothing left in this scope.'
      : execDaysLeft === 0
        ? 'Test window closed \u2014 ' + execRemaining + ' test' + (execRemaining === 1 ? '' : 's') + ' still open.'
        : 'Execute ' + execSuggest + ' test' + (execSuggest === 1 ? '' : 's') + ' per working day to finish all ' + execRemaining + ' remaining by ' + fmtD(_ph.testEnd || _ph.end) + (_ph.testEnd ? ' \u2014 ' + fmtD(_ph.testEnd) + '\u2013' + fmtD(_ph.end) + ' is reserved for bug fixing & retest.' : '.');
    const execVerdictColor = execRemaining === 0 ? '#4caf2f' : (execDaysLeft === 0 ? '#ef4444' : (execOnTrack ? '#4caf2f' : '#b45309'));
    const execVerdictBg = execVerdictColor === '#4caf2f' ? 'rgba(76,175,47,0.12)' : (execVerdictColor === '#ef4444' ? 'rgba(239,68,68,0.12)' : 'rgba(180,83,9,0.14)');
    const execEndLabel = _ph ? fmtD(_ph.end) : '\u2014';
    const execHasPacing = execPlanned > 0;
    const execPctDone = execPlanned ? Math.round(execExecuted / execPlanned * 100) : 0;
    const execPctBar = execPctDone + '%';
    const execDaysLeftLabel = execDaysLeft + (_isPC ? ' days' : ' working days');
    const execPaceLabel = execPace + '/day';
    const isoOf = (t) => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
    const execByDay = {};
    execDated.forEach(c => { const k = isoOf(c.ts); (execByDay[k] = execByDay[k] || []).push(c); });
    const execHasData = execDated.length > 0;
    let execCalMonthTs = this.state.execCalMonth;
    if (execCalMonthTs == null) {
      const latest = execDated.reduce((m, c) => Math.max(m, c.ts), 0) || now;
      const ld = new Date(latest); execCalMonthTs = new Date(ld.getFullYear(), ld.getMonth(), 1).getTime();
    }
    const ecm = new Date(execCalMonthTs);
    const execTodayStr = new Date(now).toDateString();
    const execMonthName = ecm.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const execPrevMonth = () => this.setState({ execCalMonth: new Date(ecm.getFullYear(), ecm.getMonth() - 1, 1).getTime(), execCalDay: null });
    const execNextMonth = () => this.setState({ execCalMonth: new Date(ecm.getFullYear(), ecm.getMonth() + 1, 1).getTime(), execCalDay: null });
    const execGrid = [];
    const _maxDay = Math.max(1, ...Object.keys(execByDay).map(k => execByDay[k].length));
    { const first = new Date(ecm.getFullYear(), ecm.getMonth(), 1);
      const lead = (first.getDay() + 6) % 7;
      const gs = new Date(first); gs.setDate(gs.getDate() - lead);
      for (let i = 0; i < 42; i++) { const d = new Date(gs.getFullYear(), gs.getMonth(), gs.getDate() + i);
        const iso = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
        const list = execByDay[iso] || [];
        const inMonth = d.getMonth() === ecm.getMonth();
        const pa = list.filter(c => c.status === 'Passed').length;
        const fa = list.filter(c => c.status === 'Failed').length;
        const bl = list.filter(c => c.status === 'Blocked').length;
        const sel = this.state.execCalDay === iso;
        const isToday = d.toDateString() === execTodayStr;
        const wknd = d.getDay() === 0 || d.getDay() === 6;
        const n = list.length;
        const heat = n ? Math.min(1, 0.22 + (n / _maxDay) * 0.78) : 0;
        const base = n
          ? (dark ? 'rgba(59,130,246,' + (0.10 + heat * 0.30).toFixed(2) + ')' : 'rgba(26,51,96,' + (0.05 + heat * 0.16).toFixed(2) + ')')
          : (inMonth ? 'var(--card-bg2)' : 'transparent');
        execGrid.push({ iso, day: d.getDate(), count: n, inMonth, pa, fa, bl, hasCount: n > 0,
          isToday, sel,
          bg: sel ? '#1a3360' : base,
          cellBrd: sel ? '#1a3360' : (isToday ? '#4caf2f' : (n ? (dark ? 'rgba(99,140,220,0.35)' : 'rgba(26,51,96,0.16)') : 'var(--brd-sub)')),
          cellShadow: sel ? '0 6px 16px rgba(26,51,96,0.35)' : (isToday ? '0 0 0 2px rgba(76,175,47,0.25)' : 'none'),
          cellOpacity: inMonth ? (wknd && !n ? 0.45 : 1) : 0.35,
          cursor: n ? 'pointer' : 'default',
          numColor: sel ? '#dbe6ff' : (inMonth ? 'var(--tx-fnt)' : 'var(--tx-mut)'),
          countColor: sel ? '#ffffff' : 'var(--tx-strong)',
          barPa: (n ? Math.round(pa / n * 100) : 0) + '%',
          barFa: (n ? Math.round(fa / n * 100) : 0) + '%',
          barBl: (n ? Math.round(bl / n * 100) : 0) + '%',
          title: n ? n + ' executed \u00b7 ' + pa + ' passed, ' + fa + ' failed, ' + bl + ' blocked' : 'No executions',
          onClick: n ? () => this.setState({ execCalDay: iso, execSelStatus: null }) : () => {} }); }
    }
    const execWeekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const execSelDay = this.state.execCalDay;
    const execSelStatus = this.state.execSelStatus || null;
    const _execDayAll = (execSelDay && execByDay[execSelDay] ? execByDay[execSelDay] : []);
    const _execCnt = (st) => _execDayAll.filter(c => c.status === st).length;
    const setExecStatus = (st) => this.setState({ execSelStatus: (this.state.execSelStatus === st ? null : st) });
    const execStatChips = [
      { key: 'Passed',       label: 'Passed',       n: _execCnt('Passed'),       color: '#4caf2f', bg: '#f0fdf4' },
      { key: 'Failed',       label: 'Failed',       n: _execCnt('Failed'),       color: '#ef4444', bg: '#fef2f2' },
      { key: 'Blocked',      label: 'Blocked',      n: _execCnt('Blocked'),      color: '#3b82f6', bg: '#dbeafe' },
      { key: 'Not relevant', label: 'Not relevant', n: _execCnt('Not relevant'), color: '#a855f7', bg: '#ede9fe' },
    ].map(s => ({ ...s, active: execSelStatus === s.key,
      chipBg: execSelStatus === s.key ? s.color : s.bg,
      chipColor: execSelStatus === s.key ? '#fff' : s.color,
      onClick: () => setExecStatus(s.key) }));
    const execSelList = _execDayAll.filter(c => !execSelStatus || c.status === execSelStatus).map(c => ({
      test: c.test, phase: c.phase, id: c.id, name: c.name || c.test, status: c.status, tester: c.tester,
      ...tcStatusStyle(c.status) }));
    const execSelLabel = execSelDay ? new Date(execSelDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const execSelCount = execSelList.length;
    const execFilterNote = execSelStatus ? ('Showing ' + execSelStatus.toLowerCase()) : (_execDayAll.length + ' tests executed');
    const execTotal = execDated.length;
    const execCalOpen = !!this.state.execCalModal;
    const execCalSub = execTotal + ' test runs executed \u00b7 ' + execAreaLabel + ' \u00b7 click a day to see which tests';
    const execNoSel = !execSelDay;
    const execPhaseLabel = execCalPhase || 'All environments';
    const closeExecCal = () => this.setState({ execCalModal: false });

    const phaseOfDay = (t) => { for (const ph of SCHED) { if (t >= pStart(ph.start) && t <= pEnd(ph.end)) return ph.id; } return null; };
    const sc = new Date(tlStart); sc.setDate(sc.getDate() - ((sc.getDay() + 6) % 7)); sc.setHours(0, 0, 0, 0);
    const ec = new Date(tlEnd); ec.setDate(ec.getDate() + (6 - ((ec.getDay() + 6) % 7))); ec.setHours(0, 0, 0, 0);
    const todayStr = new Date(now).toDateString();
    const calDays = [];
    for (let t = sc.getTime(); t <= ec.getTime(); t += dayMs) { const d = new Date(t); const pid = phaseOfDay(t); const wd = d.getDay();
      const weekend = wd === 0 || wd === 6;
      const working = !!pid && (this.relRunsWeekends(pid) || !weekend);
      calDays.push({ key: t, day: d.getDate(), phase: pid || '', color: working ? (PC[pid] || '#64748b') : 'transparent',
        numColor: working ? (PC[pid] || '#64748b') : 'var(--tx-mut)',
        inPhase: working, nonTest: !!pid && !working, isToday: d.toDateString() === todayStr, weekend,
        showMonth: d.getDate() <= 7 && wd === 1, monthLabel: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }); }
    const weekDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // ─── DEFECT OVERVIEW (Jira CSV) ──────────────────────────────────────
    // Defect Overview is scoped to the ACTIVE environment window of the selected release.
    // Release Backlog × Testing Link stays unscoped and shows the whole release.
    const isClosed = (s) => { const x = String(s).toLowerCase(); return ['done', 'closed', 'resolved', 'fixed', 'verified', 'complete', 'rejected', 'cancel', 'transport'].some(k => x.indexOf(k) >= 0); };
    const prBucket = (p) => { const x = String(p).toLowerCase(); if (x.indexOf('highest') >= 0 || x.indexOf('critical') >= 0 || x.indexOf('blocker') >= 0) return 'Highest'; if (x.indexOf('high') >= 0 || x.indexOf('major') >= 0) return 'High'; if (x.indexOf('medium') >= 0 || x.indexOf('normal') >= 0) return 'Medium'; return 'Low'; };
    const defPriStyle = (p) => p === 'Highest' ? { priColor: '#b91c1c', priBg: '#fee2e2' } : p === 'High' ? { priColor: '#ea580c', priBg: '#ffedd5' } : p === 'Medium' ? { priColor: '#d97706', priBg: '#fef3c7' } : { priColor: '#65a30d', priBg: '#ecfccb' };
    // ── Scope: the active environment, plus whatever is still open from earlier ones ──
    // A defect belongs to the environment whose schedule window contains the day it
    // was raised. One raised in QC1 and still open while IR3 runs is a carry-over:
    // not IR3's own finding, but open work IR3 still has to live with.
    const _phaseWin = this.ACTIVE_PHASE_WINDOW;
    const _toISO = (s) => this.dateToIso(s);
    const _msOfDay = (v) => { const iso = _toISO(v); const t = iso ? Date.parse(iso + 'T00:00:00') : NaN; return isNaN(t) ? null : t; };
    const _inPhase = (d) => { const iso = _toISO(d.created); return !iso || (iso >= _phaseWin.from && iso <= _phaseWin.to); };
    const _jdAll = this.state.jiraDefects || [];
    const _curEnv = _phaseWin.label || '';
    const _curIdx = this.relEnvIndex(_curEnv);
    _jdAll.forEach(d => { d._env = this.relEnvOfMs(_msOfDay(d.created)); });
    const _isCarry = (d) => {
      if (isClosed(d.status)) return false;
      const i = this.relEnvIndex(d._env);
      return i >= 0 && _curIdx >= 0 && i < _curIdx;
    };
    const _jdCur = _jdAll.filter(_inPhase);
    const _jdCarry = _jdAll.filter(d => !_inPhase(d) && _isCarry(d));
    const jd = _jdCur.concat(_jdCarry);
    const phaseScopeLabel = _phaseWin.label + ' · test ' + _phaseWin.fromLabel + '–' + _phaseWin.testToLabel + ' · fix till ' + _phaseWin.toLabel;
    const phaseScopeHidden = _jdAll.length - jd.length;
    const phaseScopeHasHidden = phaseScopeHidden > 0;
    // carry-over roll-up, newest environment first
    const carryTotal = _jdCarry.length;
    const carryHas = carryTotal > 0;
    const carryNone = !carryHas;
    const _carryMap = {};
    _jdCarry.forEach(d => { (_carryMap[d._env] = _carryMap[d._env] || []).push(d); });
    const _relMetaC = this.relMeta();
    const _openCarryAt = (origin) => () => this.setState({ dfStatus: 'All', dfPriority: 'All', dfSearch: '', dfState: 'Open', dfArea: 'All Areas', dfDate: '', dfOrigin: origin, defectModal: true });
    const carryEnvs = Object.keys(_carryMap)
      .sort((a, b) => this.relEnvIndex(b) - this.relEnvIndex(a))
      .map(id => {
        const list = _carryMap[id];
        const hi = list.filter(d => { const b = prBucket(d.priority); return b === 'Highest' || b === 'High'; }).length;
        return { id, count: list.length, high: hi, hasHigh: hi > 0, noHigh: hi === 0,
          color: (_relMetaC[id] || {}).color || '#7c3aed', onClick: _openCarryAt(id) };
      });
    const carryHighTotal = _jdCarry.filter(d => { const b = prBucket(d.priority); return b === 'Highest' || b === 'High'; }).length;
    const carryHasHigh = carryHighTotal > 0;
    const openCarry = _openCarryAt('__carry');

    // ── Cross-environment defect comparison ───────────────────────────────
    // Does the same problem keep coming back? Compare defect summaries across
    // environments: normalise the text, then score every cross-environment pair
    // on how much vocabulary they share. Grouping is by similarity, not by key —
    // a defect raised again in QC1 gets its own Jira ticket.
    const XE_STOP = ' the a an of in on at for to is are be was were not no with and or by from this that it its as into over under after before when while cannot can does do has have had will shall should would der die das den dem ein eine einer und oder nicht kein keine bei von fuer für im am zum zur mit auf aus nach wird wurde ist sind war waren wenn beim durch ';
    const xeTokens = (s) => {
      const out = {}, seen = {};
      String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').forEach(w => {
        if (w.length < 3) return;
        if (XE_STOP.indexOf(' ' + w + ' ') >= 0) return;
        if (!seen[w]) { seen[w] = 1; out[w] = 1; }
      });
      return Object.keys(out);
    };
    const xeThresholdKey = this.state.xeStrict || 'normal';
    const XE_LEVELS = { strict: 0.80, normal: 0.62, loose: 0.48 };
    const xeMin = XE_LEVELS[xeThresholdKey] || 0.62;
    const xeLevels = [
      { k: 'strict', label: 'Near-identical', sel: xeThresholdKey === 'strict' },
      { k: 'normal', label: 'Similar', sel: xeThresholdKey === 'normal' },
      { k: 'loose', label: 'Loosely related', sel: xeThresholdKey === 'loose' },
    ];
    const setXeStrict = (e) => this.setState({ xeStrict: e.target.value });
    const xeOrder = this.relOrder();
    const _xePool = _jdAll.filter(d => d._env && d.summary);
    const _xeDocs = _xePool.map((d, i) => ({ i, d, t: xeTokens(d.summary), env: d._env }));
    // token -> doc ids, skipping words so common they carry no signal
    const _xeIdx = {};
    _xeDocs.forEach(x => x.t.forEach(w => (_xeIdx[w] = _xeIdx[w] || []).push(x.i)));
    const _xeCommon = Math.max(8, Math.round(_xeDocs.length * 0.25));
    const _dice = (a, b) => {
      if (!a.length || !b.length) return 0;
      const set = {}; a.forEach(w => set[w] = 1);
      let hit = 0; b.forEach(w => { if (set[w]) hit++; });
      return (2 * hit) / (a.length + b.length);
    };
    const _xePairs = [];
    const _xeSeenPair = {};
    _xeDocs.forEach(x => {
      const cand = {};
      x.t.forEach(w => { const l = _xeIdx[w]; if (l && l.length <= _xeCommon) l.forEach(j => { if (j !== x.i) cand[j] = 1; }); });
      Object.keys(cand).forEach(js => {
        const j = +js, y = _xeDocs[j];
        if (!y || y.env === x.env) return;                       // only across environments
        const a = Math.min(x.i, j), b = Math.max(x.i, j), pk = a + ':' + b;
        if (_xeSeenPair[pk]) return; _xeSeenPair[pk] = 1;
        const sc = _dice(x.t, y.t);
        if (sc >= xeMin) _xePairs.push({ a, b, sc });
      });
    });
    // union-find, so a defect recurring in three environments forms one group
    const _uf = {};
    const _find = (v) => { while (_uf[v] != null && _uf[v] !== v) v = _uf[v] = _uf[_uf[v]]; return v; };
    const _union = (a, b) => { const ra = _find(a), rb = _find(b); if (ra !== rb) _uf[rb] = ra; };
    _xePairs.forEach(p => { if (_uf[p.a] == null) _uf[p.a] = p.a; if (_uf[p.b] == null) _uf[p.b] = p.b; _union(p.a, p.b); });
    const _xeBest = {};
    _xePairs.forEach(p => { const r = _find(p.a); if (!_xeBest[r] || p.sc > _xeBest[r]) _xeBest[r] = p.sc; });
    const _xeGroups = {};
    Object.keys(_uf).forEach(k => { const r = _find(+k); (_xeGroups[r] = _xeGroups[r] || []).push(+k); });
    const _relMetaX = this.relMeta();
    const _xeJiraBase = this.state.jiraBase || this.loadJiraBase() || '';
    const _envColor = (id) => (_relMetaX[id] || {}).color || '#8b95ab';
    const xeGroups = Object.keys(_xeGroups).map(r => {
      const ids = _xeGroups[r];
      const members = ids.map(i => _xeDocs[i]).sort((a, b) => this.relEnvIndex(a.env) - this.relEnvIndex(b.env));
      const envs = Array.from(new Set(members.map(m => m.env)));
      const best = _xeBest[r] || 0;
      const openN = members.filter(m => !isClosed(m.d.status)).length;
      const topPr = ['Highest', 'High', 'Medium', 'Low'].find(p => members.some(m => prBucket(m.d.priority) === p)) || 'Low';
      return {
        id: r, best, pct: Math.round(best * 100) + '%',
        title: members[0].d.summary,
        envCount: envs.length, envList: envs.join(' → '),
        isIdentical: best >= 0.85, isSimilar: best < 0.85,
        matchColor: best >= 0.85 ? '#e11d48' : best >= 0.7 ? '#ea580c' : '#d97706',
        openN, hasOpen: openN > 0, allClosed: openN === 0,
        topPr, prColor: defPriStyle(topPr).priColor, prBg: defPriStyle(topPr).priBg,
        rows: members.map(m => ({
          key: m.d.key, env: m.env, envColor: _envColor(m.env),
          summary: m.d.summary, status: m.d.status || 'Unknown',
          closed: isClosed(m.d.status), stColor: isClosed(m.d.status) ? '#4caf2f' : '#ef4444',
          created: m.d.created || '—', assignee: m.d.assignee || 'Unassigned',
          href: (_xeJiraBase && m.d.key) ? this.jiraTicketUrl(_xeJiraBase, m.d.key) : '#',
          onOpen: (e) => { if (!_xeJiraBase) { if (e && e.preventDefault) e.preventDefault(); this.openJira(m.d.key); } },
        })),
      };
    }).sort((a, b) => (b.envCount - a.envCount) || (b.best - a.best));
    const xeHas = xeGroups.length > 0;
    const xeNone = !xeHas;
    const xeGroupN = xeGroups.length;
    const xeTicketN = xeGroups.reduce((n, g) => n + g.rows.length, 0);
    const xeIdenticalN = xeGroups.filter(g => g.isIdentical).length;
    const xeOpenN = xeGroups.filter(g => g.hasOpen).length;
    // environment × environment matrix of matched pairs
    const _mx = {};
    _xePairs.forEach(p => {
      const ea = _xeDocs[p.a].env, eb = _xeDocs[p.b].env;
      const k = this.relEnvIndex(ea) <= this.relEnvIndex(eb) ? (ea + '|' + eb) : (eb + '|' + ea);
      _mx[k] = (_mx[k] || 0) + 1;
    });
    const _xeEnvsUsed = xeOrder.filter(id => _xeDocs.some(x => x.env === id));
    const xeMatrixHas = _xeEnvsUsed.length > 1 && xeHas;
    const xeMatrixCols = _xeEnvsUsed.map(id => ({ id, color: _envColor(id) }));
    const _mxMax = Math.max(1, ...Object.values(_mx));
    const xeMatrix = _xeEnvsUsed.map(rowId => ({
      id: rowId, color: _envColor(rowId),
      cells: _xeEnvsUsed.map(colId => {
        const same = rowId === colId;
        const k = this.relEnvIndex(rowId) <= this.relEnvIndex(colId) ? (rowId + '|' + colId) : (colId + '|' + rowId);
        const n = same ? 0 : (_mx[k] || 0);
        return { n, show: same ? '—' : String(n), same, none: !same && n === 0,
          bg: same ? 'transparent' : (n ? 'rgba(225,29,72,' + (0.12 + 0.55 * (n / _mxMax)).toFixed(2) + ')' : 'var(--tile-bg)'),
          color: same ? 'var(--tx-fnt)' : (n ? '#fff' : 'var(--tx-fnt)'),
          title: same ? rowId : (n + ' matching defect' + (n === 1 ? '' : 's') + ' between ' + rowId + ' and ' + colId) };
      }),
    }));

    const defTotal = jd.length;
    const defClosed = jd.filter(d => isClosed(d.status)).length;
    const defOpen = defTotal - defClosed;
    const prCnt = { Highest: 0, High: 0, Medium: 0, Low: 0 }; jd.forEach(d => { prCnt[prBucket(d.priority)]++; });
    const hasDefects = defTotal > 0;
    const noDefects = !hasDefects;
    const drill = (patch) => () => this.setState({ dfStatus: 'All', dfPriority: 'All', dfSearch: '', dfState: 'All', dfOrigin: 'All', ...patch, defectModal: true });
    const defectKpis = [
      { label: 'Total', value: defTotal, color: 'var(--tx-strong)', accent: '#94a3b8', onClick: drill({}) },
      { label: 'Open', value: defOpen, color: '#ef4444', accent: '#ef4444', onClick: drill({ dfState: 'Open' }) },
      { label: 'Closed & Ready for Transport', value: defClosed, color: '#4caf2f', accent: '#4caf2f', onClick: drill({ dfState: 'Closed' }) },
      { label: 'Highest', value: prCnt.Highest, color: '#b91c1c', accent: '#b91c1c', onClick: drill({ dfPriority: 'Highest' }) },
      { label: 'High', value: prCnt.High, color: '#ea580c', accent: '#ea580c', onClick: drill({ dfPriority: 'High' }) },
      { label: 'Medium', value: prCnt.Medium, color: '#d97706', accent: '#d97706', onClick: drill({ dfPriority: 'Medium' }) },
      { label: 'Low', value: prCnt.Low, color: '#65a30d', accent: '#65a30d', onClick: drill({ dfPriority: 'Low' }) },
    ];
    const _kpiShort = { 'Closed & Ready for Transport': 'Closed & RfT' };
    const defectKpisState = defectKpis.slice(0, 3).map(k => ({ ...k, short: _kpiShort[k.label] || k.label, full: k.label }));
    const defectKpisPrio = defectKpis.slice(3).map(k => ({ ...k, dim: k.value === 0 }));
    const openClosedPct = defTotal ? Math.round(defClosed / defTotal * 100) : 0;
    const closedDeg = Math.round(openClosedPct * 3.6);
    const jiraBase = this.state.jiraBase || this.loadJiraBase() || ''; const jiraHasBase = !!jiraBase;
    const jiraFile = this.state.jiraFile || ''; const jiraHasFile = !!jiraFile;
    const jiraError = this.state.jiraError || ''; const jiraHasError = !!jiraError;
    const jiraWarn = this.state.jiraWarn || ''; const jiraHasWarn = !!jiraWarn && !jiraHasError;
    const onCsvFile = this.onCsvFile; const setJiraBase = this.setJiraBase; const exportDefectsCsv = this.exportDefectsCsv;
    const exportDefectsXlsx = this.exportDefectsXlsx; const exportDefectsPptx = this.exportDefectsPptx;
    const clearDefects = this.clearDefects;
    const hasAnyData = hasDefects || !!(this.state.importedRows && this.state.importedRows.length) || (this.loadHistory().length > 0);
    const openDefectModal = () => this.setState({ defectModal: true });
    const closeDefectModal = () => this.setState({ defectModal: false });
    const defectModalOpen = !!this.state.defectModal;
    // Filters + sort
    const dfStatus = this.state.dfStatus || 'All';
    const dfPriority = this.state.dfPriority || 'All';
    const dfSearch = this.state.dfSearch || '';
    const dfSortKey = this.state.dfSortKey || 'priority';
    const dfSortDir = this.state.dfSortDir || 'asc';
    const statusOptions = ['All'].concat(Array.from(new Set(jd.map(d => d.status).filter(Boolean))));
    const priorityOptions = ['All', 'Highest', 'High', 'Medium', 'Low'];
    const areaOptions = ['All Areas'].concat(Array.from(new Set(jd.map(d => d.component).filter(Boolean))).sort());
    const dfArea = this.state.dfArea || 'All Areas';
    const prOrder = { Highest: 0, High: 1, Medium: 2, Low: 3 };
    const dfState = this.state.dfState || 'All';
    const dfDate = this.state.dfDate || '';
    // Origin = the environment a defect was raised in. '__carry' = everything
    // carried over from an earlier environment, whichever one.
    const dfOrigin = this.state.dfOrigin || 'All';
    const _originIds = Array.from(new Set(jd.map(d => d._env).filter(Boolean)))
      .sort((a, b) => this.relEnvIndex(a) - this.relEnvIndex(b));
    const originOptions = ['All'].concat(carryHas ? ['__carry'] : []).concat(_originIds);
    const originLabelOf = (v) => v === 'All' ? 'All origins' : v === '__carry' ? 'Carry-over only' : (v === _curEnv ? v + ' (current)' : v);
    const originChoices = originOptions.map(v => ({ v, label: originLabelOf(v), sel: v === dfOrigin }));
    const setDfOrigin = (e) => this.setState({ dfOrigin: e.target.value });
    const _matchOrigin = (d) => dfOrigin === 'All' || (dfOrigin === '__carry' ? _isCarry(d) : d._env === dfOrigin);
    const toISO = (s) => this.dateToIso(s);
    let filtered = jd.filter(d => (dfStatus === 'All' || d.status === dfStatus)
      && (dfState === 'All' || (dfState === 'Closed') === isClosed(d.status))
      && (dfArea === 'All Areas' || d.component === dfArea)
      && (dfPriority === 'All' || prBucket(d.priority) === dfPriority)
      && (!dfDate || toISO(d.created) === dfDate)
      && _matchOrigin(d)
      && (!dfSearch || (d.key + ' ' + d.summary + ' ' + d.assignee + ' ' + d.component + ' ' + d.release + ' ' + d.reporter + ' ' + (d.labels || '')).toLowerCase().indexOf(dfSearch.toLowerCase()) >= 0));
    filtered = filtered.slice().sort((a, b) => { let av, bv;
      if (dfSortKey === 'priority') { av = prOrder[prBucket(a.priority)]; bv = prOrder[prBucket(b.priority)]; }
      else if (['created', 'updated', 'resolved'].indexOf(dfSortKey) >= 0) { av = Date.parse(a[dfSortKey]) || 0; bv = Date.parse(b[dfSortKey]) || 0; }
      else { av = String(a[dfSortKey] || '').toLowerCase(); bv = String(b[dfSortKey] || '').toLowerCase(); }
      if (av < bv) return dfSortDir === 'asc' ? -1 : 1; if (av > bv) return dfSortDir === 'asc' ? 1 : -1; return 0; });
    // ─── LINKED TEST RUN per defect (retest state) ────────────────────────
    const _rtCases = this.state.importedCases || [];
    const _rtByBug = {};            // Jira key -> [qTest run]
    const _rtWhy = {};              // Jira key -> { 'Defect column': n, 'Test Run ID': n, 'Test Case ID': n }
    const _rtSeen = {};             // Jira key -> Set of run identity (dedupe across match paths)
    const _runIdent = (c) => (String(c.runId || c.id || c.name || '') + '||' + c.phase + '||' + (c.test || '') + '||' + (c.ts || ''));
    const _rtPush = (k, c, why) => {
      if (!k) return; const K = String(k).toUpperCase();
      const seen = _rtSeen[K] || (_rtSeen[K] = {});
      const ident = _runIdent(c);
      if (!seen[ident]) { seen[ident] = 1; (_rtByBug[K] = _rtByBug[K] || []).push(c); }
      const w = _rtWhy[K] || (_rtWhy[K] = {}); w[why] = (w[why] || 0) + 1;
    };
    // (a) qTest side: the run's Defect/Bug column names the Jira ticket
    _rtCases.forEach(c => { (c.defects || []).forEach(k => _rtPush(k, c, 'Defect column')); });
    // (b) Jira side: the ticket's link / test-execution fields name a Test Run or Test Case id
    const _byRun = {}, _byTc = {};
    _rtCases.forEach(c => {
      const rid = String(c.runId == null ? '' : c.runId).trim() || String(c.id == null ? '' : c.id).trim().replace(/\D+/g, '');
      if (rid) (_byRun[rid] = _byRun[rid] || []).push(c);
      const rawId = String(c.id == null ? '' : c.id).trim().toUpperCase();
      if (rawId && rawId !== rid) (_byRun[rawId] = _byRun[rawId] || []).push(c);
      const tid = String(c.tcId == null ? '' : c.tcId).trim();
      if (tid) (_byTc[tid] = _byTc[tid] || []).push(c);
    });
    jd.forEach(d => {
      const hay = String((d.links || '') + ' ' + (d.summary || '') + ' ' + (d.labels || '') + ' ' + (d.refText || ''));
      let m;
      const runRe = /\b(?:TR|TEST\s*RUN|RUN)[\s\-#:]*(\d{2,})/gi;
      while ((m = runRe.exec(hay))) (_byRun[m[1]] || []).forEach(c => _rtPush(d.key, c, 'Test Run ID'));
      const tcRe = /\b(?:TC|TEST\s*CASE|CASE)[\s\-#:]*(\d{2,})/gi;
      while ((m = tcRe.exec(hay))) (_byTc[m[1]] || []).forEach(c => _rtPush(d.key, c, 'Test Case ID'));
    });
    // (c) sibling runs: every other run of a test case that is already linked (qTest shows these under the TC)
    const _rtSib = {};
    Object.keys(_rtByBug).forEach(K => {
      const tcs = {}; (_rtByBug[K] || []).forEach(c => { if (c.tcId) tcs[String(c.tcId)] = 1; });
      const seen = _rtSeen[K] || {};
      Object.keys(tcs).forEach(t => (_byTc[t] || []).forEach(c => {
        const ident = _runIdent(c);
        if (!seen[ident]) { seen[ident] = 1; (_rtSib[K] = _rtSib[K] || []).push(c); }
      }));
    });
    const _rtLatest = (list) => {
      const byCase = {};
      list.forEach(c => {
        const k = (String(c.id == null || String(c.id).trim() === '' ? (c.name || '') : c.id).trim().toUpperCase()) + '||' + c.phase;
        const prev = byCase[k];
        if (!prev || (!c.unex && prev.unex) || ((c.unex === prev.unex) && (c.ts || 0) >= (prev.ts || 0))) byCase[k] = c;
      });
      return Object.values(byCase);
    };
    const RT_STYLE = {
      'Still failing': { c: '#dc2626', bg: 'rgba(220,38,38,0.13)' },
      'Blocked': { c: '#7c3aed', bg: 'rgba(124,58,237,0.13)' },
      'Retested green': { c: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
      'Not re-executed': { c: '#d97706', bg: 'rgba(217,119,6,0.14)' },
      'No test link': { c: 'var(--tx-fnt)', bg: 'var(--card-bg2)' },
    };
    const _fmtRt = (t) => t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
    const _rtInfo = (d) => {
      const K = String(d.key || '').toUpperCase();
      const runs = _rtLatest(_rtByBug[K] || []);
      const sibs = _rtSib[K] || [];
      const shown = (_rtByBug[K] || []).concat(sibs.map(c => Object.assign({}, c, { _sib: 1 })))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (!runs.length) return { rt: 'No test link', rtRuns: '\u2014', rtBasis: '\u2014', rtDetail: 'No qTest run references this ticket \u2014 neither via the run\'s Defect column nor via a TR-/TC-id in the ticket\'s links.', rtLast: '\u2014', rtBreak: [], rtList: [], ...RT_STYLE['No test link'] };
      const failed = runs.filter(c => c.status === 'Failed').length;
      const blocked = runs.filter(c => c.status === 'Blocked').length;
      const passed = runs.filter(c => c.status === 'Passed').length;
      const unex = shown.filter(c => c.unex).length;
      const notRel = shown.filter(c => c.status === 'Not relevant').length;
      const sPassed = shown.filter(c => c.status === 'Passed').length;
      const sFailed = shown.filter(c => c.status === 'Failed').length;
      const sBlocked = shown.filter(c => c.status === 'Blocked').length;
      const rt = failed ? 'Still failing' : blocked ? 'Blocked' : passed ? 'Retested green' : 'Not re-executed';
      const last = runs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
      const names = runs.slice(0, 3).map(c => (String(c.id || '').trim() || ('TR-' + (c.runId || '?'))) + (c.tcId ? ' · TC-' + c.tcId : '') + ' · ' + String(c.name || c.test || '').slice(0, 44) + ' → ' + c.status);
      const why = _rtWhy[K] || {};
      const basisKeys = Object.keys(why);
      const basis = basisKeys.length ? basisKeys.map(k => k === 'Defect column' ? 'Defect col.' : k === 'Test Run ID' ? 'TR-ID' : 'TC-ID').join(' + ') : '—';
      return { rt, rtRuns: shown.length + (shown.length === 1 ? ' run' : ' runs'), rtBasis: basis,
        rtBreak: [
          { label: 'passed', n: sPassed, c: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
          { label: 'failed', n: sFailed, c: '#dc2626', bg: 'rgba(220,38,38,0.13)' },
          { label: 'blocked', n: sBlocked, c: '#7c3aed', bg: 'rgba(124,58,237,0.13)' },
          { label: 'unexecuted', n: unex, c: '#d97706', bg: 'rgba(217,119,6,0.14)' },
          { label: 'not relevant', n: notRel, c: 'var(--tx-fnt)', bg: 'var(--card-bg2)' },
        ].filter(b => b.n > 0),
        rtList: shown.map(c => ({
          run: String(c.id || '').trim() || ('TR-' + (c.runId || '?')),
          tc: c.tcId ? 'TC-' + c.tcId : '\u2014',
          name: String(c.name || c.test || '').trim() || '\u2014',
          cycle: [c.phase, c.test, c.team].filter(Boolean).join(' \u00b7 '),
          st: c.unex ? (c.rawStatus || 'Unexecuted') : c.status,
          stC: c.status === 'Passed' ? '#16a34a' : c.status === 'Failed' ? '#dc2626' : c.status === 'Blocked' ? '#7c3aed' : c.unex ? '#d97706' : 'var(--tx-fnt)',
          stBg: c.status === 'Passed' ? 'rgba(22,163,74,0.14)' : c.status === 'Failed' ? 'rgba(220,38,38,0.13)' : c.status === 'Blocked' ? 'rgba(124,58,237,0.13)' : c.unex ? 'rgba(217,119,6,0.14)' : 'var(--card-bg2)',
          when: _fmtRt(c.ts), tester: String(c.tester || '\u2014'), via: c._sib ? 'same test case' : 'direct link',
          viaC: c._sib ? 'var(--tx-fnt)' : '#7c3aed' })),
        rtDetail: 'Matched via: ' + basisKeys.map(k => k + ' (' + why[k] + ')').join(', ') + '\n\n' + names.join('\n') + (runs.length > 3 ? '\n+ ' + (runs.length - 3) + ' more' : '')
          + '\n\n' + passed + ' passed · ' + failed + ' failed · ' + blocked + ' blocked · ' + unex + ' unexecuted · last ' + _fmtRt(last && last.ts),
        rtLast: _fmtRt(last && last.ts), ...RT_STYLE[rt] };
    };
    const dfRetest = this.state.dfRetest || 'All';
    const retestOptions = ['All', 'Still failing', 'Blocked', 'Retested green', 'Not re-executed', 'No test link'];
    const setDfRetest = (e) => this.setState({ dfRetest: e.target.value });
    const dfBasis = this.state.dfBasis || 'All';
    const basisOptions = ['All', 'Linked (any)', 'Defect column', 'Test Run ID', 'Test Case ID', 'Not linked'];
    const setDfBasis = (e) => this.setState({ dfBasis: e.target.value });
    const _basisOk = (keys) => dfBasis === 'All' ? true
      : dfBasis === 'Not linked' ? keys.length === 0
      : dfBasis === 'Linked (any)' ? keys.length > 0
      : keys.indexOf(dfBasis) >= 0;
    // Join coverage across ALL tickets (independent of the visible filters)
    const _jw = jd.map(d => Object.keys(_rtWhy[String(d.key || '').toUpperCase()] || {}));
    const _cnt = (k) => _jw.filter(w => w.indexOf(k) >= 0).length;
    const joinStats = [
      { label: 'linked', n: _jw.filter(w => w.length).length + '/' + jd.length, bg: 'rgba(22,163,74,0.14)', color: '#16a34a', hint: 'Tickets that resolve to at least one qTest run' },
      { label: 'via Defect col.', n: _cnt('Defect column'), bg: 'rgba(37,99,235,0.13)', color: '#2563eb', hint: 'qTest run row lists the Jira key in its Defect/Bug column' },
      { label: 'via TR-ID', n: _cnt('Test Run ID'), bg: 'rgba(124,58,237,0.13)', color: '#7c3aed', hint: 'Ticket links / summary reference a qTest Test Run ID' },
      { label: 'via TC-ID', n: _cnt('Test Case ID'), bg: 'rgba(8,145,178,0.13)', color: '#0891b2', hint: 'Ticket links / summary reference a qTest Test Case ID' },
      { label: 'not linked', n: _jw.filter(w => !w.length).length, bg: 'rgba(217,119,6,0.14)', color: '#d97706', hint: 'No qTest run found — defect is untested by the current export' },
    ];

    this._filteredDefects = filtered;
    const _notes = this.state.defectNotes || {};
    const defectRows = filtered.map(d => { const bk = prBucket(d.priority); const ri = _rtInfo(d);
      const _isCo = _isCarry(d);
      return { ...d, prBucket: bk, ...defPriStyle(bk), stClosed: isClosed(d.status), hasUrl: !!d.key,
        origin: d._env || '\u2014', isCarry: _isCo, notCarry: !_isCo,
        originColor: _isCo ? '#c026d3' : 'var(--tx-mut)',
        originBg: _isCo ? 'rgba(192,38,211,0.14)' : 'var(--chip-bg)',
        originTitle: _isCo ? ('Carry-over \u2014 raised in ' + d._env + ', still open in ' + _curEnv) : (d._env ? ('Raised in ' + d._env) : 'Raised outside every environment window'),
        rt: ri.rt, rtColor: ri.c, rtBg: ri.bg, rtRuns: ri.rtRuns, rtDetail: ri.rtDetail, rtLast: ri.rtLast, rtBasis: ri.rtBasis, _why: Object.keys(_rtWhy[String(d.key || '').toUpperCase()] || {}),
        rtBreak: ri.rtBreak || [], rtList: ri.rtList || [], rtHasRuns: !!(ri.rtList && ri.rtList.length), rtNoLink: !(ri.rtList && ri.rtList.length),
        rtOpenFlag: (this.state.rtOpen || '') === d.key,
        rtCaret: ((this.state.rtOpen || '') === d.key) ? '\u25be' : '\u25b8',
        onRtToggle: () => this.setState({ rtOpen: (this.state.rtOpen || '') === d.key ? '' : d.key }),
        note: _notes[d.key] || '', noteDisabled: !this.can('editor'),
        onNote: (e) => this.setDefectNote(d.key, e.target.value),
        keyHref: (jiraBase && d.key) ? this.jiraTicketUrl(jiraBase, d.key) : '#',
        onKeyOpen: (e) => { if (!jiraBase) { if (e && e.preventDefault) e.preventDefault(); this.openJira(d.key); } } }; })
      .filter(r => dfRetest === 'All' || r.rt === dfRetest)
      .filter(r => _basisOk(r._why));
    this._filteredDefects = defectRows;
    const defectCount = defectRows.length;
    const setDfStatus = (e) => this.setState({ dfStatus: e.target.value });
    const setDfArea = (e) => this.setState({ dfArea: e.target.value });
    const setDfPriority = (e) => this.setState({ dfPriority: e.target.value });
    const setDfSearch = (e) => this.setState({ dfSearch: e.target.value });
    const setDfDate = (e) => this.setState({ dfDate: e.target.value });
    const clearDfDate = () => this.setState({ dfDate: '' });
    const sortDefBy = (k) => () => this.setState(s => ({ dfSortKey: k, dfSortDir: (s.dfSortKey || 'priority') === k && (s.dfSortDir || 'asc') === 'asc' ? 'desc' : 'asc' }));
    const sortHandlers = {};
    ['key', 'summary', 'priority', 'status', 'assignee', 'reporter', 'created', 'updated', 'resolved', 'environment', 'component', 'release'].forEach(k => { sortHandlers[k] = sortDefBy(k); });
    const byStatusBars = statusOptions.filter(s => s !== 'All').map(s => ({ label: s, count: jd.filter(d => d.status === s).length, closed: isClosed(s) })).sort((a, b) => b.count - a.count);
    const bsMax = Math.max(1, ...byStatusBars.map(s => s.count)); byStatusBars.forEach(s => { s.pct = Math.round(s.count / bsMax * 100); s.barColor = s.closed ? '#4caf2f' : '#ef4444'; });
    const _plMax = Math.max(1, ...phaseDetails.map(pd => (pd.tests || []).reduce((a, t) => a + num(t.planned || 0), 0)));
    const byPriorityBars = ['Highest', 'High', 'Medium', 'Low'].map(p => ({ label: p, count: prCnt[p], ...defPriStyle(p) }));
    const bpMax = Math.max(1, ...byPriorityBars.map(p => p.count)); byPriorityBars.forEach(p => { p.pct = Math.round(p.count / bpMax * 100); });
    for (const pd of phaseDetails) {
      const pl = (pd.tests || []).reduce((a, t) => a + num(t.planned || 0), 0);
      const te = (pd.tests || []).reduce((a, t) => a + num(t.tested || 0), 0);
      const pa = (pd.tests || []).reduce((a, t) => a + num(t.passed || 0), 0);
      const fa = (pd.tests || []).reduce((a, t) => a + num(t.failed || 0), 0);
      const bl = (pd.tests || []).reduce((a, t) => a + num(t.blocked || 0), 0);
      const nr = (pd.tests || []).reduce((a, t) => a + num(t.notRelevant || 0), 0);
      const pend = Math.max(0, pl - (pa + fa + bl + nr));
      const base = (pa + fa + bl + nr + pend) || 1;
      pd.execPct = pl ? Math.round(te / pl * 100) : 0;
      pd.passPct = te ? Math.round(pa / te * 100) : 0;
      pd.execDash = pd.execPct; pd.passDash = pd.passPct;
      pd.barPassed = (pa / base * 100).toFixed(2); pd.barFailed = (fa / base * 100).toFixed(2);
      pd.barBlocked = (bl / base * 100).toFixed(2); pd.barNr = (nr / base * 100).toFixed(2); pd.barPend = (pend / base * 100).toFixed(2);
      pd.cntPassed = pa; pd.cntFailed = fa; pd.cntBlocked = bl; pd.cntNr = nr; pd.cntPend = pend;
      // The card header leads with the planned run count rather than the long
      // environment name, and splits the schedule onto two lines so it stops
      // eating the header width.
      pd.plannedRuns = pl;
      pd.plannedLabel = pl >= 10000 ? (Math.round(pl / 100) / 10) + 'k' : String(pl);
      const _sched = RELSCHED.find(x => x.id === pd.id);
      pd.dateMain = _sched ? (this.relFmtShort(_sched.start) + ' – ' + this.relFmt(_sched.testEnd || _sched.end)) : (pd.dateRange || '');
      pd.dateSub = (_sched && _sched.testEnd && _sched.end && _sched.end !== _sched.testEnd)
        ? ((_sched.greyNote || 'Fix & retest') + ' till ' + this.relFmt(_sched.end)) : '';
      pd.hasDateSub = !!pd.dateSub;
      pd.hasBar = (pa + fa + bl + nr) > 0;
      // ── compact row ──
      // Only the segments that exist; a row of zeros tells you nothing.
      pd.segs = [
        { k: 'Passed', n: pa, w: (pa / base * 100).toFixed(2), c: '#4caf2f' },
        { k: 'Failed', n: fa, w: (fa / base * 100).toFixed(2), c: '#ef4444' },
        { k: 'Blocked', n: bl, w: (bl / base * 100).toFixed(2), c: '#3b82f6' },
        { k: 'N/R', n: nr, w: (nr / base * 100).toFixed(2), c: '#a855f7' },
        { k: 'Pending', n: pend, w: (pend / base * 100).toFixed(2), c: 'var(--track)' },
      ].filter(x => x.n > 0);
      pd.envColor = (this.relMeta()[pd.id] || {}).color || '#8b95ab';
      pd.failN = fa; pd.hasFail = fa > 0; pd.noFail = fa === 0;
      pd.pendN = pend; pd.hasPend = pend > 0;
      pd.execLabel = pd.execPct + '%'; pd.passLabel = pd.passPct + '%';
      // Health drives the one strong colour in the row, so colour means status
      // rather than just "which environment".
      pd.health = pl === 0 ? 'none' : (fa > 0 && pd.passPct < 90) ? 'bad' : (pd.execPct < 100 ? 'warn' : 'ok');
      pd.healthColor = pd.health === 'bad' ? '#ef4444' : pd.health === 'warn' ? '#d97706' : pd.health === 'ok' ? '#4caf2f' : 'var(--tx-fnt)';
      pd.testsLabel = ((pd.tests || []).length) + ' tests';
      // A 36-run environment must not draw the same bar as a 3646-run one.
      pd.scaleW = Math.max(2, Math.round(pl / _plMax * 100));
      pd.shareLabel = Math.round(pl / Math.max(1, phaseDetails.reduce((a, x) => a + (x.tests || []).reduce((b, t) => b + num(t.planned || 0), 0), 0)) * 100) + '% of the release';
      pd.ariaExpanded = pd.expanded ? 'true' : 'false';
      pd.onOpenCoverage = (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.openCoverage(pd.id); };
      pd.onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pd.onToggle(); } };
      pd.onCovTouchStart = (e) => { this._covTx = e.touches[0].clientX; };
      pd.onCovTouchEnd = (e) => { if (this._covTx == null) return; const dx = e.changedTouches[0].clientX - this._covTx; this._covTx = null; if (Math.abs(dx) > 60) { e.stopPropagation(); this.openCoverage(pd.id); } };
    }
    // ─── COCKPIT: modules, defect analytics, quality & release ───────────
    const nowMs = Date.now();
    // Robust Jira date parsing: "4/Aug/26 3:04 PM", "04.08.2026 14:22", "04/08/2026", ISO
    const _MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const _jd = (raw) => {
      const s = String(raw || '').trim(); if (!s) return null;
      const yr = (y) => { y = +y; return y < 100 ? (y > 70 ? 1900 + y : 2000 + y) : y; };
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime();
      m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,})[\/\-. ](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/);
      if (m && _MON[m[2].slice(0, 3).toLowerCase()] != null) {
        let h = +(m[4] || 0); const ap = (m[6] || '').toLowerCase();
        if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
        return new Date(yr(m[3]), _MON[m[2].slice(0, 3).toLowerCase()], +m[1], h, +(m[5] || 0)).getTime();
      }
      m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?/);
      if (m) {
        let a = +m[1], b = +m[2];
        if (a > 12 && b <= 12) { /* day-first */ } else if (b > 12 && a <= 12) { const t = a; a = b; b = t; }
        let h = +(m[4] || 0); const ap = (m[6] || '').toLowerCase();
        if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
        return new Date(yr(m[3]), b - 1, a, h, +(m[5] || 0)).getTime();
      }
      const p = Date.parse(s); return isNaN(p) ? null : p;
    };
    const ageDays = (d) => { const c = _jd(d.created); return c ? Math.max(0, (nowMs - c) / 86400000) : null; };
    const resDays = (d) => { const c = _jd(d.created), r = _jd(d.resolved); return (c && r && r >= c) ? (r - c) / 86400000 : null; };
    const fmtDur = (v) => v == null ? '\u2014' : (v >= 1 ? (Math.round(v * 10) / 10) + 'd' : Math.round(v * 24) + 'h');

    // ─── DEFECT COURSE (created vs. resolved per day) ────────────────────
    const _PH_RE = /\b(DF-?1|IR-?1|IR-?2|IR-?3|QC-?1|PC-?1|UAT)\b/i;
    const _phOf = (d) => { const m = String((d.labels || '') + ' ' + (d.environment || '') + ' ' + (d.release || '') + ' ' + (d.component || '')).match(_PH_RE); return m ? m[1].toUpperCase().replace('-', '') : null; };
    const _dcKnown = this.relOrder().concat(['DF1', 'IR1', 'IR2', 'IR3', 'QC1', 'PC1', 'UAT'])
      .filter((p, i, a) => a.indexOf(p) === i);
    const dcPhaseOpts = ['All'].concat(_dcKnown.filter(p => jd.some(d => _phOf(d) === p)));
    const _dcActive = (this.ACTIVE_PHASE_WINDOW && this.ACTIVE_PHASE_WINDOW.label) || '';
    const dcPhase = this.state.dcPhase || (dcPhaseOpts.indexOf(_dcActive) >= 0 ? _dcActive : 'All');
    const dcSet = jd.filter(d => dcPhase === 'All' || _phOf(d) === dcPhase);
    const _dayKey = (ts) => { const x = new Date(ts); x.setHours(0, 0, 0, 0); return x.getTime(); };
    const _cMap = {}, _rMap = {};
    let _dMin = null, _dMax = null;
    const _seen = (k) => { if (_dMin == null || k < _dMin) _dMin = k; if (_dMax == null || k > _dMax) _dMax = k; };
    dcSet.forEach(d => {
      const c = _jd(d.created); if (c) { const k = _dayKey(c); _cMap[k] = (_cMap[k] || 0) + 1; _seen(k); }
      const r = _jd(d.resolved) || (isClosed(d.status) ? _jd(d.updated) : null); if (r) { const k = _dayKey(r); _rMap[k] = (_rMap[k] || 0) + 1; _seen(k); }
    });
    // window = the real data window (first to last activity day), never an arbitrary 30/60/90 slice
    const dcDays = [];
    if (_dMin != null) { for (let x = new Date(_dMin); x.getTime() <= _dMax; x.setDate(x.getDate() + 1)) dcDays.push(new Date(x)); }
    const dcRange = dcDays.length;
    const dcCreatedArr = dcDays.map(x => _cMap[x.getTime()] || 0);
    const dcResolvedArr = dcDays.map(x => _rMap[x.getTime()] || 0);
    const dcCreatedTotal = dcCreatedArr.reduce((a, b) => a + b, 0);
    const dcResolvedTotal = dcResolvedArr.reduce((a, b) => a + b, 0);
    const dcNet = dcCreatedTotal - dcResolvedTotal;
    const dcNetLabel = (dcNet > 0 ? '+' : '') + dcNet;
    const dcNetColor = dcNet > 0 ? '#ef4444' : dcNet < 0 ? '#16a34a' : 'var(--tx-mut)';
    const dcOpenArr = []; { let run = 0; dcCreatedArr.forEach((c, i) => { run += c - dcResolvedArr[i]; dcOpenArr.push(run); }); }
    const dcAvgCreated = dcRange ? Math.round(dcCreatedTotal / dcRange * 10) / 10 : 0;
    const dcAvgResolved = dcRange ? Math.round(dcResolvedTotal / dcRange * 10) / 10 : 0;
    const dcPeakIx = dcCreatedArr.reduce((bi, v, i) => v > dcCreatedArr[bi] ? i : bi, 0);
    const dcPeakLabel = dcRange ? (dcCreatedArr[dcPeakIx] + ' on ' + dcDays[dcPeakIx].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })) : '\u2014';
    const dcPeak = Math.max(1, ...dcCreatedArr, ...dcResolvedArr, ...dcOpenArr);
    const dcTop = Math.max(4, Math.ceil(dcPeak / 4) * 4);
    // The chart lives in the ~310px side column, so the viewBox is kept close to
    // its rendered size: one unit ≈ one CSS pixel, which is what keeps the axis
    // labels readable instead of shrinking them to ~4px.
    const DW = 300, DH = 206, DL = 26, DR = 6, DT = 16, DB = 30;
    const _plotH = DH - DT - DB, _base = DH - DB;
    const _slot = dcRange ? (DW - DL - DR) / dcRange : 1;
    const _bw = Math.max(1.5, Math.min(9, _slot / 2.6));
    const dcY = (v) => _base - (v / dcTop) * _plotH;
    // Axis labels are drawn as HTML on top of the SVG, not as <text>: the
    // template runtime wraps every interpolation in a <span>, and an HTML span
    // inside an SVG <text> is never painted — which is why these labels were
    // invisible. Percentages map straight onto the viewBox.
    const dcGrid = [0, 0.5, 1].map(f => {
      const y = _base - f * _plotH;
      return { y: y.toFixed(1), topPct: (y / DH * 100).toFixed(2), label: Math.round(f * dcTop) };
    });
    // date ticks and value labels only where there is room for them
    const _every = Math.max(1, Math.ceil(34 / Math.max(1, _slot)));
    const _showVals = _slot >= 20;
    const dcPlotL = DL, dcPlotR = DW - DR, dcTickY = (_base + 15).toFixed(1), dcAxisX = (DL - 5).toFixed(1);
    const dcBarW = _bw.toFixed(1);
    const dcPoints = dcDays.map((x, i) => {
      const mid = DL + _slot * i + _slot / 2;
      const c = dcCreatedArr[i], r = dcResolvedArr[i];
      return {
        cx: mid.toFixed(1),
        cBarX: (mid - _bw - 0.6).toFixed(1), cBarY: dcY(c).toFixed(1), cBarH: Math.max(0, _base - dcY(c)).toFixed(1),
        rBarX: (mid + 0.6).toFixed(1), rBarY: dcY(r).toFixed(1), rBarH: Math.max(0, _base - dcY(r)).toFixed(1),
        cLblX: (mid - _bw / 2 - 0.6).toFixed(1), cLblY: (dcY(c) - 3.5).toFixed(1),
        rLblX: (mid + _bw / 2 + 0.6).toFixed(1), rLblY: (dcY(r) - 3.5).toFixed(1),
        c: c, r: r, cShow: _showVals && c > 0, rShow: _showVals && r > 0,
        tickShow: i % _every === 0 || i === dcRange - 1,
        tick: x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        title: x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' \u00b7 created ' + c + ' \u00b7 resolved ' + r + ' \u00b7 open ' + dcOpenArr[i],
      };
    });
    const dcOpenPath = dcDays.length
      ? dcDays.map((x, i) => (i ? 'L' : 'M') + (DL + _slot * i + _slot / 2).toFixed(1) + ' ' + dcY(dcOpenArr[i]).toFixed(1)).join(' ')
      : '';
    const dcOpenNow = dcOpenArr.length ? dcOpenArr[dcOpenArr.length - 1] : 0;
    const dcGutterPct = (DL / DW * 100).toFixed(2);
    const dcTickTopPct = ((_base + 6) / DH * 100).toFixed(2);
    // Keep date ticks at least a label-width apart so they never collide — the
    // "always show the last day" rule can otherwise land next to its neighbour.
    const _tickGap = 36;
    const dcTicks = [];
    dcPoints.filter(p => p.tickShow).forEach(p => {
      const x = parseFloat(p.cx);
      const prev = dcTicks[dcTicks.length - 1];
      if (prev && x - prev.x < _tickGap) return;
      dcTicks.push({ x, label: p.tick });
    });
    const _lastPt = dcPoints[dcPoints.length - 1];
    if (_lastPt) {
      const lx = parseFloat(_lastPt.cx), last = dcTicks[dcTicks.length - 1];
      if (last && lx - last.x >= _tickGap) dcTicks.push({ x: lx, label: _lastPt.tick });
    }
    dcTicks.forEach((t, i) => { t.key = 'dct' + i; t.leftPct = (t.x / DW * 100).toFixed(2); });
    const dcTableRows = dcDays.map((x, i) => ({
      key: 'dcd' + x.getTime(),
      day: x.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
      created: dcCreatedArr[i], resolved: dcResolvedArr[i], open: dcOpenArr[i],
      cColor: dcCreatedArr[i] ? '#dc2626' : 'var(--tx-mut)',
      rColor: dcResolvedArr[i] ? '#16a34a' : 'var(--tx-mut)',
      bg: (i % 2) ? 'var(--card-bg2)' : 'transparent',
    })).filter(r => r.created || r.resolved).reverse();
    const dcPhaseTabs = dcPhaseOpts.map(p => ({ label: p, active: p === dcPhase,
      bg: p === dcPhase ? 'rgba(37,99,235,0.12)' : 'transparent', color: p === dcPhase ? '#2563eb' : 'var(--tx-mut)',
      brd: p === dcPhase ? '#2563eb' : 'var(--brd-2)', onClick: () => this.setState({ dcPhase: p }) }));
    const dcWindowLabel = dcRange
      ? dcDays[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' \u2013 ' + dcDays[dcRange - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' \u00b7 ' + dcRange + ' days'
      : 'no dated defects';
    const dcSub = 'Created vs. resolved per day \u00b7 ' + (dcPhase === 'All' ? 'all phases' : dcPhase) + ' \u00b7 ' + dcWindowLabel;
    const dcShowTable = !!this.state.dcShowTable;
    const dcTableToggle = () => this.setState({ dcShowTable: !this.state.dcShowTable });
    const dcTableLabel = dcShowTable ? 'Hide daily table' : 'Daily table';
    const dcHasPhases = dcPhaseOpts.length > 1;
    const matchStatus = (raw) => { const x = String(raw).toLowerCase();
      if (x.indexOf('block') >= 0) return 'Blocked';
      if (/(reject|cancel|invalid|duplicate|won)/.test(x)) return 'Rejected';
      if (/(closed|done|complete|verified|transport)/.test(x)) return 'Closed';
      if (/(retest|re-test)/.test(x)) return 'Retest';
      if (/(ready for test|ready to test|to test|testing|in test|fixed|resolved)/.test(x)) return 'Ready for Test';
      if (/(wait|hold|pending)/.test(x)) return 'Waiting for Fix';
      if (/(progress|develop|implement|wip)/.test(x)) return 'In Progress';
      if (/(analys|triage|investigat)/.test(x)) return 'In Analysis';
      if (x.indexOf('reopen') >= 0 || x.indexOf('open') >= 0) return 'Open Bugs';
      if (/(new|to do|todo|backlog|created)/.test(x)) return 'New Bugs';
      return 'Open Bugs';
    };
    const STATUS_DEFS = [
      { name: 'New Bugs', color: '#38bdf8' }, { name: 'Open Bugs', color: '#f59e0b' },
      { name: 'In Analysis', color: '#a78bfa' }, { name: 'In Progress', color: '#60a5fa' },
      { name: 'Waiting for Fix', color: '#fb923c' }, { name: 'Ready for Test', color: '#2dd4bf' },
      { name: 'Retest', color: '#c084fc' }, { name: 'Closed', color: '#22c55e' },
      { name: 'Rejected', color: '#94a3b8' }, { name: 'Blocked', color: '#f0446e' },
    ];
    const stCount = {}; STATUS_DEFS.forEach(d => stCount[d.name] = 0);
    jd.forEach(d => { stCount[matchStatus(d.status)]++; });
    const stMax = Math.max(1, ...Object.values(stCount));
    const statusBreakdown = STATUS_DEFS.map(d => ({ name: d.name, count: stCount[d.name], color: d.color, glow: d.color + '66', pct: Math.round(stCount[d.name] / stMax * 100) }));

    const riskMap = { Highest: { risk: 'CRITICAL', color: '#ef4444' }, High: { risk: 'HIGH', color: '#f59e0b' }, Medium: { risk: 'MODERATE', color: '#38bdf8' }, Low: { risk: 'LOW', color: '#65a30d' } };
    const slaMap = { Highest: '24h', High: '2 days', Medium: '5 days', Low: 'Backlog' };
    const priorityCards = ['Highest', 'High', 'Medium', 'Low'].map(p => {
      const list = jd.filter(d => prBucket(d.priority) === p);
      const openList = list.filter(d => !isClosed(d.status));
      const resVals = list.filter(d => isClosed(d.status)).map(resDays).filter(v => v != null);
      const ageVals = openList.map(ageDays).filter(v => v != null);
      const avgProc = resVals.length ? resVals.reduce((a, b) => a + b, 0) / resVals.length : null;
      const avgAge = ageVals.length ? ageVals.reduce((a, b) => a + b, 0) / ageVals.length : null;
      return { name: p, count: list.length, open: openList.length, pct: defTotal ? Math.round(list.length / defTotal * 100) : 0,
        risk: riskMap[p].risk, color: riskMap[p].color, riskBg: riskMap[p].color + '22', border: riskMap[p].color + '55',
        avgTime: fmtDur(avgProc), aging: fmtDur(avgAge), sla: slaMap[p] };
    });

    const openAll = jd.filter(d => !isClosed(d.status));
    const agDefs = [ { label: '< 1 day', t: (v) => v < 1, color: '#22c55e' }, { label: '1\u20133 days', t: (v) => v >= 1 && v < 3, color: '#38bdf8' }, { label: '3\u20135 days', t: (v) => v >= 3 && v < 5, color: '#f59e0b' }, { label: '> 5 days', t: (v) => v >= 5, color: '#f0446e' } ];
    const ageAll = openAll.map(ageDays).filter(v => v != null);
    const agCounts = agDefs.map(a => ageAll.filter(a.t).length);
    const agMax = Math.max(1, ...agCounts);

    // ─── TOP BUGS TO DISCUSS (triage ranking) ────────────────────────────
    const _staleDays = (d) => { const u = _jd(d.updated) || _jd(d.created); return u ? Math.max(0, (nowMs - u) / 86400000) : null; };
    const _priW = { Highest: 40, High: 28, Medium: 15, Low: 6 };
    const _isReopened = (d) => /reopen/i.test(String(d.status));
    const _isStuck = (d) => /(blocked|hold|waiting|analysis|clarif|impedi)/i.test(String(d.status));
    const _fmtDay = (ts) => { if (!ts) return '\u2014'; const x = new Date(ts); const p = (n) => String(n).padStart(2, '0');
      return p(x.getDate()) + '.' + p(x.getMonth() + 1) + '.' + String(x.getFullYear()).slice(2); };
    const _dRound = (v) => Math.round(v);
    const _cutPhase = SCHED.find(p => now >= pStart(p.start) && now <= pEnd(p.end)) || SCHED[SCHED.length - 1] || { id: '', label: '', start: '', end: '' };
    const _failRuns = _allCases.filter(c => c.status === 'Failed' || c.status === 'Blocked');
    const _bugRuns = {};
    _failRuns.forEach(c => (c.defects || []).forEach(k => { const kk = String(k).toUpperCase();
      (_bugRuns[kk] = _bugRuns[kk] || []).push(c); }));

    const _scored = openAll.map(d => {
      const pb = prBucket(d.priority);
      const age = ageDays(d) || 0;
      const stale = Math.min(_staleDays(d) == null ? age : _staleDays(d), age);
      const unassigned = !d.assignee || /unassigned|^\u2014$/i.test(d.assignee);
      const stuck = _isStuck(d);
      const reop = _isReopened(d);
      const runs = _bugRuns[String(d.key).toUpperCase()] || [];
      const blocksTests = runs.length;

      const f = [];
      const add = (pts, label, color, why) => { if (pts > 0) f.push({ pts: Math.round(pts), label, c: color, bg: color + '26', why }); };
      add(_priW[pb] || 6, pb === 'Highest' ? 'Critical priority' : pb + ' priority',
        pb === 'Highest' ? '#b91c1c' : pb === 'High' ? '#ea580c' : pb === 'Medium' ? '#d97706' : '#65a30d',
        'Jira priority ' + (d.priority || pb));
      add(Math.min(25, age * 0.7), 'Open ' + _dRound(age) + ' d', '#ef4444', 'Created ' + _fmtDay(_jd(d.created)) + ' \u2014 still not closed');
      add(Math.min(28, stale * 1.3), 'Silent ' + _dRound(stale) + ' d', '#d97706', 'Last Jira update ' + _fmtDay(_jd(d.updated) || _jd(d.created)) + ' \u2014 nobody moved it since');
      if (stuck) add(10, 'Stuck \u00b7 ' + d.status, '#3b82f6', 'Status "' + d.status + '" means it is waiting on someone');
      if (reop) add(12, 'Reopened', '#a855f7', 'Fix did not hold \u2014 the bug came back');
      if (unassigned) add(8, 'Unassigned', '#94a3b8', 'No owner \u2014 nobody is working on it');
      if (blocksTests) add(Math.min(20, 6 + blocksTests * 2), 'Blocks ' + blocksTests + ' test run' + (blocksTests === 1 ? '' : 's'), '#f0446e', blocksTests + ' failed/blocked test run(s) are linked to this bug');
      const s = f.reduce((a, x) => a + x.pts, 0);
      return { d, score: s, pb, age, stale, unassigned, factors: f, blocksTests };
    }).sort((a, b) => b.score - a.score);

    const triageAll = !!this.state.triageAll;
    const _shown = triageAll ? _scored : _scored.slice(0, 10);
    const _topMax = Math.max(1, ...(_scored.map(x => x.score)));
    const triageRows = _shown.map((x, i) => {
      const ps = defPriStyle(x.pb);
      const urg = x.score >= _topMax * 0.8 ? { c: '#ef4444', l: 'DISCUSS NOW' }
        : x.score >= _topMax * 0.55 ? { c: '#d97706', l: 'DISCUSS SOON' } : { c: '#3b82f6', l: 'KEEP WATCHING' };
      const st = matchStatus(x.d.status);
      const stDef = STATUS_DEFS.find(z => z.name === st) || { color: '#94a3b8' };
      const meta = [
        { k: 'Owner', v: x.unassigned ? 'Unassigned' : x.d.assignee, c: x.unassigned ? '#ef4444' : 'var(--tx-strong)' },
        { k: 'Area', v: x.d.component || '\u2014', c: 'var(--tx-strong)' },
        { k: 'Environment', v: x.d.environment || '\u2014', c: 'var(--tx-strong)' },
        { k: 'Reported by', v: x.d.reporter || '\u2014', c: 'var(--tx-strong)' },
        { k: 'Created', v: _fmtDay(_jd(x.d.created)) + ' \u00b7 ' + _dRound(x.age) + ' d ago', c: 'var(--tx-strong)' },
        { k: 'Last update', v: _fmtDay(_jd(x.d.updated) || _jd(x.d.created)) + ' \u00b7 ' + _dRound(x.stale) + ' d ago', c: x.stale >= 7 ? '#d97706' : 'var(--tx-strong)' },
      ];
      const headline = x.factors.slice().sort((a, b) => b.pts - a.pts)[0];
      return {
        rank: i + 1, key: x.d.key || '\u2014', summary: x.d.summary || '\u2014',
        status: st, statusColor: stDef.color, statusBg: stDef.color + '26',
        rawStatus: x.d.status, type: x.d.issueType || 'Bug',
        pri: x.pb, priColor: ps.priColor, priBg: ps.priBg,
        labels: x.d.labels || '', hasLabels: !!x.d.labels,
        release: x.d.release || '', hasRelease: !!x.d.release,
        meta, factors: x.factors,
        why: 'Mainly because: ' + (headline ? headline.why : 'open and unresolved'),
        urgColor: urg.c, urgLabel: urg.l, urgBg: urg.c + '1f',
        barW: Math.round(x.score / _topMax * 100) + '%',
        score: Math.round(x.score),
        rankBg: i < 3 ? 'rgba(239,68,68,0.16)' : 'var(--tile-bg)',
        rankColor: i < 3 ? '#ef4444' : 'var(--tx-fnt)',
        href: (jiraBase && x.d.key) ? this.jiraTicketUrl(jiraBase, x.d.key) : '#',
        onClick: () => this.setState({ dfStatus: 'All', dfPriority: 'All', dfState: 'Open', dfArea: 'All Areas', dfDate: '', dfSearch: x.d.key, defectModal: true }),
      };
    });
    const triageTotal = _scored.length;
    const triageShownCount = _shown.length;
    const triageMore = triageTotal > 10;
    const triageMoreLabel = triageAll ? 'Show top 10 only' : 'Show all ' + triageTotal + ' open defects';
    const toggleTriageAll = () => this.setState({ triageAll: !this.state.triageAll });
    const _cntNow = triageRows.filter(r => r.urgLabel === 'DISCUSS NOW').length;
    const triageStats = [
      { l: 'Discuss now', v: _cntNow, c: '#ef4444' },
      { l: 'Ranked', v: triageShownCount, c: 'var(--tx-strong)' },
      { l: 'Critical / High', v: _scored.filter(x => x.pb === 'Highest' || x.pb === 'High').length, c: '#ea580c' },
      { l: 'Silent > 7 d', v: _scored.filter(x => x.stale >= 7).length, c: '#d97706' },
      { l: 'Unassigned', v: _scored.filter(x => x.unassigned).length, c: '#94a3b8' },
      { l: 'Blocking tests', v: _scored.filter(x => x.blocksTests > 0).length, c: '#f0446e' },
    ];
    const hasTriage = triageRows.length > 0;
    const triageSub = openAll.length + ' open defects scored on priority, age, silence, ownership, status and blocked test runs \u00b7 highest first';

    // Daily intake: created today, or yesterday after 15:00 (post-meeting arrivals)
    const _cut = new Date(nowMs); _cut.setHours(15, 0, 0, 0); _cut.setDate(_cut.getDate() - 1);
    const _cutTs = _cut.getTime();
    const _fmtDT = (ts) => { const x = new Date(ts); const p = (n) => String(n).padStart(2, '0');
      return p(x.getDate()) + '.' + p(x.getMonth() + 1) + '. ' + p(x.getHours()) + ':' + p(x.getMinutes()); };
    const _todayStart = new Date(nowMs); _todayStart.setHours(0, 0, 0, 0);
    const intakeRows = jd.map(d => ({ d, ts: _jd(d.created) }))
      .filter(x => x.ts && x.ts >= _cutTs)
      .sort((a, b) => b.ts - a.ts)
      .map(x => { const pb = prBucket(x.d.priority); const ps = defPriStyle(pb);
        const isToday = x.ts >= _todayStart.getTime();
        return { key: x.d.key || '\u2014', summary: x.d.summary || '\u2014', status: x.d.status,
          assignee: (!x.d.assignee || /unassigned/i.test(x.d.assignee)) ? 'Unassigned' : x.d.assignee,
          area: x.d.component || '\u2014', pri: pb, priColor: ps.priColor, priBg: ps.priBg,
          href: (jiraBase && x.d.key) ? this.jiraTicketUrl(jiraBase, x.d.key) : '#',
          when: _fmtDT(x.ts), bucket: isToday ? 'TODAY' : 'YESTERDAY \u00b7 AFTER 15:00',
          bucketColor: isToday ? '#4caf2f' : '#d97706',
          bucketBg: isToday ? 'rgba(76,175,47,0.14)' : 'rgba(217,119,6,0.15)',
          onClick: () => this.setState({ dfStatus: 'All', dfPriority: 'All', dfState: 'All', dfArea: 'All Areas', dfDate: '', dfSearch: x.d.key, defectModal: true, triageModal: false }) }; });
    const intakeCount = intakeRows.length;
    const intakeEmpty = intakeCount === 0;
    const intakeSub = 'Created since ' + _fmtDT(_cutTs) + ' \u00b7 today plus yesterday\u2019s post-15:00 arrivals';
    const triageBtnLabel = intakeCount ? 'Top Bugs \u00b7 ' + intakeCount + ' new' : 'Top Bugs';
    const triageTab = this.state.triageTab || 'top';
    const triageTabTop = triageTab === 'top';
    const triageTabNew = triageTab === 'new';
    const setTriageTop = () => this.setState({ triageTab: 'top' });
    const setTriageNew = () => this.setState({ triageTab: 'new' });
    const tabTopBg = triageTabTop ? '#1a3360' : 'transparent';
    const tabTopColor = triageTabTop ? '#ffffff' : '#8fa3cc';
    const tabNewBg = triageTabNew ? '#1a3360' : 'transparent';
    const tabNewColor = triageTabNew ? '#ffffff' : '#8fa3cc';
    const triageStop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    const triageModalOpen = !!this.state.triageModal;
    const openTriage = () => this.setState({ triageModal: true });
    const closeTriage = () => this.setState({ triageModal: false });
    const agingBars = agDefs.map((a, i) => ({ label: a.label, count: agCounts[i], color: a.color, pct: Math.round(agCounts[i] / agMax * 100) }));

    const openHighest = jd.filter(d => prBucket(d.priority) === 'Highest' && !isClosed(d.status)).length;
    const openHigh = jd.filter(d => prBucket(d.priority) === 'High' && !isClosed(d.status)).length;
    const testedPctN = typeof testedPct === 'number' ? testedPct : 0;
    const passedPctN = typeof passedPct === 'number' ? passedPct : 0;
    const relReady = defTotal > 0 && openHighest === 0 && openHigh <= 1 && testedPctN >= 80;
    const relColor = relReady ? '#22c55e' : (openHighest > 0 ? '#ef4444' : '#f59e0b');
    const relLabel = relReady ? 'GO' : (openHighest > 0 ? 'NO-GO' : 'AT RISK');
    const releaseChecks = [
      { label: 'Open Highest defects', value: openHighest, ok: openHighest === 0 },
      { label: 'Open High defects', value: openHigh, ok: openHigh <= 1 },
      { label: 'Remaining open defects', value: defOpen, ok: defOpen < 20 },
      { label: 'Testing completion', value: testedPctN + '%', ok: testedPctN >= 80 },
    ].map(c => ({ label: c.label, value: c.value, icon: c.ok ? '\u2713' : '\u2715', color: c.ok ? '#22c55e' : '#f59e0b' }));

    const coveredPhases = phaseDetails.filter(p => (p.execPct || 0) > 0).length;
    const coverageBars = [
      { label: 'Application / module coverage', pct: testedPctN, color: '#95c11f' },
      { label: 'Business process coverage', pct: phaseDetails.length ? Math.round(coveredPhases / phaseDetails.length * 100) : 0, color: '#38bdf8' },
      { label: 'Requirement coverage', pct: passedPctN, color: '#a78bfa' },
    ];
    const density = (typeof sumTested === 'number' && sumTested > 0) ? (defTotal / sumTested * 100).toFixed(1) : '\u2014';
    const qualityKpis = [
      { label: 'Pass Rate', value: passedPctN + '%', color: summary.passedColor, sub: 'passed of executed' },
      { label: 'Test Completion', value: testedPctN + '%', color: summary.testedColor, sub: 'executed of planned' },
      { label: 'Defect Density', value: density, color: '#38bdf8', sub: 'defects / 100 tests' },
      { label: 'Open Critical', value: openHighest, color: openHighest > 0 ? '#ef4444' : '#22c55e', sub: 'highest priority open' },
    ];
    const notExec = (typeof sumPlanned === 'number' && typeof sumTested === 'number') ? Math.max(0, sumPlanned - sumTested) : 0;
    const execCounters = [
      { label: 'Total Cases', value: sumPlanned || 0, color: 'var(--tx-strong)' },
      { label: 'Executed', value: sumTested || 0, color: '#38bdf8' },
      { label: 'Passed', value: sumPassed || 0, color: '#22c55e' },
      { label: 'Failed', value: sumFailed || 0, color: '#ef4444' },
      { label: 'Blocked', value: sumBlocked || 0, color: '#f59e0b' },
      { label: 'Not Executed', value: notExec, color: '#94a3b8' },
      { label: 'Progress', value: testedPctN + '%', color: '#95c11f' },
    ];

    const activeModule = this.state.module || 'test';
    const PANEL_COUNT = 2; // keep in sync with the swipe track: track width = PANEL_COUNT*100%, each panel = 100/PANEL_COUNT %
    const panelIdx = activeModule === 'defect' ? 1 : 0;
    const trackX = (-(panelIdx * (100 / PANEL_COUNT))) + '%';
    const defectPanelActive = panelIdx === 1;
    const panel0MaxH = panelIdx === 0 ? 'none' : '100vh'; const panel0Ov = panelIdx === 0 ? 'visible' : 'hidden';
    const panel1MaxH = panelIdx === 1 ? 'none' : '100vh'; const panel1Ov = panelIdx === 1 ? 'visible' : 'hidden';
    const goTestReport = () => this.setState({ module: 'test' });
    const goDefects = () => this.setState({ module: 'defect' });
    const modTestBg = activeModule === 'test' ? '#95c11f' : 'transparent';
    const modTestColor = activeModule === 'test' ? '#1c2a05' : 'var(--tx)';
    const modDefBg = activeModule === 'defect' ? '#95c11f' : 'transparent';
    const modDefColor = activeModule === 'defect' ? '#1c2a05' : 'var(--tx)';
    const onTrackTouchStart = (e) => { this._sx = e.touches[0].clientX; this._sy = e.touches[0].clientY; };
    const onTrackPtrDown = (e) => { if (e.pointerType === 'touch') return; this._mx = e.clientX; this._my = e.clientY; };
    const onTrackPtrUp = (e) => {
      if (e.pointerType === 'touch' || this._mx == null) return;
      const dx = e.clientX - this._mx, dy = e.clientY - this._my; this._mx = null;
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (['input','textarea','select','button','a','label'].includes(tag)) return;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && activeModule === 'test') this.setState({ module: 'defect' });
        else if (dx > 0 && activeModule === 'defect') this.setState({ module: 'test' });
      }
    };
    const onTrackTouchEnd = (e) => { if (this._sx == null) return; const dx = e.changedTouches[0].clientX - this._sx, dy = e.changedTouches[0].clientY - this._sy; this._sx = null; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) this.setState({ module: dx < 0 ? 'defect' : 'test' }); };

    const jiraSyncMs = this.state.jiraSync || 0;
    const jiraSyncLabel = jiraSyncMs ? new Date(jiraSyncMs).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'not yet';
    const _qtLatest = (this.loadHistory()[0]) || null;
    const qtestSyncLabel = _qtLatest ? new Date(_qtLatest.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'not yet';
    const importedCount = defTotal;
    const importStatusLabel = jiraHasError ? 'IMPORT ERROR' : (jiraHasFile ? 'CONNECTED' : 'NOT CONNECTED');
    const importStatusColor = jiraHasError ? '#ef4444' : (jiraHasFile ? '#22c55e' : '#94a3b8');
    const importMsg = jiraHasError ? ('Import failed \u2014 ' + jiraError) : (jiraHasFile ? ('Successfully imported ' + defTotal + ' defects from ' + jiraFile) : 'No Jira data imported yet \u2014 import a CSV export to activate the module.');
    const importMsgColor = jiraHasError ? '#ef4444' : (jiraHasFile ? '#65a30d' : 'var(--tx-mut)');
    const jiraUrlValue = this.state.jiraBaseDraft != null ? this.state.jiraBaseDraft : jiraBase;
    const setJiraUrlInput = this.setJiraUrlInput;

    const panelMax = this.state.panelMax || 'summary';
    const sumExpanded = panelMax === 'summary';
    const sumCollapsed = !sumExpanded;
    const bdExpanded = panelMax === 'burndown';
    const bdCollapsed = !bdExpanded;
    const sumFlex = sumExpanded ? '1 1 0%' : '0 0 66px';
    const bdFlex = bdExpanded ? '1 1 0%' : '0 0 66px';
    const maximizeSummary = () => this.setState({ panelMax: 'summary' });
    const maximizeBurndown = () => this.setState({ panelMax: 'burndown' });
    const panelDown = (e) => { this._px = e.clientX; };
    const panelUp = (e) => { if (this._px == null) return; const dx = e.clientX - this._px; this._px = null; if (dx < -40) this.setState({ panelMax: 'burndown' }); else if (dx > 40) this.setState({ panelMax: 'summary' }); };
    const noCharts = !hasCharts;
    const bdTimeBurn = overallEnv ? overallEnv.timeBurnPct : 0;

    // ─── HISTORY + CALENDAR ───────────────────────────────────────────────
    const history = this.state.history || [];
    const viewingTs = this.state.viewingTs;
    const historyOpen = !!this.state.historyOpen;
    const openHistory = () => this.setState({ historyOpen: true, calMonth: this.state.calMonth || (history[0] ? new Date(history[0].ts) : new Date()) });
    const closeHistory = () => this.setState({ historyOpen: false });
    const historyList = history.map(s => ({ ts: s.ts, label: s.file, when: new Date(s.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), executedPct: s.planned ? Math.round(s.tested / s.planned * 100) : 0, tested: s.tested, planned: s.planned, active: s.ts === viewingTs, rowBg: s.ts === viewingTs ? '#dbeafe' : 'var(--card-bg2)', onLoad: () => this.loadSnapshot(s.ts), onDelete: () => this.deleteSnapshot(s.ts) }));
    const historyCount = history.length;
    const hasHistory = historyCount > 0;
    const noHistory = historyCount === 0;
    const viewingLabel = viewingTs ? ('Viewing ' + new Date(viewingTs).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : 'No snapshot loaded';
    const calBase = this.state.calMonth ? new Date(this.state.calMonth) : new Date();
    const calYear = calBase.getFullYear(), calM = calBase.getMonth();
    const monthName = calBase.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const byDay = {};
    history.forEach(s => { if (!byDay[s.dateKey] || s.ts > byDay[s.dateKey].ts) byDay[s.dateKey] = s; });
    const startDow = (new Date(calYear, calM, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(calYear, calM + 1, 0).getDate();
    const rawCells = [];
    for (let i = 0; i < startDow; i++) rawCells.push({ blank: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${calYear}-${String(calM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const snap = byDay[key];
      rawCells.push({ blank: false, day: d, has: !!snap, ts: snap ? snap.ts : null, executedPct: snap ? (snap.planned ? Math.round(snap.tested / snap.planned * 100) : 0) : '', active: snap ? snap.ts === viewingTs : false });
    }
    const calCells = rawCells.map(c => {
      if (c.blank) return { day: '', has: false, executedPct: '', bg: 'transparent', border: 'transparent', textColor: 'transparent', cursor: 'default', onClick: null };
      return { day: c.day, has: c.has, executedPct: c.executedPct, bg: c.active ? '#2563eb' : (c.has ? '#dbeafe' : 'var(--card-bg2)'), border: c.active ? '#2563eb' : (c.has ? '#93c5fd' : 'var(--brd-2)'), textColor: c.active ? '#ffffff' : 'var(--tx-strong)', cursor: c.has ? 'pointer' : 'default', onClick: c.has ? (() => this.loadSnapshot(c.ts)) : null };
    });
    const prevMonth = () => this.setState({ calMonth: new Date(calYear, calM - 1, 1) });
    const nextMonth = () => this.setState({ calMonth: new Date(calYear, calM + 1, 1) });

    // ─── APPLICATION COVERAGE TREE (per environment · data-derived) ──────
    const covLegend = [
      { key: 'covered', label: 'Fully Executed — all passed', color: '#4caf2f' },
      { key: 'progress', label: 'In Progress — partially executed', color: '#f6b73c' },
      { key: 'notstarted', label: 'Not Started', color: '#8b95ab' },
      { key: 'risk', label: 'Failures Found — has failed / blocked runs', color: '#ef4444' },
    ];
    const covColor = {}, covShort = {};
    covLegend.forEach(l => { covColor[l.key] = l.color; covShort[l.key] = l.label.split(' — ')[0]; });
    const covSevRank = { covered: 0, progress: 1, notstarted: 2, risk: 3 };
    const covStat = (o) => (o.failed + o.blocked) > 0 ? 'risk' : (o.planned > 0 && o.executed >= o.planned) ? 'covered' : o.executed > 0 ? 'progress' : 'notstarted';
    const covWorst = (a, b) => covSevRank[b] > covSevRank[a] ? b : a;
    const coverageEnv = this.state.coverageEnv || '';
    const coverageOpen = !!coverageEnv;
    const covPhaseMeta = this.PHASES_SCHED.find(p => p.id === coverageEnv);
    const covTitle = coverageEnv + (covPhaseMeta ? ' · ' + covPhaseMeta.label : '');
    let covRoot = { label: '', sub: '', color: 'transparent', tip: '' }, covCols = [], covUncovered = 0, covHasData = false;
    const noClick = () => {};
    const packCols = (groups) => {
      const COLS = Math.min(3, groups.length);
      const cols = Array.from({ length: COLS }, () => ({ groups: [], n: 0 }));
      groups.forEach(g => { let ci = 0; for (let k = 1; k < COLS; k++) if (cols[k].n < cols[ci].n) ci = k; cols[ci].groups.push(g); cols[ci].n += g.apps.length + 2; });
      return cols.filter(c => c.groups.length).map(c => ({ groups: c.groups }));
    };
    const scopeEnvIdx = this.relOrder().filter(id => id !== 'DF1').indexOf(coverageEnv);
    if (coverageOpen && scopeEnvIdx >= 0) {
      // scope-driven tree from APP_SCOPE: Environment \u2192 Competence Center \u2192 Application
      const appsIn = this.APP_SCOPE.filter(a => a.e[scopeEnvIdx]);
      const withSt = appsIn.map(a => {
        const m = this.scopeMatch(a, coverageEnv);
        const st = m.bad > 0 ? 'risk' : (m.planned > 0 && m.executed >= m.planned) ? 'covered' : m.executed > 0 ? 'progress' : 'notstarted';
        return { name: a.name, cc: a.cc === '\u2014' ? 'In Clarification' : a.cc, st, planned: m.planned, executed: m.executed, bad: m.bad, matched: m.any && m.planned > 0 };
      });
      covHasData = withSt.length > 0;
      if (covHasData) {
        covUncovered = withSt.filter(a => a.st !== 'covered').length;
        const gm = {};
        withSt.forEach(a => { (gm[a.cc] || (gm[a.cc] = [])).push(a); });
        const groups = Object.keys(gm).sort().map(cc2 => {
          const list = gm[cc2].sort((x, y) => x.name.localeCompare(y.name));
          let st = 'covered'; list.forEach(a => { st = covWorst(st, a.st); });
          return {
            name: cc2, color: covColor[st], sub: list.length + (list.length === 1 ? ' app \u00b7 ' : ' apps \u00b7 ') + covShort[st], tip: cc2 + ' \u2014 ' + list.length + ' applications planned on ' + coverageEnv,
            apps: list.map(a => ({
              label: a.name, color: covColor[a.st], cursor: 'default', onClick: noClick,
              sub: a.matched ? a.executed + '/' + a.planned + ' \u00b7 ' + (a.bad > 0 ? a.bad + ' failed \u2014 open' : covShort[a.st]) : 'no qTest runs matched \u00b7 ' + covShort[a.st],
              tip: a.name + ' \u2014 ' + (a.matched ? a.executed + ' of ' + a.planned + ' executed' + (a.bad > 0 ? ' \u00b7 ' + a.bad + ' failed/blocked, needs retest' : ' \u00b7 all passed') : 'no matching qTest import yet'),
            })),
          };
        });
        let envSt = 'covered'; withSt.forEach(a => { envSt = covWorst(envSt, a.st); });
        const tot = withSt.reduce((s2, a) => ({ p: s2.p + a.planned, x: s2.x + a.executed }), { p: 0, x: 0 });
        const nCov = withSt.filter(a => a.st === 'covered').length, nProg = withSt.filter(a => a.st === 'progress').length, nNot = withSt.filter(a => a.st === 'notstarted').length, nRisk = withSt.filter(a => a.st === 'risk').length;
        covRoot = { label: coverageEnv + ' \u2014 Environment', color: covColor[envSt],
          sub: withSt.length + ' applications \u00b7 ' + (tot.p > 0 ? tot.x + '/' + tot.p + ' runs executed' : 'no qTest import yet'),
          tip: coverageEnv + ': ' + nCov + ' fully executed \u00b7 ' + nProg + ' in progress \u00b7 ' + nNot + ' not started' + (nRisk ? ' \u00b7 ' + nRisk + ' with failures' : '') };
        covCols = packCols(groups);
      }
    } else if (coverageOpen) {
      // import-derived tree (DF1): Application \u2192 Modules
      const ovm = this.loadAppMap();
      const rawApps = (this.state.importedApps || []).filter(r => r.phase === coverageEnv);
      const appsMap = {};
      rawApps.forEach(r => {
        let app = ovm.assign[r.module] || r.application || '';
        app = ovm.rename[app] || app;
        if (!app) app = '(Unmapped)';
        const A = appsMap[app] || (appsMap[app] = { name: app, modules: {} });
        const mk = r.module || '(General)';
        const M = A.modules[mk] || (A.modules[mk] = { name: mk, planned: 0, executed: 0, passed: 0, failed: 0, blocked: 0 });
        M.planned += r.planned; M.executed += r.executed; M.passed += r.passed; M.failed += r.failed; M.blocked += r.blocked;
      });
      const covApps = Object.values(appsMap).map(a => {
        const mods = Object.values(a.modules).map(m => ({ ...m, st: covStat(m) }));
        let st = mods.length ? 'covered' : 'notstarted';
        mods.forEach(m => { st = covWorst(st, m.st); });
        const tot2 = mods.reduce((s2, m) => ({ planned: s2.planned + m.planned, executed: s2.executed + m.executed, passed: s2.passed + m.passed }), { planned: 0, executed: 0, passed: 0 });
        return { name: a.name, mods, st, ...tot2 };
      }).sort((x, y) => {
        const sx = /smoke/i.test(x.name) ? 0 : 1, sy = /smoke/i.test(y.name) ? 0 : 1;
        return sx - sy || y.planned - x.planned;
      }).slice(0, 12);
      covHasData = covApps.length > 0;
      if (covHasData) {
        let envSt = 'covered'; covApps.forEach(a => { envSt = covWorst(envSt, a.st); });
        covUncovered = covApps.reduce((s2, a) => s2 + a.mods.filter(m => m.st !== 'covered').length, 0);
        const covPass = (o) => o.executed > 0 ? Math.round((o.passed || 0) / o.executed * 100) + '% pass rate' : 'no executions yet';
        const openMod = (m) => () => this.setState({ tcModal: { phase: coverageEnv, module: m.name } });
        const groups = covApps.map(a => ({
          name: a.name, color: covColor[a.st], sub: a.executed + '/' + a.planned + ' \u00b7 ' + (a.failed > 0 ? a.failed + ' failed \u2014 open' : covShort[a.st]), tip: a.name + ' \u2014 ' + a.executed + '/' + a.planned + ' executed \u00b7 ' + covPass(a),
          apps: a.mods.map(m => ({ label: m.name, color: covColor[m.st], cursor: 'pointer', onClick: openMod(m), sub: m.executed + '/' + m.planned + ' \u00b7 ' + (m.failed > 0 ? m.failed + ' failed \u2014 open' : covShort[m.st]), tip: m.name + ' \u2014 ' + m.executed + '/' + m.planned + ' executed \u00b7 ' + covPass(m) + (m.failed > 0 ? ' \u00b7 ' + m.failed + ' failed, needs retest' : '') + ' \u00b7 click for test cases' })),
        }));
        const envTotals = covApps.reduce((s2, a) => ({ planned: s2.planned + a.planned, executed: s2.executed + a.executed }), { planned: 0, executed: 0 });
        covRoot = { label: coverageEnv + ' \u2014 Environment', color: covColor[envSt], sub: covApps.length + ' applications \u00b7 ' + envTotals.executed + '/' + envTotals.planned + ' runs executed', tip: coverageEnv + ' environment' };
        covCols = packCols(groups);
      }
    }
    const _tint = (c) => (typeof c === 'string' && c[0] === '#' && c.length === 7) ? c + '80' : 'var(--card-bg)';
    covRoot.bg = _tint(covRoot.color);
    covCols.forEach(col => (col.groups || []).forEach(g => {
      g.bg = _tint(g.color);
      (g.apps || []).forEach(a => { a.bg = _tint(a.color); });
    }));
    const covNoData = coverageOpen && !covHasData;
    const closeCoverage = this.closeCoverage;

    // ─── REQUIREMENT COVERAGE (from qTest linked requirements) ────────────
    const REQ_PHASE_COL = { DF1: '#64748b', IR1: '#2563eb', QC1: '#059669', IR3: '#7c3aed', PC1: '#b45309' };
    const _reqCases = (this.state.importedCases || []).filter(c => !c.unex && c.reqs && c.reqs.length);
    const reqHasData = _reqCases.length > 0;
    const _reqRank = { 'Passed': 3, 'Failed': 2, 'Blocked': 2, 'Not relevant': 1 };
    const _reqMap = new Map();
    _reqCases.forEach(c => c.reqs.forEach(r => {
      let o = _reqMap.get(r.id); if (!o) { o = { id: r.id, name: r.name || '', phaseSet: {}, best: '', runs: 0, runList: [] }; _reqMap.set(r.id, o); }
      if (r.name && !o.name) o.name = r.name;
      o.phaseSet[c.phase] = true; o.runs += 1;
      o.runList.push({ name: c.test || c.name || (c.module || 'Test run'), phase: c.phase || '—', team: c.team || '—', status: c.status || '—', statusColor: c.status === 'Passed' ? '#4caf2f' : (c.status === 'Failed' || c.status === 'Blocked') ? '#ef4444' : '#f6b73c' });
      if ((_reqRank[c.status] || 0) > (_reqRank[o.best] || 0)) o.best = c.status;
    }));
    const _reqStatusMeta = (b) => b === 'Passed' ? { label: 'Verified', color: '#4caf2f' } : (b === 'Failed' || b === 'Blocked') ? { label: 'Covered · issue', color: '#ef4444' } : { label: 'Covered', color: '#f6b73c' };
    const reqRows = [...(_reqMap.values())].map(o => ({ id: o.id, name: o.name || '—', runs: o.runs, runList: o.runList,
      phases: Object.keys(o.phaseSet).sort(), phaseTags: Object.keys(o.phaseSet).sort().map(p => ({ id: p, color: REQ_PHASE_COL[p] || '#8b95ab' })),
      best: o.best, ..._reqStatusMeta(o.best), onRuns: () => this.setState({ reqRun: { id: o.id, name: o.name || o.id, list: o.runList } }) })).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const reqCovered = reqRows.length;
    const reqVerified = reqRows.filter(r => r.best === 'Passed').length;
    const reqIssue = reqRows.filter(r => r.best === 'Failed' || r.best === 'Blocked').length;
    const reqBaseline = (this.state.reqBaseline != null) ? this.state.reqBaseline : this.loadReqBaseline();
    const reqCovPct = reqBaseline > 0 ? Math.round(reqCovered / reqBaseline * 100) : 0;
    const reqUncovered = reqBaseline > 0 ? Math.max(0, reqBaseline - reqCovered) : 0;
    const reqVerifiedPct = reqCovered > 0 ? Math.round(reqVerified / reqCovered * 100) : 0;
    const REQ_PHASES = this.relOrder();
    const reqByPhase = REQ_PHASES.map(p => {
      const ids = {}; _reqCases.forEach(c => { if (c.phase === p) c.reqs.forEach(r => { ids[r.id] = true; }); });
      return { id: p, color: REQ_PHASE_COL[p], count: Object.keys(ids).length };
    }).filter(x => x.count > 0);
    const reqPhaseMax = Math.max(1, ...reqByPhase.map(x => x.count));
    reqByPhase.forEach(x => { x.pct = Math.round(x.count / reqPhaseMax * 100); });
    const reqCovOpen = !!this.state.reqCovOpen;
    const reqCovPctLabel = reqBaseline > 0 ? (reqCovPct + '%') : '—';
    const reqNoData = !reqHasData;
    const openReqCov = this.openReqCov, closeReqCov = this.closeReqCov, setReqBaseline = this.setReqBaseline;
    const _dmd = this.state.dmdDrill || null;
    const dmdDrillOpen = !!_dmd;
    const dmdDrillTitle = _dmd ? _dmd.title : '';
    const dmdDrillColor = _dmd ? _dmd.color : '#7c3aed';
    const _prC = { 'Highest':'#ef4444','High':'#ea580c','Medium':'#2563eb','Low':'#65a30d' };
    const dmdDrillRows = _dmd ? _dmd.list.map(d => ({ id: d.id, summary: d.summary || '—', area: d.area || '—', priority: d.priority || '—', status: d.status || '—', prioColor: _prC[d.priority] || 'var(--tx-mut)', keyHref: (jiraBase && d.id) ? this.jiraTicketUrl(jiraBase, d.id) : '#', onOpen: (e) => { if (!jiraBase) { if (e && e.preventDefault) e.preventDefault(); this.openJira(d.id); } } })) : [];
    const dmdDrillCount = dmdDrillRows.length + (dmdDrillRows.length === 1 ? ' ticket' : ' tickets');
    const closeDmdDrill = () => this.setState({ dmdDrill: null });
    const reqRun = this.state.reqRun || null; const reqRunOpen = !!reqRun; const closeReqRun = () => this.setState({ reqRun: null });
    const reqRunTitle = reqRun ? reqRun.id : ''; const reqRunName = reqRun ? reqRun.name : ''; const reqRunList = reqRun ? reqRun.list : [];
    const stopReqProp = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
    const reqCanEdit = this.can('editor');
    const tcfCollapsed = !!this.state.tcfCollapsed;
    const tcfExpanded = !tcfCollapsed;
    const toggleTcfCollapse = () => this.setState({ tcfCollapsed: !tcfCollapsed });
    const tcfChevronRotate = tcfCollapsed ? -90 : 0;
    const tcfToggleTitle = tcfCollapsed ? 'Ausklappen' : 'Einklappen';

    // ─── RELEASE BACKLOG × TESTING LINK (Story + Bug from Rel. 26.02.00) ──
    const _backlogSrc = (this.state.backlogData && this.state.backlogData.length) ? this.state.backlogData : this.loadBacklog();
    // fully independent of the Defect Overview import — this section only ever shows its own CSV
    const _all = _backlogSrc || [];
    const backlogFile = this.state.backlogFile || (function () { try { return this.lsGet('qa-jira-backlog-file') || ''; } catch (e) { return ''; } })();
    const backlogError = this.state.backlogError || '';
    const _rel = '26.02.00';
    const _backlog = _all.filter(d => !d.release || d.release.indexOf(_rel) >= 0);
    const _reqIdSet = new Set();
    (this.state.importedCases || []).forEach(c => (c.reqs || []).forEach(r => _reqIdSet.add(String(r.id).toUpperCase())));
    const _isStory = (d) => /story|epic|task|requirement/i.test(d.issueType || '');
    const _isBug = (d) => /bug|defect/i.test(d.issueType || '') || !_isStory(d);
    const _hasQaLabel = (d) => /qa\+|qaplus|testfrei|test-free|testfree/i.test(d.labels || '');
    // Use the SAME run index as Defect Overview (Defect column, TR-/TC-id, sibling runs of a
    // linked test case) — not just the requirement links / links column.
    const _runsForKey = (d) => {
      const K = String(d.key || '').toUpperCase();
      return (_rtByBug[K] || []).length + (_rtSib[K] || []).length;
    };
    const _linkedQtest = (d) => _runsForKey(d) > 0 || _reqIdSet.has(String(d.key).toUpperCase()) || /\bTR-\d+/i.test(d.links || '') || /qtest/i.test(d.links || '');
    // testing-phase start: editor-set, else earliest phase start, else release-fixed
    const _parseD = (v) => { const m = String(v || '').match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]); const m2 = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m2 ? new Date(+m2[1], +m2[2] - 1, +m2[3]) : null; };
    let _phaseStart = null;
    (phases || []).forEach(p => { const mm = String(p.dateRange || '').match(/(\d{1,2})[.\/](\d{1,2})/); if (mm) { const d0 = new Date(2026, +mm[2] - 1, +mm[1]); if (!_phaseStart || d0 < _phaseStart) _phaseStart = d0; } });
    const _tsStored = this.state.testStart || (function () { try { return this.lsGet('qa-testing-start') || ''; } catch (e) { return ''; } })();
    const testStart = _tsStored || (_phaseStart ? (_phaseStart.getFullYear() + '-' + String(_phaseStart.getMonth() + 1).padStart(2, '0') + '-' + String(_phaseStart.getDate()).padStart(2, '0')) : '');
    const _tsDate = _parseD(testStart);
    const _isOlderBug = (d) => _isBug(d) && _tsDate && (() => { const c = _parseD(d.created); return c && c < _tsDate; })();

    const backlogHasData = _backlog.length > 0;
    const backlogShow = true;
    const backlogNoData = !backlogHasData;
    const backlogFileInfo = !!backlogFile;
    const backlogStories = _backlog.filter(_isStory).length;
    const backlogBugs = _backlog.filter(_isBug).length;
    const linkedQtestN = _backlog.filter(_linkedQtest).length;
    const qaLabelN = _backlog.filter(_hasQaLabel).length;
    const olderBugsN = _backlog.filter(_isOlderBug).length;
    const notLinkedN = _backlog.filter(d => !_linkedQtest(d) && !_hasQaLabel(d)).length;
    const _relColor = (d) => _linkedQtest(d) ? '#4caf2f' : (_hasQaLabel(d) ? '#38bdf8' : (_isOlderBug(d) ? '#f6b73c' : '#8b95ab'));
    const _relTag = (d) => _linkedQtest(d) ? (_runsForKey(d) ? _runsForKey(d) + ' qTest run' + (_runsForKey(d) > 1 ? 's' : '') : 'qTest linked') : (_hasQaLabel(d) ? (/(testfrei|test-?free)/i.test(d.labels) ? 'Testfrei' : 'QA+') : (_isOlderBug(d) ? 'Pre-existing' : 'No test link'));
    const backlogFilterOpts = ['All', 'qTest linked', 'QA+ / Testfrei', 'Pre-existing bugs', 'No test link', 'Flagged'];
    const backlogFilter = this.state.backlogFilter || 'All';
    const _flags = this.loadBacklogFlags();
    const _isFlagged = (d) => !!_flags[d.key];
    const _matchBF = (d) => backlogFilter === 'All' ? true : backlogFilter === 'qTest linked' ? _linkedQtest(d) : backlogFilter === 'QA+ / Testfrei' ? _hasQaLabel(d) : backlogFilter === 'Pre-existing bugs' ? _isOlderBug(d) : backlogFilter === 'No test link' ? (!_linkedQtest(d) && !_hasQaLabel(d)) : backlogFilter === 'Flagged' ? _isFlagged(d) : true;
    const backlogStatusOpts = ['All statuses'].concat(Array.from(new Set(_backlog.map(d => d.status || 'Unknown'))).sort());
    // Assignee: who the ticket sits with. "Unassigned" always sorts last.
    const _asgOf = (d) => String(d.assignee || '').trim() || 'Unassigned';
    const _asgNames = Array.from(new Set(_backlog.map(_asgOf)))
      .sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b));
    const backlogAsgOpts = ['All assignees'].concat(_asgNames);
    const backlogAsg = this.state.backlogAsg || 'All assignees';
    const _matchAsg = (d) => backlogAsg === 'All assignees' ? true : _asgOf(d) === backlogAsg;
    const setBacklogAsg = (e) => this.setState({ backlogAsg: e.target.value });
    const backlogStatus = this.state.backlogStatus || 'All statuses';
    const _matchStatus = (d) => backlogStatus === 'All statuses' ? true : (d.status || 'Unknown') === backlogStatus;
    const flaggedN = _backlog.filter(_isFlagged).length;
    const backlogQuery = this.state.backlogQuery || '';
    const _bq = backlogQuery.trim().toLowerCase();
    const _matchQ = (d) => !_bq ? true : ((d.summary || '') + ' ' + (d.key || '') + ' ' + (d.labels || '') + ' ' + (d.component || '') + ' ' + (d.status || '') + ' ' + (d.issueType || '')).toLowerCase().includes(_bq);
    const setBacklogQuery = (e) => this.setState({ backlogQuery: e.target.value });
    const clearBacklogQuery = () => this.setState({ backlogQuery: '' });
    const backlogRows = _backlog.filter(_matchBF).filter(_matchStatus).filter(_matchAsg).filter(_matchQ).map(d => ({
      key: d.key, summary: d.summary || '—', type: _isStory(d) ? (d.issueType || 'Story') : (d.issueType || 'Bug'),
      area: d.component || '—', labels: d.labels || '—', created: d.created || '—', status: d.status || 'Unknown',
      assignee: _asgOf(d), assigneeColor: _asgOf(d) === 'Unassigned' ? 'var(--tx-fnt)' : 'var(--tx)',
      tag: _relTag(d), tagColor: _relColor(d), flagged: _isFlagged(d) ? 1 : 0.25,
      onFlag: () => this.toggleBacklogFlag(d.key),
      keyHref: (jiraBase && d.key) ? this.jiraTicketUrl(jiraBase, d.key) : '#',
      onOpen: (e) => { if (!jiraBase) { if (e && e.preventDefault) e.preventDefault(); this.openJira(d.key); } },
    }));
    const setBacklogFilter = (e) => this.setState({ backlogFilter: e.target.value });
    const setBacklogStatus = (e) => this.setState({ backlogStatus: e.target.value });
    const pickBacklog = (v) => () => this.setState({ backlogFilter: v });
    const pickAll = pickBacklog('All'), pickLinked = pickBacklog('qTest linked'), pickQa = pickBacklog('QA+ / Testfrei'), pickOlder = pickBacklog('Pre-existing bugs'), pickNone = pickBacklog('No test link'), pickFlagged = pickBacklog('Flagged');
    const onBacklogCsvFile = this.onBacklogCsvFile; const clearBacklog = this.clearBacklog;
    const setTestStart = (e) => { if (!this.can('editor')) return; const v = e.target.value; try { this.lsSet('qa-testing-start', v); } catch (er) {} this.setState({ testStart: v }); };
    const backlogTotal = _backlog.length;

    // ─── TEST CASE FINALISATION (Jira Tasks / Sub-Tasks · Testfallfinalisierung) ──
    const _tcfStored = (this.state.tcfData && this.state.tcfData.length) ? this.state.tcfData : this.loadTcf();
    const tcfFile = this.state.tcfFile || (function () { try { return this.lsGet('qa-tcf-file') || ''; } catch (e) { return ''; } })();
    const tcfError = this.state.tcfError || '';
    const tcfOwnSource = _tcfStored.length > 0;
    const tcfFileInfo = !!tcfFile;
    const onTcfCsvFile = this.onTcfCsvFile; const clearTcf = this.clearTcf;
    const _tcfPool = tcfOwnSource ? _tcfStored : _all;
    const _tcfRe = /testfall\s*-?\s*final|test\s*-?\s*case\s*-?\s*final|testfallfinalisierung|tc\s*final/i;
    const _tcfIsTask = (d) => /task|aufgabe/i.test(d.issueType || '');
    const _tcfHit = (d) => _tcfRe.test((d.summary || '') + ' ' + (d.labels || '') + ' ' + (d.issueType || ''));
    let _tcf = _tcfPool.filter(d => _tcfIsTask(d) && _tcfHit(d));
    if (!_tcf.length) _tcf = _tcfPool.filter(_tcfHit);
    if (!_tcf.length) _tcf = _tcfPool.filter(_tcfIsTask);
    if (!_tcf.length && tcfOwnSource) _tcf = _tcfPool.slice();
    const _tcfDone = (d) => /(done|closed|resolved|fixed|verified|complete|transport|erledigt|abgeschlossen|fertig)/i.test(d.status || '');
    const _tcfKind = (d) => { const s = (d.summary || '') + ' ' + (d.labels || '');
      if (/(aktualisier|update|anpass|\u00fcberarbeit|ueberarbeit|pflege|revis|\u00e4nder)/i.test(s)) return 'Aktualisieren';
      if (/(neu|new|erstell|create|anleg|schreib)/i.test(s)) return 'Neu erstellen';
      return 'Nicht kategorisiert'; };
    const _tcfSub = (d) => /sub-?\s*task|unteraufgabe|subtask/i.test(d.issueType || '');
    const tcfItems = _tcf.map(d => ({ key: d.key || '\u2014', summary: d.summary || '\u2014', team: d.component || 'Ohne Team',
      assignee: d.assignee || '\u2014', status: d.status || '\u2014', kind: _tcfKind(d), level: _tcfSub(d) ? 'Sub-Task' : 'Task', done: _tcfDone(d), _d: d }));
    const tcfTotal = tcfItems.length;
    const tcfDoneN = tcfItems.filter(i => i.done).length;
    const tcfOpenN = tcfTotal - tcfDoneN;
    const tcfNewOpen = tcfItems.filter(i => !i.done && i.kind === 'Neu erstellen').length;
    const tcfUpdOpen = tcfItems.filter(i => !i.done && i.kind === 'Aktualisieren').length;
    const tcfUncat = tcfItems.filter(i => !i.done && i.kind === 'Nicht kategorisiert').length;
    const tcfHasUncat = tcfUncat > 0;
    const tcfPct = tcfTotal ? Math.round(tcfDoneN / tcfTotal * 100) : 0;
    const tcfTaskN = tcfItems.filter(i => i.level === 'Task').length;
    const tcfSubN = tcfTotal - tcfTaskN;
    const tcfTaskDone = tcfItems.filter(i => i.level === 'Task' && i.done).length;
    const tcfSubDone = tcfItems.filter(i => i.level === 'Sub-Task' && i.done).length;
    const tcfTaskPct = tcfTaskN ? Math.round(tcfTaskDone / tcfTaskN * 100) : 0;
    const tcfSubPct = tcfSubN ? Math.round(tcfSubDone / tcfSubN * 100) : 0;
    const _tcfPh = SCHED.find(p => p.testEnd) || SCHED[0] || { start: '', end: '', testEnd: '' };
    const _tcfEnd = pEnd(_tcfPh.testEnd || _tcfPh.end), _tcfStart = pStart(_tcfPh.start);
    const _tcfWd = (a, b) => { let n = 0; const d0 = new Date(a); d0.setHours(0, 0, 0, 0);
      for (let t = d0.getTime(); t <= b; t += dayMs) { const w = new Date(t).getDay(); if (w !== 0 && w !== 6) n++; } return n; };
    const tcfDaysLeft = now <= _tcfEnd ? _tcfWd(Math.max(now, _tcfStart), _tcfEnd) : 0;
    const tcfDeadline = fmtD(_tcfPh.testEnd || _tcfPh.end);
    const tcfPerDay = tcfDaysLeft > 0 ? Math.ceil(tcfOpenN / tcfDaysLeft) : tcfOpenN;
    const _tcfElapsed = Math.max(1, _tcfWd(_tcfStart, Math.min(now, _tcfEnd)));
    const tcfPace = Math.round(tcfDoneN / _tcfElapsed * 10) / 10;
    const tcfOnTrack = tcfOpenN === 0 || (tcfDaysLeft > 0 && tcfPace >= tcfPerDay);
    const tcfVerdictColor = tcfOpenN === 0 ? '#4caf2f' : tcfDaysLeft === 0 ? '#ef4444' : tcfOnTrack ? '#4caf2f' : '#f6b73c';
    const tcfVerdict = tcfOpenN === 0
      ? 'Alle Testfall-Aufgaben sind abgeschlossen.'
      : tcfDaysLeft === 0
        ? ('Finalisierungszeitraum ist beendt \u2014 ' + tcfOpenN + ' Aufgaben noch offen.')
        : (tcfPerDay + ' Testf\u00e4lle pro Arbeitstag n\u00f6tig, um alle ' + tcfOpenN + ' offenen Aufgaben bis ' + tcfDeadline + ' abzuschlie\u00dfen \u00b7 aktuelles Tempo \u00d8 ' + tcfPace + '/Tag.');
    const _tcfT = {};
    tcfItems.forEach(i => { const o = _tcfT[i.team] || (_tcfT[i.team] = { total: 0, done: 0, neu: 0, upd: 0 });
      o.total++; if (i.done) o.done++; else if (i.kind === 'Aktualisieren') o.upd++; else if (i.kind === 'Neu erstellen') o.neu++; });
    const tcfTeams = Object.keys(_tcfT).sort((a, b) => _tcfT[b].total - _tcfT[a].total).map(n => { const o = _tcfT[n];
      const open = o.total - o.done, pct = o.total ? Math.round(o.done / o.total * 100) : 0;
      return { name: n, total: o.total, done: o.done, open, neu: o.neu, upd: o.upd, pct,
        perDay: tcfDaysLeft > 0 ? Math.ceil(open / tcfDaysLeft) : open,
        neuColor: o.neu ? '#38bdf8' : '#8b95ab', updColor: o.upd ? '#f6b73c' : '#8b95ab',
        perDayColor: open === 0 ? '#4caf2f' : (tcfDaysLeft > 0 && Math.ceil(open / tcfDaysLeft) <= Math.max(1, Math.round(o.done / _tcfElapsed))) ? '#4caf2f' : '#f6b73c',
        barColor: pct >= 90 ? '#4caf2f' : pct >= 50 ? '#38bdf8' : pct > 0 ? '#f6b73c' : '#8b95ab',
        onPick: () => this.setState({ tcfTeam: (this.state.tcfTeam === n ? '' : n) }),
        rowBg: (this.state.tcfTeam === n) ? 'var(--tile-bg)' : 'transparent' }; });
    const tcfTeamCount = tcfTeams.length;
    const tcfAvgTeam = tcfTeamCount ? Math.round(tcfTotal / tcfTeamCount * 10) / 10 : 0;
    const tcfAvgTeamPerDay = (tcfTeamCount && tcfDaysLeft > 0) ? Math.round(tcfOpenN / tcfTeamCount / tcfDaysLeft * 10) / 10 : 0;
    const tcfFilter = this.state.tcfFilter || 'Alle';
    const tcfFilterOpts = ['Alle', 'Offen', 'Neu erstellen', 'Aktualisieren', 'Abgeschlossen', 'Tasks', 'Sub-Tasks'];
    const setTcfFilter = (e) => this.setState({ tcfFilter: e.target.value });
    const _pickTcf = (v) => () => this.setState({ tcfFilter: v });
    const pickTcfAll = _pickTcf('Alle'), pickTcfNew = _pickTcf('Neu erstellen'), pickTcfUpd = _pickTcf('Aktualisieren'), pickTcfDone = _pickTcf('Abgeschlossen'), pickTcfOpen = _pickTcf('Offen');
    const tcfTeamSel = this.state.tcfTeam || '';
    const tcfTeamActive = !!tcfTeamSel;
    const clearTcfTeam = () => this.setState({ tcfTeam: '' });
    const _tcfMatch = (i) => (tcfTeamSel ? i.team === tcfTeamSel : true) && (tcfFilter === 'Alle' ? true : tcfFilter === 'Offen' ? !i.done : tcfFilter === 'Abgeschlossen' ? i.done
      : tcfFilter === 'Tasks' ? i.level === 'Task' : tcfFilter === 'Sub-Tasks' ? i.level === 'Sub-Task' : (!i.done && i.kind === tcfFilter));
    const tcfRows = tcfItems.filter(_tcfMatch).map(i => ({
      key: i.key, summary: i.summary, team: i.team, level: i.level, kind: i.kind, status: i.status,
      levelColor: i.level === 'Sub-Task' ? '#8b95ab' : '#38bdf8',
      kindColor: i.kind === 'Neu erstellen' ? '#38bdf8' : i.kind === 'Aktualisieren' ? '#f6b73c' : '#8b95ab',
      statusColor: i.done ? '#4caf2f' : '#f6b73c',
      keyHref: (jiraBase && i.key) ? this.jiraTicketUrl(jiraBase, i.key) : '#',
      onOpen: (e) => { if (!jiraBase) { if (e && e.preventDefault) e.preventDefault(); this.openJira(i.key); } } }));
    const tcfRowCount = tcfRows.length;
    const tcfHasData = tcfTotal > 0;
    const tcfNoData = !tcfHasData;
    const tcfVals = { tcfExpanded, toggleTcfCollapse, tcfChevronRotate, tcfToggleTitle, tcfHasData, tcfNoData, tcfTotal, tcfDoneN, tcfOpenN, tcfNewOpen, tcfUpdOpen, tcfUncat, tcfHasUncat,
      tcfFile, tcfError, tcfFileInfo, tcfOwnSource, onTcfCsvFile, clearTcf,
      tcfPct, tcfTaskN, tcfSubN, tcfTaskDone, tcfSubDone, tcfTaskPct, tcfSubPct, tcfDaysLeft, tcfDeadline, tcfPerDay,
      tcfPace, tcfVerdict, tcfVerdictColor, tcfTeams, tcfTeamCount, tcfAvgTeam, tcfAvgTeamPerDay,
      tcfFilter, tcfFilterOpts, setTcfFilter, pickTcfAll, pickTcfNew, pickTcfUpd, pickTcfDone, pickTcfOpen, tcfRows, tcfRowCount,
      tcfTeamSel, tcfTeamActive, clearTcfTeam };

    const rptVariant = this.state.rptVariant === 'overall' ? 'overall' : 'env';
    const _print = (v) => { if (!this.can('admin')) { console.warn('QA Cockpit: rejected — admin role required'); return; }
      this.setState({ rptVariant: v }, () => setTimeout(() => { try { window.print(); } catch (e) {} }, 120)); };
    const exportPdf = () => _print(rptVariant);
    const exportPdfEnv = () => _print('env');
    const exportPdfOverall = () => _print('overall');
    const rptIsEnv = rptVariant === 'env';
    const rptTitle = rptIsEnv ? 'Test Environment & Bug Status' : 'Overall Status & Bug Report';
    const reportDateDay = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
    const rptEnvTotals = (hasCharts && overallEnv) ? {
      planned: overallEnv.planned, executed: overallEnv.executed, passed: overallEnv.passed,
      executedPct: overallEnv.executedPct, passedPct: overallEnv.passedPct,
    } : null;
    const rptHasEnv = !!hasCharts || phases.some(p => (p.pct || 0) > 0);
    const _rptPr = [
      { label: 'Critical', count: prCnt.Highest || 0, color: '#ef4444' },
      { label: 'High',     count: prCnt.High || 0,    color: '#ea580c' },
      { label: 'Medium',   count: prCnt.Medium || 0,  color: '#d97706' },
      { label: 'Low',      count: prCnt.Low || 0,     color: '#65a30d' },
    ];
    const _rptMax = Math.max(1, ..._rptPr.map(b => b.count));
    const rptBugPrios = _rptPr.map(b => ({ ...b, pct: Math.round(b.count / _rptMax * 100) }));
    const rptEmpty = !rptHasEnv && !hasDefects;
    const rptShowStatus = !rptEmpty;
    // Daily export covers ONLY the phase currently under test (QC1) — IR1/IR3/DF1/PC1 are out of scope.
    const RPT_ONLY = (this.ACTIVE_PHASE_WINDOW && this.ACTIVE_PHASE_WINDOW.label) || 'QC1';
    const RPT_SKIP = {}; this.relOrder().forEach(p => { if (p !== RPT_ONLY) RPT_SKIP[p] = true; });
    // Responsibilities belong to the selected release and are reused in the PDF.
    const rptResp = this.relResponsibilities().map(d => ({ id: d.id, role: d.role, color: d.color, people: d.people }));
    // One block per test type (Regressionstest IT / Business, Testautomation, Functional, E2E chains …), teams inside
    const _rptTests = [];
    const _noSmoke = (s) => !/smoke/i.test(String(s || ''));
    (phaseDetails || []).filter(pd => !RPT_SKIP[pd.id]).forEach(pd =>
      (pd.tests || []).filter(t => _noSmoke(t.name)).forEach(t => _rptTests.push({ id: pd.id, label: t.name || pd.label, dateRange: pd.dateRange, tests: [t] })));
    const rptEnvBlocks = (_rptTests.length ? _rptTests : (phaseDetails || []).filter(pd => !RPT_SKIP[pd.id])).map(pd => {
      const agg = {};
      (pd.tests || []).forEach(t => (t.teams || []).forEach(tm => {
        const o = agg[tm.name] || (agg[tm.name] = { planned: 0, tested: 0, passed: 0, failed: 0, blocked: 0 });
        o.planned += tm.planned || 0; o.tested += tm.tested || 0; o.passed += tm.passed || 0; o.failed += tm.failed || 0; o.blocked += tm.blocked || 0;
      }));
      let teams = Object.keys(agg).sort((a, b) => agg[b].planned - agg[a].planned).map(n => {
        const o = agg[n]; const ep = o.planned ? Math.min(100, Math.round(o.tested / o.planned * 100)) : 0;
        return { name: n, planned: o.planned, tested: o.tested, passed: o.passed, failed: o.failed, blocked: o.blocked, execPct: ep,
          failColor: o.failed ? '#ef4444' : '#cbd5e1', blockColor: o.blocked ? '#d97706' : '#cbd5e1',
          barColor: ep >= 90 ? '#16a34a' : ep >= 50 ? '#2563eb' : ep > 0 ? '#d97706' : '#cbd5e1' };
      });
      const sum = (k) => (pd.tests || []).reduce((s, t) => s + (t[k] || 0), 0);
      const planned = sum('planned'), tested = sum('tested'), passed = sum('passed'), failed = sum('failed'), blocked = sum('blocked');
      if (!teams.length) teams = [{ name: 'All teams', planned, tested, passed, failed, blocked,
        execPct: planned ? Math.min(100, Math.round(tested / planned * 100)) : 0,
        failColor: failed ? '#ef4444' : '#cbd5e1', blockColor: blocked ? '#d97706' : '#cbd5e1', barColor: '#2563eb' }];
      const execPct = planned ? Math.min(100, Math.round(tested / planned * 100)) : 0;
      const st = execPct >= 100 ? 'COMPLETE' : execPct > 0 ? 'IN PROGRESS' : 'PENDING';
      return { id: pd.id, label: pd.label, dateRange: pd.dateRange, teams, planned, tested, passed, failed, blocked, execPct, status: st, ...ps(st) };
    });
    const _ebKeep = rptEnvBlocks.filter(b => (b.planned || 0) > 0 || (b.tested || 0) > 0)
      .sort((a, b) => (b.planned || 0) - (a.planned || 0));
    if (_ebKeep.length) { rptEnvBlocks.length = 0; _ebKeep.forEach(b => rptEnvBlocks.push(b)); }
    const rptShowEnv = rptHasEnv && rptIsEnv && rptEnvBlocks.length > 0;
    const _ebSum = (k) => rptEnvBlocks.reduce((s, b) => s + (b[k] || 0), 0);
    const rptEnvTotalsFinal = (rptIsEnv && rptEnvBlocks.length)
      ? { planned: _ebSum('planned'), executed: _ebSum('tested'), passed: _ebSum('passed'),
          executedPct: _ebSum('planned') ? Math.round(_ebSum('tested') / _ebSum('planned') * 100) : 0,
          passedPct: _ebSum('tested') ? Math.round(_ebSum('passed') / _ebSum('tested') * 100) : 0 }
      : rptEnvTotals;
    const rptShowOverall = !rptIsEnv && !rptEmpty;
    const _gap = (exec, time) => { const d = Math.round((exec || 0) - (time || 0));
      return { gapLabel: (d >= 0 ? '+' : '') + d + ' pts', gapColor: d >= 0 ? '#16a34a' : d >= -10 ? '#d97706' : '#ef4444',
        gapBg: d >= 0 ? '#f0fdf4' : d >= -10 ? '#fffbeb' : '#fef2f7',
        gapNote: d >= 0 ? 'Execution ahead of schedule' : 'Execution behind schedule' }; };
    const rptHasBurn = !!(hasCharts && overallEnv);
    const rptBurnOverall = rptHasBurn ? { dateRange: overallEnv.dateRange, timeBurnPct: overallEnv.timeBurnPct,
      executedPct: overallEnv.executedPct, passedPct: overallEnv.passedPct, ..._gap(overallEnv.executedPct, overallEnv.timeBurnPct) } : null;
    const rptBurnRows = (envCharts || []).map(e => ({ id: e.id, timeBurnPct: e.timeBurnPct, executedPct: e.executedPct,
      passedPct: e.passedPct, planned: e.planned, executed: e.executed, ..._gap(e.executedPct, e.timeBurnPct) }));
    const _openRe = /(done|closed|resolved|cancel|reject|verified|transport)/i;
    const _priRank = { Blocker: 0, Critical: 1, High: 2, Major: 2, Medium: 3, Low: 4 };
    const rptAllBugs = (jd || []).filter(d => !/smoke/i.test([d.summary, d.component, d.module, d.labels, d.dir].filter(Boolean).join(' '))).map(d => { const pb = prBucket(d.priority); const ps = defPriStyle(pb);
      const open = !_openRe.test(String(d.status || ''));
      return { key: d.key || '—', summary: d.summary || '—', area: d.component || '—', pri: pb, priColor: ps.priColor,
        status: d.status || '—', assignee: (!d.assignee || /unassigned/i.test(d.assignee)) ? 'Unassigned' : d.assignee,
        open, rowBg: open ? '#ffffff' : '#f8fafc',
        _sort: (open ? 0 : 1) * 100 + (_priRank[pb] != null ? _priRank[pb] : 9) }; })
      .sort((a, b) => a._sort - b._sort || String(a.key).localeCompare(String(b.key)));
    const rptShowAllBugs = hasDefects && rptAllBugs.length > 0;

    const dumpSlot = this.state.dumpSlot || 'General';
    const dumpAll = this.loadDump(dumpSlot) || [];
    const dumpSlotTabs = this.DUMP_SLOTS.map(s => {
      const on = s === dumpSlot; const n = (this.loadDump(s) || []).length;
      return { id: s, label: (s === 'General' ? 'General dump' : s + ' bugs'), count: n,
        bg: on ? '#0f172a' : 'transparent', color: on ? '#fff' : 'var(--tx-mut)',
        brd: on ? '#0f172a' : 'var(--brd-2)', onClick: this.setDumpSlot(s) };
    });
    const dumpFile = this.loadDumpFile(dumpSlot);
    const dumpError = this.state.dumpError || ''; const dumpHasError = !!dumpError;
    const onDumpFile = this.onDumpFile; const exportDumpCsv = this.exportDumpCsv; const clearDump = this.clearDump;
    const dumpHasFile = dumpAll.length > 0;
    const _dumpScanned = (function (k) { try { return this.lsGet(k) || ''; } catch (e) { return ''; } })(this.dumpKey(dumpSlot, 'scanned'));
    const DB_STYLE = { 'Open': { c: '#ef4444', bg: 'rgba(239,68,68,0.13)' }, 'In Analysis': { c: '#d97706', bg: 'rgba(217,119,6,0.14)' }, 'Blocked': { c: '#7c3aed', bg: 'rgba(124,58,237,0.14)' }, 'Done': { c: '#65a30d', bg: 'rgba(101,163,13,0.15)' } };
    const dumpBucket = this.state.dumpBucket || 'All';
    const dumpQ = this.state.dumpQ || '';
    const _dq = dumpQ.trim().toLowerCase();
    const _bk = (d) => this.DUMP_BUCKET(d.status);
    const dumpCounts = { 'Open': 0, 'In Analysis': 0, 'Blocked': 0, 'Done': 0 };
    dumpAll.forEach(d => { dumpCounts[_bk(d)]++; });
    const dumpTabs = ['All', 'Open', 'In Analysis', 'Blocked', 'Done'].map(b => {
      const on = dumpBucket === b;
      const st = DB_STYLE[b] || { c: 'var(--tx)', bg: 'var(--card-bg2)' };
      return { label: b, count: b === 'All' ? dumpAll.length : dumpCounts[b],
        bg: on ? st.bg : 'transparent', color: on ? st.c : 'var(--tx-mut)',
        brd: on ? st.c : 'var(--brd-2)', weight: on ? '800' : '600',
        onClick: () => this.setDumpBucket(b) };
    });
    const dumpFiltered = dumpAll.filter(d => {
      if (dumpBucket !== 'All' && _bk(d) !== dumpBucket) return false;
      if (!_dq) return true;
      return [d.key, d.summary, d.assignee, d.status, d.component, d.priority].join(' ').toLowerCase().indexOf(_dq) >= 0;
    });
    const _bkRank = { 'Blocked': 0, 'Open': 1, 'In Analysis': 2, 'Done': 3 };
    const dumpRows = dumpFiltered.map(d => {
      const pb = prBucket(d.priority); const ps = defPriStyle(pb);
      const bk = _bk(d); const st = DB_STYLE[bk];
      return { key: d.key || '—', keyHref: (jiraBase && d.key) ? (jiraBase.replace(/\/$/, '') + '/browse/' + d.key) : '#',
        summary: d.summary || '—', pri: pb, priColor: ps.priColor, priBg: ps.priBg,
        bucket: bk, bkColor: st.c, bkBg: st.bg, _r: _bkRank[bk],
        status: d.status || '—', stColor: st.c,
        assignee: d.assignee || '—', created: (d.created || '—'), component: d.component || '—' };
    }).sort((a, b) => a._r - b._r || String(a.key).localeCompare(String(b.key)));
    const dumpOpen = this.state.dumpOpen !== false;
    const dumpEmpty = dumpAll.length === 0;
    const dumpShow = !dumpEmpty && dumpOpen;
    const dumpToggleLabel = dumpOpen ? 'Collapse' : 'Expand';
    const _slotName = dumpSlot === 'General' ? 'General dump' : dumpSlot;
    const dumpSub = dumpEmpty
      ? (dumpSlot === 'General'
          ? 'Separate bug dump CSV — independent of the Jira defect import'
          : 'Own CSV slot for ' + dumpSlot + ' — imported bugs stay in this tab only')
      : (_slotName + ' · ' + dumpAll.length + (dumpSlot === 'General' ? ' dump tickets' : ' bugs') + (_dumpScanned ? (' of ' + _dumpScanned + ' rows scanned') : '') + (dumpFile ? (' · ' + dumpFile) : ''));
    const dumpImportLabel = '⬆ Import ' + (dumpSlot === 'General' ? 'Bug Dump' : dumpSlot + ' bugs') + ' CSV';
    const dumpClearLabel = '✕ Clear ' + (dumpSlot === 'General' ? 'dump' : dumpSlot);
    const dumpEmptyTitle = dumpSlot === 'General' ? 'No bug dump imported yet' : 'No ' + dumpSlot + ' bugs imported yet';
    const dumpEmptyHint = dumpSlot === 'General'
      ? 'This section uses its own CSV — it never mixes with the Jira defect import above.'
      : 'Import the ' + dumpSlot + ' bug export here. Every phase tab keeps its own CSV, so ' + dumpSlot + ' open bugs never mix with the others.';
    const dumpCount = dumpRows.length + ' of ' + dumpAll.length + ' shown';
    const toggleDump = this.toggleDump; const onDumpQ = this.onDumpQ;
    const rptShowIntake = rptIsEnv && hasDefects;
    const rptIntakeCount = intakeCount;
    const rptIntakeEmpty = intakeCount === 0;
    const rptIntakeAny = intakeCount > 0;
    const _ebIds = {}; rptEnvBlocks.forEach(b => { _ebIds[b.id] = true; });
    const rptBurnRowsFinal = rptIsEnv ? rptBurnRows.filter(r => _ebIds[r.id]) : rptBurnRows;
    const _burnActive = rptIsEnv ? (envCharts || []).filter(e => _ebIds[e.id]) : [];
    const rptBurnOverallFinal = (_burnActive.length === 1)
      ? { dateRange: _burnActive[0].dateRange || rptBurnOverall && rptBurnOverall.dateRange, timeBurnPct: _burnActive[0].timeBurnPct,
          executedPct: _burnActive[0].executedPct, passedPct: _burnActive[0].passedPct,
          ..._gap(_burnActive[0].executedPct, _burnActive[0].timeBurnPct) }
      : rptBurnOverall;
    // ─── Pace per team (daily PDF): open runs + required runs/working day till test end ───
    // Window = the active environment of the selected release, never a fixed date.
    const _paceWin = this.ACTIVE_PHASE_WINDOW || {};
    const _paceEnd = pEnd(_paceWin.testTo || _paceWin.to || ''), _paceStart = pStart(_paceWin.from || '');
    const _paceWd = (a, b) => { let n = 0; const d0 = new Date(a); d0.setHours(0, 0, 0, 0);
      for (let t = d0.getTime(); t <= b; t += dayMs) { const w = new Date(t).getDay(); if (w !== 0 && w !== 6) n++; } return n; };
    const rptPaceDaysLeft = now <= _paceEnd ? _paceWd(Math.max(now, _paceStart), _paceEnd) : 0;
    const _paceElapsed = Math.max(1, _paceWd(_paceStart, Math.min(now, _paceEnd)));
    const _paceCases = (this.state.importedCases || []).filter(c => c && c.phase === RPT_ONLY && !/smoke/i.test(String(c.dir || '') + ' ' + String(c.test || '')));
    const _paceBy = {};
    _paceCases.forEach(c => {
      const segs = String(c.dir || '').split(' / ').map(s => s.trim()).filter(Boolean).slice(2);
      const k = c.team || c.module || segs[0] || '(Unassigned)';
      const o = _paceBy[k] || (_paceBy[k] = { name: k, total: 0, done: 0, open: 0 });
      o.total++;
      if ((c.status || 'Unexecuted') === 'Unexecuted') o.open++; else o.done++;
    });
    const rptPaceRows = Object.keys(_paceBy).map(k => _paceBy[k])
      .sort((a, b) => b.open - a.open || b.total - a.total)
      .map(o => {
        const perDay = rptPaceDaysLeft > 0 ? Math.ceil(o.open / rptPaceDaysLeft) : o.open;
        const actual = Math.round(o.done / _paceElapsed);
        const ok = o.open === 0 || (rptPaceDaysLeft > 0 && perDay <= Math.max(1, actual));
        return { name: o.name, total: o.total, done: o.done, open: o.open,
          pct: o.total ? Math.round(o.done / o.total * 100) : 0,
          perDay: o.open === 0 ? '✓' : String(perDay),
          actual: String(actual), color: o.open === 0 ? '#16a34a' : (ok ? '#16a34a' : '#b45309'),
          barColor: o.total && o.done / o.total >= 0.9 ? '#16a34a' : (o.done / (o.total || 1) >= 0.5 ? '#2563eb' : '#f59e0b'),
          barPct: o.total ? Math.round(o.done / o.total * 100) : 0 };
      });
    const _paceOpen = rptPaceRows.reduce((s, r) => s + r.open, 0);
    const _paceTot = rptPaceRows.reduce((s, r) => s + r.total, 0);
    const rptPaceShow = rptIsEnv && rptPaceRows.length > 0;
    const rptPaceOpen = _paceOpen;
    const rptPaceTotal = _paceTot;
    const rptPacePerDay = rptPaceDaysLeft > 0 ? Math.ceil(_paceOpen / rptPaceDaysLeft) : _paceOpen;
    const _paceEndLabel = this.relFmt(_paceWin.testTo || _paceWin.to || '');
    const rptPaceSub = RPT_ONLY + ' test execution ends ' + _paceEndLabel + ' · ' + rptPaceDaysLeft + ' working day' + (rptPaceDaysLeft === 1 ? '' : 's') + ' left · ' + _paceOpen + ' of ' + _paceTot + ' runs still open';
    const rptPaceNote = rptPaceDaysLeft === 0
      ? 'Test window closed — ' + _paceOpen + ' runs still open.'
      : 'Overall the teams must execute ' + rptPacePerDay + ' test runs per working day to finish ' + RPT_ONLY + ' by ' + this.relFmtShort(_paceWin.testTo || _paceWin.to || '') + '.';

    const diagOpen = !!this.state.diagOpen;
    const diagRows = (this.state.diag || []).map(d => ({ label: d.label, icon: d.ok ? '✅' : '❌' }));
    const closeDiag = () => this.setState({ diagOpen: false });

    // ══════════════════════════════════════════════════════════════════════
    //  RELEASE COCKPIT — navigation, overview, timeline, summary, admin
    //  Everything here reads the release model; nothing is release-specific.
    // ══════════════════════════════════════════════════════════════════════
    const _relNow = Date.now();
    const _relSel = this.relSelected() || { version: '—', environments: [] };
    const _relSelId = this.relSelectedId();
    const _relAll = this.relAll();
    const _navOpenState = this.state.navOpen || {};
    const _navFocus = this.state.navEnvFocus || '';

    // ── left navigation tree (qTest style) ──────────────────────────────
    const navReleases = _relAll.map(r => {
      const sel = r.id === _relSelId;
      const st = this.relAutoStatus(r);
      const stStyle = this.relStatusStyle(st);
      const w = this.relWindow(r);
      const envs = this.relEnvs(r);
      const openRaw = _navOpenState[r.id];
      const expanded = openRaw === undefined ? sel : !!openRaw;
      return {
        id: r.id, version: r.version || '(unnamed)',
        isSelected: sel, isCurrent: !!r.current, notCurrent: !r.current,
        statusLabel: r.current ? 'CURRENT' : st.toUpperCase(),
        statusColor: r.current ? '#0b1220' : stStyle.color,
        statusBg: r.current ? '#95c11f' : stStyle.bg,
        dot: sel ? '●' : '○',
        dotColor: r.current ? '#95c11f' : stStyle.color,
        rowBg: sel ? 'var(--card-bg2)' : 'transparent',
        rowBrd: sel ? '#95c11f' : 'transparent',
        rowTx: sel ? 'var(--tx-strong)' : 'var(--tx-mut)',
        rowWeight: sel ? 700 : 500,
        envCount: envs.length,
        envCountLabel: envs.length + ' env' + (envs.length === 1 ? '' : 's'),
        rangeLabel: w.start == null ? 'No schedule yet' : (this.relFmt(w.start) + ' – ' + this.relFmt(w.end)),
        onSelect: () => this.selectRelease(r.id),
        expanded, chevron: expanded ? '▾' : '▸',
        hasEnvs: envs.length > 0,
        onToggle: this.toggleNavRelease(r.id),
        envs: envs.map(e => {
          const ph = this.relEnvPhase(e, _relNow);
          const st2 = this.relPhaseStyle(ph);
          const ew = this.relEnvWindow(e);
          const focus = sel && _navFocus === e.name;
          return { key: r.id + '|' + e.id, name: e.name, phase: ph,
            phaseColor: st2.color, phaseBg: st2.bg,
            envColor: this.relEnvMeta(e.name).color,
            rangeLabel: ew.start == null ? '—' : (this.relFmtShort(ew.start) + ' – ' + this.relFmtShort(ew.end)),
            bg: focus ? 'var(--tile-bg)' : 'transparent',
            onClick: this.focusReleaseEnv(r.id, e.name) };
        }),
      };
    });
    const navCollapsed = !!this.state.navCollapsed;
    const navToggleIcon = navCollapsed ? '»' : '«';
    const navWidth = navCollapsed ? '58px' : '252px';
    const navExpanded = !navCollapsed;
    const navReleaseCount = _relAll.length;

    // ── release overview KPIs ───────────────────────────────────────────
    const _relWin = this.relWindow(_relSel);
    const relStatus = this.relAutoStatus(_relSel);
    const _relStStyle = this.relStatusStyle(relStatus);
    const relVersion = _relSel.version || '—';
    const relIsCurrent = !!_relSel.current;
    const relStatusLabel = relIsCurrent ? 'CURRENT' : relStatus.toUpperCase();
    const relStatusColor = relIsCurrent ? '#0b1220' : _relStStyle.color;
    const relStatusTextColor = _relStStyle.color;
    const relStatusBg = relIsCurrent ? '#95c11f' : _relStStyle.bg;
    const relPeriod = _relWin.start == null ? 'Not scheduled'
      : (this.relFmt(_relWin.start) + ' – ' + this.relFmt(_relWin.end));
    const _relEnvList = this.relEnvs(_relSel);
    const relEnvCount = _relEnvList.length;
    const relHasEnvs = relEnvCount > 0;
    const relNoEnvs = relEnvCount === 0;
    const _activeEnv = this.relActiveEnv(_relSel);
    const relCurrentEnv = _activeEnv ? _activeEnv.name : '—';
    const relCurrentPhase = _activeEnv ? this.relEnvPhase(_activeEnv, _relNow) : 'Not Started';
    const _curPhStyle = this.relPhaseStyle(relCurrentPhase);
    const relPhaseColor = _curPhStyle.color, relPhaseBg = _curPhStyle.bg;
    const relCurrentEnvRange = _activeEnv
      ? (this.relFmt(this.relEnvWindow(_activeEnv).start) + ' – ' + this.relFmt(this.relEnvWindow(_activeEnv).end)) : '—';
    const relProgressPct = (hasCharts && overallEnv) ? overallEnv.executedPct : 0;
    const relPassPct = (hasCharts && overallEnv) ? overallEnv.passedPct : 0;
    const relProgressLabel = (hasCharts && overallEnv)
      ? (overallEnv.executed + ' / ' + overallEnv.planned + ' test runs executed')
      : 'No qTest data imported for this release';
    const relOpenDefects = defOpen;
    const relCritDefects = openHighest;
    const relHighDefects = openHigh;
    const relDefectColor = relCritDefects > 0 ? '#ef4444' : (relOpenDefects > 0 ? '#d97706' : '#4caf2f');
    const relDaysLeft = _relWin.end == null || _relNow > _relWin.end ? 0
      : this.workDaysBetween(_relNow, _relWin.end) + 1;
    const relDaysLeftLabel = _relWin.end == null ? '—'
      : (_relNow > _relWin.end ? 'Finished' : relDaysLeft + ' work day' + (relDaysLeft === 1 ? '' : 's'));
    const relNotes = _relSel.notes || '';
    const relHasNotes = !!relNotes;
    const relLastUpdated = _relSel.updatedAt
      ? new Date(_relSel.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    // Next milestone = next schedule boundary in this release that is still ahead.
    const _nextMs = this.relNextMilestonePoint(_relSel);
    const relNextMilestone = _nextMs ? _nextMs.label : (adminMilestone || '—');
    const relNextMilestoneDate = _nextMs ? this.relFmt(_nextMs.t) : (adminMilestoneDate || '—');
    const relNextMilestoneIn = _nextMs
      ? (Math.max(0, Math.ceil((_nextMs.t - _relNow) / 86400000)) + ' day' + (Math.ceil((_nextMs.t - _relNow) / 86400000) === 1 ? '' : 's') + ' from today')
      : 'No upcoming milestone';
    // context line repeated in every report section
    const relContext = relVersion + ' · ' + relCurrentEnv + ' · ' + relCurrentPhase;

    // ── release timeline (environment lifecycle) ────────────────────────
    const _tlS = _relWin.start, _tlE = _relWin.end;
    const _tlSpan = (_tlS != null && _tlE != null && _tlE > _tlS) ? (_tlE - _tlS) : 1;
    const _pctOf = (t) => Math.max(0, Math.min(100, ((t - _tlS) / _tlSpan) * 100));
    const _segState = (s, e) => e < _relNow ? 'done' : (s <= _relNow && _relNow <= e ? 'current' : 'future');
    const relTimeline = _relEnvList.map(e => {
      const meta = this.relEnvMeta(e.name);
      const w = this.relEnvWindow(e);
      const phase = this.relEnvPhase(e, _relNow);
      const phStyle = this.relPhaseStyle(phase);
      const mk = (sd, ed, kind, color, pattern) => {
        const s = this.relStart(sd), en = this.relEnd(ed);
        if (s == null || en == null) return null;
        const state = _segState(s, en);
        const wPct = Math.max(0.6, _pctOf(en) - _pctOf(s));
        return { kind, label: kind, color,
          showLabel: wPct >= 7, labelOp: wPct >= 7 ? 1 : 0,
          left: _pctOf(s).toFixed(2), width: wPct.toFixed(2),
          range: this.relFmtShort(s) + ' – ' + this.relFmt(en),
          state, isCurrent: state === 'current', done: state === 'done',
          op: state === 'done' ? 0.45 : (state === 'future' ? 0.7 : 1),
          bg: pattern
            ? ('repeating-linear-gradient(135deg,' + color + ' 0 6px, rgba(255,255,255,0.22) 6px 12px)')
            : color,
          ring: state === 'current' ? ('0 0 0 2px var(--card-bg), 0 0 0 4px ' + color) : 'none',
          title: e.name + ' · ' + kind + ' · ' + this.relFmt(s) + ' – ' + this.relFmt(en) };
      };
      const segs = [
        mk(e.testingStart, e.testingEnd, 'Testing', meta.color, false),
        mk(e.bugFixStart, e.bugFixEnd, 'Bug Fixing', '#d97706', true),
        mk(e.retestStart, e.retestEnd, 'Retesting', '#7c3aed', true),
      ].filter(Boolean);
      return { key: e.id, name: e.name, label: meta.label, color: meta.color,
        phase, phaseColor: phStyle.color, phaseBg: phStyle.bg,
        isCurrent: phase === 'Testing' || phase === 'Bug Fixing' || phase === 'Retesting',
        rangeLabel: w.start == null ? '—' : (this.relFmt(w.start) + ' – ' + this.relFmt(w.end)),
        segs, hasSegs: segs.length > 0,
        notes: e.notes || '', hasNotes: !!e.notes,
        onClick: () => this.focusEnvironment(e.name) };
    });
    const relTlTodayPct = (_tlS == null || _relNow < _tlS || _relNow > _tlE) ? '0' : _pctOf(_relNow).toFixed(2);
    const relTlTodayShow = _tlS != null && _relNow >= _tlS && _relNow <= _tlE;
    const relTlStartLabel = _tlS == null ? '—' : this.relFmt(_tlS);
    const relTlEndLabel = _tlE == null ? '—' : this.relFmt(_tlE);
    const relTlLegend = [
      { label: 'Testing', bg: '#2563eb' },
      { label: 'Bug Fixing', bg: 'repeating-linear-gradient(135deg,#d97706 0 6px, rgba(255,255,255,0.22) 6px 12px)' },
      { label: 'Retesting', bg: 'repeating-linear-gradient(135deg,#7c3aed 0 6px, rgba(255,255,255,0.22) 6px 12px)' },
      { label: 'Completed', bg: '#4caf2f' },
      { label: 'Current', bg: '#95c11f' },
      { label: 'Future', bg: 'var(--track)' },
    ];

    // ── release summary (full schedule table) ───────────────────────────
    const _envChartById = {}; (envCharts || []).forEach(c => { _envChartById[c.id] = c; });
    const relSummaryRows = _relEnvList.map(e => {
      const meta = this.relEnvMeta(e.name);
      const phase = this.relEnvPhase(e, _relNow);
      const st = this.relPhaseStyle(phase);
      const w = this.relEnvWindow(e);
      const chart = _envChartById[e.name];
      const envDefects = (jd || []).filter(d => String(d.environment || '').toUpperCase().indexOf(e.name.toUpperCase()) >= 0);
      const envOpen = envDefects.filter(d => !isClosed(d.status)).length;
      const envCrit = envDefects.filter(d => !isClosed(d.status) && prBucket(d.priority) === 'Highest').length;
      const envHigh = envDefects.filter(d => !isClosed(d.status) && prBucket(d.priority) === 'High').length;
      return { key: e.id, name: e.name, label: meta.label, color: meta.color,
        testing: e.testingStart ? (this.relFmt(e.testingStart) + ' – ' + this.relFmt(e.testingEnd)) : '—',
        bugfix: e.bugFixStart ? (this.relFmt(e.bugFixStart) + ' – ' + this.relFmt(e.bugFixEnd)) : '—',
        retest: e.retestStart ? (this.relFmt(e.retestStart) + ' – ' + this.relFmt(e.retestEnd)) : '—',
        window: w.start == null ? '—' : (this.relFmt(w.start) + ' – ' + this.relFmt(w.end)),
        phase, phaseColor: st.color, phaseBg: st.bg,
        progressPct: chart ? chart.executedPct : 0,
        progressLabel: chart ? (chart.executed + ' / ' + chart.planned) : '—',
        hasProgress: !!chart,
        openDefects: envOpen, critDefects: envCrit, highDefects: envHigh,
        defectColor: envCrit > 0 ? '#ef4444' : (envOpen > 0 ? '#d97706' : '#4caf2f'),
        notes: e.notes || '—',
        onClick: () => this.focusEnvironment(e.name) };
    });
    const relHasSummary = relSummaryRows.length > 0;

    // ── Manage Releases modal ───────────────────────────────────────────
    const relModalOpen = !!this.state.relModalOpen;
    const relForm = this.state.relForm;
    const relFormOpen = !!relForm;
    const relFormIsNew = relFormOpen && !relForm.id;
    const relFormTitle = relFormOpen ? (relFormIsNew ? 'New release' : 'Edit release ' + (relForm.version || '')) : '';
    const relFormErr = this.state.relFormErr || '';
    const relFormHasErr = !!relFormErr;
    const relMsg = this.state.relMsg || '';
    const relHasMsg = !!relMsg;
    const relConfirmId = this.state.relConfirm || null;
    const relConfirmRel = relConfirmId ? _relAll.find(r => r.id === relConfirmId) : null;
    const relConfirmOpen = !!relConfirmRel;
    const relConfirmVersion = relConfirmRel ? relConfirmRel.version : '';
    const relIsLastRelease = _relAll.length <= 1;
    const relManageRows = _relAll.map(r => {
      const st = this.relAutoStatus(r);
      const stStyle = this.relStatusStyle(st);
      const w = this.relWindow(r);
      const editing = relFormOpen && relForm.id === r.id;
      return { id: r.id, version: r.version || '(unnamed)',
        statusLabel: st, statusColor: stStyle.color, statusBg: stStyle.bg,
        isCurrent: !!r.current, notCurrent: !r.current,
        envLabel: this.relEnvs(r).map(e => e.name).join(' · ') || 'No environments',
        rangeLabel: w.start == null ? 'No schedule' : (this.relFmt(w.start) + ' – ' + this.relFmt(w.end)),
        rowBg: editing ? 'var(--tile-bg)' : 'var(--card-bg)',
        rowBrd: editing ? '#95c11f' : 'var(--card-brd)',
        canDelete: !relIsLastRelease,
        onEdit: this.relEdit(r.id), onDuplicate: this.relDuplicate(r.id),
        onDelete: this.relAskDelete(r.id), onSetCurrent: this.relSetCurrent(r.id),
        onView: () => this.selectRelease(r.id) };
    });
    const _formEnvs = relFormOpen ? (relForm.environments || []) : [];
    const relEnvChoices = this.ENV_CATALOG
      .concat(_formEnvs.map(e => e.name))
      .filter((n, i, a) => n && a.indexOf(n) === i)
      .map(name => {
        const on = _formEnvs.some(e => e.name === name);
        return { name, on, mark: on ? '☑' : '☐',
          bg: on ? 'var(--tile-bg)' : 'transparent',
          brd: on ? this.relEnvMeta(name).color : 'var(--brd-2)',
          tx: on ? 'var(--tx-strong)' : 'var(--tx-mut)',
          onToggle: this.relToggleEnv(name) };
      });
    const relFormEnvs = _formEnvs.map(e => ({
      id: e.id, name: e.name, color: this.relEnvMeta(e.name).color,
      testingStart: this.relIso(e.testingStart), testingEnd: this.relIso(e.testingEnd),
      bugFixStart: this.relIso(e.bugFixStart), bugFixEnd: this.relIso(e.bugFixEnd),
      retestStart: this.relIso(e.retestStart), retestEnd: this.relIso(e.retestEnd),
      notes: e.notes || '', includeWeekends: !!e.includeWeekends,
      setName: this.relEnvSet(e.id, 'name'),
      setTestingStart: this.relEnvSet(e.id, 'testingStart'), setTestingEnd: this.relEnvSet(e.id, 'testingEnd'),
      setBugFixStart: this.relEnvSet(e.id, 'bugFixStart'), setBugFixEnd: this.relEnvSet(e.id, 'bugFixEnd'),
      setRetestStart: this.relEnvSet(e.id, 'retestStart'), setRetestEnd: this.relEnvSet(e.id, 'retestEnd'),
      setNotes: this.relEnvSet(e.id, 'notes'), setWeekends: this.relToggleEnvField(e.id, 'includeWeekends'),
      weekendMark: e.includeWeekends ? '☑' : '☐',
      onRemove: this.relRemoveEnv(e.id),
    }));
    const _formResp = relFormOpen ? (relForm.responsibilities || []) : [];
    const relFormResp = _formResp.map(r => ({
      id: r.id, role: r.role, people: r.people, color: r.color,
      setRole: this.relRespSet(r.id, 'role'), setPeople: this.relRespSet(r.id, 'people'),
      onRemove: this.relRemoveResp(r.id),
    }));
    const relFormHasResp = relFormResp.length > 0;
    const relFormNoResp = relFormResp.length === 0;
    const relRespSuggest = this.RESP_SUGGEST
      .filter(rn => !_formResp.some(x => String(x.role).toLowerCase() === rn.toLowerCase()))
      .map(rn => ({ label: rn, onAdd: this.relAddResp(rn) }));
    const relRespHasSuggest = relRespSuggest.length > 0;
    const relFormHasEnvs = relFormEnvs.length > 0;
    const relFormNoEnvs = relFormEnvs.length === 0;
    const relFormVersion = relFormOpen ? (relForm.version || '') : '';
    const relFormStatus = relFormOpen ? (relForm.status || 'Planned') : 'Planned';
    const relFormStart = relFormOpen ? this.relIso(relForm.startDate) : '';
    const relFormEnd = relFormOpen ? this.relIso(relForm.endDate) : '';
    const relFormCurrent = relFormOpen ? !!relForm.current : false;
    const relFormNotes = relFormOpen ? (relForm.notes || '') : '';
    const relFormCurrentMark = relFormCurrent ? '☑' : '☐';
    const relStatusChoices = this.REL_STATUSES.map(v => ({ value: v, label: v, selected: v === relFormStatus }));
    const relSaveLabel = relFormIsNew ? 'Create release' : 'Save changes';
    // Context for the Excel / PowerPoint defect exports, captured from the live
    // view so the file matches exactly what is on screen.
    this._defectCtx = {
      release: relVersion, environment: relCurrentEnv, phase: relCurrentPhase,
      total: defTotal, open: defOpen, closed: defClosed,
      prCnt: { ...prCnt },
      statusCounts: (statusBreakdown || []).map(x => ({ name: x.name, count: x.count })),
      filterNote: [dfStatus !== 'All' ? 'Status: ' + dfStatus : '', dfPriority !== 'All' ? 'Priority: ' + dfPriority : '',
        (dfArea && dfArea !== 'All') ? 'Area: ' + dfArea : '', dfSearch ? 'Search: ' + dfSearch : ''].filter(Boolean).join(' · '),
      shown: defectRows.length, jiraFile: this.state.jiraFile || '',
    };
    return {
      theme, toggleTheme, themeIcon, themeLabel,
      reportDate, overallStatus, headerAccent,
      onFile, importInfo, importError,
      phases, phaseDetails, summary,
      defects: defectsWithBar, totalDefects,
      risks,
      nextMilestone: adminMilestone,
      nextMilestoneDate: adminMilestoneDate,
      infoNote, hasInfo,
      milestoneOpen, openMilestone, closeMilestone, mMilestone, mDate, mInfo, setMMilestone, setMDate, setMInfo, saveMilestone,
      envCharts, overallEnv, hasCharts,
      hasEnvData, noEnvData,
      topicModalOpen, tmLevel, tmText, tmTitle, setTmTitle, tmIsEdit, tmIsNew, topicLevels, setTmLevel, setTmText, openTopicNew, closeTopic, saveTopic,
      historyOpen, openHistory, closeHistory, historyList, historyCount, hasHistory, noHistory, viewingLabel,
      calCells, weekDays, monthName, prevMonth, nextMonth,
      tcModalOpen, tcCases, tcTitle, tcCount, tcHasCases, tcNoCases, closeTcModal,
      tcUnexTotal, tcHasUnex, tcUnexLabel, toggleTcUnex, tcNoMatch, tcTrulyEmpty,
      trfQ, trfStatus, trfTeam, trfTester, trfRuns, trfBug,
      trfStatusOpts, trfTeamOpts, trfTesterOpts, trfRunsOpts, trfBugOpts,
      trfActive, trfClear, trfCountLabel, trfHasTeams, trfHasTesters,
      setTrfQ: (e) => this.setState({ trfQ: e.target.value }),
      setTrfStatus: (e) => this.setState({ trfStatus: e.target.value }),
      setTrfTeam: (e) => this.setState({ trfTeam: e.target.value }),
      setTrfTester: (e) => this.setState({ trfTester: e.target.value }),
      setTrfRuns: (e) => this.setState({ trfRuns: e.target.value }),
      setTrfBug: (e) => this.setState({ trfBug: e.target.value }),
      qtestModalOpen, qtestGroups, qtestHasSuites, qtestNoSuites, openQtestManager, closeQtestManager, saveQtestManager,
      countdown,
      timeline, todayPct, todayInRange, openTimelineModal, closeTimelineModal, timelineModalOpen, calDays, weekDayNames,
      execHasData, execMonthName, execPrevMonth, execNextMonth, execGrid, execWeekDays, execPhaseLabel,
      execSelDay, execSelList, execSelLabel, execSelCount, execTotal, execCalOpen, closeExecCal, execNoSel,
      execStatChips, execFilterNote, execCalSub,
      triageRows, hasTriage, triageSub, triageStats, triageMore, triageMoreLabel, toggleTriageAll, triageTotal, intakeRows, intakeCount, intakeEmpty, intakeSub,
      triageBtnLabel, triageModalOpen, openTriage, closeTriage, triageStop,
      triageTabTop, triageTabNew, setTriageTop, setTriageNew, tabTopBg, tabTopColor, tabNewBg, tabNewColor,
      execAreaChips, execAreaKind, execTeamChips, execHasTeams, execAreaLabel, execHasPacing, execPlanned, execExecuted, execRemaining,
      execDaysLeftLabel, execEndLabel, execSuggest, execPctDone, execPctBar, execPaceLabel, execPaceColor,
      execVerdict, execVerdictColor, execVerdictBg,
      phaseScopeLabel, phaseScopeHidden, phaseScopeHasHidden,
      storeFull: !!this.lsGet('qa-store-full'),
      vfxGlass, vfxFlat, vfxLabel, toggleVfx, envCompact, envCards, envViewLabel, toggleEnvView,
      auroraOn, auroraLabel, toggleAurora, auroraDot: auroraOn ? '#95c11f' : 'var(--tx-fnt)', vfxDot: vfxGlass ? '#95c11f' : 'var(--tx-fnt)',
      xeGroups, xeHas, xeNone, xeGroupN, xeTicketN, xeIdenticalN, xeOpenN,
      xeMatrix, xeMatrixCols, xeMatrixHas, xeLevels, xeThresholdKey, setXeStrict,
      carryTotal, carryHas, carryNone, carryEnvs, carryHighTotal, carryHasHigh, openCarry, curEnvName: _curEnv,
      dfOrigin, originChoices, setDfOrigin, originLabel: originLabelOf(dfOrigin),
      defectKpis, defectKpisState, defectKpisPrio, hasDefects, noDefects, defTotal, defOpen, defClosed, openClosedPct, closedDeg, prCnt,      jiraBase, jiraHasBase, jiraFile, jiraHasFile, jiraError, jiraHasError, onCsvFile, setJiraBase, exportDefectsCsv, exportDefectsXlsx, exportDefectsPptx,
      openDefectModal, closeDefectModal, defectModalOpen, clearDefects, hasAnyData,
      ...(() => { const g = this.state.gngOpen ? this.gngModel() : null; return {
        gngOpen: !!this.state.gngOpen, openGng: this.openGng, closeGng: this.closeGng,
        gngPhaseTabs: this.gngPhases().map(id => ({ label: id, onClick: () => this.setGngPhase(id),
          bg: id === this.GNG.from ? '#ea580c' : 'transparent', color: id === this.GNG.from ? '#fff' : '#8fa3cc' })),
        downloadGngPptx: this.downloadGngPptx, gngMsg: this.state.gngMsg || '', gngHasMsg: !!this.state.gngMsg,
        gng: g || {}, gngHasData: !!(g && g.hasData), gngNoData: !!(g && !g.hasData),
        gngHasApps: !!(g && g.appRows.length), gngHasBlockers: !!(g && g.blockerList.length),
      }; })(),
      dcBarW, dcGrid, dcPoints, dcPhaseTabs, dcSub, dcOpenPath, dcOpenNow,
      dcPlotL, dcPlotR, dcTickY, dcAxisX, dcGutterPct, dcTickTopPct, dcTicks,
      dcAvgCreated, dcAvgResolved, dcPeakLabel, dcShowTable, dcTableToggle, dcTableLabel, dcTableRows,
      dcCreatedTotal, dcResolvedTotal, dcNetLabel, dcNetColor, dcHasPhases,
      statusBreakdown, priorityCards, agingBars, releaseChecks, relColor, relLabel, openHighest, openHigh,
      coverageBars, qualityKpis, execCounters,
      activeModule, trackX, defectPanelActive, panel0MaxH, panel0Ov, panel1MaxH, panel1Ov, goTestReport, goDefects, modTestBg, modTestColor, modDefBg, modDefColor, onTrackTouchStart, onTrackTouchEnd, onTrackPtrDown, onTrackPtrUp,
      jiraSyncLabel, qtestSyncLabel, importedCount, importStatusLabel, importStatusColor, importMsg, importMsgColor, jiraUrlValue, setJiraUrlInput,
      jiraWarn, jiraHasWarn,
      dfStatus, dfPriority, dfSearch, dfSortKey, dfSortDir, statusOptions, priorityOptions, areaOptions, dfArea, setDfArea,
      setDfStatus, setDfPriority, setDfSearch, sortDefBy, sortHandlers, defectRows, defectCount, byStatusBars, byPriorityBars,
      dfRetest, retestOptions, setDfRetest,
      dfBasis, basisOptions, setDfBasis, joinStats,
      dfDate, setDfDate, clearDfDate,
      // Comment system
      commentOpen, commentText, commentSection, commenterName,
      openComment, closeComment, setText, setSection, setName,
      sections, isSuccess, hasError, commentError, submitComment,
      // Auth
      ...(() => {
        const l = this.loadLayout();
        const out = {};
        const cols = {};
        l.order.forEach(k => { const sd = this.SECTIONS.find(s => s.k === k); if (!sd) return; cols[sd.col] = (cols[sd.col] || 0) + 1; out['ord_' + k] = cols[sd.col]; out['dsp_' + k] = l.hidden[k] ? 'none' : 'flex'; });
        const rows = [];
        ['Main column', 'Side column'].forEach(col => {
          const keys = l.order.filter(k => (this.SECTIONS.find(s => s.k === k) || {}).col === col);
          keys.forEach((k, i) => {
            const sd = this.SECTIONS.find(s => s.k === k);
            rows.push({ k, label: sd.label, col, colShow: i === 0, hidden: !!l.hidden[k],
              eye: l.hidden[k] ? '🚫' : '👁', eyeTitle: l.hidden[k] ? 'Show this section' : 'Hide this section',
              nameColor: l.hidden[k] ? 'var(--tx-fnt)' : 'var(--tx-strong)',
              upDim: i === 0 ? 0.25 : 1, downDim: i === keys.length - 1 ? 0.25 : 1,
              onUp: () => this.moveSection(k, -1), onDown: () => this.moveSection(k, 1), onToggle: () => this.toggleSection(k) });
          });
        });
        out.layoutRows = rows;
        out.hiddenCount = Object.keys(l.hidden).length;
        out.hasHidden = Object.keys(l.hidden).length > 0;
        return out;
      })(),
      ...this.chainVals(),
      layoutOpen: !!this.state.layoutOpen, openLayout: this.openLayout, closeLayout: this.closeLayout, resetLayout: this.resetLayout,
      ...(() => {
        const w = this.workCfg();
        return {
          workFrom: w.from, workTo: w.to, workLabel: this.workLabel(),
          workHoursPerDay: (this.workDayMinutes() / 60).toFixed(1).replace('.0', ''),
          setWorkFrom: this.setWorkFrom, setWorkTo: this.setWorkTo, resetWork: this.resetWork,
          workDayChips: [1, 2, 3, 4, 5, 6, 0].map(d => {
            const on = this.isWorkDay(d);
            return { label: this.WEEKDAY_LABELS[d], on,
              bg: on ? '#95c11f' : 'transparent', color: on ? '#16210a' : 'var(--tx-mut)',
              brd: on ? '#95c11f' : 'var(--brd-2)', onToggle: this.toggleWorkDay(d) };
          }),
        };
      })(),
      releaseVersion: relVersion,
      // ─── release management layer ───────────────────────────────────────
      navReleases, navCollapsed, navExpanded, navToggleIcon, navWidth, navReleaseCount, toggleNavPanel: this.toggleNavPanel,
      relVersion, relStatus, relStatusLabel, relStatusColor, relStatusBg, relIsCurrent,
      relPeriod, relEnvCount, relHasEnvs, relNoEnvs, relCurrentEnv, relCurrentPhase, relCurrentEnvRange,
      relPhaseColor, relPhaseBg, relProgressPct, relPassPct, relProgressLabel,
      relOpenDefects, relCritDefects, relHighDefects, relDefectColor,
      relDaysLeft, relDaysLeftLabel, relNotes, relHasNotes, relLastUpdated,
      relNextMilestone, relNextMilestoneDate, relNextMilestoneIn, relContext,
      relSelectedIdProp: _relSelId,
      relTimeline, relTlTodayPct, relTlTodayShow, relTlStartLabel, relTlEndLabel, relTlLegend, relStatusTextColor,
      relSummaryRows, relHasSummary,
      relModalOpen, openRelManager: this.openRelManager, closeRelManager: this.closeRelManager,
      relManageRows, relNew: this.relNew, relSave: this.relSave,
      relFormOpen, relFormClosed: !relFormOpen, relFormIsNew, relFormTitle, relFormErr, relFormHasErr, relMsg, relHasMsg,
      relFormVersion, relFormStatus, relFormStart, relFormEnd, relFormCurrent, relFormCurrentMark, relFormNotes,
      relStatusChoices, relSaveLabel, relEnvChoices, relFormEnvs, relFormHasEnvs, relFormNoEnvs,
      relEnvNew: this.state.relEnvNew || '', setRelEnvNew: this.setRelEnvNew, relAddCustomEnv: this.relAddCustomEnv,
      relFormResp, relFormHasResp, relFormNoResp, relRespSuggest, relRespHasSuggest,
      relAddRespBlank: this.relAddResp(''),
      relConfirmOpen, relConfirmVersion, relConfirmDelete: this.relConfirmDelete, relCancelDelete: this.relCancelDelete,
      setRelFormVersion: this.relFormSet('version'), setRelFormStatus: this.relFormSet('status'),
      setRelFormStart: this.relFormSet('startDate'), setRelFormEnd: this.relFormSet('endDate'),
      setRelFormCurrent: this.relToggleForm('current'), setRelFormNotes: this.relFormSet('notes'),
      relCancelForm: () => this.setState({ relForm: null, relDirty: false, relFormErr: '' }),
      role, isEditor, isViewer, isAdmin, roleBadge, editorName, editors, focusPhase,
      qtestUrl: this.state.qtestUrl || '', setQtestUrl: this.setQtestUrl, refreshFromQtest: this.refreshFromQtest,
      qHasUrl: !!(this.state.qtestUrl && this.state.qtestUrl.trim()),
      qActualiseIcon: this.state.qsyncing ? '\u2026' : '\u27f3', qActualiseLabel: this.state.qsyncing ? 'Actualising\u2026' : 'Actualise',
      qsyncMsg: this.state.qsyncMsg || '', qsyncMsgColor: this.state.qsyncErr ? '#ef4444' : '#22c55e',
      panelMax, sumExpanded, sumCollapsed, bdExpanded, bdCollapsed, sumFlex, bdFlex, maximizeSummary, maximizeBurndown, panelDown, panelUp, noCharts, bdTimeBurn,
      loginOpen, openLogin, closeLogin, loginName, loginPin, loginError, loginHasError, setLoginName, setLoginPin, doLogin, doLogout,
      resetLocalPins, pinOpen, openPin, closePin, pinCurrent, pinNew1, pinNew2, setPinCurrent, setPinNew1, setPinNew2, changePin, pinSuccess, pinHasError, pinError,
      isSuperAdmin, managedUsers, hasManagedUsers, noManagedUsers, nuName, nuPin, nuRole, setNuName, setNuPin, setNuRole, addUser, nuHasError, nuSuccess, nuError, nuOk,
      // Inbox
      inboxComments, hasComments, noComments, commentCount, inboxOpen, openInbox, closeInbox, inboxCountLabel, showCommentFab, showInboxFab,
      importAccept, importBtnLabel, xlsxNoticeShow,
      coverageOpen, covTitle, covUncovered, covLegend, covRoot, covCols, covHasData, covNoData, closeCoverage,
      reqHasData, reqRows, reqCovered, reqVerified, reqIssue, reqBaseline, reqCovPct, reqCovPctLabel, reqNoData, reqUncovered, reqVerifiedPct,
      reqByPhase, reqCovOpen, openReqCov, closeReqCov, setReqBaseline, reqCanEdit, stopReqProp,
      reqRunOpen, closeReqRun, reqRunTitle, reqRunName, reqRunList,
      dmdDrillOpen, dmdDrillTitle, dmdDrillColor, dmdDrillRows, dmdDrillCount, closeDmdDrill,
      backlogHasData, backlogStories, backlogBugs, linkedQtestN, qaLabelN, olderBugsN, notLinkedN,
      backlogRows, backlogFilterOpts, backlogFilter, setBacklogFilter, testStart, setTestStart, backlogTotal,
      onBacklogCsvFile, clearBacklog, backlogFile, backlogError, backlogShow, backlogNoData, backlogFileInfo, pickBacklog,
      pickAll, pickLinked, pickQa, pickOlder, pickNone, pickFlagged, flaggedN, backlogStatusOpts, backlogStatus, setBacklogStatus,
      backlogAsgOpts, backlogAsg, setBacklogAsg,
      backlogQuery, setBacklogQuery, clearBacklogQuery, backlogShownN: backlogRows.length, backlogHasQuery: !!_bq,
      exportPdf, exportPdfEnv, exportPdfOverall, rptTitle, rptIsEnv,
      rptPaceShow, rptPaceRows, rptPaceSub, rptPaceNote, rptPaceDaysLeft, rptPaceOpen, rptPaceTotal, rptPacePerDay,
      rptShowEnv, rptShowOverall, rptHasBurn, rptEnvBlocks,
      rptBurnOverall: rptBurnOverallFinal,
      rptBurnRows: rptBurnRowsFinal,
      dumpRows, dumpShow, dumpEmpty, dumpToggleLabel, dumpSub, dumpCount, dumpQ, toggleDump, onDumpQ, dumpTabs, onDumpFile, exportDumpCsv, clearDump, dumpFile, dumpError, dumpHasError, dumpHasFile,
      dumpSlotTabs, dumpImportLabel, dumpClearLabel, dumpEmptyTitle, dumpEmptyHint,
      rptAllBugs, rptShowAllBugs, rptShowIntake, rptIntakeCount, rptIntakeEmpty, rptIntakeAny,
      respCards: rptResp.map((r, i) => ({ key: r.id || ('resp' + i), role: r.role, people: r.people, color: r.color,
        padTop: i ? '12px' : '0px', brdTop: i ? '1px solid var(--brd-sub)' : 'none',
        editable: isEditor, readOnly: !isEditor,
        onChange: this.setRespPeople(r.id) })),
      hasResp: rptResp.length > 0, noResp: rptResp.length === 0,
      rptEnvTotals: rptEnvTotalsFinal, rptHasEnv, rptBugPrios, rptEmpty, rptResp, ...tcfVals,
      reportDateDay, rptShowStatus,
      covRenameApp: this.covRenameApp, covAssignModule: this.covAssignModule,
      diagOpen, diagRows, closeDiag,
    };
  }
}

