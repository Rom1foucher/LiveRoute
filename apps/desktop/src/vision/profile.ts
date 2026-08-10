import { TOKEN_KEYS } from "@glcp/core";
import type { TokenKey } from "@glcp/core";
import { RAW_DEFAULT_VISION_PROFILE } from "./default-profile.ts";
import type {
  CostSlotProfile,
  NormalizedRect,
  SongCardProfile,
  TechniqueCardProfile,
  NumericFieldTuning,
  VisionProfile,
} from "./types.ts";

export const VISION_PROFILE_STORAGE_KEY = "gl-vision-profile-v1";
export const VISION_WINDOW_STORAGE_KEY = "gl-vision-window-v1";

export const DEFAULT_VISION_PROFILE = JSON.parse(
  JSON.stringify(RAW_DEFAULT_VISION_PROFILE),
) as VisionProfile;

export const cloneVisionProfile = (profile: VisionProfile): VisionProfile =>
  JSON.parse(JSON.stringify(profile)) as VisionProfile;

const finite = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const normalizeRect = (
  value: Partial<NormalizedRect> | undefined,
  fallback: NormalizedRect,
): NormalizedRect => {
  const x = clamp(finite(value?.x, fallback.x), 0, 1);
  const y = clamp(finite(value?.y, fallback.y), 0, 1);
  return {
    x,
    y,
    width: clamp(finite(value?.width, fallback.width), 0, 1 - x),
    height: clamp(finite(value?.height, fallback.height), 0, 1 - y),
  };
};

const normalizeCostSlot = (
  value: Partial<CostSlotProfile> | undefined,
  fallback: CostSlotProfile,
): CostSlotProfile => ({
  rect: normalizeRect(value?.rect, fallback.rect),
  fixedToken: TOKEN_KEYS.includes(value?.fixedToken as TokenKey)
    ? (value?.fixedToken as TokenKey)
    : fallback.fixedToken,
});

const strings = (value: unknown, fallback: readonly string[]): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [...fallback];

/**
 * Migrates both the old hybrid/automation profiles and the snapshot-only v3
 * shape. Removed fields are deliberately ignored instead of being kept alive
 * as misleading configuration switches.
 */
