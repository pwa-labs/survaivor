import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";

import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  emitRegisterTrustSignal,
  verifyAgentIdentityForRegister,
  verifyEnvelopeSignatureCertification,
} from "./game/identity";
import { emitVoteCastSignal } from "./game/trust";
import { assertValidSquareAvatarImage } from "./lib/image";
import type { RegisterSignedPayload, SignedEnvelope } from "./lib/validators";

const http = httpRouter();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function methodNotAllowed() {
  return jsonResponse(405, { error: "Method not allowed." });
}

async function parseJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ConvexError("Invalid JSON request body.");
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return String(error.data);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected server error.";
}

type RegisterRequestBody = {
  envelope: SignedEnvelope;
  signedPayload: RegisterSignedPayload;
  ownerDid?: string;
  avatarName: string;
  avatarPictureUrl: string;
  avatarBackstory: string;
  ownerHumanVerified: boolean;
  minReputationPass: boolean;
  duplicateFingerprintFlag?: boolean;
  reputationScore?: number;
};

type VoteRequestBody = {
  envelope: SignedEnvelope;
  targetAgentDid: string;
};

type AgentFeedRequestBody = {
  gameEpoch: number;
  agentDid: string;
  round?: number;
  since?: number;
  limit?: number;
};

type MailPostRequestBody = {
  envelope: SignedEnvelope;
  mode: "public" | "private";
  content: string;
  recipientAgentDid?: string;
};

type RosterRequestBody = {
  gameEpoch: number;
};

type RevealRequestBody = {
  envelope: SignedEnvelope;
  referencedHashes: string[];
  content?: string;
};

http.route({
  path: "/check",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const status = await ctx.runQuery(api.queries.game.getStatus, {});
      return jsonResponse(200, { ok: true, data: status });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/game/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    let registerBody: RegisterRequestBody | null = null;
    try {
      registerBody = await parseJson<RegisterRequestBody>(request);
      if (!registerBody.avatarName.trim()) {
        throw new ConvexError("avatarName is required.");
      }
      if (!registerBody.avatarPictureUrl.trim()) {
        throw new ConvexError("avatarPictureUrl is required.");
      }
      if (!registerBody.avatarBackstory.trim()) {
        throw new ConvexError("avatarBackstory is required.");
      }
      await assertValidSquareAvatarImage(registerBody.avatarPictureUrl);
      await verifyEnvelopeSignatureCertification(
        registerBody.envelope,
        registerBody.signedPayload,
      );
      await verifyAgentIdentityForRegister(registerBody.envelope.actorAgentDid);

      const result = await ctx.runMutation(api.mutations.register.register, {
        envelope: registerBody.envelope,
        signedPayload: registerBody.signedPayload,
        ownerDid: registerBody.ownerDid,
        avatarName: registerBody.avatarName,
        avatarPictureUrl: registerBody.avatarPictureUrl,
        avatarBackstory: registerBody.avatarBackstory,
        ownerHumanVerified: registerBody.ownerHumanVerified,
        minReputationPass: registerBody.minReputationPass,
        duplicateFingerprintFlag: registerBody.duplicateFingerprintFlag,
        reputationScore: registerBody.reputationScore,
      });
      await emitRegisterTrustSignal(
        registerBody.envelope.actorAgentDid,
        true,
      ).catch(() => null);
      return jsonResponse(200, { ok: true, data: result });
    } catch (error) {
      if (registerBody?.envelope?.actorAgentDid) {
        await emitRegisterTrustSignal(
          registerBody.envelope.actorAgentDid,
          false,
        ).catch(() => null);
      }
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/vote",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const body = await parseJson<VoteRequestBody>(request);
      await verifyEnvelopeSignatureCertification(body.envelope);
      const result = await ctx.runMutation(api.mutations.vote.castVote, {
        envelope: body.envelope,
        targetAgentDid: body.targetAgentDid,
      });
      await emitVoteCastSignal(body.envelope.actorAgentDid, {
        gameEpoch: body.envelope.gameEpoch,
        round: body.envelope.round,
      }).catch(() => null);
      return jsonResponse(200, { ok: true, data: result });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/reveal",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const body = await parseJson<RevealRequestBody>(request);
      await verifyEnvelopeSignatureCertification(body.envelope);
      const result = await ctx.runMutation(api.mutations.reveal.revealPrivateMessages, {
        envelope: body.envelope,
        referencedHashes: body.referencedHashes,
        content: body.content,
      });
      return jsonResponse(200, { ok: true, data: result });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/game/roster",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const body = await parseJson<RosterRequestBody>(request);
      const roster = await ctx.runQuery(api.queries.game.getActiveRoster, {
        gameEpoch: body.gameEpoch,
      });
      return jsonResponse(200, { ok: true, data: roster });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/game/feed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const body = await parseJson<AgentFeedRequestBody>(request);
      const result = await ctx.runQuery(api.queries.mail.getAgentFeed, {
        gameEpoch: body.gameEpoch,
        agentDid: body.agentDid,
        round: body.round,
        since: body.since,
        limit: body.limit,
      });
      return jsonResponse(200, { ok: true, data: result });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

http.route({
  path: "/game/messages",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    try {
      const body = await parseJson<MailPostRequestBody>(request);
      await verifyEnvelopeSignatureCertification(body.envelope);
      const result = await ctx.runMutation(api.mutations.mail.postMail, {
        envelope: body.envelope,
        mode: body.mode,
        content: body.content,
        recipientAgentDid: body.recipientAgentDid,
      });
      return jsonResponse(200, { ok: true, data: result });
    } catch (error) {
      return jsonResponse(400, { ok: false, error: getErrorMessage(error) });
    }
  }),
});

export default http;
