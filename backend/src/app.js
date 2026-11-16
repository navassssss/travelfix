// Express app factory (no listen here) so the same code runs on Render
// (node src/index.js) and as a Vercel serverless function (api/index.js).
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const archiver = require("archiver");
const { query } = require("./db");
const { signToken, authOptional, requireAuth, requireAdmin } = require("./auth");
const { CATEGORIES, buildPlan } = require("./plan");

const app = express();
const FRONTEND_URL = (process.env.FRONTEND_URL || "").trim();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      return cb(null, true); // API is public-read; auth is enforced per route.
    },
  })
);
app.use(authOptional);

app.get("/health", (_req, res) => res.json({ ok: true, service: "travelfix-api" }));
app.get("/ready", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ ok: true, db: "ready" });
  } catch (e) {
    res.status(503).json({ ok: false, db: "unavailable" });
  }
});

function publicProfile(p) {
  return { id: p.id, name: p.name, email: p.email, role: p.role, home_base: p.home_base, notify_cases: p.notify_cases, notify_contributions: p.notify_contributions, public_profile: p.public_profile, created_at: p.created_at };
}

async function loadCase(req, res) {
  const { rows } = await query("SELECT * FROM cases WHERE id = $1", [req.params.id]);
  const c = rows[0];
  if (!c) {
    res.status(404).json({ error: "Case not found" });
    return null;
  }
  const isAdmin = req.profile && req.profile.role === "admin";
  const isOwner = req.profile && c.profile_id === req.profile.id;
  const isGuest = c.guest_token && req.guestToken && c.guest_token === req.guestToken;
  if (!isAdmin && !isOwner && !isGuest) {
    res.status(403).json({ error: "You can only access your own cases" });
    return null;
  }
  return c;
}

function caseView(c) {
  return {
    id: c.id, profile_id: c.profile_id, problem: c.problem, category: c.category,
    location: c.location, destination: c.destination, urgency: c.urgency, status: c.status,
    summary: c.summary, immediate_actions: c.immediate_actions, steps: c.steps,
    alternatives: c.alternatives, sources: c.sources, clarification_question: c.clarification_question,
    feedback_rating: c.feedback_rating, feedback_helpful: c.feedback_helpful,
    feedback_comment: c.feedback_comment, created_at: c.created_at, updated_at: c.updated_at,
    resolved_at: c.resolved_at,
  };
}

function solutionView(r) {
  return {
    id: r.id, destination: r.destination, title: r.title, problem: r.problem,
    solution: r.solution, steps: r.steps, tips: r.tips, sources: r.sources,
    status: r.status, contributor_name: r.contributor_name || "TravelFix community",
    created_at: r.created_at, published_at: r.published_at,
  };
}

function contributionView(r) {
  return {
    id: r.id, profile_id: r.profile_id, destination: r.destination, title: r.title,
    problem: r.problem, solution: r.solution, steps: r.steps, tips: r.tips,
    sources: r.sources, status: r.status, admin_comment: r.admin_comment,
    created_at: r.created_at, updated_at: r.updated_at, published_at: r.published_at,
  };
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- auth ----------
app.post("/api/auth/signup", async (req, res) => {
  const { name, email, make_admin } = req.body || {};
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Name and a valid email are required" });
  }
  let role = "user";
  if (make_admin) {
    const admins = await query("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1");
    const callerIsAdmin = req.profile && req.profile.role === "admin";
    if (admins.rows.length === 0 || callerIsAdmin) role = "admin";
  }
  const { rows } = await query(
    `INSERT INTO profiles (name, email, role) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
     RETURNING *`,
    [name.trim(), email.trim().toLowerCase(), role]
  );
  const profile = rows[0];
  res.json({ profile: publicProfile(profile), token: signToken(profile), created: true });
});

app.post("/api/auth/signin", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email is required" });
  const { rows } = await query("SELECT * FROM profiles WHERE email = $1", [email.trim().toLowerCase()]);
  if (!rows[0]) return res.status(404).json({ error: "No account with that email. Create one first." });
  res.json({ profile: publicProfile(rows[0]), token: signToken(rows[0]) });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM profiles WHERE id = $1", [req.profile.sub]);
  if (!rows[0]) return res.status(404).json({ error: "Account not found" });
  res.json({ profile: publicProfile(rows[0]) });
});

