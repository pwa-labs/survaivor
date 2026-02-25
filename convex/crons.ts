import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Top of each hour:
// - Resolve the current round (no-vote trust signals emitted).
// - At 12pm Pacific, also start the next daily game from signup queue.
crons.cron(
  "survaivor top-of-hour",
  "0 * * * *",
  internal.game.automation.handleTopOfHour,
);

// Safety pass shortly after the hour in case top-of-hour execution was missed.
crons.cron(
  "survaivor top-of-hour safeguard",
  "2 * * * *",
  internal.game.automation.handleTopOfHourSafeguard,
);

export default crons;
