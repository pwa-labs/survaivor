import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const GLOBAL_GAME_STATE_KEY = "global";

type CtxWithDb = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

export async function getGlobalGameState(ctx: CtxWithDb) {
  const state = await ctx.db
    .query("gameState")
    .withIndex("by_singleton_key", (q) => q.eq("singletonKey", GLOBAL_GAME_STATE_KEY))
    .unique();

  if (!state) {
    throw new ConvexError("Global game state is not initialized.");
  }

  return state;
}

export async function ensureGlobalGameState(ctx: Pick<MutationCtx, "db">) {
  const existing = await ctx.db
    .query("gameState")
    .withIndex("by_singleton_key", (q) => q.eq("singletonKey", GLOBAL_GAME_STATE_KEY))
    .unique();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const createdId = await ctx.db.insert("gameState", {
    singletonKey: GLOBAL_GAME_STATE_KEY,
    currentPhase: "idle",
    updatedAt: now,
  });

  const created = await ctx.db.get(createdId);
  if (!created) {
    throw new ConvexError("Failed to initialize global game state.");
  }

  return created;
}

export function requirePhase(
  state: { currentPhase: string },
  expectedPhase: "signup" | "discussion" | "resolution",
) {
  if (state.currentPhase !== expectedPhase) {
    throw new ConvexError(
      `Action is only allowed during ${expectedPhase}. Current phase: ${state.currentPhase}.`,
    );
  }
}

export async function requireActiveParticipant(
  ctx: CtxWithDb,
  gameEpoch: number,
  agentDid: string,
) {
  const participant = await ctx.db
    .query("participants")
    .withIndex("by_game_epoch_agent_did", (q) =>
      q.eq("gameEpoch", gameEpoch).eq("agentDid", agentDid),
    )
    .unique();

  if (!participant || participant.status !== "active") {
    throw new ConvexError("Agent is not an active participant.");
  }

  return participant;
}
