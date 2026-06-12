// Live score overlay fetched directly by the browser from ESPN's public
// scoreboard JSON (no key, CORS-open). football-data.org's free tier proved
// hours stale on live status/scores (the WC opener never left TIMED and had
// null scores after full time), and the Actions cron that rebuilds
// matches.json gets throttled to multi-hour gaps, so the client overrides
// status/score/minute from ESPN on every poll.
import { canonicalTeam } from "@/data/aliases"
import type { Match } from "@/lib/scoring"

const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard"

// Don't trust an IN_PLAY override once the last successful ESPN fetch is this
// old — fall back to the base status (the time-window liveness in scoring.ts
// still covers the gap). FINISHED overrides are settled facts and never expire.
const IN_PLAY_TRUST_MS = 15 * 60_000

export interface LiveOverride {
  status: "IN_PLAY" | "FINISHED"
  homeScore: number | null
  awayScore: number | null
  minute?: string
}

export interface LiveOverlay {
  fetchedAt: number // 0 = never fetched successfully
  map: Map<string, LiveOverride>
}

export const emptyOverlay = (): LiveOverlay => ({ fetchedAt: 0, map: new Map() })

// match key both data sources agree on: UTC day + canonical team pair
const matchKey = (utcDate: string | undefined, home: string, away: string) =>
  `${(utcDate ?? "").slice(0, 10)}|${home}|${away}`

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "")

// Merges into `prev`: FINISHED overrides persist for the whole session even
// after their match leaves the query window (football-data can lag scores by
// hours, so dropping them would blank the leaderboard again). IN_PLAY entries
// only survive while ESPN still reports the match in play.
export async function fetchLiveOverrides(
  prev?: Map<string, LiveOverride>,
  now: Date = new Date()
): Promise<Map<string, LiveOverride>> {
  // 48h back: covers football-data's score lag; +24h forward for timezones
  const from = yyyymmdd(new Date(now.getTime() - 48 * 3600_000))
  const to = yyyymmdd(new Date(now.getTime() + 24 * 3600_000))
  const res = await fetch(`${SCOREBOARD}?dates=${from}-${to}&limit=100`)
  if (!res.ok) throw new Error(`espn scoreboard: HTTP ${res.status}`)
  const data = await res.json()

  const out = new Map<string, LiveOverride>()
  for (const [key, o] of prev ?? []) {
    if (o.status === "FINISHED") out.set(key, o)
  }
  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0]
    const type = event.status?.type
    const state = type?.state // "pre" | "in" | "post"
    if (!comp || (state !== "in" && state !== "post")) continue
    // "post" also covers postponed/canceled — only completed games are final
    if (state === "post" && type?.completed !== true) continue
    const home = comp.competitors?.find((c: any) => c.homeAway === "home")
    const away = comp.competitors?.find((c: any) => c.homeAway === "away")
    if (!home || !away) continue
    const num = (v: unknown) => {
      if (v == null || v === "") return null // Number(null/"") is 0, not NaN
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const key = matchKey(
      event.date,
      canonicalTeam(home.team?.displayName ?? ""),
      canonicalTeam(away.team?.displayName ?? "")
    )
    out.set(key, {
      status: state === "in" ? "IN_PLAY" : "FINISHED",
      homeScore: num(home.score),
      awayScore: num(away.score),
      minute: state === "in" ? event.status?.displayClock : undefined,
    })
  }
  return out
}

export function applyLiveOverrides(
  matches: Match[],
  overlay: LiveOverlay,
  now: number = Date.now()
): Match[] {
  if (!overlay.map.size) return [...matches]
  const inPlayStale = now - overlay.fetchedAt > IN_PLAY_TRUST_MS
  return matches.map((m) => {
    const o = overlay.map.get(matchKey(m.utcDate, m.homeTeam, m.awayTeam))
    if (!o || (o.status === "IN_PLAY" && inPlayStale)) return m
    return {
      ...m,
      status: o.status,
      homeScore: o.homeScore ?? m.homeScore,
      awayScore: o.awayScore ?? m.awayScore,
      minute: o.minute,
    }
  })
}
