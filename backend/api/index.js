// Vercel serverless entry point for the TravelFix API.
// The same Express app also runs on Render (node src/index.js).
// Schema migration runs lazily once per function instance, because a
// serverless function has no boot step of its own.
const app = require("../src/app");
const { migrate } = require("../src/migrate");

let migrated = false;

module.exports = async (req, res) => {
  if (!migrated && process.env.RUN_MIGRATIONS !== "0") {
    migrated = true;
    try {
      await migrate();
    } catch (e) {
      console.error("Migration failed:", e.message);
    }
  }
  return app(req, res);
};
