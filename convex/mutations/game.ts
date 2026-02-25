import { internalMutation, mutation } from "../_generated/server";
import {
  ensureSignupGameOpen,
  reconcileState,
  resolveVotingWindow,
  startDailyGameFromSignup,
} from "../game/engine";
import { ensureGlobalGameState } from "../game/state";

export const initializeGameState = mutation({
  args: {},
  handler: async (ctx) => {
    const state = await ensureGlobalGameState(ctx);
    const signup = await ensureSignupGameOpen(ctx);
    return {
      id: state._id,
      currentPhase: state.currentPhase,
      currentGameEpoch: state.currentGameEpoch ?? null,
      currentRound: state.currentRound ?? null,
      signupGameEpoch: state.signupGameEpoch ?? signup.gameEpoch,
    };
  },
});

export const openSignup = mutation({
  args: {},
  handler: async (ctx) => {
    return await ensureSignupGameOpen(ctx);
  },
});

export const startDailyGame = mutation({
  args: {},
  handler: async (ctx) => {
    return await startDailyGameFromSignup(ctx);
  },
});

export const resolveVotingWindowNow = mutation({
  args: {},
  handler: async (ctx) => {
    return await resolveVotingWindow(ctx);
  },
});

export const reconcileStateNow = mutation({
  args: {},
  handler: async (ctx) => {
    return await reconcileState(ctx);
  },
});

export const startDailyGameInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await startDailyGameFromSignup(ctx);
  },
});

export const resolveVotingWindowInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await resolveVotingWindow(ctx);
  },
});

export const reconcileStateInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await reconcileState(ctx);
  },
});
