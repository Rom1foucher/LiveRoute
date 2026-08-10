export type SongRole =
  | "sp2-target"
  | "sp3-target"
  | "friendship-10"
  | "friendship-5"
  | "specialty-priority"
  | "negligible-training-stat"
  | "negligible-flat-stat"
  | "filler";

export type SongRoleInput = {
  practiceBonus: string;
  liveBonusType: "friendship" | "speciality" | "event";
  liveBonusValue: number;
};

/**
 * Roles describe where a datum belongs in the decision hierarchy. They are
 * intentionally not converted into a common "stat score".
 */
export const classifySongRoles = ({
  practiceBonus,
  liveBonusType,
  liveBonusValue,
}: SongRoleInput): SongRole[] => {
  const roles: SongRole[] = [];
  if (/skill pts? training \+2/i.test(practiceBonus)) {
    roles.push("sp2-target");
  }
  if (/skill pts? training \+3/i.test(practiceBonus)) {
    roles.push("sp3-target");
  }
  if (liveBonusType === "friendship") {
    roles.push(liveBonusValue >= 10 ? "friendship-10" : "friendship-5");
  } else if (liveBonusType === "speciality") {
    roles.push("specialty-priority");
  }

  if (/^(speed|stamina|power|guts|wisdom) training \+/i.test(practiceBonus)) {
    roles.push("negligible-training-stat");
  } else if (/\+\d+/.test(practiceBonus) && roles.length === 0) {
    roles.push("negligible-flat-stat");
  }

  if (roles.length === 0) roles.push("filler");
  return roles;
};