export const normalizeVisionProfile = (
  value: Partial<VisionProfile> | null | undefined,
): VisionProfile => {
  const fallback = DEFAULT_VISION_PROFILE;
  const next = cloneVisionProfile(fallback);
  if (!value || typeof value !== "object") return next;
  const sourceSchemaVersion = Math.round(finite(value.schemaVersion, 0));
  const hasLegacyNumericLearning =
    sourceSchemaVersion > 0 && sourceSchemaVersion < 5;

  next.schemaVersion = 5;
  next.id = typeof value.id === "string" ? value.id : fallback.id;
  next.name = typeof value.name === "string" ? value.name : fallback.name;
  next.windowTitlePattern =
    typeof value.windowTitlePattern === "string"
      ? value.windowTitlePattern
      : fallback.windowTitlePattern;
  next.capture.hotkey =
    typeof value.capture?.hotkey === "string" &&
    value.capture.hotkey.trim().length > 0
      ? value.capture.hotkey.trim()
      : fallback.capture.hotkey;

  next.ocr.scale = clamp(finite(value.ocr?.scale, fallback.ocr.scale), 1, 5);
  next.ocr.minWordConfidence = clamp(
    finite(value.ocr?.minWordConfidence, fallback.ocr.minWordConfidence),
    0,
    100,
  );
  next.ocr.minTokenConfidence = clamp(
    finite(value.ocr?.minTokenConfidence, fallback.ocr.minTokenConfidence),
    0,
    1,
  );
  next.ocr.minTechniqueConfidence = clamp(
    finite(
      value.ocr?.minTechniqueConfidence,
      fallback.ocr.minTechniqueConfidence,
    ),
    0,
    1,
  );
  next.ocr.minSongConfidence = clamp(
    finite(value.ocr?.minSongConfidence, fallback.ocr.minSongConfidence),
    0,
    1,
  );
  next.ocr.maxTokenValue = Math.round(
    clamp(
      finite(value.ocr?.maxTokenValue, fallback.ocr.maxTokenValue),
      20,
      999,
    ),
  );
  next.ocr.threshold = value.ocr?.threshold === "none" ? "none" : "auto";
  next.ocr.invert =
    value.ocr?.invert === "never" || value.ocr?.invert === "always"
      ? value.ocr.invert
      : "auto";

  next.automation.overlayEnabled =
    value.automation?.overlayEnabled ?? fallback.automation.overlayEnabled;
  next.overlayGeometry = {
    offsetX: Math.round(
      clamp(
        finite(
          value.overlayGeometry?.offsetX,
          fallback.overlayGeometry.offsetX,
        ),
        -300,
        300,
      ),
    ),
    offsetY: Math.round(
      clamp(
        finite(
          value.overlayGeometry?.offsetY,
          fallback.overlayGeometry.offsetY,
        ),
        -300,
        300,
      ),
    ),
    widthDelta: Math.round(
      clamp(
        finite(
          value.overlayGeometry?.widthDelta,
          fallback.overlayGeometry.widthDelta,
        ),
        -600,
        600,
      ),
    ),
    heightDelta: Math.round(
      clamp(
        finite(
          value.overlayGeometry?.heightDelta,
          fallback.overlayGeometry.heightDelta,
        ),
        -600,
        600,
      ),
    ),
  };

  for (const key of TOKEN_KEYS) {
    next.palette[key] = strings(value.palette?.[key], fallback.palette[key]);
    next.regions.tokens[key] = normalizeRect(
      value.regions?.tokens?.[key],
      fallback.regions.tokens[key],
    );
  }

  for (let index = 0; index < 3; index += 1) {
    const technique = value.regions?.techniques?.[index];
    const fallbackTechnique = fallback.regions.techniques[index];
    next.regions.techniques[index] = {
      card: normalizeRect(technique?.card, fallbackTechnique.card),
      text: normalizeRect(technique?.text, fallbackTechnique.text),
      costSlots: TOKEN_KEYS.map((_, costIndex) =>
        normalizeCostSlot(
          technique?.costSlots?.[costIndex],
          fallbackTechnique.costSlots[costIndex],
        ),
      ) as TechniqueCardProfile["costSlots"],
    };

    const song = value.regions?.songs?.[index];
    const fallbackSong = fallback.regions.songs[index];
    next.regions.songs[index] = {
      card: normalizeRect(song?.card, fallbackSong.card),
      cover: normalizeRect(song?.cover, fallbackSong.cover),
      title: normalizeRect(song?.title, fallbackSong.title),
    } as SongCardProfile;
  }

  for (const kind of ["mono", "hint", "energy"] as const) {
    next.techniqueAliases[kind] = strings(
      value.techniqueAliases?.[kind],
      fallback.techniqueAliases[kind],
    );
  }
  next.songAliases =
    value.songAliases && typeof value.songAliases === "object"
      ? Object.fromEntries(
          Object.entries(value.songAliases).map(([id, aliases]) => [
            id,
            strings(aliases, []),
          ]),
        )
      : {};
  next.learnedSongHashes =
    value.learnedSongHashes && typeof value.learnedSongHashes === "object"
      ? Object.fromEntries(
          Object.entries(value.learnedSongHashes).map(([id, hashes]) => [
            id,
            strings(hashes, []),
          ]),
        )
      : {};
  if (hasLegacyNumericLearning) {
    // v0.21 changed the actual field rectangle to the best crop found for one
    // confirmed value. The original logical zone cannot be reconstructed from
    // that profile. Reset only fields touched by that obsolete learner, rather
    // than silently carrying an 8-specific crop into the additive v5 model.
    for (const id of Object.keys(value.numericFieldTuning ?? {})) {
      if (id.startsWith("token.")) {
        const key = id.slice("token.".length) as TokenKey;
        if (TOKEN_KEYS.includes(key)) {
          next.regions.tokens[key] = { ...fallback.regions.tokens[key] };
        }
        continue;
      }
      const match = /^technique\.(\d+)\.cost\.(\d+)$/.exec(id);
      if (!match) continue;
      const slot = Number(match[1]);
      const costIndex = Number(match[2]);
      const fallbackRect =
        fallback.regions.techniques[slot]?.costSlots[costIndex]?.rect;
      if (fallbackRect && next.regions.techniques[slot]?.costSlots[costIndex]) {
        next.regions.techniques[slot].costSlots[costIndex].rect = {
          ...fallbackRect,
        };
      }
    }
    next.numericFieldTuning = {};
  } else {
    next.numericFieldTuning =
      value.numericFieldTuning && typeof value.numericFieldTuning === "object"
        ? Object.fromEntries(
            Object.entries(value.numericFieldTuning).flatMap(([id, tuning]) => {
              if (!tuning || typeof tuning !== "object") return [];
              const candidate = tuning as Partial<NumericFieldTuning>;
              const templateDigits = [
                "0",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
              ] as const;
              const templates = Object.fromEntries(
                templateDigits.flatMap((digit) => {
                  const values = candidate.templates?.[digit];
                  if (!Array.isArray(values)) return [];
                  const normalizedValues = values
                    .flatMap((template) => {
                      if (!template || typeof template !== "object") return [];
                      const bits =
                        typeof template.bits === "string"
                          ? template.bits.toLowerCase()
                          : "";
                      if (!/^[0-9a-f]{96}$/.test(bits)) return [];
                      return [
                        {
                          bits,
                          samples: Math.max(
                            1,
                            Math.round(finite(template.samples, 1)),
                          ),
                        },
                      ];
                    })
                    .slice(0, 6);
                  return normalizedValues.length > 0
                    ? [[digit, normalizedValues]]
                    : [];
                }),
              ) as NumericFieldTuning["templates"];
              const inkCandidate = candidate.ink;
              const ink =
                inkCandidate &&
                typeof inkCandidate === "object" &&
                Array.isArray(inkCandidate.rgb) &&
                inkCandidate.rgb.length === 3
                  ? {
                      rgb: inkCandidate.rgb.map((channel) =>
                        Math.round(clamp(finite(channel, 0), 0, 255)),
                      ) as [number, number, number],
                      tolerance: Math.round(
                        clamp(finite(inkCandidate.tolerance, 48), 16, 128),
                      ),
                    }
                  : null;
              const normalized: NumericFieldTuning = {
                threshold: candidate.threshold === "none" ? "none" : "auto",
                scale: clamp(finite(candidate.scale, 1), 1, 5),
                mode:
                  candidate.mode === "single-number"
                    ? "single-number"
                    : "number-line",
                verifiedSamples: Math.max(
                  1,
                  Math.round(finite(candidate.verifiedSamples, 1)),
                ),
                lastExpected: Math.max(
                  0,
                  Math.round(finite(candidate.lastExpected, 0)),
                ),
                lastConfidence: clamp(
                  finite(candidate.lastConfidence, 0),
                  0,
                  1,
                ),
                ink,
                templates,
              };
              return [[id, normalized]];
            }),
          )
        : {};
  }
  return next;
};

