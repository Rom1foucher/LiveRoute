import assert from "node:assert/strict";
import test from "node:test";
import type { Balance, SongTarget } from "../src/live-model.ts";
import {
  enumeratePageActions,
  pageActionKey,
} from "../src/solver/page-actions.ts";

const balance = (partial: Partial<Balance> = {}): Balance => ({
  dance: 0,
  passion: 0,
  vocal: 0,
  visual: 0,
  mental: 0,
  ...partial,
});

const song = (id: string, cost: Partial<Balance>): SongTarget => ({
  id,
  name: id,
  cost: balance(cost),
  priority: false,
  utility: 1,
});

test("PR-1 : toute song visible payable expose mécaniquement BUY_STOP", () => {
  const visible = song("payable", { dance: 21 });
  const actions = enumeratePageActions({
    tokens: balance({ dance: 21 }),
    visibleSongs: [visible],
    timingMode: "section-open",
    concertIndex: 2,
  });
  assert.ok(
    actions.some((action) => pageActionKey(action) === "buy-stop:payable"),
  );
});

test("PR-1 : le carry est une seule action qui conserve les trois IDs", () => {
  const visibleSongs = [
    song("c", { dance: 21 }),
    song("a", { passion: 21 }),
    song("b", { vocal: 21 }),
  ];
  const actions = enumeratePageActions({
    tokens: balance(),
    visibleSongs,
    timingMode: "deadline-now",
    concertIndex: 2,
  });
  const carries = actions.filter(
    (action) => action.kind === "carry-current-page",
  );
  assert.equal(carries.length, 1);
  assert.deepEqual(carries[0], {
    kind: "carry-current-page",
    songIds: ["a", "b", "c"],
  });
});

test("PR-1 : STOP_NO_PAGE n'existe que sans page exposée", () => {
  const empty = enumeratePageActions({
    tokens: balance(),
    visibleSongs: [],
    timingMode: "deadline-now",
    concertIndex: 2,
  });
  assert.deepEqual(empty, [{ kind: "stop-no-page" }]);

  const exposed = enumeratePageActions({
    tokens: balance(),
    visibleSongs: [song("blocked", { dance: 21 })],
    timingMode: "deadline-now",
    concertIndex: 2,
  });
  assert.equal(
    exposed.some((action) => action.kind === "stop-no-page"),
    false,
  );
});
