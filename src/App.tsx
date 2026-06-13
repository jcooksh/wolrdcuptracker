import * as React from "react"

import { PARTICIPANTS } from "@/data/draft"
import { computeStandings, type Match } from "@/lib/scoring"
import {
  buildTeamRows, participantForm, knockoutCount, tournamentTotals,
} from "@/lib/derive"
import {
  fetchLiveOverrides, applyLiveOverrides, emptyOverlay, type LiveOverlay,
} from "@/lib/livescores"
import {
  StandingsPage, MatchDayPage, BracketPage, PlayersPage,
  TeamsPage, StatsPage, RulesPage, AdminPage,
  type PageData,
} from "@/pages"
import { DankFx, playAirhorn, playOof } from "@/dank"

const POLL_MS = 60_000
const ME = "" // no "current user" — nobody is highlighted as YOU

interface MatchesFile {
  updatedAt?: string | null
  matches: Match[]
}

type RouteKey =
  | "standings" | "matchday" | "bracket" | "players"
  | "teams" | "stats" | "rules" | "admin"

const TABS: Array<{ key: RouteKey; label: string; ico: string }> = [
  { key: "standings", label: "Standings", ico: "🏆" },
  { key: "matchday", label: "Match Day", ico: "⚽" },
  { key: "bracket", label: "Bracket", ico: "🗺️" },
  { key: "players", label: "Players", ico: "👥" },
  { key: "teams", label: "Teams", ico: "🌍" },
  { key: "stats", label: "Stats", ico: "📊" },
  { key: "rules", label: "Rules", ico: "📖" },
  { key: "admin", label: "Admin", ico: "⚙️" },
]

const ROUTES = new Set<string>(TABS.map((t) => t.key))
// old/design deep links keep working
const ROUTE_ALIAS: Record<string, RouteKey> = {
  fixtures: "matchday", matches: "matchday", pairs: "players",
}

