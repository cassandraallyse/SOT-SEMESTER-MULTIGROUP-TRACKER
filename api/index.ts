import { Hono } from "hono";
import { handle } from "hono/vercel";
import { neon, types } from "@neondatabase/serverless";

types.setTypeParser(types.builtins.NUMERIC, (value) => Number(value));

const app = new Hono();

function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL environment variable is missing");
  return neon(dbUrl);
}

// GET /app-api/groups — list all groups/cohorts
app.get("/app-api/groups", async (c) => {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sot_groups ORDER BY id ASC`;
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/groups — add a new group/cohort
app.post("/app-api/groups", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { name } = body;
    if (!name) return c.json({ error: "Group name is required" }, 400);

    const [row] = await sql`
      INSERT INTO sot_groups (name) VALUES (${name}) RETURNING *
    `;
    return c.json(row);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /app-api/groups/:id — delete a group
app.delete("/app-api/groups/:id", async (c) => {
  try {
    const sql = getDb();
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);

    await sql`DELETE FROM sot_groups WHERE id = ${id}`;
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/leaderboard — leaderboard filtered by groupId if provided
app.get("/app-api/leaderboard", async (c) => {
  try {
    const sql = getDb();
    const groupId = c.req.query("groupId");

    const now = new Date();
    const dow = now.getUTCDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() + diffToMon);
    weekStart.setUTCHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];

    let rows;
    if (groupId && groupId !== "all") {
      const gId = Number(groupId);
      rows = await sql`
        SELECT
          p.id, p.group_id, p.name, p.location, p.steps_goal, p.workouts_goal, p.workouts_achievable,
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
        WHERE p.group_id = ${gId}
        GROUP BY p.id, p.group_id, p.name, p.location, p.steps_goal, p.workouts_goal, p.workouts_achievable
        ORDER BY steps_pct DESC, workouts_pct DESC
      `;
    } else {
      rows = await sql`
        SELECT
          p.id, p.group_id, p.name, p.location, p.steps_goal, p.workouts_goal, p.workouts_achievable,
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
        GROUP BY p.id, p.group_id, p.name, p.location, p.steps_goal, p.workouts_goal, p.workouts_achievable
        ORDER BY steps_pct DESC, workouts_pct DESC
      `;
    }

    const [lastLog] = await sql`
      SELECT updated_at FROM sot_daily_logs ORDER BY updated_at DESC LIMIT 1
    `;

    return c.json({
      rows,
      lastUpdated: lastLog?.updated_at || null,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/participants — filtered by groupId if provided
app.get("/app-api/participants", async (c) => {
  try {
    const sql = getDb();
    const groupId = c.req.query("groupId");

    let rows;
    if (groupId && groupId !== "all") {
      rows = await sql`SELECT * FROM sot_participants WHERE group_id = ${Number(groupId)} ORDER BY name`;
    } else {
      rows = await sql`SELECT * FROM sot_participants ORDER BY name`;
    }
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/participants — add new participant
app.post("/app-api/participants", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { name, location, group_id, steps_goal, workouts_goal } = body;

    if (!name) return c.json({ error: "Name is required" }, 400);

    const [row] = await sql`
      INSERT INTO sot_participants (name, location, group_id, steps_goal, workouts_goal)
      VALUES (${name}, ${location || ""}, ${group_id || null}, ${steps_goal || 560000}, ${workouts_goal || 24})
      RETURNING *
    `;
    return c.json(row);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /app-api/participants/:id — delete participant
app.delete("/app-api/participants/:id", async (c) => {
  try {
    const sql = getDb();
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid ID" }, 400);

    await sql`DELETE FROM sot_participants WHERE id = ${id}`;
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/logs/:participantId
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

// POST /app-api/logs — upsert single daily log
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

// POST /app-api/logs/bulk — bulk insert/upsert
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

// DELETE /app-api/logs/:id — delete entry
app.delete("/app-api/logs/:id", async (c) => {
  try {
    const sql = getDb();
    const id = Number(c.req.param("id"));
    if (!id) return c.json({ error: "Invalid log ID" }, 400);

    await sql`DELETE FROM sot_daily_logs WHERE id = ${id}`;
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);
export default app;
