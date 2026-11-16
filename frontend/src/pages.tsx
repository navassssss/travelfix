import { useEffect, useState } from "react";
import { api, getGuestToken, signOut, TOKEN_KEY, GUEST_KEY, PROFILE_KEY, type CaseItem, type Contribution, type Profile, type Resource, type Solution } from "./api";
import { storage } from "./storage";
import { solvePrefill } from "./App";

export const CATEGORIES = [
  "Transportation", "Accommodation", "Lost Belongings & Documents", "Money & Payments",
  "Medical Assistance", "Communication & Language", "Safety & Unexpected Situations", "Other",
];

export interface Ctx {
  navigate: (path: string) => void;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
}

function Urgency({ value }: { value: string }) {
  return <span className={`pill ${value}`}>{value.toUpperCase()} urgency</span>;
}

function StatusPill({ value }: { value: string }) {
  const cls = value === "Published" ? "published" : value === "Pending Review" ? "pending" : "status";
  return <span className={`pill ${cls}`}>{value}</span>;
}

function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error">{error}</div> : null;
}

// ---------------- Home ----------------
export function HomePage({ navigate }: Ctx) {
  const [problem, setProblem] = useState("");
  const [location, setLocation] = useState("");
  const [recent, setRecent] = useState<Solution[]>([]);
  const [guestCases, setGuestCases] = useState<CaseItem[]>([]);

  useEffect(() => {
    api.solutions().then((r) => setRecent(r.solutions.slice(0, 3))).catch(() => {});
    const gt = getGuestToken();
    if (gt) api.guestCases(gt).then((r) => setGuestCases(r.cases.slice(0, 3))).catch(() => {});
  }, []);

  const start = () => {
    solvePrefill.problem = problem;
    solvePrefill.location = location;
    navigate("/solve");
  };

  return (
    <>
      <section className="hero">
        <h1>Something went wrong during your journey?</h1>
        <p>Tell TravelFix what happened and where you are. You will get practical next steps — no account needed.</p>
        <div className="card" style={{ color: "#1c2733" }}>
          <label>What happened?</label>
          <textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. My flight was cancelled in Kochi and I need to reach Munnar tonight" />
          <label>Where are you now?</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City or area, e.g. Kochi, India" />
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={start}>Find a Solution</button>
            <button className="btn secondary" onClick={() => { if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => setLocation(`${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}`)); }}>Use my current location</button>
          </div>
        </div>
      </section>

      {guestCases.length > 0 && (
        <div className="card">
          <h3>Continue where you left off</h3>
          {guestCases.map((c) => (
            <p key={c.id}><button className="btn small secondary" onClick={() => navigate(`/case/${c.id}`)}>Open case #{c.id}</button> {c.problem.slice(0, 80)}… <StatusPill value={c.status} /></p>
          ))}
        </div>
      )}

      <section>
        <h2>Common problems</h2>
        {CATEGORIES.map((c) => (
          <button key={c} className="chip" onClick={() => { solvePrefill.problem = ""; solvePrefill.location = location; navigate("/solve"); }}>{c}</button>
        ))}
      </section>

      <section className="card">
        <h2>How TravelFix Works</h2>
        <ol className="steps">
          <li><strong>Describe the problem</strong> — what happened, and where you are.</li>
          <li><strong>Get a plan</strong> — immediate actions first, then step-by-step guidance grounded in published solutions and verified local resources.</li>
          <li><strong>Ask follow-ups</strong> — tell us what worked or did not, and get alternatives.</li>
          <li><strong>Mark it resolved</strong> — and share feedback so the next traveller benefits.</li>
        </ol>
        <p className="muted">TravelFix never invents phone numbers, addresses or official contacts. Emergency problems always start with official help.</p>
      </section>

      <section>
        <h2>Recently published local solutions</h2>
        {recent.length === 0 && <p className="muted">No published solutions yet — check back soon.</p>}
        <div className="grid">
          {recent.map((s) => (
            <article key={s.id} className="card" style={{ margin: 0 }}>
              <h3>{s.title}</h3>
              <p className="muted">{s.destination}</p>
              <p>{s.problem.slice(0, 140)}…</p>
              <button className="btn small" onClick={() => navigate(`/local-solutions/${s.id}`)}>Read solution</button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------- Solve ----------------
export function SolvePage({ navigate }: Ctx) {
  const [problem, setProblem] = useState(solvePrefill.problem);
  const [location, setLocation] = useState(solvePrefill.location);
  const [destination, setDestination] = useState("");
  const [category, setCategory] = useState("Transportation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!problem.trim()) { setError("Describe the problem first."); return; }
    setBusy(true);
    try {
      const r = await api.submitCase({ problem, category, location, destination });
      if (r.guest_token) storage.set(GUEST_KEY, r.guest_token);
      navigate(`/case/${r.case.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the problem.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Solve a problem</h2>
      <p className="muted">No account needed. Your case stays private to you.</p>
      <ErrorBox error={error} />
      <label>Problem description</label>
      <textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="What happened?" />
      <label>Category</label>
      <div>{CATEGORIES.map((c) => (
        <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
      ))}</div>
      <label>Current location</label>
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where are you now?" />
      <label>Destination / problem location (if different)</label>
      <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Where were you headed?" />
      <div style={{ marginTop: 18 }}>
        <button className="btn" onClick={submit} disabled={busy}>{busy ? "Working…" : "Submit Problem"}</button>
      </div>
    </div>
  );
}

// ---------------- Case ----------------
export function CasePage({ navigate, id }: Ctx & { id: number }) {
  const [data, setData] = useState<{ case: CaseItem; messages: { id: number; role: string; content: string; created_at: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followup, setFollowup] = useState("");
  const [rating, setRating] = useState(0);
  const [done, setDone] = useState<string[]>([]);

  const load = () => api.getCase(id).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Could not load the case."));
  useEffect(() => { load(); }, [id]);

  if (error) return <div className="card"><ErrorBox error={error} /><button className="btn" onClick={() => navigate("/")}>Back home</button></div>;
  if (!data) return <div className="card">Loading your plan…</div>;
  const c = data.case;
  const progress = c.status === "Resolved" ? 4 : c.status === "Solution Ready" || c.status === "Awaiting User" ? 2 : 1;

  const sendFollowup = async () => {
    if (!followup.trim()) return;
    const r = await api.followup(id, followup);
    setFollowup("");
    setData({ case: c, messages: r.messages });
    load();
  };

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Your problem &amp; plan</h2>
          <StatusPill value={c.status} />
          <Urgency value={c.urgency} />
        </div>
        <p className="muted">Case #{c.id} · {c.category} · {c.destination || c.location} · {new Date(c.created_at).toLocaleString()}</p>
        <p><strong>Problem:</strong> {c.problem}</p>
        <div className="progress">
          {["Submitted", "Plan ready", "Taking action", "Resolved"].map((s, i) => (
            <div key={s} className={progress > i ? "done" : ""}>{s}</div>
          ))}
        </div>
        <p>{c.summary}</p>
      </div>

      {c.clarification_question && c.status === "Clarification Required" && (
        <div className="notice"><strong>One question first:</strong> {c.clarification_question} — answer it below in the follow-up box.</div>
      )}

      <div className="card">
        <h3>Do these first</h3>
        <ul>
          {c.immediate_actions.map((a, i) => (
            <li key={i}>
              <label style={{ display: "inline", fontWeight: 400 }}>
                <input type="checkbox" style={{ width: "auto" }} checked={done.includes(a)} onChange={() => setDone(done.includes(a) ? done.filter((x) => x !== a) : [...done, a])} /> {a}
              </label>
            </li>
          ))}
        </ul>
        <h3>Step-by-step</h3>
        <ol className="steps">{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        <h3>Alternatives</h3>
        <ul>{c.alternatives.map((a, i) => <li key={i}>{a}</li>)}</ul>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn small secondary" onClick={() => navigator.clipboard?.writeText(`${c.summary}\n\nDo these first:\n${c.immediate_actions.map((a) => `- ${a}`).join("\n")}\n\nSteps:\n${c.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`)}>Copy plan</button>
          <button className="btn small secondary" onClick={() => window.print()}>Print view</button>
        </div>
      </div>

      {c.sources.length > 0 && (
        <div className="card">
          <h3>Sources</h3>
          <ul>{c.sources.map((s, i) => <li key={i}>{s.label}</li>)}</ul>
          <p className="muted">Community entries are personal experience, not independently verified information.</p>
        </div>
      )}

      <div className="card">
        <h3>Follow-up questions</h3>
        <div className="chat">
          {data.messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>{m.content}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={followup} onChange={(e) => setFollowup(e.target.value)} placeholder="Ask a follow-up, or answer the question above…" onKeyDown={(e) => { if (e.key === "Enter") sendFollowup(); }} />
          <button className="btn" onClick={sendFollowup}>Send</button>
        </div>
      </div>

      <div className="card">
        <h3>Did this resolve your problem?</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => api.setCaseStatus(id, "Resolved").then(load)}>Mark as Resolved</button>
          <button className="btn secondary" onClick={() => api.setCaseStatus(id, "Unresolved").then(load)}>Still unresolved — show alternatives</button>
        </div>
        <label>How helpful was this? (1–5 stars)</label>
        <div>{[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="chip" onClick={() => setRating(n)} style={rating >= n ? { background: "#e8a33d", borderColor: "#e8a33d" } : {}}>{"★".repeat(n)}</button>
        ))}</div>
        <button className="btn small" disabled={rating === 0} onClick={() => api.feedback(id, { rating, helpful: rating >= 4 }).then(load)}>Submit feedback</button>
      </div>
    </>
  );
}

// ---------------- Local Solutions ----------------
export function SolutionsPage({ navigate }: Ctx) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [list, setList] = useState<Solution[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.solutions(search, category).then((r) => setList(r.solutions)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <div className="card">
      <h2>Local Solutions</h2>
      <p className="muted">Practical solutions shared by travellers — only approved and published ones are shown here.</p>
      <ErrorBox error={error} />
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by destination or problem…" />
      <div style={{ marginTop: 10 }}>
        <button className={`chip ${!category ? "active" : ""}`} onClick={() => setCategory("")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
        <button className="btn small" onClick={load}>Search</button>
      </div>
      <p className="muted">{list.length} solution{list.length === 1 ? "" : "s"}</p>
      <div className="grid">
        {list.map((s) => (
          <article key={s.id} className="card" style={{ margin: 0 }}>
            <h3>{s.title}</h3>
            <p className="muted">{s.destination} · by {s.contributor_name}</p>
            <p>{s.problem.slice(0, 140)}…</p>
            <button className="btn small" onClick={() => navigate(`/local-solutions/${s.id}`)}>Read solution</button>
          </article>
        ))}
      </div>
      {list.length === 0 && <p className="muted">No solutions match that search yet.</p>}
    </div>
  );
}

export function SolutionPage({ navigate, id }: Ctx & { id: number }) {
  const [s, setS] = useState<Solution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reported, setReported] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.solution(id).then((r) => setS(r.solution)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="card"><ErrorBox error={error} /></div>;
  if (!s) return <div className="card">Loading…</div>;
  return (
    <div className="card">
      <p className="muted"><button className="btn small secondary" onClick={() => navigate("/local-solutions")}>← All solutions</button></p>
      <h2>{s.title}</h2>
      <p className="muted">{s.destination} · by {s.contributor_name} · Published {s.published_at ? new Date(s.published_at).toLocaleDateString() : "—"}</p>
      <div className="notice">This is a personal experience shared by a traveller — not independently verified information. Check details with the provider before relying on them.</div>
      <h3>The problem</h3><p>{s.problem}</p>
      <h3>How it was resolved</h3><p>{s.solution}</p>
      {s.steps.length > 0 && (<><h3>Steps</h3><ol className="steps">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol></>)}
      {s.tips && (<><h3>Practical tips</h3><p>{s.tips}</p></>)}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn small" onClick={async () => { try { await api.saveSolution(s.id); setSaved(true); } catch (e) { setError(e instanceof Error ? e.message : "Sign in to save solutions."); } }}>{saved ? "Saved ✓" : "Save solution"}</button>
        <button className="btn small secondary" onClick={() => window.print()}>Print view</button>
      </div>
      <h3>Report incorrect information</h3>
      {reported ? <div className="success">Thanks — the report was sent to the admins.</div> : (
        <div style={{ display: "flex", gap: 8 }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is wrong or outdated?" />
          <button className="btn small secondary" disabled={!reason.trim()} onClick={async () => { await api.report({ target_type: "solution", target_id: s.id, reason }); setReported(true); }}>Report</button>
        </div>
      )}
    </div>
  );
}

// ---------------- Auth ----------------
export function AuthPage({ navigate, refreshProfile }: Ctx) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = (token: string, profile: Profile) => {
    storage.set(TOKEN_KEY, token);
    storage.set(PROFILE_KEY, String(profile.id));
    refreshProfile().then(() => navigate(profile.role === "admin" ? "/admin" : "/dashboard"));
  };

  const signup = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api.signup(name, email);
      finish(r.token, r.profile);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the account."); } finally { setBusy(false); }
  };
  const signin = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api.signin(email);
      finish(r.token, r.profile);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <h2>Sign in or create an account</h2>
      <p className="muted">One account covers Travel and Contribute. You never need an account to get help with a problem.</p>
      <ErrorBox error={error} />
      <label>Your name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Navas" />
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button className="btn" onClick={signup} disabled={busy}>Create account</button>
        <button className="btn secondary" onClick={signin} disabled={busy}>Sign in</button>
      </div>
      <div className="notice" style={{ marginTop: 20 }}>
        <strong>Google Sign-In</strong> — not yet connected.<br />
        <strong>Email OTP</strong> — not yet connected.<br />
        Name + email is the working account for now.
      </div>
    </div>
  );
}

// ---------------- Dashboard / My Travel ----------------
export function DashboardPage({ navigate, profile }: Ctx) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [contribs, setContribs] = useState<Contribution[]>([]);
  const [saved, setSaved] = useState<Solution[]>([]);
  const [overview, setOverview] = useState<{ totals: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.myCases().then((r) => setCases(r.cases)).catch(() => {});
    api.myContributions().then((r) => setContribs(r.contributions)).catch(() => {});
    api.saved().then((r) => setSaved(r.solutions)).catch(() => {});
    if (profile.role === "admin") api.adminOverview().then(setOverview).catch(() => {});
  }, [profile]);

  if (!profile) return <div className="card">Please sign in.</div>;
  const active = cases.filter((c) => c.status !== "Resolved" && c.status !== "Closed");
  const resolved = cases.filter((c) => c.status === "Resolved");
  return (
    <>
      <div className="card">
        <h2>Welcome, {profile.name}</h2>
        <p className="muted">{profile.email} · {profile.role === "admin" ? "Administrator" : "Traveller & contributor"}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => navigate("/solve")}>Solve a Problem</button>
          <button className="btn secondary" onClick={() => navigate("/my-contributions")}>Contribute a Solution</button>
          {profile.role === "admin" && <button className="btn secondary" onClick={() => navigate("/admin")}>Admin Overview</button>}
        </div>
      </div>
      <div className="grid">
        <div className="card"><h3>My Travel</h3><p>{active.length} active cases · {resolved.length} resolved</p><button className="btn small" onClick={() => navigate("/my-travel")}>Open My Travel</button></div>
        <div className="card"><h3>My Contributions</h3><p>{contribs.filter((c) => c.status === "Pending Review").length} pending · {contribs.filter((c) => c.status === "Published").length} published</p><button className="btn small" onClick={() => navigate("/my-contributions")}>Open My Contributions</button></div>
        <div className="card"><h3>Saved solutions</h3><p>{saved.length} saved</p></div>
        {overview && <div className="card"><h3>Platform</h3><p>{overview.totals.users} users · {overview.totals.cases} cases · {overview.totals.published} published · {overview.totals.pending} pending review</p></div>}
      </div>
      <div className="card">
        <h3>Recent activity</h3>
        {cases.slice(0, 5).map((c) => (
          <p key={c.id}>Case #{c.id} — {c.problem.slice(0, 70)}… <StatusPill value={c.status} /> <button className="btn small secondary" onClick={() => navigate(`/case/${c.id}`)}>Open</button></p>
        ))}
        {cases.length === 0 && <p className="muted">No cases yet. Solve your first problem to see it here.</p>}
      </div>
    </>
  );
}

export function MyTravelPage({ navigate, profile }: Ctx) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.myCases().then((r) => setCases(r.cases)).catch(() => {});
  }, [profile]);
  if (!profile) return <div className="card">Please sign in.</div>;
  const shown = cases.filter((c) =>
    filter === "all" ? true : filter === "active" ? (c.status !== "Resolved" && c.status !== "Closed") : filter === "resolved" ? c.status === "Resolved" : c.status === "Unresolved"
  );
  return (
    <div className="card">
      <h2>My Travel</h2>
      <div className="tabs">
        {(["all", "active", "unresolved", "resolved"] as const).map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)} ({f === "all" ? cases.length : cases.filter((c) => f === "active" ? (c.status !== "Resolved" && c.status !== "Closed") : f === "resolved" ? c.status === "Resolved" : c.status === "Unresolved").length})</button>
        ))}
      </div>
      {shown.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
          <strong>{c.problem.slice(0, 90)}</strong> <StatusPill value={c.status} /> <Urgency value={c.urgency} />
          <p className="muted">{c.category} · {c.destination || c.location} · {new Date(c.created_at).toLocaleDateString()}</p>
          <button className="btn small" onClick={() => navigate(`/case/${c.id}`)}>Open case</button>
        </div>
      ))}
      {shown.length === 0 && <p className="muted">No cases in this view.</p>}
    </div>
  );
}

// ---------------- Contributions ----------------
export function MyContributionsPage({ navigate, profile }: Ctx) {
  const [list, setList] = useState<Contribution[]>([]);
  const [form, setForm] = useState({ destination: "", title: "", problem: "", solution: "", tips: "" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () => api.myContributions().then((r) => setList(r.contributions)).catch(() => {});
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    load();
  }, [profile]);
  if (!profile) return <div className="card">Please sign in to contribute.</div>;

  const submit = async (asDraft: boolean) => {
    setError(null); setOk(null);
    try {
      await api.createContribution({ ...form, steps: [], sources: [], submit: !asDraft });
      setOk(asDraft ? "Draft saved." : "Submitted for review. An admin will check it before it goes public.");
      setForm({ destination: "", title: "", problem: "", solution: "", tips: "" });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
  };

  return (
    <>
      <div className="card">
        <h2>Contribute a local solution</h2>
        <p className="muted">Share a real problem you solved while travelling. It goes to an admin for review — only approved contributions become public.</p>
        <ErrorBox error={error} />
        {ok && <div className="success">{ok}</div>}
        <label>Destination</label><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="City, country" />
        <label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short title for the problem" />
        <label>Problem you faced</label><textarea value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} />
        <label>How it was resolved</label><textarea value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} />
        <label>Practical tips (optional)</label><input value={form.tips} onChange={(e) => setForm({ ...form, tips: e.target.value })} />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn secondary" onClick={() => submit(true)}>Save draft</button>
          <button className="btn" onClick={() => submit(false)}>Submit for review</button>
        </div>
      </div>
      <div className="card">
        <h2>My Contributions</h2>
        {list.map((c) => (
          <div key={c.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
            <strong>{c.title}</strong> <StatusPill value={c.status} />
            <p className="muted">{c.destination} · {new Date(c.created_at).toLocaleDateString()}</p>
            {c.admin_comment && <p><strong>Admin:</strong> {c.admin_comment}</p>}
            {c.status === "Published" && <button className="btn small" onClick={() => navigate(`/local-solutions/${c.id}`)}>View public page</button>}
            {["Draft", "Changes Requested", "Rejected"].includes(c.status) && (
              <button className="btn small secondary" onClick={async () => { await api.updateContribution(c.id, { submit: true }); load(); }}>Resubmit for review</button>
            )}
          </div>
        ))}
        {list.length === 0 && <p className="muted">No contributions yet.</p>}
      </div>
    </>
  );
}

// ---------------- Settings ----------------
export function SettingsPage({ navigate, profile, refreshProfile }: Ctx) {
  const [name, setName] = useState(profile?.name || "");
  const [home, setHome] = useState(profile?.home_base || "");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!profile) navigate("/auth"); }, [profile]);
  if (!profile) return <div className="card">Please sign in.</div>;
  return (
    <div className="card">
      <h2>Account Settings</h2>
      {msg && <div className="success">{msg}</div>}
      <label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} />
      <label>Email</label><input value={profile.email} disabled />
      <label>Home base</label><input value={home} onChange={(e) => setHome(e.target.value)} placeholder="Your home city" />
      <div style={{ marginTop: 14 }}>
        <button className="btn" onClick={async () => { await api.patch("/api/profile", { name, home_base: home }); setMsg("Saved."); refreshProfile(); }}>Save changes</button>
      </div>
      <h3 style={{ marginTop: 28 }}>Sign out</h3>
      <button className="btn secondary" onClick={() => { signOut(); navigate("/"); window.location.reload(); }}>Sign out</button>
      <h3 style={{ marginTop: 28, color: "var(--danger)" }}>Danger zone</h3>
      <p className="muted">Deleting your account removes your profile, contributions and saved solutions. Your cases become anonymous.</p>
      <button className="btn danger" onClick={async () => { if (confirm("Delete your account permanently?")) { await api.del("/api/profile"); signOut(); navigate("/"); window.location.reload(); } }}>Delete my account</button>
    </div>
  );
}

// ---------------- Admin ----------------
export function AdminOverviewPage({ navigate, profile }: Ctx) {
  const [data, setData] = useState<{ totals: Record<string, number>; recentCases: CaseItem[]; recentContributions: Contribution[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.adminOverview().then(setData).catch((e) => setError(e.message));
  }, [profile]);
  if (!profile) return <div className="card">Please sign in.</div>;
  if (error) return <div className="card"><ErrorBox error={error} /></div>;
  if (!data) return <div className="card">Loading…</div>;
  const downloadZip = async () => {
    const token = storage.get(TOKEN_KEY);
    const res = await fetch(`${(import.meta.env.VITE_API_URL as string) || ""}/api/export/zip`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { alert("Export failed."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "travelfix-website.zip"; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="card">
        <h2>Admin Overview</h2>
        <div className="grid">
          <div className="card"><strong>{data.totals.users}</strong><p className="muted">Registered users</p></div>
          <div className="card"><strong>{data.totals.cases}</strong><p className="muted">Submitted problems</p></div>
          <div className="card"><strong>{data.totals.published}</strong><p className="muted">Published solutions</p></div>
          <div className="card"><strong>{data.totals.pending}</strong><p className="muted">Pending contributions</p></div>
          <div className="card"><strong>{data.totals.reported}</strong><p className="muted">Open reports</p></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => navigate("/admin/contributions")}>Review contributions</button>
          <button className="btn secondary" onClick={() => navigate("/admin/resources")}>Manage resources</button>
          <button className="btn secondary" onClick={() => navigate("/admin/reports")}>Handle reports</button>
          <button className="btn secondary" onClick={downloadZip}>Download the complete website (.zip)</button>
        </div>
      </div>
      <div className="card">
        <h3>Recent submissions</h3>
        {data.recentCases.map((c) => <p key={c.id}>Case #{c.id} — {c.problem.slice(0, 70)}… <StatusPill value={c.status} /></p>)}
        <h3>Recent moderation activity</h3>
        {data.recentContributions.map((c) => <p key={c.id}>{c.title} — <StatusPill value={c.status} /></p>)}
      </div>
    </>
  );
}

export function AdminContributionsPage({ navigate, profile }: Ctx) {
  const [list, setList] = useState<Contribution[]>([]);
  const [filter, setFilter] = useState("Pending Review");
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.adminContributions(filter).then((r) => setList(r.contributions)).catch(() => {});
  }, [profile, filter]);
  if (!profile) return <div className="card">Please sign in.</div>;
  const review = async (id: number, action: string) => {
    await api.reviewContribution(id, action, comment || undefined);
    setComment("");
    api.adminContributions(filter).then((r) => setList(r.contributions));
  };
  return (
    <div className="card">
      <h2>Contribution Management</h2>
      <div className="tabs">
        {["Pending Review", "Published", "Changes Requested", "Rejected", "Archived", ""].map((f) => (
          <button key={f || "all"} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f || "All"}</button>
        ))}
      </div>
      <label>Reason / comment (required for reject or correction requests)</label>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Please add the exact steps you took." />
      {list.map((c) => (
        <div key={c.id} style={{ borderBottom: "1px solid var(--border)", padding: "12px 0" }}>
          <strong>{c.title}</strong> <StatusPill value={c.status} />
          <p className="muted">{c.destination} · by {(c as unknown as { contributor_name?: string }).contributor_name || "—"}</p>
          <p><strong>Problem:</strong> {c.problem}</p>
          <p><strong>Solution:</strong> {c.solution}</p>
          {c.admin_comment && <p><strong>Admin note:</strong> {c.admin_comment}</p>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn small" onClick={() => review(c.id, "approve")}>Approve &amp; publish</button>
            <button className="btn small secondary" onClick={() => review(c.id, "request-changes")}>Request corrections</button>
            <button className="btn small secondary" onClick={() => review(c.id, "reject")}>Reject</button>
            <button className="btn small secondary" onClick={() => review(c.id, "archive")}>Archive</button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="muted">Nothing here.</p>}
    </div>
  );
}

export function AdminResourcesPage({ navigate, profile }: Ctx) {
  const [list, setList] = useState<Resource[]>([]);
  const [form, setForm] = useState({ name: "", category: "Emergency", destination: "", description: "", url: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.adminResources().then((r) => setList(r.resources)).catch(() => {});
  }, [profile]);
  if (!profile) return <div className="card">Please sign in.</div>;
  const reload = () => api.adminResources().then((r) => setList(r.resources));
  return (
    <>
      <div className="card">
        <h2>Resource Management</h2>
        <ErrorBox error={error} />
        <label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Category</label>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["Emergency", ...CATEGORIES].map((c) => <option key={c}>{c}</option>)}
        </select>
        <label>Destination</label><input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
        <label>Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label>Source URL</label><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={async () => { try { await api.saveResource({ ...form, verified: true }); setForm({ name: "", category: "Emergency", destination: "", description: "", url: "" }); reload(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); } }}>Add resource</button>
        </div>
      </div>
      <div className="card">
        <h3>Local service directory</h3>
        <table className="table">
          <thead><tr><th>Name</th><th>Category</th><th>Verified</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td>{r.name}<br /><span className="muted">{r.destination}</span></td>
                <td>{r.category}</td>
                <td>{r.verified ? "Yes" : "No"}<br /><span className="muted">{r.last_verified || "—"}</span></td>
                <td>{r.status}</td>
                <td>
                  <button className="btn small secondary" onClick={async () => { await api.verifyResource(r.id, "verified"); reload(); }}>Verify</button>{" "}
                  <button className="btn small secondary" onClick={async () => { await api.verifyResource(r.id, "outdated"); reload(); }}>Outdated</button>{" "}
                  <button className="btn small secondary" onClick={async () => { await api.verifyResource(r.id, r.status === "inactive" ? "reactivate" : "deactivate"); reload(); }}>{r.status === "inactive" ? "Reactivate" : "Deactivate"}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AdminReportsPage({ navigate, profile }: Ctx) {
  const [list, setList] = useState<{ id: number; target_type: string; target_id: number; reason: string; reporter_email: string | null; status: string; created_at: string }[]>([]);
  useEffect(() => {
    if (!profile) { navigate("/auth"); return; }
    api.adminReports().then((r) => setList(r.reports)).catch(() => {});
  }, [profile]);
  if (!profile) return <div className="card">Please sign in.</div>;
  const setStatus = async (id: number, status: string) => {
    await api.setReportStatus(id, status, status === "resolved");
    api.adminReports().then((r) => setList(r.reports));
  };
  return (
    <div className="card">
      <h2>Reports Management</h2>
      {list.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
          <strong>{r.target_type} #{r.target_id}</strong> <StatusPill value={r.status} />
          <p>{r.reason}</p>
          <p className="muted">Reported by {r.reporter_email || "anonymous"} · {new Date(r.created_at).toLocaleString()}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn small secondary" onClick={() => setStatus(r.id, "investigating")}>Investigate</button>
            <button className="btn small" onClick={() => setStatus(r.id, "resolved")}>Resolve (archive content if needed)</button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p className="muted">No reports.</p>}
    </div>
  );
}
