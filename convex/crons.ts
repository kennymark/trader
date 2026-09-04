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

export default crons;
