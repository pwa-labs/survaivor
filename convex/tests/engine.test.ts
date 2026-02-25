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

async function seedTieBreakScenario(
  t: ReturnType<typeof convexTest>,
  input: {
    gameEpoch: number;
    round: number;
    activeIds: number[];
    ghostIds?: number[];
  },
) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("games", {
      gameEpoch: input.gameEpoch,
      status: "active",
      draftedAt: now - 10_000,
      startedAt: now - 9_000,
    });

    await ctx.db.insert("gameState", {
      singletonKey: "global",
      currentPhase: "discussion",
      currentGameEpoch: input.gameEpoch,
      currentRound: input.round,
      phaseStartedAt: now - 3_600_000,
      phaseEndsAt: now - 1,
      updatedAt: now,
    });

    await ctx.db.insert("rounds", {
      gameEpoch: input.gameEpoch,
      roundNumber: input.round,
      phase: "discussion",
      phaseStartedAt: now - 3_600_000,
      phaseEndsAt: now - 1,
    });

    for (const id of input.activeIds) {
      await ctx.db.insert("participants", {
        gameEpoch: input.gameEpoch,
        agentDid: buildDid(id),
        ownerDid: `did:owner:${String(id).padStart(2, "0")}`,
        avatarName: `Agent ${String(id).padStart(2, "0")}`,
        avatarPictureUrl: TEST_AVATAR_URL,
        avatarBackstory: `Backstory ${id}`,
        status: "active",
        joinedAt: now - 20_000,
      });
    }

    for (const id of input.ghostIds ?? []) {
      await ctx.db.insert("participants", {
        gameEpoch: input.gameEpoch,
        agentDid: buildDid(id),
        ownerDid: `did:owner:${String(id).padStart(2, "0")}`,
        avatarName: `Agent ${String(id).padStart(2, "0")}`,
        avatarPictureUrl: TEST_AVATAR_URL,
        avatarBackstory: `Backstory ${id}`,
        status: "eliminated",
        joinedAt: now - 40_000,
        eliminatedAt: now - 10_000,
      });
    }
  });
}

async function insertSurvivorVote(
  t: ReturnType<typeof convexTest>,
  input: {
    gameEpoch: number;
    round: number;
    voterId: number;
    targetId: number;
    index: number;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("votes", {
      gameEpoch: input.gameEpoch,
      round: input.round,
      actionType: "vote",
      actorAgentDid: buildDid(input.voterId),
      payloadHash: `vote:${input.round}:${input.index}`,
      timestamp: Date.now(),
      clientActionId: `vote:${input.round}:${input.index}`,
      nonce: `vote:${input.round}:${input.index}`,
      signature: "test-signature",
      targetAgentDid: buildDid(input.targetId),
      castAt: Date.now(),
    });
  });
}

async function insertGhostVote(
  t: ReturnType<typeof convexTest>,
  input: {
    gameEpoch: number;
    round: number;
    ghostId: number;
    targetId: number;
    index: number;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("ghostTieVotes", {
      gameEpoch: input.gameEpoch,
      round: input.round,
      actionType: "ghost_vote",
      actorAgentDid: buildDid(input.ghostId),
      payloadHash: `ghost_vote:${input.round}:${input.index}`,
      timestamp: Date.now(),
      clientActionId: `ghost_vote:${input.round}:${input.index}`,
      nonce: `ghost_vote:${input.round}:${input.index}`,
      signature: "test-signature",
      targetAgentDid: buildDid(input.targetId),
      castAt: Date.now(),
    });
  });
}

