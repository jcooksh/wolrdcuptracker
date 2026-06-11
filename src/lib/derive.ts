// Derived views over the real match data for the dashboard pages:
// per-team form/stage, per-participant recent form, and tournament-wide tallies.
import { TEAM_OWNER, TEAM_OWNER_NAME } from "@/data/draft"
import { isMatchLive, type Match } from "@/lib/scoring"

const FINISHED = new Set(["FINISHED", "AWARDED"])
const KNOCKOUT = new Set([
  "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL",
])

export const STAGE_RANK: Record<string, number> = {
  GROUP_STAGE: 0, LAST_32: 1, LAST_16: 2, QUARTER_FINALS: 3,
  SEMI_FINALS: 4, THIRD_PLACE: 4, FINAL: 5,
}

export const STAGE_SHORT: Record<string, string> = {
  GROUP_STAGE: "GROUP", LAST_32: "R32", LAST_16: "R16",
  QUARTER_FINALS: "QF", SEMI_FINALS: "SF", THIRD_PLACE: "3RD", FINAL: "FINAL",
}

export const STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE: "Group Stage", LAST_32: "Round of 32", LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals", SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third place", FINAL: "Final",
}

export interface TeamRow {
  team: string
  owner: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  points: number
  form: string[] // W | D | L, oldest→newest, plus trailing "live"
  stage: string // furthest stage code reached
  live: boolean
}

interface ResultPoint {
  date: string
  letter: "W" | "D" | "L"
}

// Per-team chronological results (finished only) + live flag + furthest stage.
function teamResults(matches: Match[]) {
  const results: Record<string, ResultPoint[]> = {}
  const live: Record<string, boolean> = {}
  const stage: Record<string, string> = {}

  const ensure = (t: string) => {
    if (!(t in results)) {
      results[t] = []
      live[t] = false
      stage[t] = "GROUP_STAGE"
    }
  }

  const bump = (t: string, code: string) => {
    if ((STAGE_RANK[code] ?? 0) > (STAGE_RANK[stage[t]] ?? 0)) stage[t] = code
  }

  for (const m of [...matches].sort((a, b) =>
    (a.utcDate ?? "").localeCompare(b.utcDate ?? "")
  )) {
    for (const team of [m.homeTeam, m.awayTeam]) {
      if (!TEAM_OWNER[team]) continue
      ensure(team)
      if (KNOCKOUT.has(m.stage)) bump(team, m.stage)
    }
    if (isMatchLive(m)) {
      if (TEAM_OWNER[m.homeTeam]) { ensure(m.homeTeam); live[m.homeTeam] = true }
      if (TEAM_OWNER[m.awayTeam]) { ensure(m.awayTeam); live[m.awayTeam] = true }
    }
    if (!FINISHED.has(m.status) || m.homeScore == null || m.awayScore == null) continue
    const date = m.utcDate ?? ""
    if (TEAM_OWNER[m.homeTeam]) {
      ensure(m.homeTeam)
      results[m.homeTeam].push({ date, letter: m.homeScore > m.awayScore ? "W" : m.homeScore < m.awayScore ? "L" : "D" })
    }
    if (TEAM_OWNER[m.awayTeam]) {
      ensure(m.awayTeam)
      results[m.awayTeam].push({ date, letter: m.awayScore > m.homeScore ? "W" : m.awayScore < m.homeScore ? "L" : "D" })
    }
  }
  return { results, live, stage }
}

export function buildTeamRows(matches: Match[]): TeamRow[] {
  const { results, live, stage } = teamResults(matches)
  const rows: TeamRow[] = []
  for (const team of Object.keys(TEAM_OWNER)) {
    const rs = results[team] ?? []
    const won = rs.filter((r) => r.letter === "W").length
    const drawn = rs.filter((r) => r.letter === "D").length
    const lost = rs.filter((r) => r.letter === "L").length
    const st = stage[team] ?? "GROUP_STAGE"
    const koBonus = STAGE_RANK[st] > 0 ? STAGE_RANK[st] * 4 : 0 // rough: 4 per ko round reached
    const form = rs.map((r) => r.letter as string)
    if (live[team]) form.push("live")
    rows.push({
      team,
      owner: TEAM_OWNER_NAME[team],
      played: rs.length,
      won, drawn, lost,
      gf: 0, ga: 0, // goals tracked at participant level; per-team gf/ga via scoring if needed
      points: won * 3 + drawn + koBonus,
      form,
      stage: st,
      live: live[team] ?? false,
    })
  }
  return rows
}

// Recent W/D/L across all of a participant's teams (chronological, last 5).
export function participantForm(matches: Match[], teams: string[]): string {
  const { results } = teamResults(matches)
  const pts: ResultPoint[] = []
  for (const t of teams) pts.push(...(results[t] ?? []))
  pts.sort((a, b) => a.date.localeCompare(b.date))
  return pts.slice(-5).map((p) => p.letter).join("")
}

export function knockoutCount(matches: Match[], teams: string[]): number {
  const { stage } = teamResults(matches)
  return teams.filter((t) => (STAGE_RANK[stage[t] ?? "GROUP_STAGE"] ?? 0) > 0).length
}

export interface Totals {
  played: number
  live: number
  upcoming: number
  finished: number
  goals: number
}

export function tournamentTotals(matches: Match[]): Totals {
  let live = 0, finished = 0, upcoming = 0, goals = 0
  for (const m of matches) {
    if (isMatchLive(m)) live++
    else if (FINISHED.has(m.status)) {
      finished++
      goals += (m.homeScore ?? 0) + (m.awayScore ?? 0)
    } else upcoming++
  }
  return { played: finished + live, live, upcoming, finished, goals }
}

export const isLive = (m: Match) => isMatchLive(m)
export const isFinished = (m: Match) => FINISHED.has(m.status)
export const isUpcoming = (m: Match) => !isMatchLive(m) && !FINISHED.has(m.status)
