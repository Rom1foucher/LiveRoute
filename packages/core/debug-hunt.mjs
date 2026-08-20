import { analyzeSongSelection } from "./src/solver/song-policy.ts";
import { createHuntState } from "./src/solver/hunt-state.ts";

const balance = (partial = {}) => ({
  dance: 0, passion: 0, vocal: 0, visual: 0, mental: 0, ...partial,
});
const song = (id, cost, roles = ["filler"]) => ({
  id, name: id, cost: balance(cost), roles,
  priority: (roles ?? []).some((r) => ["sp2-target","sp3-target","friendship-10","friendship-5"].includes(r)),
  utility: (roles ?? []).includes("sp2-target") || (roles ?? []).includes("sp3-target") ? 5 : 1,
  policyValue: (roles ?? []).includes("sp2-target") || (roles ?? []).includes("sp3-target") ? 500 : 0,
});
const rich = balance({ dance: 100, passion: 100, vocal: 100, visual: 100, mental: 100 });

const filler = song("filler-abandon", { dance: 21 }, ["filler"]);
const sp3 = { ...song("SP3-abandon", { dance: 21, vocal: 21, mental: 21 }, ["sp3-target"]), practiceBonus: "Skill Pt training +3" };

const result = analyzeSongSelection({
  period: "classic",
  tokens: rich,
  visibleSongs: [filler],
  remainingSongs: [filler, sp3],
  techniquesToNextSong: 5,
  songsThisSection: 2,
  totalSongs: 10,
  concertIndex: 2,
  timingMode: "section-open",
  nextSongCycle: 4,
  huntState: {
    ...createHuntState(["SP3-abandon"]),
    pagesSeenWithoutTarget: 3,
    lastObservedPageKey: "2:4",
  },
  trials: 300,
});

console.log("plan.mode", result.plan.mode);
console.log("recommended.action", result.recommended?.action);
const continuation = result.policies.find((p) => p.id === "filler-abandon:buy-continue");
console.log("continuation.huntDecision", continuation?.huntDecision);
