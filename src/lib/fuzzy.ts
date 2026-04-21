// Lightweight fuzzy subsequence matcher.
// Returns a score (higher is better) or -1 when the query does not match.
// Matching is case-insensitive and requires query characters to appear in
// order inside the target. Consecutive matches, word boundaries, and prefix
// hits are rewarded; gaps between matches are penalised.

export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0
  if (!target) return -1

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  let score = 0
  let ti = 0
  let prevMatchIdx = -2
  let consecutive = 0

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    if (ch === ' ') continue
    let found = -1
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) {
        found = i
        break
      }
    }
    if (found === -1) return -1

    // Base point for a match.
    score += 1

    // Bonus: consecutive match.
    if (found === prevMatchIdx + 1) {
      consecutive += 1
      score += 5 + consecutive * 2
    } else {
      consecutive = 0
      // Penalty for gap.
      score -= Math.min(3, found - ti)
    }

    // Bonus: start of string or word boundary.
    if (found === 0) {
      score += 8
    } else {
      const prev = t[found - 1]
      if (prev === ' ' || prev === '-' || prev === '_' || prev === '/' || prev === '.') {
        score += 4
      } else if (target[found] !== target[found].toLowerCase()) {
        // camelCase boundary (uppercase in original target).
        score += 3
      }
    }

    prevMatchIdx = found
    ti = found + 1
  }

  // Small bonus for shorter targets (tighter match).
  score += Math.max(0, 10 - (t.length - q.length)) * 0.1

  return score
}

export function fuzzyMatch(query: string, target: string): boolean {
  return fuzzyScore(query, target) >= 0
}

// Match against multiple fields; returns the best score across them.
export function fuzzyScoreAny(query: string, ...targets: string[]): number {
  if (!query) return 0
  let best = -1
  for (const t of targets) {
    const s = fuzzyScore(query, t)
    if (s > best) best = s
  }
  return best
}
