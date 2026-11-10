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

// Helpers for Spreadsheet Parsing (always logs the date so clearing a cell sets it to 0)
function extractMatrixLogs(
  rowTypes: Record<string, any[]>,
  dateColIndices: { idx: number; isoDate: string }[]
) {
  const stepsRow = rowTypes["Steps"] || [];
  const workoutRow = rowTypes["Workout"] || [];
  const yogaRow = rowTypes["Yoga"] || [];
  const logs = [];

  for (const { idx, isoDate } of dateColIndices) {
    const sRaw = String(stepsRow[idx] ?? "0").replace(/,/g, "").trim();
    const wRaw = String(workoutRow[idx] ?? "0").trim().toLowerCase();
    const yRaw = String(yogaRow[idx] ?? "0").trim().toLowerCase();

    const stepsNum = parseInt(sRaw, 10) || 0;
    let wNum = 0;
    if (wRaw === "y" || wRaw === "true") wNum = 1;
    else wNum = parseInt(wRaw, 10) || 0;

    let yNum = 0;
    if (yRaw === "y" || yRaw === "true") yNum = 1;
    else yNum = parseInt(yRaw, 10) || 0;

    // Always push the record so zeroed/cleared values overwrite the database
    logs.push({ log_date: isoDate, steps: stepsNum, workout: wNum, yoga: yNum });
  }
  return logs;
}