describe("engine lifecycle", () => {
  it("resolves deterministically to a single winner across 24-player game", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const t = convexTest(schema, modules);

    const initialized = await t.mutation(api.mutations.game.initializeGameState, {});
    expect(initialized.signupGameEpoch).toBeTruthy();

    await seedQueuedRegistrations(t, initialized.signupGameEpoch, 24);

    const started = await t.mutation(internal.mutations.game.startDailyGameInternal, {});
    expect(started).toMatchObject({
      started: true,
      currentGameEpoch: initialized.signupGameEpoch,
    });

    let lastResolution: Awaited<
      ReturnType<typeof t.mutation<typeof internal.mutations.game.resolveVotingWindowInternal>>
    > | null = null;

    for (let i = 0; i < 23; i += 1) {
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      lastResolution = await t.mutation(internal.mutations.game.resolveVotingWindowInternal, {});
      expect(lastResolution.resolved).toBe(true);
    }

    expect(lastResolution).toMatchObject({
      completed: true,
      winnerDid: buildDid(12),
    });

    const status = await t.query(api.queries.game.getStatus, {});
    expect(status.gameState.currentPhase).toBe("idle");
    expect(status.gameState.currentGameEpoch).toBeUndefined();
    expect(status.activeParticipantCount).toBe(0);

    const completedGame = await t.run(async (ctx) => {
      return await ctx.db
        .query("games")
        .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", initialized.signupGameEpoch))
        .unique();
    });
    expect(completedGame).toMatchObject({
      status: "completed",
      winnerDid: buildDid(12),
      totalRounds: 23,
    });

    vi.useRealTimers();
  });

  it("uses ghost tie-break votes when current-round survivor votes tie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    const t = convexTest(schema, modules);
    const gameEpoch = 7001;
    const round = 2;

    await seedTieBreakScenario(t, {
      gameEpoch,
      round,
      activeIds: [1, 2, 3, 5],
      ghostIds: [4],
    });

    await insertSurvivorVote(t, { gameEpoch, round, voterId: 1, targetId: 2, index: 1 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 2, targetId: 1, index: 2 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 3, targetId: 2, index: 3 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 5, targetId: 1, index: 4 });
    await insertGhostVote(t, { gameEpoch, round, ghostId: 4, targetId: 2, index: 1 });

    const resolved = await t.mutation(internal.mutations.game.resolveVotingWindowInternal, {});
    expect(resolved).toMatchObject({
      resolved: true,
      completed: false,
      eliminatedDid: buildDid(2),
    });

    const roundResultMessage = await t.run(async (ctx) => {
      const messages = await ctx.db
        .query("messagesPublic")
        .withIndex("by_game_epoch_round", (q) => q.eq("gameEpoch", gameEpoch).eq("round", round))
        .collect();
      return messages.find((message) => message.messageType === "round_result");
    });
    expect(roundResultMessage?.content).toContain("Ghost tie-break votes decided the tie.");

    vi.useRealTimers();
  });

  it("uses historical survivor votes when current and ghost tie-break votes are tied", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T01:00:00.000Z"));
    const t = convexTest(schema, modules);
    const gameEpoch = 7002;
    const round = 3;

    await seedTieBreakScenario(t, {
      gameEpoch,
      round,
      activeIds: [1, 2, 3, 4],
      ghostIds: [],
    });

    // Current round tie between 1 and 2 (2 votes each).
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 1, targetId: 2, index: 1 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 2, targetId: 1, index: 2 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 3, targetId: 2, index: 3 });
    await insertSurvivorVote(t, { gameEpoch, round, voterId: 4, targetId: 1, index: 4 });

    // Historical rounds bias against candidate 2.
    await insertSurvivorVote(t, { gameEpoch, round: 1, voterId: 1, targetId: 2, index: 5 });
    await insertSurvivorVote(t, { gameEpoch, round: 1, voterId: 2, targetId: 3, index: 6 });
    await insertSurvivorVote(t, { gameEpoch, round: 1, voterId: 3, targetId: 2, index: 7 });
    await insertSurvivorVote(t, { gameEpoch, round: 1, voterId: 4, targetId: 1, index: 8 });
    await insertSurvivorVote(t, { gameEpoch, round: 2, voterId: 1, targetId: 2, index: 9 });
    await insertSurvivorVote(t, { gameEpoch, round: 2, voterId: 2, targetId: 4, index: 10 });
    await insertSurvivorVote(t, { gameEpoch, round: 2, voterId: 3, targetId: 1, index: 11 });
    await insertSurvivorVote(t, { gameEpoch, round: 2, voterId: 4, targetId: 2, index: 12 });

    const resolved = await t.mutation(internal.mutations.game.resolveVotingWindowInternal, {});
    expect(resolved).toMatchObject({
      resolved: true,
      completed: false,
      eliminatedDid: buildDid(2),
    });

    const roundResultMessage = await t.run(async (ctx) => {
      const messages = await ctx.db
        .query("messagesPublic")
        .withIndex("by_game_epoch_round", (q) => q.eq("gameEpoch", gameEpoch).eq("round", round))
        .collect();
      return messages.find((message) => message.messageType === "round_result");
    });
    expect(roundResultMessage?.content).toContain("Historical vote pressure decided the tie.");

    vi.useRealTimers();
  });
});