app.get("/api/auth/providers", (_req, res) => {
  res.json({
    google: { connected: false, note: "Google Sign-In is not connected yet." },
    email_otp: { connected: false, note: "Email OTP is not connected yet." },
    email: { connected: true, note: "Name + email is the working account." },
  });
});

// ---------- cases ----------
app.post("/api/cases", async (req, res) => {
  const { problem, category, location, destination } = req.body || {};
  if (!problem || !problem.trim()) return res.status(400).json({ error: "Describe the problem" });
  const safeCategory = CATEGORIES.includes(category) ? category : "Other";
  const guestToken = req.profile ? null : req.guestToken || crypto.randomUUID();

  const published = await query(
    "SELECT id, title, destination, problem, solution FROM contributions WHERE status = 'Published' ORDER BY published_at DESC LIMIT 50"
  );
  const resources = await query(
    "SELECT id, name, category, destination, description, url, verified FROM resources WHERE status = 'active' AND verified = TRUE ORDER BY name LIMIT 50"
  );
  const plan = buildPlan({
    problem: problem.trim(), category: safeCategory,
    location: (location || "").trim(), destination: (destination || "").trim(),
    publishedSolutions: published.rows, verifiedResources: resources.rows,
  });

  const { rows } = await query(
    `INSERT INTO cases (profile_id, guest_token, problem, category, location, destination, urgency, status, summary, immediate_actions, steps, alternatives, sources, clarification_question)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.profile ? req.profile.sub : null, guestToken, problem.trim(), safeCategory,
     (location || "").trim(), (destination || "").trim(), plan.urgency, plan.status,
     plan.summary, JSON.stringify(plan.immediateActions), JSON.stringify(plan.steps),
     JSON.stringify(plan.alternatives), JSON.stringify(plan.sources), plan.clarificationQuestion]
  );
  const c = rows[0];
  await query("INSERT INTO case_messages (case_id, role, content) VALUES ($1, 'assistant', $2)", [c.id, plan.summary]);
  res.status(201).json({ case: caseView(c), guest_token: guestToken, plan });
});

app.get("/api/cases", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM cases WHERE profile_id = $1 ORDER BY created_at DESC", [req.profile.sub]);
  res.json({ cases: rows.map(caseView) });
});

app.get("/api/cases/guest/:token", async (req, res) => {
  const { rows } = await query("SELECT * FROM cases WHERE guest_token = $1 ORDER BY created_at DESC", [req.params.token]);
  res.json({ cases: rows.map(caseView) });
});

app.get("/api/cases/:id", async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const messages = await query("SELECT id, role, content, created_at FROM case_messages WHERE case_id = $1 ORDER BY created_at ASC", [c.id]);
  res.json({ case: caseView(c), messages: messages.rows });
});

app.post("/api/cases/:id/followups", async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: "Write a follow-up question" });
  await query("INSERT INTO case_messages (case_id, role, content) VALUES ($1, 'user', $2)", [c.id, message.trim()]);

  const resources = await query(
    "SELECT id, name, category, destination, description, url, verified FROM resources WHERE status = 'active' AND verified = TRUE ORDER BY name LIMIT 20"
  );
  const lower = message.toLowerCase();
  const relevant = resources.rows.filter((r) =>
    lower.includes((r.category || "").toLowerCase()) || (r.destination && lower.includes(r.destination.toLowerCase()))
  );
  let reply;
  if (c.status === "Clarification Required" && message.trim().length >= 10) {
    reply = "Thanks — that helps. I have updated your case to Solution Ready. Work through the steps in your plan, starting with the immediate actions, and tell me here if any step does not work so I can suggest an alternative.";
    await query("UPDATE cases SET status = 'Solution Ready', updated_at = now() WHERE id = $1", [c.id]);
  } else if (relevant.length > 0) {
    reply = `Based on what you asked, this may help: ${relevant[0].name} — ${relevant[0].description || "see the local resources on your case page."} If that does not fit, tell me what happened when you tried the next step in your plan and I will suggest an alternative.`;
  } else {
    reply = "Noted. Try the next step in your plan — the immediate actions first — and tell me what happens. If a step does not work, describe what you tried and I will suggest an alternative from published solutions and verified resources.";
  }
  await query("INSERT INTO case_messages (case_id, role, content) VALUES ($1, 'assistant', $2)", [c.id, reply]);
  const messages = await query("SELECT id, role, content, created_at FROM case_messages WHERE case_id = $1 ORDER BY created_at ASC", [c.id]);
  res.json({ reply, messages: messages.rows });
});

app.post("/api/cases/:id/status", async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const { status } = req.body || {};
  const allowed = ["Resolved", "Unresolved", "Closed"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status must be Resolved, Unresolved or Closed" });
  const { rows } = await query(
    "UPDATE cases SET status = $1, resolved_at = CASE WHEN $1 = 'Resolved' THEN now() ELSE resolved_at END, updated_at = now() WHERE id = $2 RETURNING *",
    [status, c.id]
  );
  res.json({ case: caseView(rows[0]) });
});

app.post("/api/cases/:id/feedback", async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const { rating, helpful, comment } = req.body || {};
  const { rows } = await query(
    "UPDATE cases SET feedback_rating = $1, feedback_helpful = $2, feedback_comment = $3, updated_at = now() WHERE id = $4 RETURNING *",
    [rating || null, helpful ?? null, comment || null, c.id]
  );
  res.json({ case: caseView(rows[0]) });
});

app.delete("/api/cases/:id", async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  await query("DELETE FROM cases WHERE id = $1", [c.id]);
  res.json({ ok: true });
});

// ---------- public solutions ----------
app.get("/api/solutions", async (req, res) => {
  const { search, category } = req.query;
  const conditions = ["c.status = 'Published'"];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.title ILIKE $${params.length} OR c.problem ILIKE $${params.length} OR c.destination ILIKE $${params.length})`);
  }
  if (category) {
    params.push(`%${category}%`);
    conditions.push(`(c.problem ILIKE $${params.length} OR c.title ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `SELECT c.*, p.name AS contributor_name FROM contributions c
     LEFT JOIN profiles p ON p.id = c.profile_id
     WHERE ${conditions.join(" AND ")} ORDER BY c.published_at DESC NULLS LAST, c.created_at DESC LIMIT 100`,
    params
  );
  res.json({ solutions: rows.map(solutionView) });
});

app.get("/api/solutions/:id", async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, p.name AS contributor_name FROM contributions c LEFT JOIN profiles p ON p.id = c.profile_id WHERE c.id = $1`,
    [req.params.id]
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: "Solution not found" });
  const isOwner = req.profile && r.profile_id === req.profile.sub;
  const isAdmin = req.profile && req.profile.role === "admin";
  if (r.status !== "Published" && !isOwner && !isAdmin) return res.status(404).json({ error: "Solution not found" });
  res.json({ solution: solutionView(r) });
});

