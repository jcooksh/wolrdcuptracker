import * as React from "react"
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
  mvByParticipant: Record<string, number>
  updatedAt: string | null
  reload: () => void
}

const TOTAL_MATCHES = 104

/* one vivid colour per owner — same palette as the design system */
const PALETTE = [
  "#2E5BFF", "#FF4E36", "#07A085", "#F25C8E", "#FFB02E", "#1592C9",
  "#7A5BFF", "#5C9A00", "#E8590C", "#B83280", "#0B7285",
]
const COLOR: Record<string, string> = Object.fromEntries(
  PARTICIPANTS.map((p, i) => [p.id, PALETTE[i % PALETTE.length]])
)
const colorOf = (pid?: string) => (pid ? COLOR[pid] ?? "#928876" : "#928876")

const ownerName = (team: string): string | undefined => TEAM_OWNER_NAME[team]
const ownerId = (team: string): string | undefined => TEAM_OWNER[team]
const gdStr = (gd: number) => `${gd >= 0 ? "+" : ""}${gd}`

const ABBR: Record<string, string> = {
  "South Korea": "KOR", "Saudi Arabia": "KSA", "South Africa": "RSA",
  "New Zealand": "NZL", "Czech Republic": "CZE", "Ivory Coast": "CIV",
  "Cape Verde": "CPV", USA: "USA", "Curaçao": "CUW",
}
const abbr = (t: string) => ABBR[t] ?? t.slice(0, 3).toUpperCase()

function fmtKickoff(iso?: string) {
  if (!iso) return { day: "TBD", time: "--:--" }
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  }
}

const byDate = (a: Match, b: Match) => (a.utcDate ?? "").localeCompare(b.utcDate ?? "")

function groupByDay(ms: Match[]): Array<{ day: string; ms: Match[] }> {
  const groups: Array<{ day: string; ms: Match[] }> = []
  for (const m of ms) {
    const day = fmtKickoff(m.utcDate).day
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.ms.push(m)
    else groups.push({ day, ms: [m] })
  }
  return groups
}

/* ── shared bits ───────────────────────────────────────────── */
function MvTag({ mv }: { mv: number }) {
  if (mv > 0) return <span className="mv up">▲{mv}</span>
  if (mv < 0) return <span className="mv down">▼{-mv}</span>
  return <span className="mv same">–</span>
}

function FormPips({ form }: { form: string }) {
  const chars = form.slice(-5).split("").filter(Boolean)
  if (chars.length === 0) {
    return (
      <div className="form">
        {[0, 1, 2].map((i) => <span key={i} className="none">·</span>)}
      </div>
    )
  }
  return (
    <div className="form">
      {chars.map((c, i) => (
        <span key={i} className={c === "W" ? "w" : c === "D" ? "d" : "l"}>{c}</span>
      ))}
    </div>
  )
}

function OwnerLine({ team }: { team: string }) {
  const o = ownerName(team)
  if (!o) return null
  return (
    <div className="ownline">
      <span className="dotc" style={{ background: colorOf(ownerId(team)) }} />
      {o}
    </div>
  )
}

/* ── hero: next fixture instead of a tagline ──────────────── */
function NextUp({ matches }: { matches: Match[] }) {
  const now = Date.now()
  const next = matches
    .filter((m) => isUpcoming(m) && m.utcDate && Date.parse(m.utcDate) > now)
    .sort(byDate)[0]
  if (!next) return <div className="eyebrow">{TOURNAMENT.title}</div>
  const k = fmtKickoff(next.utcDate)
  const Side = ({ team }: { team: string }) => (
    <span className="nu-team">
      <span className="nu-fl">{flagOf(team)}</span>
      <span className="nu-tn">{team}</span>
      {ownerName(team) ? (
        <span className="nu-own">
          <span className="dotc" style={{ background: colorOf(ownerId(team)) }} />
          {ownerName(team)}
        </span>
      ) : (
        <span className="nu-own none">unpicked</span>
      )}
    </span>
  )
  return (
    <div className="nextup">
      <div className="nu-lbl"><span className="nu-pip" />Next up · {k.day} · {k.time} kickoff</div>
      <div className="nu-fix">
        <Side team={next.homeTeam} />
        <span className="nu-v">v</span>
        <Side team={next.awayTeam} />
      </div>
    </div>
  )
}