function parseHash(): { route: RouteKey; param: string } {
  const segs = location.hash.replace(/^#\/?/, "").split("/")
  const raw = ROUTE_ALIAS[segs[0]] ?? segs[0]
  if (ROUTES.has(raw)) return { route: raw as RouteKey, param: segs[1] ?? "" }
  const stored = localStorage.getItem("ct-tab")
  return {
    route: stored && ROUTES.has(stored) ? (stored as RouteKey) : "standings",
    param: "",
  }
}

export default function App() {
  const [matches, setMatches] = React.useState<Match[]>([])
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [{ route, param }, setNav] = React.useState(parseHash())

  // ── ULTRA MEGA DANK MODE (triple-click bottom-right corner) ──
  const [dank, setDank] = React.useState(() => localStorage.getItem("dank") === "1")
  const [dankBanner, setDankBanner] = React.useState(false)
  const clickTimes = React.useRef<number[]>([])

  React.useEffect(() => {
    document.body.classList.toggle("dank", dank)
    localStorage.setItem("dank", dank ? "1" : "0")
  }, [dank])

  const cornerClick = () => {
    const now = Date.now()
    clickTimes.current = [...clickTimes.current, now].filter((t) => now - t < 900)
    if (clickTimes.current.length >= 3) {
      clickTimes.current = []
      setDank((on) => {
        const next = !on
        if (next) { playAirhorn(); setDankBanner(true); setTimeout(() => setDankBanner(false), 1800) }
        else playOof()
        return next
      })
    }
  }

  // base fixtures (built JSON) and the ESPN live overlay are fetched
  // independently so either can fail without losing the other
  const baseRef = React.useRef<Match[]>([])
  const liveRef = React.useRef<LiveOverlay>(emptyOverlay())
  const inflight = React.useRef(false)

  const load = React.useCallback(async () => {
    if (inflight.current) return
    inflight.current = true
    setLoading(true)
    try {
      try {
        const url = `${import.meta.env.BASE_URL}data/matches.json?t=${Date.now()}`
        const res = await fetch(url, { cache: "no-store" })
        const data: MatchesFile = await res.json()
        baseRef.current = data.matches ?? []
        setUpdatedAt(data.updatedAt ?? null)
      } catch {
        /* keep last good base data */
      }
      try {
        liveRef.current = {
          fetchedAt: Date.now(),
          map: await fetchLiveOverrides(liveRef.current.map),
        }
      } catch {
        /* keep last overlay; stale IN_PLAY entries stop applying after 15min */
      }
      setMatches(applyLiveOverrides(baseRef.current, liveRef.current))
    } finally {
      inflight.current = false
      setLoading(false)
    }
  }, [])

  // ticks each poll so time-based liveness (isMatchLive) re-evaluates even
  // when a fetch fails and `matches` keeps the same reference
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    load()
    const id = setInterval(() => { setNow(Date.now()); load() }, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  React.useEffect(() => {
    const onHash = () => setNav(parseHash())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  React.useEffect(() => {
    localStorage.setItem("ct-tab", route)
    window.scrollTo(0, 0)
  }, [route, param])

  const data: PageData = React.useMemo(() => {
    const standings = computeStandings(matches)
    const teamRows = buildTeamRows(matches)
    const formByParticipant: Record<string, string> = {}
    const koByParticipant: Record<string, number> = {}
    for (const p of PARTICIPANTS) {
      formByParticipant[p.id] = participantForm(matches, p.teams)
      koByParticipant[p.id] = knockoutCount(matches, p.teams)
    }
    // movement vs the table at the start of today (UTC) — powers the ▲/▼ tags.
    // Keep every fixture (so the knockout-appearance bonus matches the live
    // table) but strip the result of anything that kicked off today, so only
    // today's finished games can move a player's rank. Filtering fixtures out
    // entirely would drop their +4 KO bonus and show phantom arrows for days.
    const dayStart = new Date(now)
    dayStart.setUTCHours(0, 0, 0, 0)
    const before = matches.map((m) => {
      const t = m.utcDate ? Date.parse(m.utcDate) : NaN
      if (!Number.isNaN(t) && t >= dayStart.getTime()) {
        return { ...m, status: "TIMED", homeScore: null, awayScore: null }
      }
      return m
    })
    const prevRank: Record<string, number> = {}
    computeStandings(before).forEach((s) => { prevRank[s.participant.id] = s.rank })
    const mvByParticipant: Record<string, number> = {}
    standings.forEach((s) => {
      const prev = prevRank[s.participant.id]
      mvByParticipant[s.participant.id] = prev ? prev - s.rank : 0
    })
    return {
      me: ME,
      matches,
      standings,
      teamRows,
      totals: tournamentTotals(matches),
      formByParticipant,
      koByParticipant,
      mvByParticipant,
      updatedAt,
      reload: load,
    }
  }, [matches, updatedAt, load, now])

  const liveCount = data.totals.live

  const go = (key: RouteKey) => { location.hash = `#/${key}` }

  const PAGES: Record<RouteKey, React.ReactNode> = {
    standings: <StandingsPage d={data} />,
    matchday: <MatchDayPage d={data} />,
    bracket: <BracketPage d={data} />,
    players: <PlayersPage d={data} playerId={param} />,
    teams: <TeamsPage d={data} />,
    stats: <StatsPage d={data} />,
    rules: <RulesPage d={data} />,
    admin: <AdminPage d={data} />,
  }

  return (
    <div className="app">
      <div className="accentbar"><i /><i /><i /><i /><i /></div>

      <div className="wrap head">
        <header className="topbar">
          <div
            className="logo"
            role="button"
            tabIndex={0}
            onClick={() => go("standings")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("standings") } }}
          >
            <div className="ball">C</div>
            <div className="wm">CUP<span>TRACK</span></div>
          </div>
          <div className="spacer" />
          <span className="hostflags" title="Hosts: USA · Canada · Mexico">🇺🇸 🇨🇦 🇲🇽</span>
          {liveCount > 0 && (
            <span className="live-pill"><span className="pip" />{liveCount} LIVE</span>
          )}
          <button className="ghost-btn" onClick={load} disabled={loading}>
            {loading ? "↻ Updating…" : "↻ Refresh"}
          </button>
        </header>
      </div>

      <nav className="nav">
        <div className="nav-inner">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`#/${t.key}`}
              className={route === t.key ? "tab active" : "tab"}
            >
              <span className="ico">{t.ico}</span>
              {t.label}
              {t.key === "matchday" && liveCount > 0 && (
                <span className="badge">{liveCount}</span>
              )}
            </a>
          ))}
        </div>
      </nav>

      <div className="wrap">
        <main className="page" key={`${route}/${param}`}>{PAGES[route]}</main>
      </div>

      {/* secret dank-mode trigger — triple-click me */}
      <div className="dank-corner" onClick={cornerClick} aria-hidden />
      {dank && <DankFx />}
      {dankBanner && <div className="dank-banner">420<br />DANK MODE<br />ENABLED</div>}
    </div>
  )
}
