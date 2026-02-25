import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const TEST_AVATAR_URL = "https://example.com/avatar.png";

function buildDid(index: number) {
  return `did:agent:${String(index).padStart(2, "0")}`;
}

async function seedQueuedRegistrations(
  t: ReturnType<typeof convexTest>,
  gameEpoch: number,
  count: number,
) {
  await t.run(async (ctx) => {
    for (let i = 1; i <= count; i += 1) {
      const did = buildDid(i);
      await ctx.db.insert("registrations", {
        gameEpoch,
        agentDid: did,
        ownerDid: `did:owner:${String(i).padStart(2, "0")}`,
        avatarName: `Agent ${String(i).padStart(2, "0")}`,
        avatarPictureUrl: TEST_AVATAR_URL,
        avatarBackstory: `Backstory ${i}`,
        status: "queued",
        requestedAt: Date.now() + i,
        ownerHumanVerified: true,
        minReputationPass: true,
      });
    }
  });
}

describe("top-of-hour automation", () => {
  it("emits no-vote, eliminated, and winner signals with system actor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T11:00:00.000-08:00"));
    process.env.IDENTITY_INTEGRATOR_API_KEY = "test-integrator-key";

    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const t = convexTest(schema, modules);
    const initialized = await t.mutation(api.mutations.game.initializeGameState, {});
    await seedQueuedRegistrations(t, initialized.signupGameEpoch, 2);
    await t.mutation(internal.mutations.game.startDailyGameInternal, {});
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    await t.action(internal.game.automation.handleTopOfHour, {});

    const calls = fetchMock.mock.calls as unknown[][];
    const ingestCalls = calls.filter((call) =>
      String(call[0]).endsWith("/ingest"),
    );
    expect(ingestCalls.length).toBe(4);

    const payloads = ingestCalls.map((call) => {
      const init = (call[1] ?? undefined) as RequestInit | undefined;
      const body = init?.body;
      return JSON.parse(String(body)) as {
        eventType: string;
        actorType: string;
        actorId: string;
      };
    });

    const eventTypes = payloads.map((payload) => payload.eventType).sort();
    expect(eventTypes).toEqual(["eliminated", "round_no_vote", "round_no_vote", "winner"]);

    for (const payload of payloads) {
      expect(payload.actorType).toBe("system");
      expect(payload.actorId).toBe("sys:survaivor");
    }

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("simulates a full 24-agent game via hourly ticks", async () => {
    vi.useFakeTimers();
    // 11:00 Pacific in winter; next tick at noon starts the game.
    vi.setSystemTime(new Date("2026-01-01T19:00:00.000Z"));
    process.env.IDENTITY_INTEGRATOR_API_KEY = "test-integrator-key";

    const fetchMock = vi.fn(async () => {
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const t = convexTest(schema, modules);
    const initialized = await t.mutation(api.mutations.game.initializeGameState, {});
    await seedQueuedRegistrations(t, initialized.signupGameEpoch, 24);

    // Noon Pacific: starts the daily game.
    vi.advanceTimersByTime(60 * 60 * 1000);
    await t.action(internal.game.automation.handleTopOfHour, {});

    // 23 hourly ticks resolve 23 rounds for a deterministic winner.
    for (let i = 0; i < 23; i += 1) {
      vi.advanceTimersByTime(60 * 60 * 1000);
      await t.action(internal.game.automation.handleTopOfHour, {});
    }

    const game = await t.run(async (ctx) => {
      return await ctx.db
        .query("games")
        .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", initialized.signupGameEpoch))
        .unique();
    });
    expect(game).toMatchObject({
      status: "completed",
      winnerDid: buildDid(12),
      totalRounds: 23,
    });

    const status = await t.query(api.queries.game.getStatus, {});
    expect(status.gameState.currentPhase).toBe("idle");
    expect(status.gameState.currentGameEpoch).toBeUndefined();

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
