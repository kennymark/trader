import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Convex crons have no plan-tier floor, so alerts run on the cadence the app was
 * originally written for rather than the daily limit a Vercel Hobby plan imposes.
 */
const crons = cronJobs();

crons.interval(
  "evaluate price alerts",
  { minutes: 5 },
  internal.alertCycle.run,
  {},
);

// After the US close, so the day's price is the one the call is recorded at.
crons.daily(
  "record the day's calls",
  { hourUTC: 21, minuteUTC: 30 },
  internal.intelligenceActions.recordDaily,
  {},
);

export default crons;
