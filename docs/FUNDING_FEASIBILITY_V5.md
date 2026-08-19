# Funding feasibility — v5 P1′

P1′ separates a physical game rule from a zero-income projection. It does not
change solver utility or ranking policy; those migrations start at P3a.

## Observed state

For a concrete song cost and the wallet currently observed by the solver:

- `physicalAffordable` is the hard game rule `wallet[c] >= cost[c]` for every
  token colour;
- `immediateFundingGap[c] = max(0, cost[c] - wallet[c])` is exact;
- `weightedFundingGap` prices that exact gap with the common token shadow
  prices for the decision. Shadow prices remain cardinal weights inside token
  space, not an exchange rate to stats or skill points.

A deficit never makes a purchase legal. Conversely, a current deficit is not
evidence that the song cannot appear or that future training income is zero.

## Zero-income projection

Future technique offers have stochastic token costs even when future training
income is fixed to zero. For each song, the solver therefore retains a
per-colour empirical `zeroIncomeFundingGap` distribution over trials that
physically reach the next song page.

`zeroIncomeFundabilityProbability` is conditional on that page being reached.
It is `null` when the conditioning event is unavailable, rather than silently
turning unknown into `0`.

The distribution is deliberately not collapsed into one scalar. A dual offer
can shift the deficit from one token colour to another while keeping a similar
total cost, and those states are mechanically different.

## Legacy compatibility

`goalProbability`, `affordProbability`, and
`targetAffordableProbabilityGivenAppearance` remain for current UI/log
compatibility. P1′ adds the explicit fields beside them. P3a will move these
mechanical quantities into the common `HorizonOutcome` representation while
reproducing the legacy decision vector exactly.
