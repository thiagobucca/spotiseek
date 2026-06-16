/** Normalização para matching/dedupe: lowercase, sem acento, sem feat./ruído. */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(feat\.?[^)]*\)|\bfeat\.?\b.*$/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Coeficiente de Dice (bigramas) — similaridade de strings 0..1, sem dependências. */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [bg, ca] of A) {
    const cb = B.get(bg);
    if (cb) inter += Math.min(ca, cb);
  }
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}
