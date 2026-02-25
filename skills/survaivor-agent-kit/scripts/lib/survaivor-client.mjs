import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const DEFAULT_SURVAIVOR_BASE_URL = "https://arena.survaivor.app";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eqIdx = token.indexOf("=");
    if (eqIdx >= 0) {
      args[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(value, label) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required value: ${label}`);
  }
  return value;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",");
  return `{${body}}`;
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function extractSignatureHash(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.signatureHash === "string") return value.signatureHash;
  if (typeof value.hash === "string") return value.hash;
  if (typeof value.id === "string") return value.id;
  if (value.data && typeof value.data === "object") return extractSignatureHash(value.data);
  return null;
}

function parseJsonFromCommandOutput(stdout, label) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`${label} returned empty output.`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // fallthrough
      }
    }
  }
  throw new Error(`${label} did not return valid JSON: ${trimmed}`);
}

function identityCliSharedArgs() {
  const args = [];
  if (process.env.IDENTITY_ALIAS) args.push("--as", process.env.IDENTITY_ALIAS);
  if (process.env.IDENTITY_HOME) args.push("--home", process.env.IDENTITY_HOME);
  if (process.env.IDENTITY_CREDENTIALS_PATH) {
    args.push("--credentials", process.env.IDENTITY_CREDENTIALS_PATH);
  }
  if (process.env.IDENTITY_APP_BASE_URL) args.push("--url", process.env.IDENTITY_APP_BASE_URL);
  return args;
}

function identityCliIdentityArgs() {
  const args = [];
  if (process.env.IDENTITY_ALIAS) args.push("--as", process.env.IDENTITY_ALIAS);
  if (process.env.IDENTITY_HOME) args.push("--home", process.env.IDENTITY_HOME);
  return args;
}

async function runIdentityCli(args, label) {
  return await new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "identityapp", ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${label} failed (exit ${code}): ${stderr.trim() || stdout.trim() || "unknown error"}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

async function callSurvaivor(path, body) {
  const baseUrl = process.env.SURVAIVOR_BASE_URL ?? DEFAULT_SURVAIVOR_BASE_URL;
  const result = await postJson(`${baseUrl}${path}`, body);
  if (!result.ok || !result.data?.ok) {
    throw new Error(`survAIvor ${path} failed (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return result.data.data;
}

async function resolveAgentDid() {
  const { stdout } = await runIdentityCli(
    ["identity", "show", ...identityCliIdentityArgs()],
    "identityapp identity show",
  );
  const identity = parseJsonFromCommandOutput(stdout, "identityapp identity show");
  const did =
    typeof identity?.did === "string"
      ? identity.did
      : typeof identity?.data?.did === "string"
        ? identity.data.did
        : null;
  if (!did) {
    throw new Error(
      "Could not resolve DID from identityapp. Configure identityapp default identity or IDENTITY_ALIAS.",
    );
  }
  return did;
}

async function signInIdentity({ payloadCanonical, note }) {
  const did = await resolveAgentDid();
  const args = ["sign", payloadCanonical, ...identityCliSharedArgs()];
  if (note) args.push("--note", note);
  const { stdout } = await runIdentityCli(args, "identityapp sign");
  const result = parseJsonFromCommandOutput(stdout, "identityapp sign");
  const signatureHash = extractSignatureHash(result);
  if (!signatureHash) {
    throw new Error(
      `identityapp sign response missing signature hash: ${JSON.stringify(result)}`,
    );
  }
  return { did, signatureHash };
}

async function ensureIntegratorConsent({
  integratorSlug = process.env.INTEGRATOR_SLUG ?? "survaivor",
} = {}) {
  const args = [
    "integrator",
    "consent",
    "allow",
    "--integrator",
    integratorSlug,
    ...identityCliSharedArgs(),
  ];
  const { stdout } = await runIdentityCli(args, "identityapp integrator consent allow");
  return parseJsonFromCommandOutput(stdout, "identityapp integrator consent allow");
}

function buildEnvelope({ actionType, gameEpoch, round, actorAgentDid, payloadHash, signatureHash }) {
  const clientActionId = `${actionType}-${randomUUID()}`;
  return {
    gameEpoch,
    round,
    actionType,
    actorAgentDid,
    payloadHash,
    timestamp: Date.now(),
    clientActionId,
    nonce: clientActionId,
    signature: signatureHash,
  };
}

async function buildSignedEnvelope({ actionType, gameEpoch, round, payloadForHash, note }) {
  const payloadCanonical = stableStringify(payloadForHash);
  const payloadHash = sha256Hex(payloadCanonical);
  const { did, signatureHash } = await signInIdentity({
    payloadCanonical,
    note,
  });
  return {
    envelope: buildEnvelope({
      actionType,
      gameEpoch,
      round,
      actorAgentDid: did,
      payloadHash,
      signatureHash,
    }),
    payloadHash,
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export {
  buildSignedEnvelope,
  callSurvaivor,
  ensureIntegratorConsent,
  resolveAgentDid,
  parseArgs,
  parseBoolean,
  parseNumber,
  printJson,
  required,
};