app.get("/api/saved", requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, p.name AS contributor_name FROM saved_solutions s
     JOIN contributions c ON c.id = s.contribution_id
     LEFT JOIN profiles p ON p.id = c.profile_id
     WHERE s.profile_id = $1 ORDER BY s.created_at DESC`,
    [req.profile.sub]
  );
  res.json({ solutions: rows.map(solutionView) });
});

app.post("/api/solutions/:id/save", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT id, status FROM contributions WHERE id = $1", [req.params.id]);
  if (!rows[0] || rows[0].status !== "Published") return res.status(404).json({ error: "Solution not found" });
  await query("INSERT INTO saved_solutions (profile_id, contribution_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [req.profile.sub, req.params.id]);
  res.json({ ok: true, saved: true });
});

app.delete("/api/solutions/:id/save", requireAuth, async (req, res) => {
  await query("DELETE FROM saved_solutions WHERE profile_id = $1 AND contribution_id = $2", [req.profile.sub, req.params.id]);
  res.json({ ok: true, saved: false });
});

// ---------- contributions ----------
app.post("/api/contributions", requireAuth, async (req, res) => {
  const { destination, title, problem, solution, steps, tips, sources, submit } = req.body || {};
  if (!destination || !title || !problem || !solution) {
    return res.status(400).json({ error: "Destination, title, problem and solution are required" });
  }
  const status = submit ? "Pending Review" : "Draft";
  const { rows } = await query(
    `INSERT INTO contributions (profile_id, destination, title, problem, solution, steps, tips, sources, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.profile.sub, destination.trim(), title.trim(), problem.trim(), solution.trim(),
     JSON.stringify(steps || []), tips || "", JSON.stringify(sources || []), status]
  );
  res.status(201).json({ contribution: contributionView(rows[0]) });
});

