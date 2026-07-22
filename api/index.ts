import { Hono } from "hono";
import { handle } from "hono/vercel";
import { neon, types } from "@neondatabase/serverless";

types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

const app = new Hono();

// Helper to get database connection in Vercel
function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL environment variable is missing");
  return neon(dbUrl);
}

// GET /app-api/leaderboard — participants with totals, weekly, and completion rates
app.get("/app-api/leaderboard", async (c) => {
  try {
    const sql = getDb();

    // Determine the current ISO week start (Monday)
    const now = new Date();
    const dow = now.getUTCDay(); // 0=Sun
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() + diffToMon);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const rows = await sql`
      SELECT
        p.id,
        p.name,
        p.location,
        p.steps_goal,
        p.workouts_goal,
        p.workouts_achievable,
        COALESCE(SUM(l.steps), 0)::int AS steps_total,
        COALESCE(SUM(l.workout), 0)::int AS workouts_total,
        COALESCE(SUM(l.yoga), 0)::int AS yoga_total,
        CASE WHEN p.steps_goal > 0
          THEN ROUND(COALESCE(SUM(l.steps), 0)::numeric / p.steps_goal * 100, 1)
          ELSE 0
        END AS steps_pct,
        CASE WHEN p.workouts_goal > 0
          THEN ROUND(COALESCE(SUM(l.workout), 0)::numeric / p.workouts_goal * 100, 1)
          ELSE 0
        END AS workouts_pct,
        COALESCE(SUM(CASE WHEN l.log_date >= ${weekStartStr}::date THEN l.steps ELSE 0 END), 0)::int AS week_steps,
        COALESCE(SUM(CASE WHEN l.log_date >= ${weekStartStr}::date THEN l.workout ELSE 0 END), 0)::int AS week_workouts
      FROM sot_participants p
      LEFT JOIN sot_daily_logs l ON l.participant_id = p.id
      GROUP BY p.id, p.name, p.location, p.steps_goal, p.workouts_goal, p.workouts_achievable
      ORDER BY steps_pct DESC, workouts_pct DESC
    `;
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/participants — list all participants
app.get("/app-api/participants", async (c) => {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sot_participants ORDER BY name`;
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/logs/:participantId — recent logs for a participant
app.get("/app-api/logs/:participantId", async (c) => {
  try {
    const sql = getDb();
    const participantId = Number(c.req.param("participantId"));
    const rows = await sql`
      SELECT * FROM sot_daily_logs
      WHERE participant_id = ${participantId}
      ORDER BY log_date DESC
      LIMIT 30
    `;
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/logs — upsert a single daily log entry
app.post("/app-api/logs", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { participant_id, log_date, steps, workout, yoga } = body;

    if (!participant_id || !log_date) {
      return c.json({ error: "participant_id and log_date are required" }, 400);
    }

    const [row] = await sql`
      INSERT INTO sot_daily_logs (participant_id, log_date, steps, workout, yoga, updated_at)
      VALUES (${participant_id}, ${log_date}, ${steps ?? 0}, ${workout ?? 0}, ${yoga ?? 0}, NOW())
      ON CONFLICT (participant_id, log_date)
      DO UPDATE SET
        steps = EXCLUDED.steps,
        workout = EXCLUDED.workout,
        yoga = EXCLUDED.yoga,
        updated_at = NOW()
      RETURNING *
    `;
    return c.json(row);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/logs/bulk — bulk insert/upsert daily log entries
app.post("/app-api/logs/bulk", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { participant_id, logs } = body;

    if (!participant_id || !Array.isArray(logs) || logs.length === 0) {
      return c.json({ error: "participant_id and a non-empty logs array are required" }, 400);
    }

    await Promise.all(
      logs.map((entry: any) =>
        sql`
          INSERT INTO sot_daily_logs (participant_id, log_date, steps, workout, yoga, updated_at)
          VALUES (${participant_id}, ${entry.log_date}, ${entry.steps ?? 0}, ${entry.workout ?? 0}, ${entry.yoga ?? 0}, NOW())
          ON CONFLICT (participant_id, log_date)
          DO UPDATE SET
            steps = EXCLUDED.steps,
            workout = EXCLUDED.workout,
            yoga = EXCLUDED.yoga,
            updated_at = NOW()
        `
      )
    );

    return c.json({ success: true, count: logs.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);
export default app;
