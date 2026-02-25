import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { hashCanonicalPayload } from "../lib/identity";
import schema from "../schema";
import { modules } from "../test.setup";

const TEST_AVATAR_URL = "https://example.com/avatar.png";

function buildAgentDid(index: number) {
  return `did:agent:${String(index).padStart(2, "0")}`;
}

function buildOwnerDid(index: number) {
  return `did:owner:${String(index).padStart(2, "0")}`;
}

function buildEnvelope(input: {
  gameEpoch: number;
  round: number;
  actionType: "mail_post" | "vote" | "reveal";
  actorAgentDid: string;
  clientActionId: string;
  timestamp: number;
}) {
  return {
    gameEpoch: input.gameEpoch,
    round: input.round,
    actionType: input.actionType,
    actorAgentDid: input.actorAgentDid,
    payloadHash: `${input.actionType}:${input.clientActionId}`,
    timestamp: input.timestamp,
    clientActionId: input.clientActionId,
    nonce: input.clientActionId,
    signature: "test-signature",
  } as const;
}

async function registerAgent(
  t: ReturnType<typeof convexTest>,
  input: {
    gameEpoch: number;
    actorAgentDid: string;
    ownerDid: string;
    clientActionId: string;
    timestamp: number;
  },
) {
  const signedPayload = {
    type: "survaivor.game.register" as const,
    gameEpoch: input.gameEpoch,
    round: 0,
    actionType: "register" as const,
    actorAgentDid: input.actorAgentDid,
    clientActionId: input.clientActionId,
    timestamp: input.timestamp,
    ownerDid: input.ownerDid,
    avatarName: input.actorAgentDid.replace("did:agent:", "Agent "),
    avatarPictureUrl: TEST_AVATAR_URL,
    avatarBackstory: `Backstory for ${input.actorAgentDid}`,
  };
  const payloadHash = await hashCanonicalPayload(signedPayload);

  await t.mutation(api.mutations.register.register, {
    envelope: {
      gameEpoch: input.gameEpoch,
      round: 0,
      actionType: "register",
      actorAgentDid: input.actorAgentDid,
      payloadHash,
      timestamp: input.timestamp,
      clientActionId: input.clientActionId,
      nonce: input.clientActionId,
      signature: "test-signature",
    },
    signedPayload,
    ownerDid: input.ownerDid,
    avatarName: signedPayload.avatarName,
    avatarPictureUrl: signedPayload.avatarPictureUrl,
    avatarBackstory: signedPayload.avatarBackstory,
    ownerHumanVerified: true,
    minReputationPass: true,
  });
}

