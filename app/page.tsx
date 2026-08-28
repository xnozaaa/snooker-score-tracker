'use client';

import { useEffect, useMemo, useState } from 'react';

type PlayerId = 'AA' | 'JK' | 'NH' | 'NA';
type TeamId = 'gold' | 'green';
type ShotKind = 'fluke' | 'frameBallFluke';
type BreakBallId = 'red' | 'yellow' | 'green' | 'brown' | 'blue' | 'pink' | 'black';

type BreakEntry = {
  id: string;
  playerId: PlayerId;
  points: number;
  balls?: BreakBallId[];
  createdAt: number;
};

type ShotEntry = {
  id: string;
  playerId: PlayerId;
  kind: ShotKind;
  createdAt: number;
};

type FoulEntry = {
  id: string;
  offenderId: PlayerId;
  awardedTeam: TeamId;
  points: 4 | 5 | 6 | 7;
  createdAt: number;
};

type Frame = {
  id: string;
  number: number;
  breaks: BreakEntry[];
  shots: ShotEntry[];
  fouls?: FoulEntry[];
  winner?: TeamId;
  closedAt?: number;
};

type ManualHighBreak = BreakEntry;

type DaySession = {
  frameWins: Record<TeamId, number>;
  frames: Frame[];
  manualHighBreaks: ManualHighBreak[];
};

type TrackerData = {
  version: 1;
  players: Record<PlayerId, string>;
  sessions: Record<string, DaySession>;
};

const PLAYER_IDS: PlayerId[] = ['AA', 'JK', 'NH', 'NA'];
const BREAK_BALLS = [
  { id: 'red', name: 'Red', points: 1 },
  { id: 'yellow', name: 'Yellow', points: 2 },
  { id: 'green', name: 'Green', points: 3 },
  { id: 'brown', name: 'Brown', points: 4 },
  { id: 'blue', name: 'Blue', points: 5 },
  { id: 'pink', name: 'Pink', points: 6 },
  { id: 'black', name: 'Black', points: 7 },
] as const;
const FOUL_POINTS = [4, 5, 6, 7] as const;
const TEAM_PLAYERS: Record<TeamId, PlayerId[]> = {
  gold: ['AA', 'JK'],
  green: ['NH', 'NA'],
};
const STORAGE_KEY = 'digital-nuggy-book-v1';

function id() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function emptyFrame(number: number): Frame {
  return { id: id(), number, breaks: [], shots: [], fouls: [] };
}

function emptySession(): DaySession {
  return {
    frameWins: { gold: 0, green: 0 },
    frames: [emptyFrame(1)],
    manualHighBreaks: [],
  };
}

const EMPTY_DATA: TrackerData = {
  version: 1,
  players: { AA: 'AA', JK: 'JK', NH: 'NH', NA: 'NA' },
  sessions: {},
};

