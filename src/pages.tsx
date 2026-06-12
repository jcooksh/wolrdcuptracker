import { useState } from "react"

import { PARTICIPANTS, TEAM_OWNER, TEAM_OWNER_NAME, TOURNAMENT } from "@/data/draft"
import { flagOf, initialsOf } from "@/data/flags"
import { POINTS, type Match, type Standing } from "@/lib/scoring"
import {
  type TeamRow, type Totals, STAGE_LABEL, STAGE_SHORT, STAGE_RANK,
  isLive, isFinished, isUpcoming,
} from "@/lib/derive"

export interface PageData {
  me: string
  matches: Match[]
  standings: Standing[]
  teamRows: TeamRow[]
  totals: Totals
  formByParticipant: Record<string, string>
  koByParticipant: Record<string, number>
  updatedAt: string | null
  reload: () => void
}

const TOTAL_MATCHES = 104
const TEAM_OWNER_NAME_BY_ID: Record<string, string> =
  Object.fromEntries(PARTICIPANTS.map((p) => [p.id, p.name]))
const ownerName = (team: string): string | undefined => TEAM_OWNER_NAME[team]
const ownerId = (team: string): string | undefined => TEAM_OWNER[team]
const gdStr = (gd: number) => `${gd >= 0 ? "+" : ""}${gd}`

function fmtKickoff(iso?: string) {
  if (!iso) return { day: "TBD", time: "--:--" }
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }
}

// W/D/L pips from a form string ("WDLWW"); shows dashes when empty.
function Wdl({ form }: { form: string }) {
  const chars = form.slice(-5).split("")
  if (chars.length === 0) {
    return (
      <span className="wdl">
        {[0, 1, 2].map((i) => <span key={i} className="none">·</span>)}
      </span>
    )
  }
  return (
    <span className="wdl">
      {chars.map((c, i) => (
        <span key={i} className={c === "W" ? "w" : c === "D" ? "d" : "l"}>{c}</span>
      ))}
    </span>
  )
}

