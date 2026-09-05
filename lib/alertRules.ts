/**
 * Pure alert-rule evaluation, extracted from the old node-cron worker so the
 * Convex action stays thin and this stays unit-testable.
 */

export function evaluateRule(
  kind: string,
  threshold: number,
  price: number,
  basePrice: number | null,
): { triggered: boolean; message: string } {
  const at = price.toFixed(2);
  if (kind === "above") {
    return {
      triggered: price >= threshold,
      message: `at ${at}, above your ${threshold} level`,
    };
  }
  if (kind === "below") {
    return {
      triggered: price <= threshold,
      message: `at ${at}, below your ${threshold} level`,
    };
  }
  if (!basePrice || basePrice <= 0) {
    return { triggered: false, message: "No baseline price" };
  }
  const changePct = ((price - basePrice) / basePrice) * 100;
  const move = `${Math.abs(changePct).toFixed(1)}% from ${basePrice.toFixed(2)} to ${at}`;
  if (kind === "pct_drop") {
    return {
      triggered: changePct <= -Math.abs(threshold),
      message: `down ${move} — past your ${Math.abs(threshold)}% drop threshold`,
    };
  }
  if (kind === "pct_rise") {
    return {
      triggered: changePct >= Math.abs(threshold),
      message: `up ${move} — past your ${Math.abs(threshold)}% rise threshold`,
    };
  }
  return { triggered: false, message: "Unknown rule kind" };
}
