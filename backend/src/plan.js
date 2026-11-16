// Grounded solution generation for TravelFix.
//
// The plan is built ONLY from:
//  1. per-category generic guidance templates (no specific contacts, phone
//     numbers, addresses or opening hours — those would be invented), and
//  2. published community solutions and verified resources read from the
//     database at request time.
// Nothing in here invents a phone number, address, official contact or
// service availability. Emergency categories always lead with official help.

const CATEGORIES = [
  "Transportation",
  "Accommodation",
  "Lost Belongings & Documents",
  "Money & Payments",
  "Medical Assistance",
  "Communication & Language",
  "Safety & Unexpected Situations",
  "Other",
];

const EMERGENCY_BLOCK = {
  title: "Get official help first",
  steps: [
    "If anyone is hurt or in immediate danger, contact local emergency services right away and move to a safe place if you can do so.",
    "In the EU the single emergency number is 112; in the US it is 911. Elsewhere, check the number posted at your hotel, station or airport, or ask staff — do not rely on a number from memory.",
    "Follow the instructions of local officials and medical staff. Do not delay official help to search for other options.",
  ],
};

const CATEGORY_GUIDANCE = {
  Transportation: {
    immediate: [
      "Stay where staff can see you and keep your ticket or booking reference handy.",
      "Ask the carrier's help desk or station staff about the next available option before buying anything new.",
    ],
    steps: [
      "Confirm what happened with the carrier (delay, cancellation, missed connection) and ask what they will provide — rebooking, refund or an alternative route.",
      "Ask for the next departure, including other carriers or routes from the same station or airport.",
      "If you must wait overnight, ask the carrier or your travel insurer what accommodation support applies.",
      "Keep receipts for any extra transport, food or stay — you may need them for a refund or insurance claim.",
      "If you booked through an agent or platform, message them as well so the booking record is updated.",
    ],
    alternatives: [
      "A different carrier, route or mode of transport from the same hub.",
      "Ride-share or local taxi where that is safe and available.",
      "Rebook for the next day and arrange a nearby stay.",
    ],
  },
  Accommodation: {
    immediate: [
      "Contact the hotel front desk, host or booking platform support first — they can usually fix access or booking problems fastest.",
      "Keep your booking confirmation and any payment receipts ready.",
    ],
    steps: [
      "Explain the problem to the property or host and ask what they can offer (room change, refund, alternative stay).",
      "If the booking was made through a platform, open a support request in that platform so there is a written record.",
      "If the place is unsafe or unusable, look for alternative stays nearby and keep the price reasonable.",
      "Take photos of any problem with the room or property for your records.",
      "Ask for any agreement (refund, move, compensation) in writing.",
    ],
    alternatives: [
      "Another room or property from the same host or chain.",
      "A nearby hotel, hostel or guesthouse booked for one night.",
      "Contact your travel insurer if the booking is unusable.",
    ],
  },
  "Lost Belongings & Documents": {
    immediate: [
      "Retrace your last steps and check with the lost-property desk where you last were.",
      "If a passport or ID is lost, report it promptly — do not wait until you travel.",
    ],
    steps: [
      "Report the loss to local police and keep a copy of the report — embassies, airlines and insurers usually ask for it.",
      "Contact your country's nearest embassy or consulate for an emergency travel document. Use only the contact details from the embassy's official website.",
      "Notify your bank if cards or a wallet were lost, and your phone provider if a phone was lost.",
      "Check the lost-property offices of the airline, station or venue where the loss happened.",
      "Keep copies of any replacement documents in a separate place from the originals.",
    ],
    alternatives: [
      "Use digital copies of your documents (photos or cloud copies) while replacements are arranged.",
      "Ask your hotel to help you contact the police or your embassy.",
    ],
  },
  "Money & Payments": {
    immediate: [
      "If a card is lost or stolen, freeze or block it with your bank first.",
      "Do not share card PINs or one-time codes with anyone.",
    ],
    steps: [
      "Contact your bank through the number on its official website or app to block the card and check recent transactions.",
      "Use a second card, mobile payment or cash you already carry while the issue is sorted.",
      "If an ATM kept your card, report it to the bank that owns the ATM and to your own bank.",
      "Keep receipts and a note of times and amounts for any disputed transaction.",
      "If you are out of funds, contact a trusted person at home or your travel insurer for help.",
    ],
    alternatives: [
      "Withdraw cash with a second card or mobile wallet.",
      "Use your bank's emergency card-replacement or cash-advance service if it offers one.",
    ],
  },
  "Medical Assistance": {
    immediate: [
      "If it is serious, get official medical help first — do not wait to research options.",
      "Tell medical staff about allergies, medicines and existing conditions.",
    ],
    steps: [
      "Go to the nearest hospital or urgent-care centre, or ask hotel or venue staff to direct you.",
      "Bring your ID, insurance details and a list of medicines you take.",
      "Contact your travel insurer as soon as practical and keep all bills and reports.",
      "Ask for a written summary of the treatment before you leave.",
      "If you need a pharmacy, ask medical staff or your hotel for the nearest one.",
    ],
    alternatives: [
      "A pharmacist can advise on minor issues and over-the-counter medicines.",
      "Your insurer may have a helpline that can direct you to a nearby facility.",
    ],
  },
  "Communication & Language": {
    immediate: [
      "Use a translation app and short, simple sentences.",
      "Show the address or place name written down rather than only saying it.",
    ],
    steps: [
      "Write down the key facts (place, time, what you need) and show them to staff.",
      "Use your phone's translation app in both directions and confirm the other person understood.",
      "Ask your hotel or host for help with an important call or booking.",
      "Save the address of your stay in the local language on your phone.",
      "Learn a few local phrases for directions, help and emergencies.",
    ],
    alternatives: [
      "Ask a younger local or hotel staff member to interpret.",
      "Use the translation app's camera mode for signs and menus.",
    ],
  },
  "Safety & Unexpected Situations": {
    immediate: [
      "Move to a safe, public place with other people around.",
      "Contact local police or emergency services if you feel unsafe.",
    ],
    steps: [
      "Go somewhere safe and public — a hotel lobby, shop, station or police station.",
      "Contact local police and follow their advice.",
      "Tell someone you trust where you are and what happened.",
      "Keep your belongings close and avoid isolated areas, especially at night.",
      "If your stay or transport no longer feels safe, change it and tell the provider why.",
    ],
    alternatives: [
      "Ask hotel staff or local police for the safest route or area.",
      "Change your plans and stay somewhere you feel safe.",
    ],
  },
  Other: {
    immediate: [
      "Write down exactly what happened, where and when, while it is fresh.",
      "Ask nearby staff for help — they know the local options best.",
    ],
    steps: [
      "Describe the problem clearly to the nearest staff member or service provider.",
      "Ask what the usual local solution is and what it costs before you agree.",
      "Keep receipts and a written record of who you spoke to.",
      "If a booking or service is involved, contact the provider's support as well.",
      "Ask your hotel or host for local advice if you are unsure.",
    ],
    alternatives: [
      "Ask locals or your hotel for the usual way this is handled here.",
      "Check published TravelFix solutions for the same destination.",
    ],
  },
};

