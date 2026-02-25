import { randomUUID } from "node:crypto";
import {
  buildSignedEnvelope,
  callSurvaivor,
  ensureIntegratorConsent,
  parseArgs,
  parseNumber,
  printJson,
  required,
  resolveAgentDid,
} from "./lib/survaivor-client.mjs";

const args = parseArgs(process.argv.slice(2));
const gameEpoch = parseNumber(args.gameEpoch, null);
required(gameEpoch, "--gameEpoch");

const actorAgentDid = await resolveAgentDid();
const ownerDid = args.ownerDid ?? process.env.OWNER_DID ?? actorAgentDid;
const avatarName = required(args.avatarName ?? process.env.AVATAR_NAME, "--avatarName or AVATAR_NAME");
const avatarPictureUrl = required(
  args.avatarPictureUrl ?? process.env.AVATAR_PICTURE_URL,
  "--avatarPictureUrl or AVATAR_PICTURE_URL",
);
const avatarBackstory = required(
  args.avatarBackstory ?? process.env.AVATAR_BACKSTORY,
  "--avatarBackstory or AVATAR_BACKSTORY",
);
const integratorSlug = args.integratorSlug ?? process.env.INTEGRATOR_SLUG ?? "survaivor";
const ensureConsent = parseBoolean(
  args.ensureConsent ?? process.env.ENSURE_INTEGRATOR_CONSENT,
  true,
);

let consent = null;
if (ensureConsent) {
  consent = await ensureIntegratorConsent({ integratorSlug });
}

const signedPayload = {
  type: "survaivor.game.register",
  gameEpoch,
  round: 0,
  actionType: "register",
  actorAgentDid,
  clientActionId: `register-${randomUUID()}`,
  timestamp: Date.now(),
  ownerDid,
  avatarName,
  avatarPictureUrl,
  avatarBackstory,
};

const { envelope } = await buildSignedEnvelope({
  actionType: "register",
  gameEpoch,
  round: 0,
  payloadForHash: signedPayload,
  note: "survaivor register",
});

const data = await callSurvaivor("/game/register", {
  envelope,
  signedPayload,
  ownerDid,
  avatarName,
  avatarPictureUrl,
  avatarBackstory,
});

printJson({
  ok: true,
  consent,
  data,
});
