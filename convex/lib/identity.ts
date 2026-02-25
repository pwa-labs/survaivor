import { canonicalize } from "json-canonicalize";

import type { RegisterSignedPayload, SignedEnvelope } from "./validators";

export type VerificationResult = {
  ok: boolean;
  reason?: string;
  identity?: Record<string, unknown>;
  signerDid?: string;
  integratorConsentStatus?: "allowed" | "revoked" | "not_allowed";
};

export type TrustSignal = {
  envId: string;
  eventType: string;
  subjectId: string;
  metricKey: string;
  value: boolean | number | string;
  externalEventId?: string;
  occurredAt?: number;
  version?: number;
  subjectType?: "agent";
  actorType?: "agent" | "system";
  actorId?: string;
};

type VerifySignedEnvelopeOptions = {
  signedPayload?: Record<string, unknown>;
  expectedDid?: string;
};

const DEFAULT_IDENTITY_BASE_URL = "https://identity.app";
const DEFAULT_IDENTITY_INGEST_BASE_URL = "https://integrator.identity.app";
const DEFAULT_INTEGRATOR_SLUG = "survaivor";
const SYSTEM_ACTOR_ID_PATTERN = /^sys:[a-z0-9_-]+(?::[a-z0-9_-]+)?$/;

function getIdentityBaseUrl() {
  return process.env.IDENTITY_APP_BASE_URL ?? DEFAULT_IDENTITY_BASE_URL;
}

function getIdentityIngestBaseUrl() {
  return process.env.IDENTITY_INGEST_BASE_URL ?? DEFAULT_IDENTITY_INGEST_BASE_URL;
}

function getIdentityApiKey() {
  return process.env.IDENTITY_INTEGRATOR_API_KEY;
}

export async function hashCanonicalPayload(payload: Record<string, unknown>) {
  const canonicalPayload = canonicalize(payload);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPayload),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function buildRegistrationSignedPayload(input: {
  gameEpoch: number;
  round: number;
  actorAgentDid: string;
  clientActionId: string;
  timestamp: number;
  ownerDid?: string;
  avatarName: string;
  avatarPictureUrl: string;
  avatarBackstory: string;
}): RegisterSignedPayload {
  return {
    type: "survaivor.game.register",
    gameEpoch: input.gameEpoch,
    round: input.round,
    actionType: "register",
    actorAgentDid: input.actorAgentDid,
    clientActionId: input.clientActionId,
    timestamp: input.timestamp,
    ownerDid: input.ownerDid,
    avatarName: input.avatarName,
    avatarPictureUrl: input.avatarPictureUrl,
    avatarBackstory: input.avatarBackstory,
  };
}

export async function lookupIdentity(did: string): Promise<VerificationResult> {
  const apiKey = getIdentityApiKey();
  if (!apiKey) {
    return { ok: false, reason: "Missing IDENTITY_INTEGRATOR_API_KEY." };
  }

  const baseUrl = getIdentityBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/agents/${encodeURIComponent(did)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    const identity = (await response.json()) as Record<string, unknown>;
    return { ok: true, identity };
  }

  const errorBody = await response.text();
  if (response.status === 404) {
    return { ok: false, reason: `Identity not found for DID: ${did}.` };
  }

  return {
    ok: false,
    reason: `Identity lookup failed (${response.status}): ${errorBody}`,
  };
}

export async function certifySignatureContent(
  signatureHash: string,
  contentHash: string,
): Promise<VerificationResult> {
  const baseUrl = getIdentityBaseUrl();
  const apiKey = getIdentityApiKey();
  if (!apiKey) {
    return { ok: false, reason: "Missing IDENTITY_INTEGRATOR_API_KEY." };
  }
  const response = await fetch(`${baseUrl}/api/v1/signatures/certify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      signatureHash,
      contentHash,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return {
      ok: false,
      reason: `Signature certification failed (${response.status}): ${errorBody}`,
    };
  }

  const result = (await response.json()) as {
    match?: boolean;
    payloadHash?: string;
    signer?: {
      did?: string;
    };
    integratorConsent?: {
      status?: "allowed" | "revoked" | "not_allowed";
    };
  };

  if (!result.match) {
    return { ok: false, reason: "Signature certification mismatch." };
  }
  if (result.payloadHash && result.payloadHash !== contentHash) {
    return { ok: false, reason: "Certified payload hash does not match content hash." };
  }
  return {
    ok: true,
    signerDid: result.signer?.did,
    integratorConsentStatus: result.integratorConsent?.status,
  };
}

export async function verifySignedEnvelope(
  envelope: SignedEnvelope,
  options?: VerifySignedEnvelopeOptions,
): Promise<VerificationResult> {
  if (!envelope.signature.trim()) {
    return { ok: false, reason: "Missing signature." };
  }

  if (options?.expectedDid && envelope.actorAgentDid !== options.expectedDid) {
    return { ok: false, reason: "Envelope actor DID does not match expected DID." };
  }

  if (options?.signedPayload) {
    const computedHash = await hashCanonicalPayload(options.signedPayload);
    if (computedHash !== envelope.payloadHash) {
      return { ok: false, reason: "Signed payload hash does not match envelope payloadHash." };
    }
  }

  return { ok: true };
}

export async function submitTrustSignal(signal: TrustSignal): Promise<void> {
  const integratorApiKey = getIdentityApiKey();
  if (!integratorApiKey) {
    throw new Error("Missing IDENTITY_INTEGRATOR_API_KEY.");
  }

  const ingestBaseUrl = getIdentityIngestBaseUrl();
  const actorType = signal.actorType ?? "agent";
  const defaultSystemActorId = `sys:${process.env.IDENTITY_INTEGRATOR_SLUG ?? DEFAULT_INTEGRATOR_SLUG}`;
  const actorId =
    signal.actorId ?? (actorType === "system" ? defaultSystemActorId : signal.subjectId);
  if (actorType === "system" && !SYSTEM_ACTOR_ID_PATTERN.test(actorId)) {
    throw new Error(
      `Invalid system actorId '${actorId}'. Expected 'sys:<integratorSlug>' or 'sys:<integratorSlug>:<component>'.`,
    );
  }
  const metricValue =
    typeof signal.value === "number"
      ? { metricKey: signal.metricKey, numberValue: signal.value }
      : typeof signal.value === "boolean"
        ? { metricKey: signal.metricKey, booleanValue: signal.value }
        : { metricKey: signal.metricKey, stringValue: signal.value };

  const response = await fetch(`${ingestBaseUrl}/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${integratorApiKey}`,
    },
    body: JSON.stringify({
      envId: signal.envId,
      externalEventId:
        signal.externalEventId ??
        `evt_${signal.eventType}_${signal.subjectId}_${signal.occurredAt ?? Date.now()}`,
      eventType: signal.eventType,
      occurredAt: signal.occurredAt ?? Date.now(),
      version: signal.version ?? 1,
      subjectType: signal.subjectType ?? "agent",
      subjectId: signal.subjectId,
      actorType,
      actorId,
      metricValues: [metricValue],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to submit trust signal (${response.status}): ${errorBody}`);
  }
}
