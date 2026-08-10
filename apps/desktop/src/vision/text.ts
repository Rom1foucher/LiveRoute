export const normalizeText = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const levenshtein = (left: string, right: string): number => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array<number>(right.length + 1);
  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column];
    }
  }
  return previous[right.length];
};

export const textSimilarity = (left: string, right: string): number => {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  const edit =
    1 -
    levenshtein(normalizedLeft, normalizedRight) /
      Math.max(normalizedLeft.length, normalizedRight.length);
  const leftTokens = new Set(normalizedLeft.split(" "));
  const rightTokens = new Set(normalizedRight.split(" "));
  const intersection = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token),
  ).length;
  const tokenScore =
    intersection / Math.max(1, new Set([...leftTokens, ...rightTokens]).size);
  const contains =
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
      ? Math.min(normalizedLeft.length, normalizedRight.length) /
        Math.max(normalizedLeft.length, normalizedRight.length)
      : 0;
  return Math.max(edit, tokenScore, contains * 0.98);
};