describe("gameplay e2e flow", () => {
  it("opens signup, registers 24 agents, runs chat+vote+elimination across hourly ticks", async () => {
    vi.useFakeTimers();
    // 11:00 Pacific (winter); noon tick should start the game.
    vi.setSystemTime(new Date("2026-01-01T19:00:00.000Z"));

    process.env.IDENTITY_INTEGRATOR_API_KEY = "test-integrator-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch,
    );

    const t = convexTest(schema, modules);
    const initialized = await t.mutation(
      api.mutations.game.initializeGameState,
      {},
    );
    expect(initialized.currentPhase).toBe("idle");
    expect(initialized.signupGameEpoch).toBeTruthy();
    const preGameStatus = await t.query(api.queries.game.getStatus, {});
    expect(preGameStatus.signupScene).toBeTruthy();
    expect(preGameStatus.signupScene?.summary).toContain("In ");

    let actionCounter = 0;
    const nextActionId = (prefix: string) => {
      actionCounter += 1;
      return `${prefix}-${actionCounter}`;
    };

    for (let i = 1; i <= 24; i += 1) {
      await registerAgent(t, {
        gameEpoch: initialized.signupGameEpoch,
        actorAgentDid: buildAgentDid(i),
        ownerDid: buildOwnerDid(i),
        clientActionId: nextActionId("register"),
        timestamp: Date.now(),
      });
    }

    // Noon Pacific top-of-hour starts the game from signup.
    vi.advanceTimersByTime(60 * 60 * 1000);
    const noonTick = (await t.action(
      internal.game.automation.handleTopOfHour,
      {},
    )) as {
      started?: boolean;
      currentGameEpoch?: number;
    };
    expect(noonTick.started).toBe(true);
    expect(noonTick.currentGameEpoch).toBe(initialized.signupGameEpoch);
    const startedStatus = await t.query(api.queries.game.getStatus, {});
    expect(startedStatus.gameScene).toBeTruthy();
    expect(startedStatus.gameScene?.summary).toContain("In ");

    const eliminationPlan = [
      buildAgentDid(1),
      buildAgentDid(2),
      buildAgentDid(3),
    ];
    let activeDids = Array.from({ length: 24 }, (_, i) => buildAgentDid(i + 1));
    let ghostRevealHash: string | null = null;

    for (
      let roundIndex = 0;
      roundIndex < eliminationPlan.length;
      roundIndex += 1
    ) {
      const expectedEliminatedDid = eliminationPlan[roundIndex];

      const status = await t.query(api.queries.game.getStatus, {});
      const gameEpoch = status.gameState.currentGameEpoch as number;
      const round = status.gameState.currentRound as number;
      expect(status.gameState.currentPhase).toBe("discussion");

      // Simulate a few public chats each round.
      for (const chatterDid of activeDids.slice(0, 3)) {
        await t.mutation(api.mutations.mail.postMail, {
          envelope: buildEnvelope({
            gameEpoch,
            round,
            actionType: "mail_post",
            actorAgentDid: chatterDid,
            clientActionId: nextActionId("mail"),
            timestamp: Date.now(),
          }),
          mode: "public",
          content: `Round ${round} message from ${chatterDid}`,
        });
      }
      if (roundIndex === 0) {
        const privateEnvelope = buildEnvelope({
          gameEpoch,
          round,
          actionType: "mail_post",
          actorAgentDid: buildAgentDid(2),
          clientActionId: nextActionId("private-mail"),
          timestamp: Date.now(),
        });
        ghostRevealHash = privateEnvelope.payloadHash;
        await t.mutation(api.mutations.mail.postMail, {
          envelope: privateEnvelope,
          mode: "private",
          recipientAgentDid: buildAgentDid(1),
          content: "Secret alliance offer.",
        });
      }

      // Everyone votes; target receives max votes so elimination is deterministic.
      for (const voterDid of activeDids) {
        const targetDid =
          voterDid === expectedEliminatedDid
            ? activeDids.find((did) => did !== voterDid)!
            : expectedEliminatedDid;
        await t.mutation(api.mutations.vote.castVote, {
          envelope: buildEnvelope({
            gameEpoch,
            round,
            actionType: "vote",
            actorAgentDid: voterDid,
            clientActionId: nextActionId("vote"),
            timestamp: Date.now(),
          }),
          targetAgentDid: targetDid,
        });
      }

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      const tickResult = (await t.action(
        internal.game.automation.handleTopOfHour,
        {},
      )) as {
        resolved?: boolean;
        eliminatedDid?: string;
      };
      expect(tickResult.resolved).toBe(true);
      expect(tickResult.eliminatedDid).toBe(expectedEliminatedDid);

      activeDids = activeDids.filter((did) => did !== expectedEliminatedDid);

      if (roundIndex === 0 && ghostRevealHash) {
        const postEliminationStatus = await t.query(
          api.queries.game.getStatus,
          {},
        );
        const revealResult = await t.mutation(
          api.mutations.reveal.revealPrivateMessages,
          {
            envelope: buildEnvelope({
              gameEpoch,
              round: postEliminationStatus.gameState.currentRound as number,
              actionType: "reveal",
              actorAgentDid: buildAgentDid(1),
              clientActionId: nextActionId("reveal"),
              timestamp: Date.now(),
            }),
            referencedHashes: [ghostRevealHash],
            content: "You all should see this now.",
          },
        );
        expect(revealResult.revealedCount).toBe(1);
      }

      const roster = await t.query(api.queries.game.getActiveRoster, {
        gameEpoch,
      });
      expect(roster.roster).toHaveLength(activeDids.length);
      expect(
        roster.roster.find((agent) => agent.agentDid === expectedEliminatedDid),
      ).toBeUndefined();
    }

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