export const loadVisionProfile = async (): Promise<VisionProfile> => {
  const stored = window.localStorage.getItem(VISION_PROFILE_STORAGE_KEY);
  if (stored) {
    try {
      return normalizeVisionProfile(
        JSON.parse(stored) as Partial<VisionProfile>,
      );
    } catch {
      // Fall through to the editable project profile.
    }
  }
  try {
    const response = await fetch("/vision-profile.json", {
      cache: "no-store",
    });
    if (response.ok) {
      return normalizeVisionProfile(
        (await response.json()) as Partial<VisionProfile>,
      );
    }
  } catch {
    // Browser-only builds can still use the embedded starter.
  }
  return cloneVisionProfile(DEFAULT_VISION_PROFILE);
};

export const saveVisionProfile = (profile: VisionProfile): void => {
  window.localStorage.setItem(
    VISION_PROFILE_STORAGE_KEY,
    JSON.stringify(normalizeVisionProfile(profile)),
  );
};

export const CALIBRATION_GROUPS = ["Tokens", "Techniques", "Songs"] as const;

export type CalibrationGroup = (typeof CALIBRATION_GROUPS)[number];

export type CalibrationTarget = {
  id: string;
  label: string;
  group: CalibrationGroup;
  get: (profile: VisionProfile) => NormalizedRect;
  set: (profile: VisionProfile, value: NormalizedRect) => VisionProfile;
};

