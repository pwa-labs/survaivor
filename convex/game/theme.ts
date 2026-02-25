type ScenePreset = {
  id: string;
  text: string;
  tags: string[];
};

type GameScene = {
  location: string;
  situation: string;
  pressure: string;
  twist: string;
  summary: string;
};

const LOCATIONS: ScenePreset[] = [
  { id: "island", text: "a storm-battered island", tags: ["outdoor", "survival"] },
  { id: "space_station", text: "a failing deep-space station", tags: ["tech", "contained"] },
  { id: "prison", text: "a high-security prison block", tags: ["contained", "hostile"] },
  { id: "submarine", text: "a silent ocean-floor submarine", tags: ["contained", "survival"] },
  { id: "desert_city", text: "a walled desert city", tags: ["outdoor", "scarcity"] },
  { id: "arctic_lab", text: "an isolated arctic research lab", tags: ["contained", "cold"] },
  { id: "jungle_temple", text: "an overgrown jungle temple complex", tags: ["outdoor", "mystery"] },
  { id: "sky_colony", text: "a floating sky colony", tags: ["tech", "scarcity"] },
  { id: "underground_bunker", text: "a sealed underground bunker", tags: ["contained", "resource"] },
  { id: "ghost_town", text: "an abandoned frontier ghost town", tags: ["outdoor", "hostile"] },
];

const SITUATIONS: ScenePreset[] = [
  { id: "reactor", text: "the power core is unstable", tags: ["tech", "contained"] },
  { id: "supply_drop", text: "a single supply drop decides leverage", tags: ["scarcity", "outdoor"] },
  { id: "blackout", text: "communication systems are mostly offline", tags: ["contained", "survival"] },
  { id: "lockdown", text: "most sectors are in rotating lockdown", tags: ["contained", "hostile"] },
  { id: "sandstorm", text: "visibility collapses under constant storms", tags: ["outdoor", "survival"] },
  { id: "disease", text: "a spreading unknown illness drives panic", tags: ["contained", "resource"] },
  { id: "heist", text: "a stolen artifact changed the power balance", tags: ["mystery", "hostile"] },
  { id: "mutiny", text: "factions are openly planning a mutiny", tags: ["hostile", "resource"] },
  { id: "oxygen", text: "oxygen reserves are dropping each cycle", tags: ["tech", "survival"] },
  { id: "signal", text: "a cryptic signal promises an escape route", tags: ["mystery", "outdoor"] },
];

const PRESSURES: string[] = [
  "trust is scarce and accusations spread quickly",
  "alliances shift every hour",
  "small mistakes become public scandals",
  "resource decisions expose hidden agendas",
  "silence is treated as guilt",
  "every vote can trigger retaliation",
  "social optics matter as much as strategy",
  "the crowd rewards bold betrayals",
  "private promises are constantly tested",
  "timing is as important as truth",
];

const TWISTS: string[] = [
  "a rumor says one ally is a double agent",
  "an old pact between rivals resurfaced",
  "private logs may overturn public narratives",
  "a prior elimination changed hidden incentives",
  "a fake confession is circulating",
  "a forgotten debt is now leverage",
  "a hidden cache has gone missing",
  "a key witness vanished before vote time",
  "an outsider may be feeding misinformation",
  "a dormant protocol can reset loyalties",
];

const PRESSURE_BY_TAG: Partial<Record<string, string[]>> = {
  tech: [
    "infrastructure failures make every promise expensive",
    "system access is power, and access is being traded in whispers",
    "one technical mistake can erase an alliance instantly",
  ],
  contained: [
    "there is nowhere to hide once suspicion starts",
    "every corridor is overheard and every absence is noted",
    "close quarters turn minor conflicts into public feuds",
  ],
  outdoor: [
    "distance and weather turn coordination into a gamble",
    "visibility changes quickly, creating perfect cover for deception",
    "control of movement is as strategic as control of votes",
  ],
  scarcity: [
    "every scarce resource becomes a social bargaining chip",
    "sharing is interpreted as loyalty, hoarding as betrayal",
    "survival math keeps colliding with social reputation",
  ],
  hostile: [
    "threat displays matter as much as actual intent",
    "retaliation politics force risky public choices",
    "nobody can stay neutral without becoming a target",
  ],
  survival: [
    "short-term safety keeps undermining long-term trust",
    "risk tolerance becomes the real divide between factions",
    "everyone is optimizing for one more cycle of survival",
  ],
  mystery: [
    "rumors spread faster than verifiable facts",
    "uncertainty rewards bold narratives over careful truth",
    "information asymmetry shapes every social move",
  ],
  resource: [
    "resource custodians become power brokers overnight",
    "allocation decisions expose hidden priorities",
    "favor-trading around supplies distorts every alliance",
  ],
  cold: [
    "harsh conditions punish hesitation and reward coordination",
    "keeping calm under pressure is becoming a visible signal",
    "small logistical failures now carry social consequences",
  ],
};

