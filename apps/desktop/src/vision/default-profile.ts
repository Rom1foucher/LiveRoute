// Generated from the canonical snapshot-only OCR profile.
// Keep public/vision-profile.json structurally identical through the profile coherence test.
export const RAW_DEFAULT_VISION_PROFILE = {
  schemaVersion: 5,
  id: "global-steam-snapshot-2048-reference",
  name: "Global Steam — snapshots Lessons 2048×1152",
  windowTitlePattern: "umamusume|pretty derby",
  capture: {
    hotkey: "CommandOrControl+Shift+Space",
  },
  ocr: {
    scale: 2.4,
    minWordConfidence: 32,
    minTokenConfidence: 0.58,
    minTechniqueConfidence: 0.54,
    minSongConfidence: 0.58,
    maxTokenValue: 400,
    threshold: "auto",
    invert: "auto",
  },
  automation: {
    overlayEnabled: true,
  },
  overlayGeometry: {
    offsetX: 0,
    offsetY: 0,
    widthDelta: 0,
    heightDelta: 0,
  },
  palette: {
    dance: ["#38aeea", "#287ed3"],
    passion: ["#f3a139", "#e66d2d"],
    vocal: ["#ec668e", "#d84270"],
    visual: ["#9e6be8", "#7548c7"],
    mental: ["#69be5c", "#3a9851"],
  },
  regions: {
    tokens: {
      dance: {
        x: 0.178,
        y: 0.071,
        width: 0.027,
        height: 0.044,
      },
      passion: {
        x: 0.232,
        y: 0.071,
        width: 0.027,
        height: 0.044,
      },
      vocal: {
        x: 0.286,
        y: 0.071,
        width: 0.027,
        height: 0.044,
      },
      visual: {
        x: 0.339,
        y: 0.071,
        width: 0.027,
        height: 0.044,
      },
      mental: {
        x: 0.393,
        y: 0.071,
        width: 0.027,
        height: 0.044,
      },
    },
    techniques: [
      {
        card: {
          x: 0.14,
          y: 0.176,
          width: 0.296,
          height: 0.199,
        },
        text: {
          x: 0.22,
          y: 0.218,
          width: 0.207,
          height: 0.105,
        },
        costSlots: [
          {
            rect: {
              x: 0.239,
              y: 0.33199999999999996,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "dance",
          },
          {
            rect: {
              x: 0.281,
              y: 0.33199999999999996,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "passion",
          },
          {
            rect: {
              x: 0.3225,
              y: 0.33199999999999996,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "vocal",
          },
          {
            rect: {
              x: 0.364,
              y: 0.33199999999999996,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "visual",
          },
          {
            rect: {
              x: 0.4055,
              y: 0.33199999999999996,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "mental",
          },
        ],
      },
      {
        card: {
          x: 0.14,
          y: 0.389,
          width: 0.296,
          height: 0.199,
        },
        text: {
          x: 0.22,
          y: 0.431,
          width: 0.207,
          height: 0.105,
        },
        costSlots: [
          {
            rect: {
              x: 0.239,
              y: 0.545,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "dance",
          },
          {
            rect: {
              x: 0.281,
              y: 0.545,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "passion",
          },
          {
            rect: {
              x: 0.3225,
              y: 0.545,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "vocal",
          },
          {
            rect: {
              x: 0.364,
              y: 0.545,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "visual",
          },
          {
            rect: {
              x: 0.4055,
              y: 0.545,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "mental",
          },
        ],
      },
      {
        card: {
          x: 0.14,
          y: 0.602,
          width: 0.296,
          height: 0.199,
        },
        text: {
          x: 0.22,
          y: 0.644,
          width: 0.207,
          height: 0.105,
        },
        costSlots: [
          {
            rect: {
              x: 0.239,
              y: 0.758,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "dance",
          },
          {
            rect: {
              x: 0.281,
              y: 0.758,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "passion",
          },
          {
            rect: {
              x: 0.3225,
              y: 0.758,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "vocal",
          },
          {
            rect: {
              x: 0.364,
              y: 0.758,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "visual",
          },
          {
            rect: {
              x: 0.4055,
              y: 0.758,
              width: 0.021,
              height: 0.035,
            },
            fixedToken: "mental",
          },
        ],
      },
    ],
    songs: [
      {
        card: {
          x: 0.14,
          y: 0.176,
          width: 0.296,
          height: 0.199,
        },
        cover: {
          x: 0.155,
          y: 0.22799999999999998,
          width: 0.055,
          height: 0.099,
        },
        title: {
          x: 0.156,
          y: 0.182,
          width: 0.195,
          height: 0.033,
        },
      },
      {
        card: {
          x: 0.14,
          y: 0.389,
          width: 0.296,
          height: 0.199,
        },
        cover: {
          x: 0.155,
          y: 0.441,
          width: 0.055,
          height: 0.099,
        },
        title: {
          x: 0.156,
          y: 0.395,
          width: 0.195,
          height: 0.033,
        },
      },
      {
        card: {
          x: 0.14,
          y: 0.602,
          width: 0.296,
          height: 0.199,
        },
        cover: {
          x: 0.155,
          y: 0.654,
          width: 0.055,
          height: 0.099,
        },
        title: {
          x: 0.156,
          y: 0.608,
          width: 0.195,
          height: 0.033,
        },
      },
    ],
  },
  techniqueAliases: {
    mono: ["speed", "stamina", "power", "guts", "wit", "skill pts"],
    hint: ["hint", "skill hint", "hint level"],
    energy: ["energy", "recover energy", "energy recovery", "体力"],
  },
  songAliases: {},
  learnedSongHashes: {},
  numericFieldTuning: {},
} as const;