app.get("/api/contributions/mine", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM contributions WHERE profile_id = $1 ORDER BY updated_at DESC", [req.profile.sub]);
  res.json({ contributions: rows.map(contributionView) });
});

app.patch("/api/contributions/:id", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM contributions WHERE id = $1", [req.params.id]);
  const c = rows[0];
  if (!c) return res.status(404).json({ error: "Contribution not found" });
  if (c.profile_id !== req.profile.sub) return res.status(403).json({ error: "You can only edit your own contributions" });
  if (!["Draft", "Changes Requested", "Rejected"].includes(c.status)) {
    return res.status(400).json({ error: "Only drafts, changes-requested or rejected contributions can be edited" });
  }
  const { destination, title, problem, solution, steps, tips, sources, submit } = req.body || {};
  const updated = await query(
    `UPDATE contributions SET destination = COALESCE($1, destination), title = COALESCE($2, title),
     problem = COALESCE($3, problem), solution = COALESCE($4, solution),
     steps = COALESCE($5, steps), tips = COALESCE($6, tips), sources = COALESCE($7, sources),
     status = $8, updated_at = now() WHERE id = $9 RETURNING *`,
    [destination, title, problem, solution,
     steps ? JSON.stringify(steps) : null, tips ?? null, sources ? JSON.stringify(sources) : null,
     submit ? "Pending Review" : c.status, c.id]
  );
  res.json({ contribution: contributionView(updated.rows[0]) });
});

app.delete("/api/contributions/:id", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM contributions WHERE id = $1", [req.params.id]);
  const c = rows[0];
  if (!c) return res.status(404).json({ error: "Contribution not found" });
  if (c.profile_id !== req.profile.sub) return res.status(403).json({ error: "You can only delete your own contributions" });
  if (!["Draft", "Rejected"].includes(c.status)) return res.status(400).json({ error: "Only drafts or rejected contributions can be deleted" });
  await query("DELETE FROM contributions WHERE id = $1", [c.id]);
  res.json({ ok: true });
});

// ---------- reports ----------
app.post("/api/reports", async (req, res) => {
  const { target_type, target_id, reason, reporter_email } = req.body || {};
  if (!["solution", "resource"].includes(target_type) || !target_id || !reason) {
    return res.status(400).json({ error: "Target, id and reason are required" });
  }
  const { rows } = await query(
    "INSERT INTO reports (target_type, target_id, reason, reporter_email, reporter_profile_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [target_type, target_id, reason.trim(), reporter_email || null, req.profile ? req.profile.sub : null]
  );
  res.status(201).json({ report: rows[0] });
});

// ---------- profile ----------
app.get("/api/profile", requireAuth, async (req, res) => {
  const { rows } = await query("SELECT * FROM profiles WHERE id = $1", [req.profile.sub]);
  res.json({ profile: publicProfile(rows[0]) });
});

app.patch("/api/profile", requireAuth, async (req, res) => {
  const { name, home_base, notify_cases, notify_contributions, public_profile } = req.body || {};
  const { rows } = await query(
    `UPDATE profiles SET name = COALESCE($1, name), home_base = COALESCE($2, home_base),
     notify_cases = COALESCE($3, notify_cases), notify_contributions = COALESCE($4, notify_contributions),
     public_profile = COALESCE($5, public_profile), updated_at = now() WHERE id = $6 RETURNING *`,
    [name, home_base, notify_cases, notify_contributions, public_profile, req.profile.sub]
  );
  res.json({ profile: publicProfile(rows[0]) });
});

app.delete("/api/profile", requireAuth, async (req, res) => {
  await query("DELETE FROM saved_solutions WHERE profile_id = $1", [req.profile.sub]);
  await query("DELETE FROM contributions WHERE profile_id = $1", [req.profile.sub]);
  await query("UPDATE cases SET profile_id = NULL WHERE profile_id = $1", [req.profile.sub]);
  await query("DELETE FROM profiles WHERE id = $1", [req.profile.sub]);
  res.json({ ok: true });
});

