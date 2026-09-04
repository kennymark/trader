/**
 * Pure alert-rule evaluation, extracted from the old node-cron worker so the
 * Convex action stays thin and this stays unit-testable.
 */

export function inCooldown(lastTriggeredAt: number | null, cooldownMinutes: number) {
  if (!lastTriggeredAt) return false;
  return Date.now() - lastTriggeredAt < cooldownMinutes * 60_000;
}

export function evaluateRule(
  kind: string,
  threshold: number,
  price: number,
  basePrice: number | null,
): { triggered: boolean; message: string } {
  if (kind === "above") {
    return {
      triggered: price >= threshold,
      message: `${price.toFixed(2)} is at/above ${threshold}`,
    };
  }
  if (kind === "below") {
    return {
      triggered: price <= threshold,
      message: `${price.toFixed(2)} is at/below ${threshold}`,
    };
  }
  if (!basePrice || basePrice <= 0) {
    return { triggered: false, message: "No baseline price" };
  }
  const changePct = ((price - basePrice) / basePrice) * 100;
  if (kind === "pct_drop") {
    return {
      triggered: changePct <= -Math.abs(threshold),
      message: `${price.toFixed(2)} is ${changePct.toFixed(2)}% vs baseline ${basePrice.toFixed(2)} (drop threshold ${threshold}%)`,
    };
  }
  if (kind === "pct_rise") {
    return {
      triggered: changePct >= Math.abs(threshold),
      message: `${price.toFixed(2)} is ${changePct.toFixed(2)}% vs baseline ${basePrice.toFixed(2)} (rise threshold ${threshold}%)`,
    };
  }
  return { triggered: false, message: "Unknown rule kind" };
}