const URGENCY_KEYWORDS = {
  critical: ["bleeding", "unconscious", "accident", "attack", "assault", "choking", "chest pain", "emergency", "stolen passport", "hospital"],
  high: ["passport", "stolen", "robbery", "lost wallet", "no money", "stranded", "cancelled", "missed flight", "injured", "sick", "fever", "police", "unsafe", "threat"],
  medium: ["delay", "late", "locked out", "no room", "overbooked", "refund", "broken", "no internet", "no signal", "language"],
};

function assessUrgency(category, problem) {
  const text = (problem || "").toLowerCase();
  if (category === "Medical Assistance" || category === "Safety & Unexpected Situations") {
    for (const word of URGENCY_KEYWORDS.critical) {
      if (text.includes(word)) return "critical";
    }
    return "high";
  }
  for (const word of URGENCY_KEYWORDS.critical) {
    if (text.includes(word)) return "high";
  }
  for (const word of URGENCY_KEYWORDS.high) {
    if (text.includes(word)) return "high";
  }
  for (const word of URGENCY_KEYWORDS.medium) {
    if (text.includes(word)) return "medium";
  }
  return "low";
}

function tokenize(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3);
}

function matchScore(problemTokens, row) {
  const hay = ((row.title || "") + " " + (row.problem || "") + " " + (row.destination || "")).toLowerCase();
  let score = 0;
  for (const token of new Set(problemTokens)) {
    if (hay.includes(token)) score += 1;
  }
  return score;
}

