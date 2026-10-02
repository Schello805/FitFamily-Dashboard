import { describe, expect, it, beforeEach } from "vitest";
import { POST, PUT, DELETE } from "./route";
import { db } from "@/lib/db";
import { setAdminPin } from "@/lib/security";

describe("manual-training API route (Add, Edit, Delete)", () => {
  const pin = "4321";
  const profileId = "papa";

  beforeEach(async () => {
    await setAdminPin(pin);
  });

  it("rejects requests with incorrect PIN", async () => {
    const res = await POST(
      new Request("http://localhost/api/manual-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: "9999",
          profileId,
          type: "strength",
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          endedAt: new Date(Date.now() - 1800000).toISOString()
        })
      })
    );
    expect(res.status).toBe(401);
  });

  it("creates, edits, and deletes a training session successfully", async () => {
    // 1. Create
    const startedAt = new Date(Date.now() - 7200000).toISOString();
    const endedAt = new Date(Date.now() - 3600000).toISOString();

    const postRes = await POST(
      new Request("http://localhost/api/manual-training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          profileId,
          type: "strength",
          startedAt,
          endedAt
        })
      })
    );
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(typeof postData.sessionId).toBe("string");
    const sessionId = postData.sessionId;

    const client = await db();
    const inserted = await client.execute({
      sql: "SELECT * FROM training_sessions WHERE id = ?",
      args: [sessionId]
    });
    expect(inserted.rows.length).toBe(1);

    await client.batch([
      { sql: "UPDATE training_sessions SET status = 'active', ended_at = NULL WHERE id = ?", args: [sessionId] },
      { sql: "UPDATE training_segments SET ended_at = NULL WHERE session_id = ?", args: [sessionId] }
    ], "write");

    // 2. Edit (PUT)
    const newStartedAt = new Date(Date.now() - 5400000).toISOString();
    const newEndedAt = new Date(Date.now() - 1800000).toISOString();

    const putRes = await PUT(
      new Request("http://localhost/api/manual-training", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          sessionId,
          profileId,
          type: "endurance",
          startedAt: newStartedAt,
          endedAt: newEndedAt
        })
      })
    );
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.ok).toBe(true);

    const updated = await client.execute({
      sql: "SELECT * FROM training_sessions WHERE id = ?",
      args: [sessionId]
    });
    expect(updated.rows[0].started_at).toBe(newStartedAt);
    expect(updated.rows[0].status).toBe("completed");
    expect(updated.rows[0].edited).toBe(1);

    const updatedSegment = await client.execute({
      sql: "SELECT * FROM training_segments WHERE session_id = ?",
      args: [sessionId]
    });
    expect(updatedSegment.rows[0].type).toBe("endurance");

    const extraSegmentStart = new Date(new Date(newStartedAt).getTime() + 10 * 60000).toISOString();
    const extraSegmentEnd = new Date(new Date(newStartedAt).getTime() + 20 * 60000).toISOString();
    await client.execute({
      sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, 'strength', ?, ?)",
      args: [`${sessionId}-extra`, sessionId, extraSegmentStart, extraSegmentEnd]
    });
    const scaledStart = new Date(Date.now() - 4200000).toISOString();
    const scaledEnd = new Date(Date.now() - 2400000).toISOString();
    const scaleRes = await PUT(new Request("http://localhost/api/manual-training", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, sessionId, profileId, type: "strength", startedAt: scaledStart, endedAt: scaledEnd })
    }));
    expect(scaleRes.status).toBe(200);
    const scaledSegments = await client.execute({
      sql: "SELECT type, started_at, ended_at FROM training_segments WHERE session_id = ? ORDER BY started_at ASC",
      args: [sessionId]
    });
    expect(scaledSegments.rows.map((row) => row.type)).toEqual(["endurance", "strength"]);
    expect(String(scaledSegments.rows[0]?.started_at)).toBe(scaledStart);
    expect(String(scaledSegments.rows[0]?.ended_at)).toBe(scaledEnd);

    // 3. Delete (DELETE)
    const deleteRes = await DELETE(
      new Request("http://localhost/api/manual-training", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          sessionId,
          profileId
        })
      })
    );
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.ok).toBe(true);

    const deletedCheck = await client.execute({
      sql: "SELECT * FROM training_sessions WHERE id = ?",
      args: [sessionId]
    });
    expect(deletedCheck.rows.length).toBe(0);

    const deletedSegmentCheck = await client.execute({
      sql: "SELECT * FROM training_segments WHERE session_id = ?",
      args: [sessionId]
    });
    expect(deletedSegmentCheck.rows.length).toBe(0);
  });
});