/* ============================================================ STANDINGS */
export function StandingsPage({ d }: { d: PageData }) {
  const { standings, totals, me, formByParticipant, koByParticipant } = d
  const top3 = standings.slice(0, 3)
  const totalPts = standings.reduce((a, s) => a + s.points, 0)
  const totalGoals = standings.reduce((a, s) => a + s.gf, 0)
  const inKo = standings.filter((s) => koByParticipant[s.participant.id] > 0).length
  const leader = standings[0]

  return (
    <>
      <div className="statstrip">
        <div className="stat">
          <div className="lbl">Matches played</div>
          <div className="v">{totals.played}<span className="unit">/ {TOTAL_MATCHES}</span></div>
          <div className="meta">{totals.upcoming} upcoming · {totals.live} live</div>
        </div>
        <div className="stat accent">
          <div className="lbl">Total points awarded</div>
          <div className="v">{totalPts}</div>
          <div className="meta">{totalGoals} goals · {inKo} owners in KO</div>
        </div>
        <div className="stat live">
          <div className="lbl">Live now</div>
          <div className="v">{totals.live}</div>
          <div className="meta">{totals.live > 0 ? "matches in play" : "no games kicked off"}</div>
        </div>
        <div className="stat">
          <div className="lbl">Current leader</div>
          <div className="v" style={{ fontSize: 30 }}>{leader?.participant.name ?? "–"}</div>
          <div className="meta">{leader?.points ?? 0} pts · GD {gdStr(leader?.gd ?? 0)}</div>
        </div>
      </div>

      <div>
        <div className="section-sub" style={{ marginBottom: 14 }}>Podium</div>
        <div className="podium-row">
          {top3.map((s, i) => (
            <div key={s.participant.id} className={`podium-card r${i + 1}`}>
              <div className="place">{i + 1}</div>
              <div className="eyebrow">{["1st", "2nd", "3rd"][i]}</div>
              <div className="nm">{s.participant.name}</div>
              <div className="pts">{s.points}<span className="unit">PTS</span></div>
              <div className="meta">{s.won}W · {s.drawn}D · {s.lost}L · GD {gdStr(s.gd)}</div>
              <div className="teams-mini">
                {s.participant.teams.map((t) => (
                  <span key={t} className="team-chip"><span className="flag">{flagOf(t)}</span>{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Full Table</h2>
          <span className="eyebrow">{PARTICIPANTS.length} owners · live</span>
          <div className="spacer" />
          <span className="chip">Sort · POINTS</span>
        </div>
        <div className="card-body tight">
          <table className="leaderboard">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Player</th>
                <th style={{ width: 130 }}>Form</th>
                <th style={{ width: 50, textAlign: "right" }}>P</th>
                <th style={{ width: 60, textAlign: "right" }}>GD</th>
                <th style={{ width: 50, textAlign: "right" }}>GF</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 90, textAlign: "right" }}>PTS</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const p = s.participant
                const isMe = p.id === me
                return (
                  <tr key={p.id} className={isMe ? "me" : ""}>
                    <td><span className={`rank-cell ${i === 0 ? "g" : i === 1 ? "s" : i === 2 ? "b" : ""}`}>{i + 1}</span></td>
                    <td>
                      <div className="player-cell">
                        <div className="av">{initialsOf(p.name)}</div>
                        <div>
                          <div className="nm">{p.name}{isMe && <span className="me-tag">YOU</span>}</div>
                          <div className="sub">{p.teams.length} TEAMS · {koByParticipant[p.id]} IN KO</div>
                        </div>
                      </div>
                    </td>
                    <td><Wdl form={formByParticipant[p.id] ?? ""} /></td>
                    <td className="num">{s.played}</td>
                    <td className={`gd-cell ${s.gd > 0 ? "pos" : s.gd < 0 ? "neg" : ""}`}>{gdStr(s.gd)}</td>
                    <td className="num">{s.gf}</td>
                    <td>{s.liveMatches > 0 ? <span className="chip live">{s.liveMatches} live</span> : <span className="chip">—</span>}</td>
                    <td className={`pts-cell ${i === 0 ? "lead" : ""}`}>{s.points}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ============================================================ MATCH ROW */
function MatchRow({ m, me }: { m: Match; me: string }) {
  const k = fmtKickoff(m.utcDate)
  const live = isLive(m)
  const fin = isFinished(m)
  // a presumed-live match has no scoreline yet — keep showing "vs", not 0 – 0
  const showScore = (fin || live) && (m.homeScore != null || m.awayScore != null)
  const ho = ownerName(m.homeTeam), ao = ownerName(m.awayTeam)
  return (
    <div className={`match-row ${live ? "live" : ""}`}>
      <div className="when">{k.day}<span className="big">{live ? (m.minute ?? "LIVE") : fin ? "FT" : k.time}</span></div>
      <div className="team-side">
        <div className="flag-lg">{flagOf(m.homeTeam)}</div>
        <div>
          <div className="team-name">{m.homeTeam}</div>
          <div className={`owner ${ownerId(m.homeTeam) === me ? "you" : ""}`}>{ho ? `↳ ${ho}` : "—"}</div>
        </div>
      </div>
      <div className={`vs ${showScore ? "score" : ""}`}>
        {showScore ? <>{m.homeScore ?? 0}<span style={{ color: "var(--text-4)" }}> – </span>{m.awayScore ?? 0}</> : "vs"}
      </div>
      <div className="team-side">
        <div className="flag-lg">{flagOf(m.awayTeam)}</div>
        <div>
          <div className="team-name">{m.awayTeam}</div>
          <div className={`owner ${ownerId(m.awayTeam) === me ? "you" : ""}`}>{ao ? `↳ ${ao}` : "—"}</div>
        </div>
      </div>
      <div className="stage">
        {live && <span className="chip live">LIVE</span>}
        {fin && <span className="chip">FT</span>}
        <div style={{ marginTop: 4 }}>{STAGE_SHORT[m.stage] ?? m.stage}</div>
      </div>
    </div>
  )
}

/* ============================================================ MATCH DAY */
export function MatchDayPage({ d }: { d: PageData }) {
  const { matches, me, standings } = d
  const live = matches.filter(isLive)
    .sort((a, b) => (a.utcDate ?? "").localeCompare(b.utcDate ?? ""))
  const upcoming = matches.filter(isUpcoming)
    .sort((a, b) => (a.utcDate ?? "").localeCompare(b.utcDate ?? "")).slice(0, 4)
  // a confirmed in-play match with a real scoreline beats a presumed-live one
  const hero = live.find((m) => m.status === "IN_PLAY" || m.status === "PAUSED") ?? live[0]
  const alsoLive = live.filter((m) => m !== hero)

  return (
    <>
      {hero ? (
        <div className="hero-match">
          <div className="stripe" />
          <div className="row1">
            <span className="chip live">LIVE</span>
            <span className="stage">{STAGE_LABEL[hero.stage] ?? hero.stage}</span>
          </div>
          <div className="vs-grid">
            <div className="hero-team">
              <div className="flag-xl">{flagOf(hero.homeTeam)}</div>
              <div className="nm">{hero.homeTeam}</div>
              <div className="own">OWNED BY <b>{ownerName(hero.homeTeam) ?? "—"}</b></div>
            </div>
            <div>
              {hero.homeScore != null || hero.awayScore != null ? (
                <div className="scorebox"><span>{hero.homeScore ?? 0}</span><span className="dash">–</span><span>{hero.awayScore ?? 0}</span></div>
              ) : (
                <div className="scorebox"><span className="dash">–</span></div>
              )}
              <div className="scorebox minute">{hero.homeScore != null || hero.awayScore != null ? (hero.minute ?? "LIVE") : "KICKED OFF · SCORE PENDING"}</div>
            </div>
            <div className="hero-team">
              <div className="flag-xl">{flagOf(hero.awayTeam)}</div>
              <div className="nm">{hero.awayTeam}</div>
              <div className="own">OWNED BY <b>{ownerName(hero.awayTeam) ?? "—"}</b></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hero-match" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="row1"><span className="chip">NO LIVE GAMES</span></div>
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div className="section-title" style={{ fontSize: 44 }}>Nothing kicking off</div>
            <div className="section-sub">Tournament runs {TOURNAMENT.fromDate} → {TOURNAMENT.toDate}</div>
          </div>
        </div>
      )}

      {alsoLive.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Also live</h2><span className="eyebrow">{alsoLive.length} more in play</span></div>
          <div className="card-body tight">{alsoLive.map((m) => <MatchRow key={m.id} m={m} me={me} />)}</div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-head"><h2>Up Next</h2><span className="eyebrow">soonest kickoffs</span></div>
          <div className="card-body tight">
            {upcoming.length ? upcoming.map((m) => <MatchRow key={m.id} m={m} me={me} />)
              : <div className="empty">No scheduled fixtures</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Live leaderboard</h2></div>
          <div className="card-body tight">
            <table className="leaderboard">
              <tbody>
                {standings.slice(0, 8).map((s, i) => (
                  <tr key={s.participant.id} className={s.participant.id === me ? "me" : ""}>
                    <td><span className={`rank-cell ${i === 0 ? "g" : i === 1 ? "s" : i === 2 ? "b" : ""}`}>{i + 1}</span></td>
                    <td><div className="player-cell"><div className="nm">{s.participant.name}</div></div></td>
                    <td>{s.liveMatches > 0 ? <span className="chip live">{s.liveMatches}</span> : null}</td>
                    <td className={`pts-cell ${i === 0 ? "lead" : ""}`}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

/* ============================================================ FIXTURES */
export function FixturesPage({ d }: { d: PageData }) {
  const { matches, me, totals } = d
  const byDate = (a: Match, b: Match) => (a.utcDate ?? "").localeCompare(b.utcDate ?? "")
  const live = matches.filter(isLive).sort(byDate)
  const upcoming = matches.filter(isUpcoming).sort(byDate)
  const finished = matches.filter(isFinished).sort((a, b) => byDate(b, a))

  return (
    <>
      <div className="statstrip">
        <div className="stat"><div className="lbl">Played</div><div className="v">{totals.played}</div><div className="meta">of {TOTAL_MATCHES} total</div></div>
        <div className="stat live"><div className="lbl">Live</div><div className="v">{totals.live}</div><div className="meta">in play now</div></div>
        <div className="stat accent"><div className="lbl">Upcoming</div><div className="v">{totals.upcoming}</div><div className="meta">scheduled</div></div>
        <div className="stat"><div className="lbl">Goals total</div><div className="v">{totals.goals}</div><div className="meta">in finished games</div></div>
      </div>

      {live.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Live now</h2><span className="eyebrow">{live.length} matches</span></div>
          <div className="card-body tight">{live.map((m) => <MatchRow key={m.id} m={m} me={me} />)}</div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Upcoming</h2><span className="eyebrow">next up</span></div>
        <div className="card-body tight">
          {upcoming.length ? upcoming.slice(0, 20).map((m) => <MatchRow key={m.id} m={m} me={me} />)
            : <div className="empty">No upcoming fixtures</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Recent results</h2><span className="eyebrow">finished</span></div>
        <div className="card-body tight">
          {finished.length ? finished.slice(0, 20).map((m) => <MatchRow key={m.id} m={m} me={me} />)
            : <div className="empty">No results yet — tournament hasn't started</div>}
        </div>
      </div>
    </>
  )
}

/* ============================================================ BRACKET */
const KO_STAGES = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"]
export function BracketPage({ d }: { d: PageData }) {
  const { matches, standings, koByParticipant } = d
  const koMatches = matches.filter((m) => (STAGE_RANK[m.stage] ?? 0) > 0)
  const aliveOwners = standings.filter((s) => koByParticipant[s.participant.id] > 0).length

  const Tie = ({ m }: { m: Match }) => {
    const hw = m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore
    const aw = m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore
    return (
      <div className="br-tie">
        <div className={`side ${hw ? "win" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>{flagOf(m.homeTeam)}</span>
            <div><div>{m.homeTeam}</div><div className="own">{ownerName(m.homeTeam) ?? "—"}</div></div>
          </div>
          <div className="sc">{m.homeScore ?? "–"}</div>
        </div>
        <div className={`side ${aw ? "win" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>{flagOf(m.awayTeam)}</span>
            <div><div>{m.awayTeam}</div><div className="own">{ownerName(m.awayTeam) ?? "—"}</div></div>
          </div>
          <div className="sc">{m.awayScore ?? "–"}</div>
        </div>
        {isLive(m) && <div className="br-foot" style={{ color: "var(--live)" }}>● live</div>}
        {isUpcoming(m) && <div className="br-foot" style={{ color: "var(--text-3)" }}>{fmtKickoff(m.utcDate).day}</div>}
      </div>
    )
  }

  return (
    <>
      <div className="statstrip">
        <div className="stat accent"><div className="lbl">Knockout matches</div><div className="v">{koMatches.length}</div><div className="meta">winners +{POINTS.nextRound} pts each round</div></div>
        <div className="stat"><div className="lbl">Owners in KO</div><div className="v">{aliveOwners}<span className="unit">/ {PARTICIPANTS.length}</span></div><div className="meta">teams still alive</div></div>
        <div className="stat"><div className="lbl">Teams in KO</div><div className="v">{d.teamRows.filter((t) => STAGE_RANK[t.stage] > 0).length}<span className="unit">/ 48</span></div><div className="meta">reached a knockout round</div></div>
        <div className="stat live"><div className="lbl">Live ties</div><div className="v">{koMatches.filter(isLive).length}</div><div className="meta">in play</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Knockout Bracket</h2><span className="eyebrow">R32 → Final</span>
          <div className="spacer" /><span className="chip lime">+{POINTS.nextRound} pts per round advanced</span>
        </div>
        <div className="card-body">
          {koMatches.length === 0 ? (
            <div className="empty">Bracket is set after the group stage — check back once R32 is drawn</div>
          ) : (
            <div className="bracket">
              {KO_STAGES.map((stage) => {
                const ties = koMatches.filter((m) => m.stage === stage)
                return (
                  <div className="br-col" key={stage}>
                    <h4>{STAGE_LABEL[stage] ?? stage}</h4>
                    {ties.length ? ties.map((m) => <Tie key={m.id} m={m} />)
                      : <div className="br-tie empty-tie"><div className="side">TBD</div><div className="side">TBD</div></div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ============================================================ PLAYERS */
export function PlayersPage({ d, playerId }: { d: PageData; playerId?: string }) {
  if (playerId && PARTICIPANTS.some((p) => p.id === playerId)) {
    return <PlayerDetail d={d} id={playerId} />
  }

  const { standings, teamRows } = d
  const teamStage = Object.fromEntries(teamRows.map((t) => [t.team, t]))

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 className="section-title">All Players</h2>
          <div className="section-sub">{PARTICIPANTS.length} owners · 48 teams · tap a card for detail</div>
        </div>
        <span className="chip">SORT · POINTS</span>
      </div>

      <div className="player-grid">
        {standings.map((s, i) => {
          const p = s.participant
          return (
            <a key={p.id} href={`#/players/${p.id}`} className="player-card link">
              <div className="top">
                <div className="av-lg">{initialsOf(p.name)}</div>
                <div>
                  <div className="nm">{p.name}</div>
                  <div className="teamcount">{p.teams.length} TEAMS</div>
                </div>
                <div className="rk">#{i + 1}</div>
              </div>
              <div className="pts-big">{s.points}<span className="unit">PTS</span></div>
              <div className="meta">{s.won}W · {s.drawn}D · {s.lost}L · GD {gdStr(s.gd)}</div>
              <div className="teams-row">
                {p.teams.map((t) => {
                  const tr = teamStage[t]
                  return (
                    <span key={t} className="team-chip">
                      <span className="flag">{flagOf(t)}</span>{t}
                      {tr?.live && <span style={{ color: "var(--live)", fontSize: 10 }}>●</span>}
                    </span>
                  )
                })}
              </div>
              <div className="view-link">View teams & fixtures →</div>
            </a>
          )
        })}
      </div>
    </>
  )
}

/* ── single player: their teams individually + their fixtures ── */
function PlayerDetail({ d, id }: { d: PageData; id: string }) {
  const { standings, teamRows, matches, me, formByParticipant, koByParticipant } = d
  const idx = standings.findIndex((s) => s.participant.id === id)
  const s = standings[idx]
  const p = s.participant
  const rows = p.teams.map((t) => teamRows.find((r) => r.team === t)!).filter(Boolean)
  const teamSet = new Set(p.teams)
  const theirs = matches.filter((m) => teamSet.has(m.homeTeam) || teamSet.has(m.awayTeam))
  const byDate = (a: Match, b: Match) => (a.utcDate ?? "").localeCompare(b.utcDate ?? "")
  const live = theirs.filter(isLive).sort(byDate)
  const upcoming = theirs.filter(isUpcoming).sort(byDate)
  const results = theirs.filter(isFinished).sort((a, b) => byDate(b, a))

  return (
    <>
      <a href="#/players" className="chip" style={{ alignSelf: "flex-start" }}>← All players</a>

      <div className="card">
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <div className="av-lg" style={{ width: 56, height: 56, fontSize: 20 }}>{initialsOf(p.name)}</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 34, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1 }}>{p.name}</div>
            <div className="section-sub" style={{ marginTop: 6 }}>
              rank #{idx + 1} · {p.teams.length} teams · {koByParticipant[id]} in KO
            </div>
            <div style={{ marginTop: 10 }}><Wdl form={formByParticipant[id] ?? ""} /></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 56, color: "var(--lime)", lineHeight: 1 }}>{s.points}<span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)", marginLeft: 8 }}>PTS</span></div>
            <div className="meta" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)", letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 6 }}>{s.won}W · {s.drawn}D · {s.lost}L · GD {gdStr(s.gd)} · GF {s.gf}</div>
          </div>
        </div>
      </div>

      <div>
        <div className="section-sub" style={{ marginBottom: 14 }}>Their teams</div>
        <div className="team-grid">
          {rows.map((t) => <TeamCardView key={t.team} t={t} me={me} />)}
        </div>
      </div>

      {live.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>Live now</h2><span className="eyebrow">{live.length} in play</span></div>
          <div className="card-body tight">{live.map((m) => <MatchRow key={m.id} m={m} me={me} />)}</div>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h2>Upcoming matches</h2><span className="eyebrow">{p.name}'s teams</span></div>
        <div className="card-body tight">
          {upcoming.length ? upcoming.slice(0, 12).map((m) => <MatchRow key={m.id} m={m} me={me} />)
            : <div className="empty">No upcoming fixtures</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Results</h2><span className="eyebrow">finished</span></div>
        <div className="card-body tight">
          {results.length ? results.slice(0, 12).map((m) => <MatchRow key={m.id} m={m} me={me} />)
            : <div className="empty">No results yet</div>}
        </div>
      </div>
    </>
  )
}

/* ============================================================ TEAM CARD */
function TeamCardView({ t, me }: { t: TeamRow; me: string }) {
  const stageChip = STAGE_RANK[t.stage] > 0
    ? <span className="chip lime">{STAGE_SHORT[t.stage]}</span>
    : <span className="chip">GROUP</span>
  return (
    <div className="team-card">
      <div className="top">
        <div className="flag-md">{flagOf(t.team)}</div>
        <div style={{ flex: 1 }}>
          <div className="nm">{t.team}</div>
          <div className="own">↳ {t.owner}{ownerId(t.team) === me && <span style={{ color: "var(--lime)" }}> (YOU)</span>}</div>
        </div>
        {stageChip}
      </div>
      <div className="form">
        {t.form.length ? t.form.slice(-5).map((c, i) =>
          c === "live" ? <span key={i} className="live">●</span>
            : <span key={i} className={c === "W" ? "w" : c === "D" ? "d" : "l"}>{c}</span>)
          : [0, 1, 2].map((i) => <span key={i} className="none">·</span>)}
      </div>
      <div className="pts-row">
        <div><div className="v">{t.points}</div><div className="lbl">Points contributed</div></div>
        <div className="right">{t.played}P · {t.won}W {t.drawn}D {t.lost}L</div>
      </div>
    </div>
  )
}

/* ============================================================ TEAMS */
export function TeamsPage({ d }: { d: PageData }) {
  const { teamRows, me, totals } = d
  const [owner, setOwner] = useState<string>("all")
  const stageSortKey = (t: TeamRow) => (t.live ? 0 : STAGE_RANK[t.stage] > 0 ? 1 : 2)
  const sorted = [...teamRows].sort((a, b) => stageSortKey(a) - stageSortKey(b) || b.points - a.points || a.team.localeCompare(b.team))
  const rows = owner === "all" ? sorted : sorted.filter((t) => ownerId(t.team) === owner)
  const inKo = teamRows.filter((t) => STAGE_RANK[t.stage] > 0).length
  const liveTeams = teamRows.filter((t) => t.live).length

  return (
    <>
      <div className="statstrip">
        <div className="stat"><div className="lbl">Total teams</div><div className="v">48</div><div className="meta">across {PARTICIPANTS.length} owners</div></div>
        <div className="stat accent"><div className="lbl">In knockouts</div><div className="v">{inKo}</div><div className="meta">reached a KO round</div></div>
        <div className="stat live"><div className="lbl">Live now</div><div className="v">{liveTeams}</div><div className="meta">{totals.live} matches</div></div>
        <div className="stat"><div className="lbl">Played</div><div className="v">{teamRows.filter((t) => t.played > 0).length}</div><div className="meta">teams with games</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>{owner === "all" ? "All 48 Teams" : `${TEAM_OWNER_NAME_BY_ID[owner]}'s Teams`}</h2>
          <span className="eyebrow">{rows.length} shown · live first</span>
        </div>
        <div className="filter-row">
          <button className={`chip ${owner === "all" ? "lime" : ""}`} onClick={() => setOwner("all")}>All owners</button>
          {PARTICIPANTS.map((p) => (
            <button key={p.id} className={`chip ${owner === p.id ? "lime" : ""}`} onClick={() => setOwner(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="card-body">
          <div className="team-grid">
            {rows.map((t) => <TeamCardView key={t.team} t={t} me={me} />)}
          </div>
        </div>
      </div>
    </>
  )
}

/* ============================================================ STATS */
export function StatsPage({ d }: { d: PageData }) {
  const { teamRows, totals } = d
  const mvp = [...teamRows].filter((t) => t.points > 0).sort((a, b) => b.points - a.points).slice(0, 6)
  const started = totals.played > 0

  return (
    <>
      <div>
        <h2 className="section-title">The Numbers</h2>
        <div className="section-sub">live records · refreshed every 60s</div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><h2>Golden Boot Race</h2><span className="eyebrow">player goals</span></div>
          <div className="card-body">
            <div className="empty">
              {started ? "Per-player goal data not in the feed yet" : "No goals yet — tournament starts " + TOURNAMENT.fromDate}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Movers · last 24h</h2></div>
          <div className="card-body"><div className="empty">{started ? "No ranking changes yet" : "Standings static until kickoff"}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>MVP Teams</h2><span className="eyebrow">most points contributed by a single team</span></div>
        <div className="card-body mvp-grid">
          {mvp.length ? mvp.map((t) => (
            <div key={t.team} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 44, color: "var(--lime)", lineHeight: 1 }}>{t.points}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "0.03em", textTransform: "uppercase" }}>{t.team}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>↳ {t.owner}</div>
              </div>
            </div>
          )) : <div className="empty" style={{ gridColumn: "1 / -1" }}>No points scored yet</div>}
        </div>
      </div>
    </>
  )
}

/* ============================================================ RULES */
export function RulesPage(_: { d: PageData }) {
  return (
    <div className="rules-grid">
      <div>
        <h2 className="section-title">How the Sweepstake Works</h2>
        <div className="section-sub">scoring · tie-breaks · the boring stuff</div>
        <div className="prose">
          <p style={{ fontSize: 17, marginTop: 24 }}>
            {PARTICIPANTS.length} of us drew 4–6 national teams each from a hat. Every match those
            teams play scores points. The leaderboard is live for the whole tournament —
            <code>{TOURNAMENT.fromDate}</code> to <code>{TOURNAMENT.toDate}</code>. Most points at the end wins.
          </p>
          <h3>Scoring</h3>
          <table className="points-table">
            <thead><tr><th>Event</th><th style={{ textAlign: "right" }}>Points</th></tr></thead>
            <tbody>
              <tr><td>Win</td><td className="v" style={{ textAlign: "right" }}>{POINTS.win}</td></tr>
              <tr><td>Draw</td><td className="v" style={{ textAlign: "right" }}>{POINTS.draw}</td></tr>
              <tr><td>Loss</td><td className="v" style={{ textAlign: "right", color: "var(--text-3)" }}>{POINTS.loss}</td></tr>
              <tr><td>Reaching a knockout round (R32, R16, QF, SF, Final)</td><td className="v" style={{ textAlign: "right" }}>+{POINTS.nextRound} each</td></tr>
            </tbody>
          </table>
          <h3>Tie-breaks</h3>
          <ul>
            <li>Goal difference (GF − GA) across all your teams</li>
            <li>Then goals for</li>
            <li>Then alphabetical on name</li>
          </ul>
          <h3>Live data</h3>
          <p>Scores come from <code>football-data.org</code>. A scheduled job refreshes results every ~10 minutes during match days and the dashboard re-polls every 60 seconds — no manual updates.</p>
          <h3>No swaps</h3>
          <p>Group stage gives 3 matches per team. Draw a team that goes out early and you still bank whatever points they earned. No refunds, no swaps.</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card">
          <div className="card-head"><h2>Quick maths</h2></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div className="section-sub">Group stage max</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--lime)" }}>9 pts</div>
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>3 wins per team</div>
            </div>
            <div>
              <div className="section-sub">If a team reaches the Final</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 36, color: "var(--lime)" }}>+20 pts</div>
              <div style={{ color: "var(--text-2)", fontSize: 13 }}>R32 + R16 + QF + SF + Final = 5 × {POINTS.nextRound}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>The pot</h2></div>
          <div className="card-body" style={{ textAlign: "center", padding: 24 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 56, color: "var(--lime)", lineHeight: 1 }}>£—</div>
            <div className="section-sub" style={{ marginTop: 6 }}>set buy-in in admin</div>
            <hr style={{ border: "none", borderTop: "1px solid var(--border-soft)", margin: "18px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "left" }}>
              <div><div className="section-sub">1ST</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--gold)" }}>£—</div></div>
              <div><div className="section-sub">2ND</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--silver)" }}>£—</div></div>
              <div><div className="section-sub">3RD</div><div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--bronze)" }}>£—</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================ ADMIN */
export function AdminPage({ d }: { d: PageData }) {
  const { updatedAt, reload, totals, matches } = d
  const lastSync = updatedAt ? new Date(updatedAt).toLocaleString() : "never"
  const dataUrl = `${import.meta.env.BASE_URL}data/matches.json`

  return (
    <>
      <div>
        <h2 className="section-title">Admin</h2>
        <div className="section-sub">draft · data · sync</div>
      </div>

      <div className="statstrip">
        <div className="stat accent"><div className="lbl">Last sync</div><div className="v" style={{ fontSize: 26 }}>{lastSync === "never" ? "never" : lastSync.split(",")[1] ?? lastSync}</div><div className="meta">auto every ~10 min on match days</div></div>
        <div className="stat"><div className="lbl">Matches loaded</div><div className="v">{matches.length}</div><div className="meta">{totals.played} played · {totals.upcoming} upcoming</div></div>
        <div className="stat"><div className="lbl">Source</div><div className="v" style={{ fontSize: 18, fontFamily: "var(--font-mono)" }}>football-data</div><div className="meta">competition WC · season 2026</div></div>
        <div className="stat"><div className="lbl">Live</div><div className="v" style={{ color: "var(--win)" }}>{totals.live}</div><div className="meta">matches in play</div></div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><h2>Draft</h2><span className="eyebrow">{PARTICIPANTS.length} owners · 48 teams</span></div>
          <div className="card-body tight">
            {PARTICIPANTS.map((p) => (
              <div key={p.id} className="draft-row">
                <div className="av" style={{ width: 32, height: 32 }}>{initialsOf(p.name)}</div>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.teams.map((t) => (
                    <span key={t} className="team-chip"><span className="flag">{flagOf(t)}</span>{t}</span>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ padding: "12px 20px", fontSize: 12, color: "var(--text-3)" }}>
              Edit the draft in <code>src/data/draft.ts</code> and push to update.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head"><h2>Data</h2></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="btn primary" style={{ justifyContent: "center" }} onClick={reload}>⟳ Reload scores now</button>
              <a className="btn" style={{ justifyContent: "center" }} href={dataUrl} download>↓ Download matches.json</a>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2>API key</h2></div>
            <div className="card-body">
              <div style={{ fontSize: 13, color: "var(--text-2)" }}>
                <code>FOOTBALL_DATA_KEY</code> is stored as a GitHub repo secret and used only by the
                CI fetch job. It never reaches the browser.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