// Build a plan. publishedSolutions and verifiedResources come from the DB.
function buildPlan({ problem, category, location, destination, publishedSolutions, verifiedResources }) {
  const safeCategory = CATEGORIES.includes(category) ? category : "Other";
  const guidance = CATEGORY_GUIDANCE[safeCategory];
  const urgency = assessUrgency(safeCategory, problem);
  const tokens = tokenize(problem + " " + (destination || "") + " " + (location || ""));

  const matchedSolutions = (publishedSolutions || [])
    .map((row) => ({ row, score: matchScore(tokens, row) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.row);

  const matchedResources = (verifiedResources || [])
    .filter((r) => {
      const cat = (r.category || "").toLowerCase();
      const dest = (r.destination || "").toLowerCase();
      const catMatch =
        cat === safeCategory.toLowerCase() ||
        cat === "emergency" ||
        (safeCategory === "Medical Assistance" && cat.includes("medical")) ||
        (safeCategory === "Transportation" && cat.includes("transport")) ||
        (safeCategory === "Accommodation" && cat.includes("accommodation"));
      const destMatch = !destination || !dest || dest.includes(destination.toLowerCase()) || destination.toLowerCase().includes(dest);
      return catMatch && destMatch;
    })
    .slice(0, 5);

  const where = destination || location || "where you are";
  const summary =
    `You reported a ${safeCategory.toLowerCase()} problem${destination ? ` in ${destination}` : location ? ` near ${location}` : ""}. ` +
    `This plan starts with the safest immediate action, then works through the usual local steps. ` +
    `It is general guidance plus published community experience and verified local resources — check details with the provider on the spot before you rely on them.`;

  const immediate = [...guidance.immediate];
  const steps = [...guidance.steps];
  if (safeCategory === "Medical Assistance" || safeCategory === "Safety & Unexpected Situations") {
    immediate.unshift(EMERGENCY_BLOCK.steps[0]);
    steps.unshift(EMERGENCY_BLOCK.steps[1]);
  }

  // Personal community solutions are labelled as personal experience, never as verified fact.
  const sources = [];
  for (const s of matchedSolutions) {
    sources.push({
      kind: "community",
      label: `Community experience: "${s.title}" (${s.destination || "destination not listed"}) — personal experience, not independently verified.`,
      solutionId: s.id,
    });
  }
  for (const r of matchedResources) {
    sources.push({
      kind: "resource",
      label: `Verified resource: ${r.name} — ${r.description || ""}${r.url ? ` (${r.url})` : ""}`,
      resourceId: r.id,
    });
  }

  let clarification = null;
  if (!destination && !location) {
    clarification = "Where exactly are you right now (city or area)? That will let me point you to the nearest help.";
  } else if ((problem || "").trim().length < 20) {
    clarification = "Can you add a little more detail about what happened? For example, what you have already tried.";
  } else if (safeCategory === "Transportation") {
    clarification = "Which carrier or service were you using, and where were you headed?";
  }

  return {
    urgency,
    summary,
    immediateActions: immediate,
    steps,
    alternatives: guidance.alternatives,
    matchedSolutions: matchedSolutions.map((s) => ({
      id: s.id,
      title: s.title,
      destination: s.destination,
      problem: s.problem,
      solution: s.solution,
    })),
    matchedResources: matchedResources.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      destination: r.destination,
      description: r.description,
      url: r.url,
      verified: r.verified,
    })),
    sources,
    clarificationQuestion: clarification,
    status: clarification && urgency !== "critical" && urgency !== "high" ? "Clarification Required" : "Solution Ready",
  };
}

module.exports = { CATEGORIES, buildPlan, assessUrgency };