function Countdown({ matches }: { matches: Match[] }) {
  const now = Date.now()
  const from = Date.parse(TOURNAMENT.fromDate)
  const to = Date.parse(TOURNAMENT.toDate)
  const DAY = 86_400_000
  if (now < from) {
    const days = Math.max(1, Math.ceil((from - now) / DAY))
    return (
      <div className="countdown">
        <div className="lbl">World Cup 2026</div>
        <div className="big">{days} day{days === 1 ? "" : "s"}</div>
        <div className="lbl" style={{ marginTop: 4 }}>until kickoff</div>
      </div>
    )
  }
  // furthest stage actually under way, by the real match stage code (so the
  // third-place playoff reads "Third place", not "Semi-finals")
  let topStage = "GROUP_STAGE"
  for (const m of matches) {
    if ((isLive(m) || isFinished(m)) && (STAGE_RANK[m.stage] ?? 0) > (STAGE_RANK[topStage] ?? 0)) {
      topStage = m.stage
    }
  }
  const day = Math.floor((now - from) / DAY) + 1
  const days = Math.max(0, Math.ceil((to - now) / DAY))
  return (
    <div className="countdown">
      <div className="lbl">{STAGE_LABEL[topStage] ?? "Group stage"} · Day {day}</div>
      <div className="big">{days} day{days === 1 ? "" : "s"}</div>
      <div className="lbl" style={{ marginTop: 4 }}>until the final</div>
    </div>
  )
}

