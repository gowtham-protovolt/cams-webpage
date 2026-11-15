import test from "node:test";
import assert from "node:assert/strict";
import { findAuthenticatedSession } from "../src/middleware/auth.js";

test("loads an active user with its unexpired session in one database aggregation", async () => {
  const now = new Date("2026-10-28T10:00:00.000Z");
  let aggregateCalls = 0;
  let pipeline;
  const session = {
    tokenHash: "hashed-token",
    userId: "user-id",
    expiresAt: new Date("2026-10-28T11:00:00.000Z"),
    user: {
      _id: "user-id",
      email: "owner@example.test",
      username: "owner",
      displayName: "Plant Owner",
      role: "owner"
    }
  };
  const database = {
    collection(name) {
      assert.equal(name, "sessions");
      return {
        aggregate(stages) {
          aggregateCalls += 1;
          pipeline = stages;
          return { next: async () => session };
        }
      };
    }
  };

  const result = await findAuthenticatedSession(database, "hashed-token", now);

  assert.equal(aggregateCalls, 1);
  assert.deepEqual(pipeline[0], { $match: { tokenHash: "hashed-token", expiresAt: { $gt: now } } });
  assert.deepEqual(pipeline[1], { $limit: 1 });
  assert.deepEqual(pipeline[2].$lookup, {
    from: "users",
    localField: "userId",
    foreignField: "_id",
    pipeline: [
      { $match: { active: true } },
      { $project: { email: 1, username: 1, displayName: 1, role: 1 } }
    ],
    as: "user"
  });
  assert.deepEqual(pipeline[3], { $unwind: "$user" });
  assert.equal(result, session);
});