const withProfileRect = (
  profile: VisionProfile,
  mutate: (draft: VisionProfile) => void,
): VisionProfile => {
  const draft = cloneVisionProfile(profile);
  mutate(draft);
  return draft;
};

export const buildCalibrationTargets = (): CalibrationTarget[] => {
  const targets: CalibrationTarget[] = [];
  for (const key of TOKEN_KEYS) {
    targets.push({
      id: `token.${key}`,
      label: `Lessons · ${key}`,
      group: "Tokens",
      get: (profile) => profile.regions.tokens[key],
      set: (profile, value) =>
        withProfileRect(profile, (draft) => {
          draft.regions.tokens[key] = normalizeRect(value, value);
        }),
    });
  }

  for (let index = 0; index < 3; index += 1) {
    targets.push(
      {
        id: `technique.${index}.card`,
        label: `Technique ${index + 1} · carte`,
        group: "Techniques",
        get: (profile) => profile.regions.techniques[index].card,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.techniques[index].card = normalizeRect(value, value);
          }),
      },
      {
        id: `technique.${index}.text`,
        label: `Technique ${index + 1} · effets`,
        group: "Techniques",
        get: (profile) => profile.regions.techniques[index].text,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.techniques[index].text = normalizeRect(value, value);
          }),
      },
      ...TOKEN_KEYS.map((key, costIndex): CalibrationTarget => ({
        id: `technique.${index}.cost.${costIndex}`,
        label: `Technique ${index + 1} · coût ${key}`,
        group: "Techniques",
        get: (profile) =>
          profile.regions.techniques[index].costSlots[costIndex].rect,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.techniques[index].costSlots[costIndex].rect =
              normalizeRect(value, value);
          }),
      })),
      {
        id: `song.${index}.card`,
        label: `Song ${index + 1} · carte`,
        group: "Songs",
        get: (profile) => profile.regions.songs[index].card,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.songs[index].card = normalizeRect(value, value);
          }),
      },
      {
        id: `song.${index}.cover`,
        label: `Song ${index + 1} · pochette`,
        group: "Songs",
        get: (profile) => profile.regions.songs[index].cover,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.songs[index].cover = normalizeRect(value, value);
          }),
      },
      {
        id: `song.${index}.title`,
        label: `Song ${index + 1} · titre`,
        group: "Songs",
        get: (profile) => profile.regions.songs[index].title,
        set: (profile, value) =>
          withProfileRect(profile, (draft) => {
            draft.regions.songs[index].title = normalizeRect(value, value);
          }),
      },
    );
  }
  return targets;
};

export const rectToCss = (
  value: NormalizedRect,
): Record<"left" | "top" | "width" | "height", string> => ({
  left: `${value.x * 100}%`,
  top: `${value.y * 100}%`,
  width: `${value.width * 100}%`,
  height: `${value.height * 100}%`,
});