/* ── live ticker built from real results ──────────────────── */
function Ticker({ matches }: { matches: Match[] }) {
  const live = matches.filter(isLive).sort(byDate)
  const recent = matches.filter(isFinished).sort((a, b) => byDate(b, a)).slice(0, 8)

  const note = (m: Match): string => {
    const ho = ownerName(m.homeTeam), ao = ownerName(m.awayTeam)
    if (isLive(m)) return m.minute ?? "LIVE"
    if (m.homeScore == null || m.awayScore == null) return "FT"
    if (m.homeScore > m.awayScore) return ho ? `${ho} +${POINTS.win}` : "FT"
    if (m.homeScore < m.awayScore) return ao ? `${ao} +${POINTS.win}` : "FT"
    // draw: +1 per owned side
    if (ho && ao) return ho === ao ? `${ho} +${POINTS.draw * 2}` : `${ho} & ${ao} share`
    if (ho) return `${ho} +${POINTS.draw}`
    if (ao) return `${ao} +${POINTS.draw}`
    return "all square"
  }

  const items = [...live, ...recent]
  if (items.length === 0) return null

  const run = (prefix: string) => items.map((m) => (
    <React.Fragment key={`${prefix}-${m.id}`}>
      {flagOf(m.homeTeam)} {abbr(m.homeTeam)}{" "}
      {m.homeScore != null || m.awayScore != null
        ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}`
        : "v"}{" "}
      {flagOf(m.awayTeam)} {abbr(m.awayTeam)} <b>· {note(m)}</b>
      <span className="dot">◆</span>
    </React.Fragment>
  ))

  return (
    <div className="ticker">
      <span className="tag">{live.length > 0 ? "LIVE" : "LATEST"}</span>
      <div className="scroll"><span className="run">{run("a")}{run("b")}</span></div>
    </div>
  )
}

/* ════════ STANDINGS ════════ */
export function StandingsPage({ d }: { d: PageData }) {
  const { standings, matches, formByParticipant, mvByParticipant } = d
  const podClass = ["gold", "teal", "coral"]
  const word = ["First place 👑", "Runner-up", "Third"]

  return (
    <>
      <section className="hero">
        <div><NextUp matches={matches} /></div>
        <Countdown matches={matches} />
      </section>

      <Ticker matches={matches} />

      <div className="section-head">
        <h2>On the podium</h2>
        <div className="spacer" />
        <span className="eyebrow">Top 3 of {standings.length}</span>
      </div>
      <div className="podium">
        {standings.slice(0, 3).map((s, i) => (
          <div key={s.participant.id} className={`pod ${podClass[i]}`}>
            <div className="rk-badge">{i + 1}</div>
            <div className="rk-word">{word[i]}</div>
            <div className="nm">{s.participant.name}</div>
            <div className="flags">
              {s.participant.teams.map((t) => <span key={t} className="f">{flagOf(t)}</span>)}
            </div>
            <div className="pts">{s.points}<span className="u">pts</span></div>
            <div className="meta">GD {gdStr(s.gd)} · last 5 {formByParticipant[s.participant.id] || "—"}</div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>Full table</h2>
        <div className="spacer" />
        <span className="eyebrow">Tap a player · GD tie-break</span>
      </div>
      <div className="board">
        <div className="head">
          <span>#</span><span>Player</span><span>Teams</span><span>Form</span>
          <span className="r">GD</span><span className="r">Pts</span>
        </div>
        {standings.map((s, i) => {
          const p = s.participant
          return (
            <a
              key={p.id}
              href={`#/players/${p.id}`}
              className={`row ${i === 0 ? "leader" : ""}`}
              aria-label={`Rank ${i + 1}, ${p.name}, ${s.points} points, goal difference ${gdStr(s.gd)}${s.liveMatches > 0 ? `, ${s.liveMatches} live` : ""}`}
            >
              <div className="rk">
                <span className="pos">{i + 1}</span>
                <MvTag mv={mvByParticipant[p.id] ?? 0} />
              </div>
              <div className="who">
                <div className="ava" style={{ background: colorOf(p.id) }}>
                  {initialsOf(p.name)}
                  {s.liveMatches > 0 && <span className="livedot" />}
                </div>
                <div>
                  <div className="nm">{p.name}</div>
                  <div className="sub">{s.won}W {s.drawn}D {s.lost}L · {p.teams.length} teams</div>
                </div>
              </div>
              <div className="flagcluster">
                {p.teams.map((t) => <span key={t} className="f">{flagOf(t)}</span>)}
              </div>
              <FormPips form={formByParticipant[p.id] ?? ""} />
              <div className={`gd num ${s.gd > 0 ? "pos" : s.gd < 0 ? "neg" : ""}`}>{gdStr(s.gd)}</div>
              <div className="pts-cell num">{s.points}</div>
            </a>
          )
        })}
      </div>
      <div className="footnote">
        <span className="chip">WIN +{POINTS.win}</span>
        <span className="chip">DRAW +{POINTS.draw}</span>
        <span className="chip">KO ROUND +{POINTS.nextRound}</span>
        Draw a team that goes out early? You keep the points. No swaps, no refunds.
      </div>
    </>
  )
}

/* ════════ MATCH DAY ════════ */
function MatchCard({ m }: { m: Match }) {
  const live = isLive(m)
  const fin = isFinished(m)
  const k = fmtKickoff(m.utcDate)
  const ko = (STAGE_RANK[m.stage] ?? 0) > 0
  const showScore = (live || fin) && (m.homeScore != null || m.awayScore != null)

  const stat = live ? (
    <span className="stat live"><span className="pip" />{m.minute ?? "LIVE"}</span>
  ) : fin ? (
    <span className="stat ft">FULL TIME</span>
  ) : (
    <span className="stat soon">{k.time}</span>
  )

  const Side = ({ team, score, other }: { team: string; score: number | null; other: number | null }) => {
    const dim = showScore && (score ?? 0) < (other ?? 0)
    return (
      <div className={`side ${dim ? "dim" : ""}`}>
        <span className="fl">{flagOf(team)}</span>
        <div>
          <span className="tn">{team}</span>
          <OwnerLine team={team} />
        </div>
        <span className="sc">{showScore ? score ?? 0 : ""}</span>
      </div>
    )
  }

  return (
    <div className={`match ${live ? "islive" : ""}`}>
      <div className="mh"><span className="when">{k.day}{ko ? ` · ${STAGE_SHORT[m.stage] ?? m.stage}` : ""}</span>{stat}</div>
      <Side team={m.homeTeam} score={m.homeScore} other={m.awayScore} />
      {!showScore && <div className="vs">vs</div>}
      <Side team={m.awayTeam} score={m.awayScore} other={m.homeScore} />
    </div>
  )
}

