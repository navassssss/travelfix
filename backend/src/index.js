// TravelFix API entry point (Render / any Node host).
// Runs the schema migration on boot (idempotent), then serves the API.
require("dotenv").config();
const { migrate } = require("./migrate");
const app = require("./app");

const PORT = process.env.PORT || 10000;

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`TravelFix API listening on ${PORT}`));
  })
  .catch((err) => {
    console.error("Migration failed, starting API anyway:", err.message);
    app.listen(PORT, () => console.log(`TravelFix API listening on ${PORT} (migrations failed)`));
  });
