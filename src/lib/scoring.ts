import { PARTICIPANTS, TEAM_OWNER, type Participant } from "@/data/draft"

// Scoring rules:
//   win  = 3 pts
//   draw = 1 pt
//   loss = 0 pts
//   + 4 pts each time a team reaches a knockout round (advancing)
//   goal difference tracked as a tie-breaker / display stat
export const POINTS = { win: 3, draw: 1, loss: 0, nextRound: 4 }

// Stage codes from football-data.org. GROUP_STAGE earns no bonus; every other
// stage a team appears in means they advanced -> +4.
const KNOCKOUT_STAGES = new Set([
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
])

export interface Match {
  id: number
  stage: string
  status: string // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
  utcDate?: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

export interface TeamStats {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  matchPoints: number
  bonusPoints: number
  points: number
}

export interface Standing {
  participant: Participant
  rank: number
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
  liveMatches: number // count of teams currently in play
  teams: TeamStats[]
}

const FINISHED = new Set(["FINISHED", "AWARDED"])
const LIVE = new Set(["IN_PLAY", "PAUSED"])
const NOT_STARTED = new Set(["SCHEDULED", "TIMED"])

// football-data.org can lag flipping TIMED -> IN_PLAY (the WC 2026 opener was
// still TIMED 90 minutes after kickoff), so a match whose scheduled kickoff has
// passed also counts as live until the API catches up. Windows are generous to
// cover delayed kickoffs and stoppage; knockout games get extra for ET + pens.
const LIVE_WINDOW_MS = {
  GROUP_STAGE: 3 * 60 * 60 * 1000,
  KNOCKOUT: 4 * 60 * 60 * 1000,
}

export function isMatchLive(m: Match, now: number = Date.now()): boolean {
  if (LIVE.has(m.status)) return true
  if (!NOT_STARTED.has(m.status) || !m.utcDate) return false
  const kickoff = Date.parse(m.utcDate)
  if (Number.isNaN(kickoff)) return false
  const windowMs =
    m.stage === "GROUP_STAGE" ? LIVE_WINDOW_MS.GROUP_STAGE : LIVE_WINDOW_MS.KNOCKOUT
  return now >= kickoff && now - kickoff < windowMs
}

function emptyTeam(team: string): TeamStats {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    matchPoints: 0,
    bonusPoints: 0,
    points: 0,
  }
}

export function computeTeamStats(matches: Match[]): Record<string, TeamStats> {
  const stats: Record<string, TeamStats> = {}
  const reachedStages: Record<string, Set<string>> = {}

  const ensure = (team: string) => {
    if (!(team in stats)) {
      stats[team] = emptyTeam(team)
      reachedStages[team] = new Set()
    }
    return stats[team]
  }

  for (const m of matches) {
    // Only count teams that are owned by someone in the sweepstake.
    const owned = TEAM_OWNER[m.homeTeam] || TEAM_OWNER[m.awayTeam]
    if (!owned) continue

    // Knockout-round bonus is earned by appearing in the fixture at all
    // (a team only reaches the round if it advanced).
    if (KNOCKOUT_STAGES.has(m.stage)) {
      if (TEAM_OWNER[m.homeTeam]) {
        ensure(m.homeTeam)
        reachedStages[m.homeTeam].add(m.stage)
      }
      if (TEAM_OWNER[m.awayTeam]) {
        ensure(m.awayTeam)
        reachedStages[m.awayTeam].add(m.stage)
      }
    }

    if (!FINISHED.has(m.status)) continue
    if (m.homeScore == null || m.awayScore == null) continue

    const home = ensure(m.homeTeam)
    const away = ensure(m.awayTeam)

    home.played++
    away.played++
    home.gf += m.homeScore
    home.ga += m.awayScore
    away.gf += m.awayScore
    away.ga += m.homeScore

    if (m.homeScore > m.awayScore) {
      home.won++
      away.lost++
      home.matchPoints += POINTS.win
    } else if (m.homeScore < m.awayScore) {
      away.won++
      home.lost++
      away.matchPoints += POINTS.win
    } else {
      home.drawn++
      away.drawn++
      home.matchPoints += POINTS.draw
      away.matchPoints += POINTS.draw
    }
  }

  for (const team of Object.keys(stats)) {
    const s = stats[team]
    s.gd = s.gf - s.ga
    s.bonusPoints = reachedStages[team].size * POINTS.nextRound
    s.points = s.matchPoints + s.bonusPoints
  }

  return stats
}

export function computeStandings(matches: Match[]): Standing[] {
  const teamStats = computeTeamStats(matches)
  const liveTeams = new Set<string>()
  for (const m of matches) {
    if (isMatchLive(m)) {
      liveTeams.add(m.homeTeam)
      liveTeams.add(m.awayTeam)
    }
  }

  const standings: Standing[] = PARTICIPANTS.map((p) => {
    const teams = p.teams.map((t) => teamStats[t] ?? emptyTeam(t))
    const agg = teams.reduce(
      (a, t) => {
        a.played += t.played
        a.won += t.won
        a.drawn += t.drawn
        a.lost += t.lost
        a.gf += t.gf
        a.ga += t.ga
        a.points += t.points
        return a
      },
      { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }
    )
    const liveMatches = p.teams.filter((t) => liveTeams.has(t)).length
    return {
      participant: p,
      rank: 0,
      ...agg,
      gd: agg.gf - agg.ga,
      liveMatches,
      teams: teams.sort((a, b) => b.points - a.points || b.gd - a.gd),
    }
  })

  // Sort: points, then goal difference, then goals for, then name.
  standings.sort(
    (a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.participant.name.localeCompare(b.participant.name)
  )
  standings.forEach((s, i) => (s.rank = i + 1))
  return standings
}