export function MatchDayPage({ d }: { d: PageData }) {
  const { matches } = d
  const live = matches.filter(isLive).sort(byDate)
  const finished = matches.filter(isFinished).sort((a, b) => byDate(b, a))
  const upcoming = matches.filter(isUpcoming).sort(byDate)

  return (
    <>
      <div className="section-head">
        <h2>Match Day</h2>
        <div className="spacer" />
        <span className="eyebrow">{live.length} live · {finished.length} done · {upcoming.length} to come</span>
      </div>

      {live.length > 0 && (
        <>
          <div className="dayhdr" style={{ marginTop: 6 }}>🔴 Live now</div>
          <div className="match-grid">{live.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </>
      )}

      <div className="section-head mt"><h2>Results</h2></div>
      {finished.length === 0 && <div className="empty">No results yet — tournament runs {TOURNAMENT.fromDate} → {TOURNAMENT.toDate}</div>}
      {groupByDay(finished).map(({ day, ms }) => (
        <React.Fragment key={day}>
          <div className="dayhdr">{day}</div>
          <div className="match-grid">{ms.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </React.Fragment>
      ))}

      <div className="section-head mt"><h2>Coming up</h2></div>
      {upcoming.length === 0 && <div className="empty">No scheduled fixtures</div>}
      {groupByDay(upcoming).map(({ day, ms }) => (
        <React.Fragment key={day}>
          <div className="dayhdr">{day}</div>
          <div className="match-grid">{ms.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </React.Fragment>
      ))}
    </>
  )
}

/* ════════ BRACKET ════════ */
const KO_ORDER = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"]

function Tie({ m, final }: { m: Match; final?: boolean }) {
  const fin = isFinished(m)
  const hw = fin && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore
  const aw = fin && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore
  const T = ({ team, win, score }: { team: string; win: boolean; score: number | null }) => (
    <div className={`t ${win ? "win" : ""}`}>
      <span className="fl">{flagOf(team)}</span>
      <span className="tn">{team}</span>
      <span className="sc num">{score ?? "–"}</span>
      <span className="od" style={{ background: ownerId(team) ? colorOf(ownerId(team)) : "transparent" }} />
    </div>
  )
  return (
    <div className={`tie ${final ? "final" : ""} ${isLive(m) ? "islive" : ""}`} title={fmtKickoff(m.utcDate).day}>
      <T team={m.homeTeam} win={hw} score={m.homeScore} />
      <T team={m.awayTeam} win={aw} score={m.awayScore} />
    </div>
  )
}

export function BracketPage({ d }: { d: PageData }) {
  const { matches } = d
  const ko = matches.filter((m) => (STAGE_RANK[m.stage] ?? 0) > 0)
  const final = ko.find((m) => m.stage === "FINAL")
  const third = ko.find((m) => m.stage === "THIRD_PLACE")
  const champ = final && isFinished(final) && final.homeScore != null && final.awayScore != null
    && final.homeScore !== final.awayScore
    ? (final.homeScore > final.awayScore ? final.homeTeam : final.awayTeam)
    : null

  return (
    <>
      <div className="section-head">
        <h2>The Bracket</h2>
        <div className="spacer" />
        <span className="eyebrow">+{POINTS.nextRound} per round reached</span>
      </div>

      {ko.length === 0 ? (
        <div className="empty">
          Bracket locks in once the group stage wraps — check back when the Round of 32 is drawn.
        </div>
      ) : (
        <div className="bracket">
          {KO_ORDER.map((stage) => {
            const ties = ko.filter((m) => m.stage === stage).sort(byDate)
            return (
              <div className="bcol" key={stage}>
                <div className="bcol-h">{STAGE_LABEL[stage]}</div>
                <div className="bcol-body">
                  {stage === "FINAL" ? (
                    <>
                      {final && <Tie m={final} final />}
                      {champ && (
                        <div className="champ">
                          <div className="lbl">World champions</div>
                          <div className="fl">{flagOf(champ)}</div>
                          <div className="tn">{champ}</div>
                          <div className="lbl" style={{ marginTop: 6 }}>{ownerName(champ) ?? "—"} cashes in 🏆</div>
                        </div>
                      )}
                      {third && (
                        <>
                          <div className="bcol-h" style={{ marginTop: 10 }}>Third place</div>
                          <Tie m={third} />
                        </>
                      )}
                      {!final && <div className="tie"><div className="t"><span className="fl" /><span className="tn">TBD</span></div><div className="t"><span className="fl" /><span className="tn">TBD</span></div></div>}
                    </>
                  ) : ties.length ? (
                    ties.map((m) => <Tie key={m.id} m={m} />)
                  ) : (
                    <div className="tie"><div className="t"><span className="fl" /><span className="tn">TBD</span></div><div className="t"><span className="fl" /><span className="tn">TBD</span></div></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="footnote bracket-note">
        <span className="chip">R32 → FINAL</span>
        Reaching each round is <b>+{POINTS.nextRound}</b> for the owner — the bracket is where the
        table can flip. Coloured dots show who owns each nation.
      </div>
    </>
  )
}

/* ════════ PLAYERS ════════ */
function MiniPips({ form }: { form: string[] }) {
  return (
    <span className="mini">
      {form.slice(-5).map((c, i) =>
        c === "live"
          ? <span key={i} className="live">●</span>
          : <span key={i} className={c === "W" ? "w" : c === "D" ? "d" : "l"}>{c}</span>
      )}
    </span>
  )
}

function PlayerCardTop({ s, rank }: { s: Standing; rank: number }) {
  const p = s.participant
  return (
    <div className="top" style={{ background: colorOf(p.id) }}>
      <div className="ava">{initialsOf(p.name)}</div>
      <div>
        <div className="nm">{p.name}</div>
        <div className="sub">RANK #{rank} · {s.won}W {s.drawn}D {s.lost}L · GD {gdStr(s.gd)}</div>
      </div>
      <div className="big"><div className="n">{s.points}</div><div className="u">POINTS</div></div>
    </div>
  )
}

function PlayerTeamRows({ s, rowByTeam }: { s: Standing; rowByTeam: Map<string, TeamRow> }) {
  return (
    <div className="body">
      {s.teams.map((t) => {
        const row = rowByTeam.get(t.team)
        return (
          <div className="teamrow" key={t.team}>
            <span className="fl">{flagOf(t.team)}</span>
            <span className="tn">{t.team}</span>
            <MiniPips form={row?.form ?? []} />
            <span className={`tp ${row?.live ? "live" : ""}`}>{t.points} pt{t.points === 1 ? "" : "s"}</span>
          </div>
        )
      })}
    </div>
  )
}

export function PlayersPage({ d, playerId }: { d: PageData; playerId?: string }) {
  if (playerId && PARTICIPANTS.some((p) => p.id === playerId)) {
    return <PlayerDetail d={d} id={playerId} />
  }
  const { standings, teamRows } = d
  const rowByTeam = new Map(teamRows.map((r) => [r.team, r]))
  return (
    <>
      <div className="section-head">
        <h2>The Players</h2>
        <div className="spacer" />
        <span className="eyebrow">{PARTICIPANTS.length} owners · 48 nations</span>
      </div>
      <div className="pairs-grid">
        {standings.map((s, i) => (
          <a key={s.participant.id} href={`#/players/${s.participant.id}`} className="pcard link">
            <PlayerCardTop s={s} rank={i + 1} />
            <PlayerTeamRows s={s} rowByTeam={rowByTeam} />
          </a>
        ))}
      </div>
    </>
  )
}

function PlayerDetail({ d, id }: { d: PageData; id: string }) {
  const { standings, teamRows, matches } = d
  const idx = standings.findIndex((s) => s.participant.id === id)
  const s = standings[idx]
  const rowByTeam = new Map(teamRows.map((r) => [r.team, r]))
  const teamSet = new Set(s.participant.teams)
  const theirs = matches.filter((m) => teamSet.has(m.homeTeam) || teamSet.has(m.awayTeam))
  const live = theirs.filter(isLive).sort(byDate)
  const upcoming = theirs.filter(isUpcoming).sort(byDate).slice(0, 12)
  const results = theirs.filter(isFinished).sort((a, b) => byDate(b, a)).slice(0, 12)

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <a href="#/players" className="chip">← All players</a>
      </div>

      <div className="pcard" style={{ marginBottom: 30 }}>
        <PlayerCardTop s={s} rank={idx + 1} />
        <PlayerTeamRows s={s} rowByTeam={rowByTeam} />
      </div>

      {live.length > 0 && (
        <>
          <div className="dayhdr">🔴 Live now</div>
          <div className="match-grid">{live.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </>
      )}

      <div className="section-head mt"><h2>Coming up</h2><div className="spacer" /><span className="eyebrow">{s.participant.name}'s teams</span></div>
      {upcoming.length
        ? <div className="match-grid">{upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        : <div className="empty">No upcoming fixtures</div>}

      <div className="section-head mt"><h2>Results</h2></div>
      {results.length
        ? <div className="match-grid">{results.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        : <div className="empty">No results yet</div>}
    </>
  )
}

/* ════════ TEAMS ════════ */
export function TeamsPage({ d }: { d: PageData }) {
  const { teamRows, standings } = d
  const [owner, setOwner] = useState<string>("all")
  // points from the scoring engine (same source as Standings/Players) so a
  // team can't show a different total across tabs
  const ptsByTeam = new Map<string, number>()
  for (const s of standings) for (const t of s.teams) ptsByTeam.set(t.team, t.points)
  const ptsOf = (team: string) => ptsByTeam.get(team) ?? 0
  const sorted = [...teamRows].sort((a, b) => ptsOf(b.team) - ptsOf(a.team) || a.team.localeCompare(b.team))
  const rows = owner === "all" ? sorted : sorted.filter((t) => ownerId(t.team) === owner)

  return (
    <>
      <div className="section-head">
        <h2>The Teams</h2>
        <div className="spacer" />
        <span className="eyebrow">48 nations · points contributed</span>
      </div>
      <div className="filterbar">
        <button className={`fbtn ${owner === "all" ? "active" : ""}`} onClick={() => setOwner("all")}>
          All 48
        </button>
        {PARTICIPANTS.map((p) => (
          <button
            key={p.id}
            className={`fbtn ${owner === p.id ? "active" : ""}`}
            onClick={() => setOwner(p.id)}
          >
            <span className="dotc" style={{ background: colorOf(p.id) }} />{p.name}
          </button>
        ))}
      </div>
      <div className="teams-grid">
        {rows.map((t) => (
          <div className="tcard" key={t.team}>
            <span className="stripe" style={{ background: colorOf(ownerId(t.team)) }} />
            {t.live && <span className="livedot" />}
            <span className="fl">{flagOf(t.team)}</span>
            <div className="info">
              <div className="tn">{t.team}</div>
              <div className="ow">{STAGE_SHORT[t.stage] ?? t.stage} · {t.owner}</div>
            </div>
            <div className="pp">{ptsOf(t.team)}<small>PTS</small></div>
          </div>
        ))}
      </div>
    </>
  )
}

/* ════════ STATS ════════ */
export function StatsPage({ d }: { d: PageData }) {
  const { standings, totals, mvByParticipant } = d
  const leader = standings[0]
  const last = standings[standings.length - 1]
  const mover = [...standings].sort(
    (a, b) => (mvByParticipant[b.participant.id] ?? 0) - (mvByParticipant[a.participant.id] ?? 0)
  )[0]
  const moverMv = mover ? mvByParticipant[mover.participant.id] ?? 0 : 0
  const topTeam = standings.flatMap((s) => s.teams).sort((a, b) => b.points - a.points)[0]
  const maxPts = Math.max(1, leader?.points ?? 0)

  return (
    <>
      <div className="section-head">
        <h2>The Stats</h2>
        <div className="spacer" />
        <span className="eyebrow">For the group chat</span>
      </div>
      <div className="stat-grid">
        <div className="scard gold">
          <span className="em">👑</span>
          <div className="k">Top of the pile</div>
          <div className="v">{leader?.participant.name ?? "—"}</div>
          <div className="d">{leader?.points ?? 0} pts · {leader?.won ?? 0} wins · GD {gdStr(leader?.gd ?? 0)}</div>
        </div>
        <div className="scard teal">
          <span className="em">📈</span>
          <div className="k">Biggest climber</div>
          <div className="v">{moverMv > 0 ? mover.participant.name : "—"}</div>
          <div className="d">{moverMv > 0 ? `Up ${moverMv} place${moverMv === 1 ? "" : "s"} today` : "No risers yet today"}</div>
        </div>
        <div className="scard coral">
          <span className="em">🥶</span>
          <div className="k">Rock bottom</div>
          <div className="v">{last?.participant.name ?? "—"}</div>
          <div className="d">{last?.points ?? 0} pts — propping up the table</div>
        </div>
        <div className="scard ink">
          <span className="em">{topTeam && topTeam.points > 0 ? flagOf(topTeam.team) : "⚽"}</span>
          <div className="k">Best pick so far</div>
          <div className="v">{topTeam && topTeam.points > 0 ? topTeam.team : "—"}</div>
          <div className="d">{topTeam && topTeam.points > 0 ? `${topTeam.points} pts for ${ownerName(topTeam.team)}` : "No points banked yet"}</div>
        </div>
        <div className="scard cream">
          <span className="em">⚽</span>
          <div className="k">Goals so far</div>
          <div className="v">{totals.goals}</div>
          <div className="d">across {totals.finished} finished games</div>
        </div>
        <div className="scard cream">
          <span className="em">📅</span>
          <div className="k">Matches played</div>
          <div className="v">{totals.played}<span style={{ fontSize: 20 }}> / {TOTAL_MATCHES}</span></div>
          <div className="d">{totals.upcoming} still to come</div>
        </div>
      </div>
      <div className="section-head"><h2>Points by player</h2></div>
      <div className="barlist">
        {standings.map((s) => (
          <div className="barrow" key={s.participant.id}>
            <span className="bn">{s.participant.name}</span>
            <div className="bartrack">
              <div
                className="barfill"
                style={{
                  width: `${Math.round((s.points / maxPts) * 100)}%`,
                  background: colorOf(s.participant.id),
                }}
              />
            </div>
            <span className="bv">{s.points}</span>
          </div>
        ))}
      </div>
    </>
  )
}

/* ════════ RULES ════════ */
export function RulesPage(_: { d: PageData }) {
  return (
    <>
      <div className="section-head">
        <h2>How it works</h2>
        <div className="spacer" />
        <span className="eyebrow">The sweepstake rules</span>
      </div>
      <div className="rules-grid">
        <div className="rule-card">
          <h3>Scoring</h3>
          <div className="score-line">
            <div className="ic" style={{ background: "rgba(7,160,133,.14)" }}>✅</div>
            <div className="lab">Win<small>any of your teams wins a match</small></div>
            <div className="pl pos">+{POINTS.win}</div>
          </div>
          <div className="score-line">
            <div className="ic" style={{ background: "rgba(255,176,46,.18)" }}>🤝</div>
            <div className="lab">Draw<small>a point for a stalemate</small></div>
            <div className="pl pos">+{POINTS.draw}</div>
          </div>
          <div className="score-line">
            <div className="ic" style={{ background: "rgba(46,91,255,.12)" }}>🚀</div>
            <div className="lab">Reach a knockout round<small>R32, R16, QF, SF, Final — each step</small></div>
            <div className="pl pos">+{POINTS.nextRound}</div>
          </div>
        </div>
        <div>
          <div className="rule-card">
            <h3>Tie-breaks</h3>
            <div className="tiebreak"><span className="n">1</span><div><b>Goal difference</b> across all your teams</div></div>
            <div className="tiebreak"><span className="n">2</span><div><b>Goals scored</b> — attack wins the day</div></div>
            <div className="tiebreak"><span className="n">3</span><div><b>Alphabetical</b> on name. Brutal but simple.</div></div>
          </div>
        </div>
      </div>
      <div className="footnote" style={{ marginTop: 24 }}>
        <span className="chip">{PARTICIPANTS.length} players</span>
        <span className="chip">48 nations</span>
        <span className="chip">4–6 each</span>
        Drafted from a hat. Draw a team that flops? You keep their points. No swaps, no refunds, no mercy.
      </div>
    </>
  )
}

/* ════════ ADMIN ════════ */
export function AdminPage({ d }: { d: PageData }) {
  const { updatedAt, reload, totals, matches } = d
  const lastSync = updatedAt ? new Date(updatedAt).toLocaleString() : "never"
  const dataUrl = `${import.meta.env.BASE_URL}data/matches.json`

  return (
    <>
      <div className="section-head">
        <h2>Admin</h2>
        <div className="spacer" />
        <span className="eyebrow">Draft · data · sync</span>
      </div>
      <div className="admin-grid">
        <div className="rule-card">
          <h3>The draft</h3>
          {PARTICIPANTS.map((p) => (
            <div className="draft-row" key={p.id}>
              <div className="ava" style={{ background: colorOf(p.id) }}>{initialsOf(p.name)}</div>
              <div className="nm">{p.name}</div>
              <div className="chips">
                {p.teams.map((t) => <span key={t} className="chip">{flagOf(t)} {t}</span>)}
              </div>
            </div>
          ))}
          <div className="footnote" style={{ marginTop: 14 }}>
            Edit the draft in <code>src/data/draft.ts</code> and push to update.
          </div>
        </div>
        <div className="admin-col">
          <div className="rule-card">
            <h3>Data</h3>
            <div className="footnote" style={{ marginTop: 0, marginBottom: 14 }}>
              <span className="chip">last sync {lastSync}</span>
              <span className="chip">{matches.length} matches loaded</span>
              <span className="chip">{totals.played} played</span>
              <span className="chip">{totals.live} live</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="ghost-btn" style={{ justifyContent: "center" }} onClick={reload}>⟳ Reload scores now</button>
              <a className="ghost-btn" style={{ justifyContent: "center" }} href={dataUrl} download>↓ Download matches.json</a>
            </div>
          </div>
          <div className="rule-card">
            <h3>Where scores come from</h3>
            <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
              <p style={{ marginTop: 0 }}>
                Baseline results come from <code>football-data.org</code> via a scheduled CI job
                (~every 10 min); the browser layers ESPN live scores on top every 60s.
              </p>
              <p style={{ marginBottom: 0 }}>
                <code>FOOTBALL_DATA_KEY</code> is a GitHub repo secret used only by the CI fetch
                job — it never reaches the browser.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
