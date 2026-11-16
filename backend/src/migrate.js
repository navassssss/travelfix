// Creates the TravelFix schema (idempotent) and seeds verified resources
// plus a few published community solutions. Safe to run repeatedly.
// Usage: DATABASE_URL=... node src/migrate.js
require("dotenv").config();
const { query } = require("./db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  home_base TEXT NOT NULL DEFAULT '',
  notify_cases BOOLEAN NOT NULL DEFAULT TRUE,
  notify_contributions BOOLEAN NOT NULL DEFAULT TRUE,
  public_profile BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cases (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  guest_token TEXT,
  problem TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted','Clarification Required','Analyzing','Solution Ready','Awaiting User','Unresolved','Resolved','Closed','Expired')),
  summary TEXT NOT NULL DEFAULT '',
  immediate_actions JSONB NOT NULL DEFAULT '[]',
  steps JSONB NOT NULL DEFAULT '[]',
  alternatives JSONB NOT NULL DEFAULT '[]',
  sources JSONB NOT NULL DEFAULT '[]',
  clarification_question TEXT,
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_helpful BOOLEAN,
  feedback_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cases_profile_idx ON cases(profile_id);
CREATE INDEX IF NOT EXISTS cases_guest_idx ON cases(guest_token);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status);

CREATE TABLE IF NOT EXISTS case_messages (
  id SERIAL PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_messages_case_idx ON case_messages(case_id);

CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  destination TEXT NOT NULL,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  solution TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]',
  tips TEXT NOT NULL DEFAULT '',
  sources JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Pending Review','Changes Requested','Approved','Published','Rejected','Archived')),
  admin_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS contributions_status_idx ON contributions(status);
CREATE INDEX IF NOT EXISTS contributions_profile_idx ON contributions(profile_id);

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  contact_info TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','outdated','inactive')),
  last_verified DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resources_status_idx ON resources(status);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('solution','resource')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reporter_email TEXT,
  reporter_profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);

CREATE TABLE IF NOT EXISTS saved_solutions (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contribution_id INTEGER NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, contribution_id)
);

-- Row Level Security: defence in depth. The API connects with the owner
-- connection and enforces ownership in application code; these policies
-- protect the data if it is ever exposed through Supabase/PostgREST with
-- the anon key. Only published contributions and active resources are
-- publicly readable.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read_published ON contributions;
CREATE POLICY public_read_published ON contributions FOR SELECT USING (status = 'Published');
DROP POLICY IF EXISTS public_read_active_resources ON resources;
CREATE POLICY public_read_active_resources ON resources FOR SELECT USING (status = 'active');
`;

const SEED_RESOURCES = [
  {
    name: "Local emergency services",
    category: "Emergency",
    destination: "",
    description: "In an emergency, contact local emergency services first and follow their instructions. In the EU the single emergency number is 112; in the US it is 911. Elsewhere, use the number posted at your hotel, station or airport.",
    url: null, contact_info: null, verified: true,
  },
  {
    name: "Nearest hospital / urgent care",
    category: "Medical Assistance",
    destination: "",
    description: "Go to the nearest hospital or urgent-care centre for medical help, or ask hotel or venue staff to direct you. Bring ID, insurance details and a list of medicines you take.",
    url: null, contact_info: null, verified: true,
  },
  {
    name: "Embassy / consulate assistance",
    category: "Lost Belongings & Documents",
    destination: "",
    description: "Your country's nearest embassy or consulate can help with a lost passport and emergency travel documents. Use only the contact details from the embassy's official website.",
    url: null, contact_info: null, verified: true,
  },
  {
    name: "Airline / carrier help desk",
    category: "Transportation",
    destination: "",
    description: "The carrier's help desk at the airport or station handles delays, cancellations and missed connections. Keep your ticket or booking reference ready.",
    url: null, contact_info: null, verified: true,
  },
  {
    name: "Hotel front desk / booking platform support",
    category: "Accommodation",
    destination: "",
    description: "The hotel front desk, host or booking platform support is the fastest route for access problems, booking errors or unsafe rooms. Keep your booking confirmation ready.",
    url: null, contact_info: null, verified: true,
  },
];

const SEED_SOLUTIONS = [
  {
    destination: "Kochi, India",
    title: "Missed the last ferry and had no transport to the hotel",
    problem: "Arrived late in Fort Kochi, the last ferry had left and there were no buses. It was dark and I did not know the area.",
    solution: "I stayed inside the well-lit jetty area, asked the jetty staff for help, and booked a taxi through my hotel, who sent a car. The hotel front desk knew the local options and the fair price.",
    steps: ["Stay in a lit, public place and do not walk alone in an unfamiliar area at night.", "Ask station or jetty staff for the next transport option.", "Call your hotel and ask them to arrange a car or suggest a trusted taxi.", "Agree the price before you get in, and share your live location with someone you trust."],
    tips: "Save your hotel's number and address offline before you travel, and keep a small amount of local cash for late-night transport.",
    sources: [],
  },
  {
    destination: "Dubai, UAE",
    title: "Phone died and I could not find my hotel",
    problem: "My phone battery died after landing, I had no charger and no data, and I could not find my hotel address.",
    solution: "I used the airport information desk, who looked up the hotel and wrote the address in both English and Arabic. A taxi from the official rank took me there.",
    steps: ["Go to the airport or station information desk and ask staff to help.", "Use an official taxi rank, not touts.", "Keep your hotel address written on paper as a backup.", "Charge your phone at the hotel and save the address offline."],
    tips: "Always carry your hotel address on paper and a small power bank.",
    sources: [],
  },
  {
    destination: "Singapore",
    title: "Lost wallet on the metro",
    problem: "I left my wallet on the train. It had my cards and some cash, and I was not sure who to contact.",
    solution: "I reported it at the next station's passenger service centre, who logged it and gave me a reference number. I then blocked my cards through my bank's app and filed a report at the station.",
    steps: ["Report the loss at the nearest station service centre and get a reference number.", "Block your cards through your bank's app or official helpline.", "Check back with the lost-property office the next day.", "Keep a copy of any report for your insurer."],
    tips: "Keep one card and some cash in a separate place from your main wallet.",
    sources: [],
  },
];

async function migrate() {
  await query(SCHEMA);
  console.log("Schema applied.");

  for (const r of SEED_RESOURCES) {
    const existing = await query("SELECT id FROM resources WHERE name = $1", [r.name]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO resources (name, category, destination, description, url, contact_info, verified, status, last_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',CURRENT_DATE)`,
        [r.name, r.category, r.destination, r.description, r.url, r.contact_info, r.verified]
      );
    }
  }
  console.log("Resources seeded.");

  for (const s of SEED_SOLUTIONS) {
    const existing = await query("SELECT id FROM contributions WHERE title = $1", [s.title]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO contributions (destination, title, problem, solution, steps, tips, sources, status, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Published', now())`,
        [s.destination, s.title, s.problem, s.solution, JSON.stringify(s.steps), s.tips, JSON.stringify(s.sources)]
      );
    }
  }
  console.log("Solutions seeded.");
}

module.exports = { migrate, SCHEMA };

if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