// ---------- admin ----------
app.get("/api/admin/overview", requireAuth, requireAdmin, async (req, res) => {
  const [u, c, p, pe, re] = await Promise.all([
    query("SELECT COUNT(*)::int AS n FROM profiles"),
    query("SELECT COUNT(*)::int AS n FROM cases"),
    query("SELECT COUNT(*)::int AS n FROM contributions WHERE status = 'Published'"),
    query("SELECT COUNT(*)::int AS n FROM contributions WHERE status = 'Pending Review'"),
    query("SELECT COUNT(*)::int AS n FROM reports WHERE status IN ('open','investigating')"),
  ]);
  const users = u.rows[0];
  const cases = c.rows[0];
  const published = p.rows[0];
  const pending = pe.rows[0];
  const reported = re.rows[0];
  const recentCases = await query("SELECT id, problem, category, urgency, status, created_at FROM cases ORDER BY created_at DESC LIMIT 10");
  const recentContribs = await query("SELECT id, title, destination, status, created_at FROM contributions ORDER BY created_at DESC LIMIT 10");
  res.json({
    totals: { users: users.n, cases: cases.n, published: published.n, pending: pending.n, reported: reported.n },
    recentCases: recentCases.rows, recentContributions: recentContribs.rows,
  });
});

app.get("/api/admin/contributions", requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = "";
  if (status) {
    params.push(status);
    where = "WHERE c.status = $1";
  }
  const { rows } = await query(
    `SELECT c.*, p.name AS contributor_name, p.email AS contributor_email FROM contributions c
     LEFT JOIN profiles p ON p.id = c.profile_id ${where} ORDER BY c.created_at DESC LIMIT 100`,
    params
  );
  res.json({ contributions: rows.map((r) => ({ ...contributionView(r), contributor_name: r.contributor_name, contributor_email: r.contributor_email })) });
});

