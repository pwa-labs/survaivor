import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

function buildRevealEnvelope(input: {
  gameEpoch: number;
  round: number;
  actorAgentDid: string;
  clientActionId: string;
  timestamp: number;
}) {
  return {
    gameEpoch: input.gameEpoch,
    round: input.round,
    actionType: "reveal" as const,
    actorAgentDid: input.actorAgentDid,
    payloadHash: `reveal:${input.clientActionId}`,
    timestamp: input.timestamp,
    clientActionId: input.clientActionId,
    nonce: input.clientActionId,
    signature: "test-signature",
  };
}

async function seedActiveGameWithPrivateMessage(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  const gameEpoch = 1;
  const round = 2;
  const recipientDid = "did:agent:01";
  const senderDid = "did:agent:02";

  const messageHash = "private-message-hash";
  await t.run(async (ctx) => {
    await ctx.db.insert("games", {
      gameEpoch,
      status: "active",
      draftedAt: now - 10_000,
      startedAt: now - 5_000,
    });
    await ctx.db.insert("gameState", {
      singletonKey: "global",
      currentPhase: "discussion",
      currentGameEpoch: gameEpoch,
      currentRound: round,
      phaseStartedAt: now - 4_000,
      phaseEndsAt: now + 10_000,
      updatedAt: now,
    });
    await ctx.db.insert("participants", {
      gameEpoch,
      agentDid: recipientDid,
      avatarName: "Ghost One",
      avatarPictureUrl: "https://example.com/avatar-1.png",
      avatarBackstory: "Backstory",
      status: "active",
      joinedAt: now - 4_000,
    });
    await ctx.db.insert("participants", {
      gameEpoch,
      agentDid: senderDid,
      avatarName: "Ghost Two",
      avatarPictureUrl: "https://example.com/avatar-2.png",
      avatarBackstory: "Backstory",
      status: "active",
      joinedAt: now - 4_000,
    });
    await ctx.db.insert("messagesPrivate", {
      gameEpoch,
      round,
      actionType: "mail_post",
      actorAgentDid: senderDid,
      recipientAgentDid: recipientDid,
      payloadHash: messageHash,
      timestamp: now - 3_000,
      clientActionId: "mail-1",
      nonce: "mail-1",
      signature: "test-signature",
      content: "private message",
      revealStatus: "hidden",
    });
  });

  return { now, gameEpoch, round, recipientDid, messageHash };
}

describe("reveal constraints", () => {
  it("rejects reveal when actor is not eliminated", async () => {
    const t = convexTest(schema, modules);
    const ctx = await seedActiveGameWithPrivateMessage(t);

    await expect(
      t.mutation(api.mutations.reveal.revealPrivateMessages, {
        envelope: buildRevealEnvelope({
          gameEpoch: ctx.gameEpoch,
          round: ctx.round,
          actorAgentDid: ctx.recipientDid,
          clientActionId: "reveal-active",
          timestamp: ctx.now,
        }),
        referencedHashes: [ctx.messageHash],
      }),
    ).rejects.toThrowError("Only eliminated agents (ghosts) can reveal private messages.");
  });

  it("rejects reveal of private messages received after elimination", async () => {
    const t = convexTest(schema, modules);
    const ctx = await seedActiveGameWithPrivateMessage(t);

    await t.run(async (dbCtx) => {
      const participant = await dbCtx.db
        .query("participants")
        .withIndex("by_game_epoch_agent_did", (q) =>
          q.eq("gameEpoch", ctx.gameEpoch).eq("agentDid", ctx.recipientDid),
        )
        .unique();
      if (!participant) throw new Error("Missing participant");
      await dbCtx.db.patch(participant._id, {
        status: "eliminated",
        eliminatedAt: ctx.now - 2_000,
      });
    });

    const postEliminationHash = "private-after-elimination";
    await t.run(async (dbCtx) => {
      await dbCtx.db.insert("messagesPrivate", {
        gameEpoch: ctx.gameEpoch,
        round: ctx.round,
        actionType: "mail_post",
        actorAgentDid: "did:agent:02",
        recipientAgentDid: ctx.recipientDid,
        payloadHash: postEliminationHash,
        timestamp: ctx.now - 1_000,
        clientActionId: "mail-after",
        nonce: "mail-after",
        signature: "test-signature",
        content: "too late",
        revealStatus: "hidden",
      });
    });

    await expect(
      t.mutation(api.mutations.reveal.revealPrivateMessages, {
        envelope: buildRevealEnvelope({
          gameEpoch: ctx.gameEpoch,
          round: ctx.round,
          actorAgentDid: ctx.recipientDid,
          clientActionId: "reveal-late",
          timestamp: ctx.now,
        }),
        referencedHashes: [postEliminationHash],
      }),
    ).rejects.toThrowError(
      "Ghost reveals can only include private messages received before elimination.",
    );
  });

  it("rejects reveal when referenced hash does not exist", async () => {
    const t = convexTest(schema, modules);
    const ctx = await seedActiveGameWithPrivateMessage(t);

    await t.run(async (dbCtx) => {
      const participant = await dbCtx.db
        .query("participants")
        .withIndex("by_game_epoch_agent_did", (q) =>
          q.eq("gameEpoch", ctx.gameEpoch).eq("agentDid", ctx.recipientDid),
        )
        .unique();
      if (!participant) throw new Error("Missing participant");
      await dbCtx.db.patch(participant._id, {
        status: "eliminated",
        eliminatedAt: ctx.now - 500,
      });
    });

    await expect(
      t.mutation(api.mutations.reveal.revealPrivateMessages, {
        envelope: buildRevealEnvelope({
          gameEpoch: ctx.gameEpoch,
          round: ctx.round,
          actorAgentDid: ctx.recipientDid,
          clientActionId: "reveal-bad-hash",
          timestamp: ctx.now,
        }),
        referencedHashes: ["not-found-hash"],
      }),
    ).rejects.toThrowError("One or more referenced private messages were not found.");
  });

  it("rejects replaying the same reveal envelope (idempotency)", async () => {
    const t = convexTest(schema, modules);
    const ctx = await seedActiveGameWithPrivateMessage(t);

    await t.run(async (dbCtx) => {
      const participant = await dbCtx.db
        .query("participants")
        .withIndex("by_game_epoch_agent_did", (q) =>
          q.eq("gameEpoch", ctx.gameEpoch).eq("agentDid", ctx.recipientDid),
        )
        .unique();
      if (!participant) throw new Error("Missing participant");
      await dbCtx.db.patch(participant._id, {
        status: "eliminated",
        eliminatedAt: ctx.now - 500,
      });
    });

    const envelope = buildRevealEnvelope({
      gameEpoch: ctx.gameEpoch,
      round: ctx.round,
      actorAgentDid: ctx.recipientDid,
      clientActionId: "reveal-replay",
      timestamp: ctx.now,
    });

    const first = await t.mutation(api.mutations.reveal.revealPrivateMessages, {
      envelope,
      referencedHashes: [ctx.messageHash],
    });
    expect(first.revealedCount).toBe(1);

    await expect(
      t.mutation(api.mutations.reveal.revealPrivateMessages, {
        envelope,
        referencedHashes: [ctx.messageHash],
      }),
    ).rejects.toThrowError("Duplicate clientActionId for this action.");
  });
});
