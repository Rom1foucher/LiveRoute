import { useLabels } from "../i18n/LanguageContext.tsx";
import { TOKEN_META } from "../constants.tsx";
import { TOKEN_KEYS, type TokenKey } from "@glcp/core";
import type { TokenReservePlan } from "@glcp/core";
import { SONGS } from "@glcp/core";

export function TokenInput({
  tokenKey,
  value,
  onChange,
  compact = false,
  maximum = 400,
}: {
  tokenKey: TokenKey;
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  maximum?: number;
}) {
  const L = useLabels();
  const meta = TOKEN_META[tokenKey];
  return (
    <label
      className={`token-input token-${meta.tone} ${compact ? "compact" : ""}`}
    >
      <span className="token-label">
        <img src={meta.icon} alt="" />
        <span>{compact ? meta.short : meta.label}</span>
      </span>
      <input
        type="number"
        min="0"
        max={maximum}
        inputMode="numeric"
        aria-label={`${compact ? L.token.costLabel : L.token.pointsLabel} ${meta.label}`}
        value={value}
        onChange={(event) =>
          onChange(
            Math.min(
              maximum,
              Math.max(0, Number.parseInt(event.target.value || "0", 10)),
            ),
          )
        }
      />
    </label>
  );
}

export function MiniTokenCost({
  tokenKey,
  value,
}: {
  tokenKey: TokenKey;
  value: number;
}) {
  if (value <= 0) return null;
  return (
    <span className={`mini-token token-${TOKEN_META[tokenKey].tone}`}>
      <img src={TOKEN_META[tokenKey].icon} alt="" />
      {value}
    </span>
  );
}

export function TokenReservePlanCard({
  plan,
  compact = false,
}: {
  plan: TokenReservePlan;
  compact?: boolean;
}) {
  const L = useLabels();
  // v0.24 replaced the old `alternative` mode with a feasibility scale:
  // `frontier` protects several vectors as a set, `single` protects one.
  const isFrontier = plan.mode === "frontier";

  return (
    <div className={`reserve-plan ${compact ? "compact" : ""}`}>
      <div className="reserve-plan-copy">
        <span>{L.token.repereExplicatif}</span>
        <strong>
          {plan.mode === "none"
            ? L.token.aucuneDemandeProche
            : isFrontier
              ? L.token.echelleDeCiblesFaisables(plan.targets.length)
              : L.token.referenceCost(plan.targets[0].name)}
        </strong>
        <small>
          {plan.mode === "none"
            ? L.token.laDecisionVectorielleNeDetecte
            : isFrontier
              ? L.token.cesVecteursSontProtegesEnsemble
              : L.token.affichePourExpliquerLaTension}
        </small>
      </div>

      {plan.targets.length > 0 && (
        <div className="reserve-targets">
          {plan.targets.map((target) => {
            const song = SONGS.find((candidate) => candidate.id === target.id);
            return (
              <div className="reserve-target" key={target.id}>
                <span>
                  <strong>{target.name}</strong>
                  <small>
                    {song?.priorityReason ??
                      song?.practiceBonus ??
                      (target.priority
                        ? L.token.priorityTarget
                        : L.token.bestRemainingTarget)}
                  </small>
                </span>
                <div>
                  {TOKEN_KEYS.map((key) => (
                    <MiniTokenCost
                      key={key}
                      tokenKey={key}
                      value={target.cost[key]}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
