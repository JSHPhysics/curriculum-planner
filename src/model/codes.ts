export function generateTopicCode(existingCodes: readonly string[]): string {
  const used = new Set(existingCodes);
  let n = 1;
  while (used.has(`T${n}`)) n++;
  return `T${n}`;
}

export function generateSubTopicCode(
  topicCode: string,
  existingSubTopicCodes: readonly string[]
): string {
  const used = new Set(existingSubTopicCodes);
  let n = 0;
  while (used.has(`${topicCode}${indexToLetters(n)}`)) n++;
  return `${topicCode}${indexToLetters(n)}`;
}

function indexToLetters(n: number): string {
  let result = "";
  let remaining = n;
  while (remaining >= 0) {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return result;
}
