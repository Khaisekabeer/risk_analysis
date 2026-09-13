/**
 * 0/1 knapsack over remediation actions, quantised to ₹1,000 units.
 *
 * Mirrors src/investment_optimizer.py on the `development` branch, which
 * solves the same selection with PuLP. Running it client-side keeps the
 * budget slider instant; the server result is authoritative once wired.
 */
export function solveKnapsack(items, budget) {
  const unit = 1000
  const cap = Math.max(0, Math.floor(budget / unit))
  const costs = items.map((i) => Math.floor(i.cost / unit))
  const dp = Array.from({ length: items.length + 1 }, () => new Array(cap + 1).fill(0))

  for (let i = 1; i <= items.length; i++) {
    const c = costs[i - 1]
    const v = items[i - 1].reduction
    for (let b = 0; b <= cap; b++) {
      dp[i][b] = dp[i - 1][b]
      if (c <= b) dp[i][b] = Math.max(dp[i][b], dp[i - 1][b - c] + v)
    }
  }

  const chosen = new Set()
  let b = cap
  for (let i = items.length; i > 0; i--) {
    if (dp[i][b] !== dp[i - 1][b]) {
      chosen.add(items[i - 1].id)
      b -= costs[i - 1]
    }
  }

  const allocated = items.filter((i) => chosen.has(i.id)).reduce((s, i) => s + i.cost, 0)
  const remaining = items.filter((i) => !chosen.has(i.id))
  return {
    chosen,
    total: dp[items.length][cap],
    allocated,
    unspent: budget - allocated,
    cheapestRemaining: remaining.length
      ? remaining.reduce((m, i) => Math.min(m, i.cost), Infinity)
      : null,
  }
}