function formatDay(dateKey: string) {
  if (!dateKey) return 'Today';
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function teamScore(frame: Frame, team: TeamId) {
  const breakPoints = frame.breaks
    .filter((entry) => TEAM_PLAYERS[team].includes(entry.playerId))
    .reduce((total, entry) => total + entry.points, 0);
  const foulPoints = (frame.fouls ?? [])
    .filter((entry) => entry.awardedTeam === team)
    .reduce((total, entry) => total + entry.points, 0);
  return breakPoints + foulPoints;
}

function playerScore(frame: Frame, playerId: PlayerId) {
  return frame.breaks
    .filter((entry) => entry.playerId === playerId)
    .reduce((total, entry) => total + entry.points, 0);
}

export default function Home() {
  const [data, setData] = useState<TrackerData>(EMPTY_DATA);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerId>('AA');
  const [currentBalls, setCurrentBalls] = useState<BreakBallId[]>([]);
  const [breakInput, setBreakInput] = useState('');
  const [manualPlayer, setManualPlayer] = useState<PlayerId>('AA');
  const [manualInput, setManualInput] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const today = localDateKey();
    let next = EMPTY_DATA;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TrackerData;
        if (parsed?.version === 1 && parsed.players && parsed.sessions) next = parsed;
      }
    } catch {
      // A damaged browser record should never stop score entry.
    }
    if (!next.sessions[today]) {
      next = { ...next, sessions: { ...next.sessions, [today]: emptySession() } };
    }
    setData(next);
    setSelectedDate(today);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrated]);

  const session = selectedDate ? data.sessions[selectedDate] ?? emptySession() : emptySession();
  const activeFrame = session.frames.find((frame) => !frame.winner) ?? session.frames.at(-1)!;
  const completedFrames = session.frames.filter((frame) => frame.winner).toReversed();

  const highBreaks = useMemo(() => {
    const recorded = session.frames.flatMap((frame) =>
      frame.breaks.map((entry) => ({ ...entry, source: `Frame ${frame.number}` })),
    );
    const manual = session.manualHighBreaks.map((entry) => ({ ...entry, source: 'Manual entry' }));
    return [...recorded, ...manual].sort(
      (a, b) => b.points - a.points || b.createdAt - a.createdAt,
    );
  }, [session.frames, session.manualHighBreaks]);

  const liveEvents = useMemo(() => {
    const breaks = activeFrame.breaks.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      actor: data.players[entry.playerId] || entry.playerId,
      label: `${entry.points} break${entry.balls?.length ? ` · ${entry.balls.length} balls` : ''}`,
      tone: 'break',
    }));
    const shots = activeFrame.shots.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      actor: data.players[entry.playerId] || entry.playerId,
      label: entry.kind === 'fluke' ? 'Fluke' : 'Crucial frame-ball fluke',
      tone: entry.kind,
    }));
    const fouls = (activeFrame.fouls ?? []).map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      actor: TEAM_PLAYERS[entry.awardedTeam]
        .map((playerId) => data.players[playerId] || playerId)
        .join(' / '),
      label: `Awarded ${entry.points} foul points`,
      tone: 'foul',
    }));
    return [...breaks, ...shots, ...fouls].sort((a, b) => b.createdAt - a.createdAt);
  }, [activeFrame, data.players]);

  function updateSession(change: (current: DaySession) => DaySession) {
    if (!selectedDate) return;
    setData((current) => {
      const base = current.sessions[selectedDate] ?? emptySession();
      return {
        ...current,
        sessions: { ...current.sessions, [selectedDate]: change(base) },
      };
    });
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2400);
  }

  function saveBreak(points: number, balls?: BreakBallId[]) {
    if (!Number.isInteger(points) || points < 1 || points > 147) {
      showNotice('Enter a whole break from 1 to 147.');
      return;
    }
    const entry: BreakEntry = {
      id: id(),
      playerId: selectedPlayer,
      points,
      balls: balls?.length ? [...balls] : undefined,
      createdAt: Date.now(),
    };
    updateSession((current) => ({
      ...current,
      frames: current.frames.map((frame) =>
        frame.id === activeFrame.id ? { ...frame, breaks: [...frame.breaks, entry] } : frame,
      ),
    }));
    showNotice(`${data.players[selectedPlayer]} · ${points} break added`);
  }

  function addBall(ballId: BreakBallId) {
    const ball = BREAK_BALLS.find((item) => item.id === ballId)!;
    const nextTotal = currentBalls.reduce<number>(
      (total, currentBallId) => total + BREAK_BALLS.find((item) => item.id === currentBallId)!.points,
      ball.points,
    );
    if (nextTotal > 147) {
      showNotice('The current break cannot go above 147.');
      return;
    }
    setCurrentBalls((current) => [...current, ballId]);
    if ('vibrate' in navigator) navigator.vibrate(10);
  }

  function saveBuiltBreak() {
    const points = currentBalls.reduce<number>(
      (total, ballId) => total + BREAK_BALLS.find((item) => item.id === ballId)!.points,
      0,
    );
    if (!points) {
      showNotice('Tap a ball to start the break.');
      return;
    }
    saveBreak(points, currentBalls);
    setCurrentBalls([]);
  }

  function addManualBreak() {
    const points = Number(breakInput);
    if (!Number.isInteger(points) || points < 1 || points > 147) {
      showNotice('Enter a whole break from 1 to 147.');
      return;
    }
    saveBreak(points);
    setBreakInput('');
  }

  function logShot(kind: ShotKind) {
    const entry: ShotEntry = { id: id(), playerId: selectedPlayer, kind, createdAt: Date.now() };
    updateSession((current) => ({
      ...current,
      frames: current.frames.map((frame) =>
        frame.id === activeFrame.id ? { ...frame, shots: [...frame.shots, entry] } : frame,
      ),
    }));
    showNotice(kind === 'fluke' ? 'Fluke logged' : 'Crucial frame-ball fluke logged');
  }

  function logFoul(points: 4 | 5 | 6 | 7) {
    const offenderTeam: TeamId = TEAM_PLAYERS.gold.includes(selectedPlayer) ? 'gold' : 'green';
    const awardedTeam: TeamId = offenderTeam === 'gold' ? 'green' : 'gold';
    const entry: FoulEntry = {
      id: id(),
      offenderId: selectedPlayer,
      awardedTeam,
      points,
      createdAt: Date.now(),
    };
    updateSession((current) => ({
      ...current,
      frames: current.frames.map((frame) =>
        frame.id === activeFrame.id
          ? { ...frame, fouls: [...(frame.fouls ?? []), entry] }
          : frame,
      ),
    }));
    const awardedLabel = TEAM_PLAYERS[awardedTeam]
      .map((playerId) => data.players[playerId] || playerId)
      .join(' / ');
    showNotice(`${points} foul points awarded to ${awardedLabel}`);
  }

  function undoLastEvent() {
    const last = liveEvents[0];
    if (!last) {
      showNotice('Nothing to undo in this frame.');
      return;
    }
    updateSession((current) => ({
      ...current,
      frames: current.frames.map((frame) =>
        frame.id === activeFrame.id
          ? {
              ...frame,
              breaks: frame.breaks.filter((entry) => entry.id !== last.id),
              shots: frame.shots.filter((entry) => entry.id !== last.id),
              fouls: (frame.fouls ?? []).filter((entry) => entry.id !== last.id),
            }
          : frame,
      ),
    }));
    showNotice('Last entry undone');
  }

  function endFrame(winner: TeamId) {
    updateSession((current) => ({
      ...current,
      frameWins: { ...current.frameWins, [winner]: current.frameWins[winner] + 1 },
      frames: [
        ...current.frames.map((frame) =>
          frame.id === activeFrame.id ? { ...frame, winner, closedAt: Date.now() } : frame,
        ),
        emptyFrame(activeFrame.number + 1),
      ],
    }));
    setCurrentBalls([]);
    showNotice(`Frame ${activeFrame.number} saved`);
  }

  function addManualHighBreak() {
    const points = Number(manualInput);
    if (!Number.isInteger(points) || points < 1 || points > 147) {
      showNotice('Enter a whole break from 1 to 147.');
      return;
    }
    const entry: ManualHighBreak = {
      id: id(),
      playerId: manualPlayer,
      points,
      createdAt: Date.now(),
    };
    updateSession((current) => ({
      ...current,
      manualHighBreaks: [...current.manualHighBreaks, entry],
    }));
    setManualInput('');
    showNotice('High break recorded manually');
  }

  function removeManualHighBreak(entryId: string) {
    updateSession((current) => ({
      ...current,
      manualHighBreaks: current.manualHighBreaks.filter((entry) => entry.id !== entryId),
    }));
    showNotice('Manual high break removed');
  }

  function chooseDate(dateKey: string) {
    if (!dateKey) return;
    setCurrentBalls([]);
    setSelectedDate(dateKey);
    setData((current) =>
      current.sessions[dateKey]
        ? current
        : { ...current, sessions: { ...current.sessions, [dateKey]: emptySession() } },
    );
  }

  function resetDay() {
    if (!window.confirm(`Clear every entry for ${formatDay(selectedDate)}?`)) return;
    updateSession(() => emptySession());
    setCurrentBalls([]);
    showNotice('Day cleared');
  }

  function renamePlayer(playerId: PlayerId, name: string) {
    setData((current) => ({
      ...current,
      players: { ...current.players, [playerId]: name.slice(0, 18) },
    }));
  }

  if (!hydrated) {
    return (
      <main className="loading-screen">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <p>Opening the Nuggy Book…</p>
      </main>
    );
  }

  const goldScore = teamScore(activeFrame, 'gold');
  const greenScore = teamScore(activeFrame, 'green');
  const flukeTotal = session.frames.reduce((total, frame) => total + frame.shots.length, 0);
  const foulPointsTotal = session.frames.reduce(
    (total, frame) => total + (frame.fouls ?? []).reduce((sum, entry) => sum + entry.points, 0),
    0,
  );
  const topBreak = highBreaks[0];
  const currentBreakTotal = currentBalls.reduce<number>(
    (total, ballId) => total + BREAK_BALLS.find((ball) => ball.id === ballId)!.points,
    0,
  );
  const selectedPlayerTeam: TeamId = TEAM_PLAYERS.gold.includes(selectedPlayer) ? 'gold' : 'green';
  const foulAwardTeam: TeamId = selectedPlayerTeam === 'gold' ? 'green' : 'gold';
  const foulAwardLabel = TEAM_PLAYERS[foulAwardTeam]
    .map((playerId) => data.players[playerId] || playerId)
    .join(' / ');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div className="brand-copy">
          <p className="eyebrow">The Digital Nuggy Book</p>
          <h1>{formatDay(selectedDate)}</h1>
        </div>
        <label className="date-control">
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => chooseDate(event.target.value)}
            aria-label="Choose session date"
          />
        </label>
      </header>

      <section className="scoreboard" aria-label="Current match score">
        <div className="team-block gold-team">
          <p>{TEAM_PLAYERS.gold.map((player) => data.players[player] || player).join(' & ')}</p>
          <strong>{session.frameWins.gold}</strong>
        </div>
        <div className="frame-status">
          <span><i /> Frame {activeFrame.number} · live</span>
          <b>{goldScore} <em>—</em> {greenScore}</b>
          <small>points this frame</small>
        </div>
        <div className="team-block green-team">
          <p>{TEAM_PLAYERS.green.map((player) => data.players[player] || player).join(' & ')}</p>
          <strong>{session.frameWins.green}</strong>
        </div>
      </section>

      <section className="stat-strip" aria-label="Today's summary">
        <div><span>Frames played</span><b>{completedFrames.length}</b></div>
        <div><span>High break</span><b>{topBreak?.points ?? '—'}</b></div>
        <div><span>Fluke events</span><b>{flukeTotal}</b></div>
        <div><span>Foul points</span><b>{foulPointsTotal}</b></div>
        <button type="button" onClick={undoLastEvent} disabled={!liveEvents.length}>Undo last entry</button>
      </section>

      <section className="workspace-grid">
        <section className="entry-card panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Quick entry</p>
              <h2>Record the next break</h2>
            </div>
            <span className="selected-pill">{data.players[selectedPlayer] || selectedPlayer} selected</span>
          </div>

          <div className="player-grid" aria-label="Select player">
            {PLAYER_IDS.map((playerId) => {
              const team = TEAM_PLAYERS.gold.includes(playerId) ? 'gold' : 'green';
              const playerFlukes = activeFrame.shots.filter((shot) => shot.playerId === playerId).length;
              return (
                <button
                  className={`player-tile ${team} ${selectedPlayer === playerId ? 'selected' : ''}`}
                  key={playerId}
                  type="button"
                  onClick={() => setSelectedPlayer(playerId)}
                  aria-pressed={selectedPlayer === playerId}
                >
                  <span>{data.players[playerId] || playerId}</span>
                  <b>{playerScore(activeFrame, playerId)}</b>
                  <small>{playerFlukes} fluke{playerFlukes === 1 ? '' : 's'}</small>
                </button>
              );
            })}
          </div>

          <div className="break-builder">
            <div className="break-readout">
              <div>
                <span className="action-label">Current break · {data.players[selectedPlayer] || selectedPlayer}</span>
                <strong>{currentBreakTotal}</strong>
              </div>
              <div className="ball-sequence" aria-label={`${currentBalls.length} balls in current break`}>
                {currentBalls.length ? currentBalls.map((ballId, index) => (
                  <i className={`sequence-ball ${ballId}`} key={`${ballId}-${index}`} title={BREAK_BALLS.find((ball) => ball.id === ballId)!.name} />
                )) : <span>Tap each potted ball below</span>}
              </div>
            </div>

            <div className="ball-pad" aria-label="Snooker ball buttons">
              {BREAK_BALLS.map((ball) => (
                <button
                  className="score-ball"
                  key={ball.name}
                  type="button"
                  onClick={() => addBall(ball.id)}
                  aria-label={`Add ${ball.name}, ${ball.points} point${ball.points === 1 ? '' : 's'}`}
                >
                  <span className={`ball-face ${ball.id}`}>{ball.points}</span>
                  <small>{ball.name}</small>
                </button>
              ))}
            </div>

            <div className="break-actions">
              <button type="button" onClick={() => setCurrentBalls((current) => current.slice(0, -1))} disabled={!currentBalls.length}>Undo ball</button>
              <button type="button" onClick={() => setCurrentBalls([])} disabled={!currentBalls.length}>Clear</button>
              <button className="primary-button" type="button" onClick={saveBuiltBreak}>Save {currentBreakTotal || ''} break</button>
            </div>
          </div>

          <details className="manual-score-entry">
            <summary>Enter a break total manually</summary>
            <div className="entry-row">
              <label className="break-field">
                <span>Break score</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  max="147"
                  placeholder="0"
                  value={breakInput}
                  onChange={(event) => setBreakInput(event.target.value.replace(/\D/g, '').slice(0, 3))}
                  onKeyDown={(event) => event.key === 'Enter' && addManualBreak()}
                  aria-label="Break score"
                />
              </label>
              <button className="secondary-save-button" type="button" onClick={addManualBreak}>Add break</button>
            </div>
          </details>

          <div className="shot-actions">
            <div>
              <span className="action-label">Shot tags for {data.players[selectedPlayer] || selectedPlayer}</span>
              <p>Log these separately from the break score.</p>
            </div>
            <button className="fluke-button" type="button" onClick={() => logShot('fluke')}>
              <span className="ball-icon yellow" aria-hidden="true" /> Log fluke
            </button>
            <button className="crucial-button" type="button" onClick={() => logShot('frameBallFluke')}>
              <span className="ball-icon black" aria-hidden="true" /> Frame-ball fluke
            </button>
          </div>

          <div className="foul-actions">
            <div>
              <span className="action-label">Foul by {data.players[selectedPlayer] || selectedPlayer}</span>
              <p>Points are awarded to {foulAwardLabel}.</p>
            </div>
            <div className="foul-point-buttons" aria-label="Award foul points">
              {FOUL_POINTS.map((points) => (
                <button key={points} type="button" onClick={() => logFoul(points)} aria-label={`Award ${points} foul points to ${foulAwardLabel}`}>
                  +{points}
                </button>
              ))}
            </div>
          </div>

          <div className="frame-finish">
            <div>
              <p className="eyebrow">Finish frame {activeFrame.number}</p>
              <strong>Who won?</strong>
            </div>
            <button type="button" className="winner-button gold" onClick={() => endFrame('gold')}>
              {TEAM_PLAYERS.gold.map((player) => data.players[player] || player).join(' / ')}
            </button>
            <button type="button" className="winner-button green" onClick={() => endFrame('green')}>
              {TEAM_PLAYERS.green.map((player) => data.players[player] || player).join(' / ')}
            </button>
          </div>
        </section>

        <aside className="side-stack">
          <section className="high-card panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Today</p>
                <h2>High break</h2>
              </div>
              <span className="trophy-dot" aria-hidden="true">★</span>
            </div>
            {topBreak ? (
              <>
                <strong className="high-break">{topBreak.points}</strong>
                <p className="holder">{data.players[topBreak.playerId] || topBreak.playerId} · {topBreak.source}</p>
              </>
            ) : (
              <>
                <strong className="high-break empty">—</strong>
                <p className="holder">No break recorded yet</p>
              </>
            )}

            <div className="manual-entry">
              <p className="action-label">Add a high break manually</p>
              <div>
                <select value={manualPlayer} onChange={(event) => setManualPlayer(event.target.value as PlayerId)} aria-label="Player for manual high break">
                  {PLAYER_IDS.map((playerId) => <option value={playerId} key={playerId}>{data.players[playerId] || playerId}</option>)}
                </select>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Score"
                  value={manualInput}
                  onChange={(event) => setManualInput(event.target.value.replace(/\D/g, '').slice(0, 3))}
                  onKeyDown={(event) => event.key === 'Enter' && addManualHighBreak()}
                  aria-label="Manual high break score"
                />
                <button type="button" onClick={addManualHighBreak}>Add</button>
              </div>
              {session.manualHighBreaks.length > 0 && (
                <ul className="manual-list">
                  {session.manualHighBreaks.toReversed().slice(0, 3).map((entry) => (
                    <li key={entry.id}>
                      <span>{data.players[entry.playerId] || entry.playerId} · {entry.points}</span>
                      <button type="button" onClick={() => removeManualHighBreak(entry.id)} aria-label={`Remove ${entry.points} high break`}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <details className="rules-card panel">
            <summary>House fluke rules <span>+</span></summary>
            <ul>
              <li>A fluke is a shot where a ball goes into a pocket other than the one you aimed for.</li>
              <li>All plants must be declared.</li>
              <li>All triples and quadruples must be declared.</li>
              <li>GAs and flukey snookers do not count toward the fluke counter.</li>
            </ul>
          </details>
        </aside>
      </section>

      <section className="lower-grid">
        <section className="activity-card panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Frame {activeFrame.number}</p>
              <h2>Live entries</h2>
            </div>
            <span>{liveEvents.length} logged</span>
          </div>
          {liveEvents.length ? (
            <ol className="activity-list">
              {liveEvents.map((event) => (
                <li key={event.id}>
                  <span className={`event-mark ${event.tone}`} aria-hidden="true" />
                  <b>{event.actor}</b>
                  <span>{event.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Select a player and enter the first break or fluke.</p>
          )}
        </section>

        <section className="history-card panel">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Today</p>
              <h2>Finished frames</h2>
            </div>
            <span>{completedFrames.length}</span>
          </div>
          {completedFrames.length ? (
            <ol className="frame-list">
              {completedFrames.map((frame) => (
                <li key={frame.id}>
                  <span>Frame {frame.number}</span>
                  <b>{teamScore(frame, 'gold')} — {teamScore(frame, 'green')}</b>
                  <em className={frame.winner}>{frame.winner === 'gold' ? 'AA / JK' : 'NH / NA'}</em>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Finished frames will appear here.</p>
          )}
        </section>
      </section>

      <details className="settings-card panel">
        <summary>Player names &amp; day controls <span>+</span></summary>
        <div className="settings-grid">
          {PLAYER_IDS.map((playerId) => (
            <label key={playerId}>
              <span>{playerId}</span>
              <input value={data.players[playerId]} onChange={(event) => renamePlayer(playerId, event.target.value)} aria-label={`Name for ${playerId}`} />
            </label>
          ))}
          <button className="danger-button" type="button" onClick={resetDay}>Clear this day</button>
        </div>
        <p className="storage-note">Scores save automatically in this browser on this device.</p>
      </details>

      <footer>
        <span>The Digital Nuggy Book · Season 4</span>
        <span>Fast enough for the next shot.</span>
      </footer>

      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}
