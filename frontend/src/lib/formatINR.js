/**
 * Formats a numeric ₹ value using the Indian numbering convention
 * (lakhs/crores), e.g. formatINR(12345678) => "₹1,23,45,678"
 */
export function formatINR(value, { decimals = 0, compact = false } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'

  if (compact) {
    const abs = Math.abs(value)
    if (abs >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`
    if (abs >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`
    if (abs >= 1e3) return `₹${(value / 1e3).toFixed(1)} K`
  }

  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })
  return formatter.format(value)
}
