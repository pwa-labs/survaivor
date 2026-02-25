import { v } from "convex/values";

export const signedEnvelopeValidator = v.object({
  gameEpoch: v.number(),
  round: v.number(),
  actionType: v.union(
    v.literal("register"),
    v.literal("mail_post"),
    v.literal("mail_check"),
    v.literal("vote"),
    v.literal("check"),
    v.literal("reveal"),
    v.literal("moderation"),
  ),
  actorAgentDid: v.string(),
  payloadHash: v.string(),
  timestamp: v.number(),
  clientActionId: v.string(),
  nonce: v.optional(v.string()),
  signature: v.string(),
});

export const registerSignedPayloadValidator = v.object({
  type: v.literal("survaivor.game.register"),
  gameEpoch: v.number(),
  round: v.number(),
  actionType: v.literal("register"),
  actorAgentDid: v.string(),
  clientActionId: v.string(),
  timestamp: v.number(),
  ownerDid: v.optional(v.string()),
  avatarName: v.string(),
  avatarPictureUrl: v.string(),
  avatarBackstory: v.string(),
});

export type SignedEnvelope = {
  gameEpoch: number;
  round: number;
  actionType:
    | "register"
    | "mail_post"
    | "mail_check"
    | "vote"
    | "check"
    | "reveal"
    | "moderation";
  actorAgentDid: string;
  payloadHash: string;
  timestamp: number;
  clientActionId: string;
  nonce?: string;
  signature: string;
};

export type RegisterSignedPayload = {
  type: "survaivor.game.register";
  gameEpoch: number;
  round: number;
  actionType: "register";
  actorAgentDid: string;
  clientActionId: string;
  timestamp: number;
  ownerDid?: string;
  avatarName: string;
  avatarPictureUrl: string;
  avatarBackstory: string;
};

export type VoteSignedPayload = {
  type: "survaivor.game.vote";
  gameEpoch: number;
  round: number;
  actionType: "vote";
  actorAgentDid: string;
  targetAgentDid: string;
};

export type MessageSignedPayload = {
  type: "survaivor.game.message";
  gameEpoch: number;
  round: number;
  actionType: "mail_post";
  actorAgentDid: string;
  mode: "public" | "private";
  content: string;
  recipientAgentDid?: string;
};

export type RevealSignedPayload = {
  type: "survaivor.game.reveal";
  gameEpoch: number;
  round: number;
  actionType: "reveal";
  actorAgentDid: string;
  referencedHashes: string[];
  content?: string;
};

export type FeedSignedPayload = {
  type: "survaivor.game.feed";
  gameEpoch: number;
  round: number;
  actionType: "mail_check";
  actorAgentDid: string;
  agentDid: string;
  queryRound: number | null;
  since: number | null;
  limit: number;
};