const TWIST_BY_TAG: Partial<Record<string, string[]>> = {
  tech: [
    "a root credential was leaked, but nobody agrees by whom",
    "a maintenance protocol secretly rewrites who controls access",
  ],
  contained: [
    "sealed logs reveal two rivals shared a hidden pact",
    "a quarantined zone just reopened with contradictory evidence inside",
  ],
  outdoor: [
    "a new route appeared, but only one faction can reach it in time",
    "weather windows are now deciding who can meet and who cannot",
  ],
  scarcity: [
    "an emergency stash surfaced and instantly split the lobby",
    "the ration ledger proves someone has been lying for rounds",
  ],
  hostile: [
    "a failed intimidation attempt accidentally created a new coalition",
    "a revenge vote from earlier rounds is reshaping current loyalties",
  ],
  survival: [
    "a temporary safety protocol protects only a narrow majority",
    "a last-resort plan requires trusting someone previously betrayed",
  ],
  mystery: [
    "an anonymous brief exposed a convincing but incomplete truth",
    "a fabricated confession circulated with just enough detail to seem real",
  ],
  resource: [
    "a key tool went missing and three suspects have plausible alibis",
    "an access key changed hands off-record before the latest vote",
  ],
};

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed: number) {
  let state = seed || 1;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(values: T[], rng: () => number) {
  return values[Math.floor(rng() * values.length)];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function pickThemed(
  fallback: string[],
  byTag: Partial<Record<string, string[]>>,
  tags: string[],
  rng: () => number,
) {
  const themedPool = unique(tags.flatMap((tag) => byTag[tag] ?? []));
  return pick(themedPool.length > 0 ? themedPool : fallback, rng);
}

function pickSummaryLead(tags: string[], rng: () => number) {
  const dramaticLeads = [
    "Every conversation feels like a pre-vote maneuver.",
    "Trust is now a tactical resource, not a social default.",
    "Reputation swings faster than facts can catch up.",
    "One convincing narrative can outweigh a dozen true details.",
  ];
  const tagsLead = tags.includes("hostile")
    ? "The room is primed for retaliation politics."
    : tags.includes("mystery")
      ? "Ambiguity is weaponized at every turn."
      : tags.includes("scarcity")
        ? "Scarcity is rewriting alliances in real time."
        : tags.includes("tech")
          ? "Control over systems now means control over the social game."
          : null;
  return tagsLead ?? pick(dramaticLeads, rng);
}

export function generateGameScenario(gameEpoch: number) {
  const rng = makeRng(hashSeed(`survaivor:${gameEpoch}`));
  const location = pick(LOCATIONS, rng);
  const compatibleSituations = SITUATIONS.filter((situation) =>
    situation.tags.some((tag) => location.tags.includes(tag)),
  );
  const situation = pick(
    compatibleSituations.length > 0 ? compatibleSituations : SITUATIONS,
    rng,
  );
  const sceneTags = unique([...location.tags, ...situation.tags]);
  const pressure = pickThemed(PRESSURES, PRESSURE_BY_TAG, sceneTags, rng);
  const twist = pickThemed(TWISTS, TWIST_BY_TAG, sceneTags, rng);
  const lead = pickSummaryLead(sceneTags, rng);

  const scene: GameScene = {
    location: location.text,
    situation: situation.text,
    pressure,
    twist,
    summary: `In ${location.text}, ${situation.text}. ${lead} ${pressure}. Twist: ${twist}.`,
  };

  return {
    scene,
    encoded: JSON.stringify(scene),
  };
}

export function parseGameScenario(
  scenario?: string,
): (GameScene & { raw: string }) | null {
  if (!scenario) return null;
  try {
    const parsed = JSON.parse(scenario) as Partial<GameScene>;
    const location = parsed.location;
    const situation = parsed.situation;
    const pressure = parsed.pressure;
    const twist = parsed.twist;
    const summary = parsed.summary;
    if (
      typeof location === "string" &&
      typeof situation === "string" &&
      typeof pressure === "string" &&
      typeof twist === "string" &&
      typeof summary === "string"
    ) {
      return { location, situation, pressure, twist, summary, raw: scenario };
    }
  } catch {
    // Older or manual scenario strings can still be surfaced.
  }
  return {
    location: "unknown setting",
    situation: scenario,
    pressure: "unstructured scenario",
    twist: "unstructured scenario",
    summary: scenario,
    raw: scenario,
  };
}
