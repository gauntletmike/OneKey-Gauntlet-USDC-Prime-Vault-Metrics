// Keep on-chain amounts as integer strings until the presentation boundary.
export function units(raw, decimals = 6) {
  if (raw == null) return null;
  const n = BigInt(raw), scale = 10n ** BigInt(decimals);
  return Number(n / scale) + Number(n % scale) / Number(scale);
}
export function fraction(numerator, denominator) {
  if (numerator == null || denominator == null || BigInt(denominator) <= 0n) return null;
  return Number(BigInt(numerator) * 10n ** 12n / BigInt(denominator)) / 1e12;
}
export function lookThrough(allocated, childTotal, position) {
  if (allocated == null || childTotal == null || position == null || BigInt(childTotal) <= 0n) return null;
  return (BigInt(allocated) * BigInt(position) / BigInt(childTotal)).toString();
}
export function normalizeSeries(points, transform = Number) {
  return (points || []).filter(p => p.y != null && Number.isFinite(Number(p.y))).map(p => ({ x: Number(p.x), y: transform(p.y) })).filter(p => Number.isFinite(p.y)).sort((a,b) => a.x - b.x);
}