app.post("/api/admin/contributions/:id/review", requireAuth, requireAdmin, async (req, res) => {
  const { action, comment } = req.body || {};
  const map = { approve: "Published", reject: "Rejected", "request-changes": "Changes Requested", archive: "Archived" };
  const status = map[action];
  if (!status) return res.status(400).json({ error: "Action must be approve, reject, request-changes or archive" });
  if ((action === "reject" || action === "request-changes") && !comment) {
    return res.status(400).json({ error: "A reason is required for rejection or correction requests" });
  }
  const { rows } = await query(
    `UPDATE contributions SET status = $1, admin_comment = $2,
     published_at = CASE WHEN $1 = 'Published' THEN COALESCE(published_at, now()) ELSE published_at END,
     updated_at = now() WHERE id = $3 RETURNING *`,
    [status, comment || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Contribution not found" });
  res.json({ contribution: contributionView(rows[0]) });
});

app.get("/api/admin/resources", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await query("SELECT * FROM resources ORDER BY name");
  res.json({ resources: rows });
});

app.post("/api/admin/resources", requireAuth, requireAdmin, async (req, res) => {
  const { name, category, destination, description, url, contact_info, verified } = req.body || {};
  if (!name || !category) return res.status(400).json({ error: "Name and category are required" });
  const { rows } = await query(
    `INSERT INTO resources (name, category, destination, description, url, contact_info, verified, status, last_verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active', CURRENT_DATE) RETURNING *`,
    [name.trim(), category, destination || "", description || "", url || null, contact_info || null, !!verified]
  );
  res.json({ resource: rows[0] });
});

app.patch("/api/admin/resources/:id", requireAuth, requireAdmin, async (req, res) => {
  const { name, category, destination, description, url, contact_info, verified, status } = req.body || {};
  const { rows } = await query(
    `UPDATE resources SET name = COALESCE($1, name), category = COALESCE($2, category),
     destination = COALESCE($3, destination), description = COALESCE($4, description),
     url = COALESCE($5, url), contact_info = COALESCE($6, contact_info),
     verified = COALESCE($7, verified), status = COALESCE($8, status), updated_at = now()
     WHERE id = $9 RETURNING *`,
    [name, category, destination, description, url, contact_info, verified, status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Resource not found" });
  res.json({ resource: rows[0] });
});

app.post("/api/admin/resources/:id/verify", requireAuth, requireAdmin, async (req, res) => {
  const { action } = req.body || {};
  let sql;
  if (action === "verified") sql = "UPDATE resources SET verified = TRUE, status = 'active', last_verified = CURRENT_DATE, updated_at = now() WHERE id = $1 RETURNING *";
  else if (action === "outdated") sql = "UPDATE resources SET verified = FALSE, status = 'outdated', updated_at = now() WHERE id = $1 RETURNING *";
  else if (action === "deactivate") sql = "UPDATE resources SET status = 'inactive', updated_at = now() WHERE id = $1 RETURNING *";
  else if (action === "reactivate") sql = "UPDATE resources SET status = 'active', updated_at = now() WHERE id = $1 RETURNING *";
  else return res.status(400).json({ error: "Action must be verified, outdated, deactivate or reactivate" });
  const { rows } = await query(sql, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Resource not found" });
  res.json({ resource: rows[0] });
});

app.get("/api/admin/reports", requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await query("SELECT * FROM reports ORDER BY created_at DESC LIMIT 100");
  res.json({ reports: rows });
});

app.post("/api/admin/reports/:id/status", requireAuth, requireAdmin, async (req, res) => {
  const { status, archive } = req.body || {};
  if (!["open", "investigating", "resolved"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const { rows } = await query("UPDATE reports SET status = $1, updated_at = now() WHERE id = $2 RETURNING *", [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Report not found" });
  if (status === "resolved" && archive && rows[0].target_type === "solution") {
    await query("UPDATE contributions SET status = 'Archived' WHERE id = $1", [rows[0].target_id]);
  }
  res.json({ report: rows[0] });
});

// ---------- zip export (admin) ----------
app.get("/api/export/zip", requireAuth, requireAdmin, async (req, res) => {
  const solutions = await query("SELECT * FROM contributions WHERE status = 'Published' ORDER BY published_at DESC");
  const resources = await query("SELECT * FROM resources WHERE status = 'active' ORDER BY name");
  const counts = await query("SELECT (SELECT COUNT(*) FROM profiles) AS users, (SELECT COUNT(*) FROM cases) AS cases, (SELECT COUNT(*) FROM contributions WHERE status='Published') AS published");
  const summary = { ...counts.rows[0], exported_at: new Date().toISOString(), note: "Private cases and accounts are never included." };
  const snapshot = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TravelFix — snapshot</title></head><body>
<h1>TravelFix</h1><p>Something went wrong during your journey? TravelFix helps you know what to do next.</p>
<h2>Published local solutions (${solutions.rows.length})</h2>
${solutions.rows.map((s) => `<section><h3>${escapeHtml(s.title)} — ${escapeHtml(s.destination)}</h3><p>${escapeHtml(s.problem)}</p><p>${escapeHtml(s.solution)}</p></section>`).join("\n")}
<h2>Local resources (${resources.rows.length})</h2>
${resources.rows.map((r) => `<p><strong>${escapeHtml(r.name)}</strong> (${escapeHtml(r.category)}) — ${escapeHtml(r.description || "")}</p>`).join("\n")}
<p>Exported ${summary.exported_at}. Private cases and accounts are excluded.</p>
</body></html>`;
  const readme = `TravelFix website export\n\nContents:\n- index.html — standalone snapshot of the public website (open in any browser, no server needed)\n- data/solutions.json — all published local solutions\n- data/resources.json — the verified local resource directory\n- data/summary.json — site totals at export time\n\nPrivate cases and accounts are never included. Rebuilt fresh on every download.\n`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="travelfix-website-${new Date().toISOString().slice(0, 10)}.zip"`);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).end(String(err)));
  archive.pipe(res);
  archive.append(snapshot, { name: "index.html" });
  archive.append(JSON.stringify(solutions.rows, null, 2), { name: "data/solutions.json" });
  archive.append(JSON.stringify(resources.rows, null, 2), { name: "data/resources.json" });
  archive.append(JSON.stringify(summary, null, 2), { name: "data/summary.json" });
  archive.append(readme, { name: "README.md" });
  await archive.finalize();
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

module.exports = app;