// POST /app-api/verify-passcode — Hardcoded fallback for "2026"
app.post("/app-api/verify-passcode", async (c) => {
  try {
    const body = await c.req.json();
    const { passcode } = body;

    if (passcode === "2026") {
      return c.json({ success: true });
    } else {
      return c.json({ error: "Incorrect passcode" }, 401);
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/update-passcode
app.post("/app-api/update-passcode", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { groupId, newPasscode } = body;

    if (!newPasscode || newPasscode.trim().length < 4) {
      return c.json({ error: "Passcode must be at least 4 characters" }, 400);
    }

    if (groupId && groupId !== "all") {
      await sql`UPDATE sot_groups SET admin_pin = ${newPasscode.trim()} WHERE id = ${Number(groupId)}`;
    } else {
      await sql`UPDATE sot_groups SET admin_pin = ${newPasscode.trim()}`;
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/groups
app.get("/app-api/groups", async (c) => {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sot_groups ORDER BY id ASC`;
    return c.json(rows);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/groups
app.post("/app-api/groups", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { name } = body;
    if (!name) return c.json({ error: "Group name is required" }, 400);

    const [row] = await sql`
      INSERT INTO sot_groups (name, admin_pin) VALUES (${name}, '2026') RETURNING *
    `;
    return c.json(row);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /app-api/groups/:id
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

// GET /app-api/leaderboard
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
    let minLogDate = null;

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
        ORDER BY 
          steps_pct DESC, 
          workouts_pct DESC, 
          COALESCE(SUM(l.workout), 0) DESC, 
          COALESCE(SUM(l.steps), 0) DESC
      `;

      const [minRow] = await sql`
        SELECT MIN(l.log_date)::text AS min_date
        FROM sot_daily_logs l
        JOIN sot_participants p ON p.id = l.participant_id
        WHERE p.group_id = ${gId}
      `;
      minLogDate = minRow?.min_date || null;
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
        ORDER BY 
          steps_pct DESC, 
          workouts_pct DESC, 
          COALESCE(SUM(l.workout), 0) DESC, 
          COALESCE(SUM(l.steps), 0) DESC
      `;

      const [minRow] = await sql`
        SELECT MIN(log_date)::text AS min_date FROM sot_daily_logs
      `;
      minLogDate = minRow?.min_date || null;
    }

    const [lastLog] = await sql`
      SELECT updated_at FROM sot_daily_logs ORDER BY updated_at DESC LIMIT 1
    `;

    return c.json({
      rows,
      lastUpdated: lastLog?.updated_at || null,
      minLogDate,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /app-api/participants
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

// POST /app-api/participants — 8-week semester standards: 560k steps, 24 workouts
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

// DELETE /app-api/participants/:id
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

// POST /app-api/logs
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

// POST /app-api/logs/bulk
app.post("/app-api/logs/bulk", async (c) => {
  try {
    const sql = getDb();
    const body = await c.req.json();
    const { participant_id, logs } = body;

    if (!participant_id || !Array.isArray(logs) || logs.length === 0) {
      return c.json({ error: "participant_id and a non-empty logs array are required" }, 400);
    }

    for (const entry of logs) {
      await sql`
        INSERT INTO sot_daily_logs (participant_id, log_date, steps, workout, yoga, updated_at)
        VALUES (${Number(participant_id)}, ${entry.log_date}, ${Number(entry.steps) || 0}, ${Number(entry.workout) || 0}, ${Number(entry.yoga) || 0}, NOW())
        ON CONFLICT (participant_id, log_date)
        DO UPDATE SET
          steps = EXCLUDED.steps,
          workout = EXCLUDED.workout,
          yoga = EXCLUDED.yoga,
          updated_at = NOW()
      `;
    }

    return c.json({ success: true, count: logs.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /app-api/sync-sheet (Multi-Group Google Sheet Ingestion)
app.post("/app-api/sync-sheet", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const syncSecret = process.env.SHEET_SYNC_SECRET;

    if (!syncSecret || authHeader !== `Bearer ${syncSecret}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { rows, groupName } = body;

    if (!Array.isArray(rows) || rows.length < 2) {
      return c.json({ error: "Invalid rows format: spreadsheet data too short" }, 400);
    }

    const sql = getDb();

    // Match group ID if groupName was provided (e.g., "Group 1")
    let targetGroupId: number | null = null;
    if (groupName) {
      const [g] = await sql`
        SELECT id FROM sot_groups 
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(${groupName})) 
        LIMIT 1
      `;
      if (g) targetGroupId = g.id;
    }

    // Filter participants by group if a group was matched
    const participants = targetGroupId
      ? await sql`SELECT id, name FROM sot_participants WHERE group_id = ${targetGroupId}`
      : await sql`SELECT id, name FROM sot_participants`;

    // 1. Locate date columns in header row
    const headerCols: any[] = rows[0] || [];
    const dateColIndices: { idx: number; isoDate: string }[] = [];

    headerCols.forEach((col, idx) => {
      const colStr = String(col ?? "").trim();
      
      const slashMatch = colStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        const m = slashMatch[1].padStart(2, "0");
        const d = slashMatch[2].padStart(2, "0");
        const y = slashMatch[3];
        dateColIndices.push({ idx, isoDate: `${y}-${m}-${d}` });
        return;
      }

      const isoMatch = colStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        dateColIndices.push({ idx, isoDate: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` });
      }
    });

    if (dateColIndices.length === 0) {
      return c.json({ error: "No date columns found in sheet header" }, 400);
    }

    // 2. Parse matrix sheet rows into participant logs
    let currentParticipantId: number | null = null;
    let rowTypes: Record<string, any[]> = {};
    const bulkPayloads: { participant_id: number; logs: any[] }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const parts: any[] = rows[i] || [];
      const firstCol = String(parts[0] ?? "").trim();
      if (!firstCol) continue;

      if (["Steps", "Workout", "Yoga"].includes(firstCol)) {
        if (currentParticipantId && !rowTypes[firstCol]) {
          rowTypes[firstCol] = parts;
        }
      } else {
        if (currentParticipantId && Object.keys(rowTypes).length > 0) {
          const pLogs = extractMatrixLogs(rowTypes, dateColIndices);
          if (pLogs.length > 0) bulkPayloads.push({ participant_id: currentParticipantId, logs: pLogs });
        }

        const firstName = firstCol.split(" ")[0].toLowerCase();
        const matchP = participants.find((p: any) => {
          const pFirst = p.name.toLowerCase().split(" ")[0];
          return (
            pFirst === firstName ||
            firstName.startsWith(pFirst) ||
            pFirst.startsWith(firstName)
          );
        });

        currentParticipantId = matchP ? matchP.id : null;
        rowTypes = {};
      }
    }

    if (currentParticipantId && Object.keys(rowTypes).length > 0) {
      const pLogs = extractMatrixLogs(rowTypes, dateColIndices);
      if (pLogs.length > 0) bulkPayloads.push({ participant_id: currentParticipantId, logs: pLogs });
    }

    // 3. Write directly into Neon PostgreSQL
    let totalEntries = 0;
    for (const payload of bulkPayloads) {
      for (const entry of payload.logs) {
        await sql`
          INSERT INTO sot_daily_logs (participant_id, log_date, steps, workout, yoga, updated_at)
          VALUES (${Number(payload.participant_id)}, ${entry.log_date}, ${Number(entry.steps) || 0}, ${Number(entry.workout) || 0}, ${Number(entry.yoga) || 0}, NOW())
          ON CONFLICT (participant_id, log_date)
          DO UPDATE SET
            steps = EXCLUDED.steps,
            workout = EXCLUDED.workout,
            yoga = EXCLUDED.yoga,
            updated_at = NOW()
        `;
        totalEntries++;
      }
    }

    return c.json({
      success: true,
      group: groupName || "all",
      participantsSynced: bulkPayloads.length,
      totalEntriesSynced: totalEntries,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /app-api/logs/:id
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

export default app;
