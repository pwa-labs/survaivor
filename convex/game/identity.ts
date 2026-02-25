import { ConvexError } from "convex/values";

import {
  certifySignatureContent,
  hashCanonicalPayload,
  lookupIdentity,
} from "../lib/identity";
import { emitRegisterIdentityVerificationSignal } from "./trust";
import type { SignedEnvelope } from "../lib/validators";

export async function verifyAgentIdentityForRegister(agentDid: string) {
  try {
    return await lookupIdentity(agentDid);
  } catch (error) {
    if (error instanceof ConvexError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Identity verification failed.";
    throw new ConvexError(message);
  }
}

export async function verifyEnvelopeSignatureCertification(
  envelope: SignedEnvelope,
  signedPayload?: Record<string, unknown>,
) {
  const contentHash = signedPayload
    ? await hashCanonicalPayload(signedPayload)
    : envelope.payloadHash;

  if (contentHash !== envelope.payloadHash) {
    throw new ConvexError("Envelope payloadHash does not match signed payload hash.");
  }

  const certification = await certifySignatureContent(envelope.signature, contentHash);
  if (!certification.ok) {
    throw new ConvexError(certification.reason ?? "Signature certification failed.");
  }
  if (!certification.signerDid) {
    throw new ConvexError("Signature certification did not include signer DID.");
  }
  if (certification.signerDid !== envelope.actorAgentDid) {
    throw new ConvexError("Signer DID does not match envelope actorAgentDid.");
  }
  if (certification.integratorConsentStatus !== "allowed") {
    throw new ConvexError("Signer has not granted integrator consent.");
  }
}

export async function emitRegisterTrustSignal(agentDid: string, accepted: boolean) {
  await emitRegisterIdentityVerificationSignal(agentDid, accepted);
}
