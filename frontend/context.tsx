import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  ApiMarketItem,
  ApiQcQueueNextResponse,
  ApiTeamBatchesResponse,
  ApiTeamSummaryResponse,
  Batch,
  BatchId,
  GameConfig,
  Joke,
  JokeId,
  Role,
  RoundId,
  Team,
  TeamId,
  User,
  UserId,
} from './types';
import { instructorService } from './services/instructorService';
import { jmService } from './services/jmService';
import { qcService } from './services/qcService';
import { customerService } from './services/customerService';
import { sessionService } from './services/sessionService';
import { ApiError } from './services/apiClient';
import { setMockRoundNumber } from './services/mockApi';

const LS_USER_ID = 'joke_factory_user_id';
const LS_DISPLAY_NAME = 'joke_factory_display_name';

const DEFAULT_ROUND2_BATCH_LIMIT = 6;

// Helper to init team names (fallback, will be replaced by /v1/teams where possible)
const INITIAL_TEAM_NAMES: Record<string, string> = {};
for (let i = 1; i <= 20; i++) INITIAL_TEAM_NAMES[i.toString()] = `Team ${i}`;

function nowMs() {
  return Date.now();
}

function isMockModeEnabled(): boolean {
  const env = (import.meta as any).env || {};
  const forceMock = String(env.VITE_USE_MOCK_API ?? '').toLowerCase() === 'true';
  const prod = Boolean(env.PROD);
  const base = String(env.VITE_API_BASE_URL ?? '').trim();
  return forceMock || (prod && !base);
}

function toRole(apiRole: string | null): Role {
  switch (apiRole) {
    case 'INSTRUCTOR':
      return 'INSTRUCTOR' as Role;
    case 'JM':
      return 'JOKE_MAKER' as Role;
    case 'QC':
      return 'QUALITY_CONTROL' as Role;
    case 'CUSTOMER':
      return 'CUSTOMER' as Role;
    default:
      return 'UNASSIGNED' as Role;
  }
}

function makeUser(base: { user_id: UserId; display_name: string }, role: Role, team_id: TeamId | null): User {
  const team = team_id ? String(team_id) : 'N/A';
  return {
    user_id: base.user_id,
    display_name: base.display_name,
    team_id,
    role,
    // UI compatibility
    id: String(base.user_id),
    name: base.display_name,
    team,
    // customer UI compatibility (populated later)
    wallet: 0,
    purchasedJokes: [],
  };
}

function normalizeRoundStatus(s: string | undefined | null): 'ACTIVE' | 'ENDED' | 'CONFIGURED' | null {
  if (!s) return null;
  const upper = String(s).toUpperCase();
  if (upper.includes('ACTIVE')) return 'ACTIVE';
  if (upper.includes('ENDED')) return 'ENDED';
  if (upper.includes('CONFIGURED')) return 'CONFIGURED';
  return null;
}

function mapBatchFromTeamList(
  roundNumber: number,
  team_id: TeamId,
  teamBatches: ApiTeamBatchesResponse['batches'][number],
  jokeTexts?: string[],
): Batch {
  const batch_id = teamBatches.batch_id;
  const status = teamBatches.status;
  const jokes: Joke[] = (jokeTexts || []).map((txt, idx) => {
    const fakeJokeId = Number(`${batch_id}${idx}`); // stable-ish per batch; only for UI rendering
    return {
      joke_id: fakeJokeId as JokeId,
      joke_text: txt,
      id: String(fakeJokeId),
      content: txt,
    };
  });

  const submittedAt = teamBatches.submitted_at ? Date.parse(teamBatches.submitted_at) : undefined;
  const ratedAt = teamBatches.rated_at ? Date.parse(teamBatches.rated_at) : undefined;

  return {
    batch_id,
    round_id: 0 as RoundId, // not included in list endpoint response; tracked separately
    team_id,
    status,
    jokes,
    submitted_at: teamBatches.submitted_at,
    rated_at: teamBatches.rated_at,
    avg_score: teamBatches.avg_score,
    passes_count: teamBatches.passes_count,
    // UI compatibility aliases
    id: String(batch_id),
    team: String(team_id),
    round: roundNumber,
    submittedAt,
    ratedAt,
    avgRating: teamBatches.avg_score ?? undefined,
    acceptedCount: teamBatches.passes_count ?? undefined,
  };
}

interface GameContextType {
  user: User | null;
  roster: User[]; // Instructor: lobby; JM/QC: teammates
  login: (name: string, role: Role) => Promise<void>;
  logout: () => void;
  
  config: GameConfig;
  updateConfig: (updates: Partial<GameConfig>) => Promise<void>;
  setRound: (round: number) => void;
  setGameActive: (active: boolean) => Promise<void>;
  endRound: () => Promise<void>;
  toggleTeamPopup: (show: boolean) => Promise<void>;
  resetGame: () => void;
  
  // Lobby / Team Formation
  calculateValidCustomerOptions: () => number[];
  formTeams: (customerCount: number) => Promise<void>;
  resetToLobby: () => void;

  // Team Name Management
  teamNames: Record<string, string>;
  updateTeamName: (teamNum: string, name: string) => void;
  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;

  batches: Batch[];
  addBatch: (jokes: string[]) => Promise<void>;
  rateBatch: (
    batchId: string,
    ratings: { [jokeId: string]: number },
    tags: { [jokeId: string]: string[] },
    feedback: string,
  ) => Promise<void>;
  
  sales: Record<string, number>; // jokeId -> count of purchases
  buyJoke: (jokeId: string, cost: number) => Promise<void>;
  returnJoke: (jokeId: string, cost: number) => Promise<void>;

  // API-driven view models
  roundId: RoundId | null;
  marketItems: ApiMarketItem[];
  teamSummary: ApiTeamSummaryResponse | null;
  instructorLobby: ApiInstructorLobbyResponse | null;
  instructorStats: ApiInstructorStatsResponse | null;
  qcQueue: ApiQcQueueNextResponse | null;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [roundId, setRoundId] = useState<RoundId | null>(null);
  const [roster, setRoster] = useState<User[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>(INITIAL_TEAM_NAMES);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [sales] = useState<Record<string, number>>({}); // legacy; kept for compatibility but no longer authoritative

  const [marketItems, setMarketItems] = useState<ApiMarketItem[]>([]);
  const [teamSummary, setTeamSummary] = useState<ApiTeamSummaryResponse | null>(null);
  const [instructorLobby, setInstructorLobby] = useState<ApiInstructorLobbyResponse | null>(null);
  const [instructorStats, setInstructorStats] = useState<ApiInstructorStatsResponse | null>(null);
  const [qcQueue, setQcQueue] = useState<ApiQcQueueNextResponse | null>(null);

  // Local caches to preserve UI that expects joke text (API does not return it for batch history).
  const submittedBatchJokesRef = useRef<Record<string, string[]>>({});
  const qcRatedHistoryRef = useRef<Record<string, Batch>>({});
  
  const [config, setConfig] = useState<GameConfig>({
    status: 'LOBBY', // Start in LOBBY to show setup screen
    round: 1,
    isActive: false,
    showTeamPopup: false,
    startTime: null,
    elapsedTime: 0,
    customerBudget: 10,
    round1BatchSize: 5,
    round2BatchLimit: 6,
  });
  // Initial load from localStorage (session only)
  useEffect(() => {
    const storedUserId = localStorage.getItem(LS_USER_ID);
    const storedName = localStorage.getItem(LS_DISPLAY_NAME);
    if (storedUserId && storedName) {
      const uid = Number(storedUserId);
      if (!Number.isNaN(uid)) {
        setUser(makeUser({ user_id: uid as UserId, display_name: storedName }, 'UNASSIGNED' as Role, null));
      }
    }
  }, []);

  // Professional polling: /v1/session/me + /v1/rounds/active (+ role-specific data)
  useEffect(() => {
    // Start polling as soon as we have a logged-in user (including right after `login()`),
    // not only on initial page load.
    const storedUserId = localStorage.getItem(LS_USER_ID) ?? (user ? String(user.user_id) : null);
    if (!storedUserId) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const abortRef = { current: null as AbortController | null };

    const poll = async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const [me, active] = await Promise.all([sessionService.me(), sessionService.activeRound()]);
        if (cancelled) return;

        setRoundId(me.round_id);

        const role = toRole(me.assignment.role);
        const nextUser = makeUser(me.user, role, me.assignment.team_id);

        // Customer-only: hydrate wallet/purchases from budget + market.
        if (role === ('CUSTOMER' as Role)) {
          try {
            const [budget, market] = await Promise.all([
              customerService.budget(me.round_id),
              customerService.market(me.round_id),
            ]);
            if (!cancelled) {
              nextUser.wallet = budget.remaining_budget;
              nextUser.purchasedJokes = market.items.filter(i => i.is_bought_by_me).map(i => String(i.joke_id));
              setMarketItems(market.items);
            }
          } catch {
            // ignore customer hydration errors (will surface on action)
          }
        }

        setUser(prev => {
          if (!prev) return nextUser;
          // avoid re-render storms
          const same =
            prev.user_id === nextUser.user_id &&
            prev.role === nextUser.role &&
            prev.team_id === nextUser.team_id &&
            prev.wallet === nextUser.wallet &&
            JSON.stringify(prev.purchasedJokes) === JSON.stringify(nextUser.purchasedJokes);
          return same ? prev : { ...prev, ...nextUser };
        });

        const activeRound = active.round;
        const roundNumber = activeRound?.round_number ?? 1;
        const normalizedStatus = normalizeRoundStatus(activeRound?.status) ?? 'CONFIGURED';
        const isActive = normalizedStatus === 'ACTIVE';

        setConfig(prev => {
          const elapsed = isActive && activeRound?.started_at ? Math.max(0, Math.floor((nowMs() - Date.parse(activeRound.started_at)) / 1000)) : prev.elapsedTime;
          return {
            ...prev,
            status: isActive ? 'PLAYING' : 'LOBBY',
            round: roundNumber,
            isActive,
            startTime: isActive && activeRound?.started_at ? Date.parse(activeRound.started_at) : null,
            elapsedTime: elapsed,
            customerBudget: activeRound?.customer_budget ?? prev.customerBudget,
            round1BatchSize: activeRound?.batch_size ?? prev.round1BatchSize,
            round2BatchLimit: prev.round2BatchLimit ?? DEFAULT_ROUND2_BATCH_LIMIT,
          };
        });

        // Team names from /v1/teams (best-effort, infrequent but cheap)
        try {
          const t = await sessionService.getTeams();
          if (!cancelled) {
            const next = { ...INITIAL_TEAM_NAMES };
            t.teams.forEach(team => {
              next[String(team.id)] = team.name;
            });
            setTeamNames(next);
          }
        } catch {
          // ignore
        }

        // Role-specific data
        if (role === ('INSTRUCTOR' as Role)) {
          try {
            const [lobby, stats] = await Promise.all([
              instructorService.lobby(me.round_id),
              instructorService.stats(me.round_id),
            ]);
            if (!cancelled) {
              setInstructorLobby(lobby);
              setInstructorStats(stats);

              // Build roster for instructor drag/drop (teams + customers + unassigned)
              const rosterUsers: User[] = [];
              lobby.teams.forEach(t => {
                t.members.forEach(m => {
                  rosterUsers.push(makeUser({ user_id: m.user_id, display_name: m.display_name }, toRole(m.role), t.team.id));
                });
              });
              lobby.customers.forEach(c => {
                rosterUsers.push(makeUser({ user_id: c.user_id, display_name: c.display_name }, 'CUSTOMER' as Role, null));
              });
              lobby.unassigned.forEach(u => {
                rosterUsers.push(makeUser({ user_id: u.user_id, display_name: u.display_name }, 'UNASSIGNED' as Role, null));
              });
              setRoster(rosterUsers);
            }
          } catch {
            // ignore; instructor endpoints will surface errors on action
          }
        } else if (role === ('JOKE_MAKER' as Role) && me.assignment.team_id) {
          try {
            const [summary, list] = await Promise.all([
              jmService.teamSummary(me.round_id, me.assignment.team_id),
              jmService.listTeamBatches(me.round_id, me.assignment.team_id),
            ]);
            if (!cancelled) {
              setTeamSummary(summary);
              const mapped = list.batches.map(b =>
                mapBatchFromTeamList(
                  roundNumber,
                  me.assignment.team_id!,
                  b,
                  submittedBatchJokesRef.current[String(b.batch_id)],
                ),
              );
              // Merge QC-rated history (if any) so JM can still see feedback in same session.
              const qcExtra = Object.values(qcRatedHistoryRef.current).filter(b => b.team_id === me.assignment.team_id);
              const merged = [...mapped, ...qcExtra].reduce<Record<string, Batch>>((acc, b) => {
                acc[String(b.batch_id)] = b;
                return acc;
              }, {});
              setBatches(Object.values(merged).sort((a, b) => (a.batch_id - b.batch_id)));
            }
          } catch {
            // ignore; action will surface
          }

          // teammate roster (best-effort)
          try {
            const resp: any = await sessionService.myTeam(me.round_id);
            if (!cancelled) {
              const members = Array.isArray(resp?.members) ? resp.members : [];
              const rosterUsers: User[] = members.map((m: any) =>
                makeUser(
                  { user_id: Number(m.user_id) as UserId, display_name: String(m.display_name ?? m.name ?? '') },
                  toRole(m.role ?? null),
                  (m.team_id ?? me.assignment.team_id) as TeamId,
                ),
              );
              // ensure self exists in list
              if (!rosterUsers.some(u => u.user_id === nextUser.user_id)) rosterUsers.push(nextUser);
              setRoster(rosterUsers);
            }
          } catch {
            // ok
          }
        } else if (role === ('QUALITY_CONTROL' as Role)) {
          // QC queue (live work)
          try {
            const q = await qcService.queueNext(me.round_id);
            if (!cancelled) setQcQueue(q);
          } catch {
            if (!cancelled) setQcQueue(null);
          }

          // teammate roster (best-effort)
          try {
            const resp: any = await sessionService.myTeam(me.round_id);
            if (!cancelled) {
              const members = Array.isArray(resp?.members) ? resp.members : [];
              const rosterUsers: User[] = members.map((m: any) =>
                makeUser(
                  { user_id: Number(m.user_id) as UserId, display_name: String(m.display_name ?? m.name ?? '') },
                  toRole(m.role ?? null),
                  (m.team_id ?? null) as TeamId,
                ),
              );
              if (!rosterUsers.some(u => u.user_id === nextUser.user_id)) rosterUsers.push(nextUser);
              setRoster(rosterUsers);
            }
          } catch {
            // ok
          }

          // Keep local rated history visible in QC UI (no API endpoint for history provided).
          if (!cancelled) {
            const hist = Object.values(qcRatedHistoryRef.current);
            setBatches(hist);
          }
        }
      } catch {
        // If session/me fails (e.g. invalid user), we don't auto-logout; user can reload/login again.
      }
    };

    poll();
    pollTimer = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [user?.user_id]);

  // Timer Logic
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (config.isActive) {
      timer = setInterval(() => {
        setConfig(prev => ({ ...prev, elapsedTime: prev.elapsedTime + 1 }));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [config.isActive]);

  const login = async (name: string, _role: Role) => {
    const display_name = name.trim();
    if (!display_name) return;
    try {
      const joined = await sessionService.join({ display_name });
      localStorage.setItem(LS_USER_ID, String(joined.user.user_id));
      localStorage.setItem(LS_DISPLAY_NAME, joined.user.display_name);

      // Immediately set local user to unblock router; polling will hydrate assignment.
      const next = makeUser(joined.user, 'UNASSIGNED' as Role, null);
      setUser(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'NAME_TAKEN') {
        alert('Name already taken. Please choose a different display name.');
        return;
      }
      alert('Failed to join session. Please try again.');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(LS_USER_ID);
    localStorage.removeItem(LS_DISPLAY_NAME);
    setRoundId(null);
    setRoster([]);
    setBatches([]);
    setMarketItems([]);
    setTeamSummary(null);
    setInstructorLobby(null);
    setInstructorStats(null);
    setQcQueue(null);
  };

  const updateConfig = async (updates: Partial<GameConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    // Only instructor config is persisted via API (customer_budget, batch_size).
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;

    const nextBudget = updates.customerBudget ?? config.customerBudget;
    const nextBatch = updates.round1BatchSize ?? config.round1BatchSize;
    try {
      await instructorService.updateConfig(roundId, { customer_budget: nextBudget, batch_size: nextBatch });
    } catch {
      // config will re-sync on next poll; keep UI responsive
      alert('Failed to update round config.');
    }
  };

  // --- LOBBY & TEAM FORMATION LOGIC ---

  const calculateValidCustomerOptions = (): number[] => {
    // Count pairs that are available for assignment (exclude Instructor)
    const availablePairs = roster.filter(u => u.role !== ('INSTRUCTOR' as Role));
    const P = availablePairs.length;
    
    const options: number[] = [];
    
    // Constraints:
    // 1. User Request: 2 <= C <= 10
    // 2. Game Logic: C <= P - 2 (Must leave at least 2 pairs for production: 1 JM + 1 QC)
    // 3. Game Logic: (P - C) % 2 === 0 (Remaining pairs must be even to split evenly into teams)
    
    for (let c = 2; c <= 10; c++) {
        if (c > P - 2) break;

        const remaining = P - c;
        if (remaining >= 2 && remaining % 2 === 0) {
            options.push(c);
        }
    }
    return options;
  };

  const formTeams = async (customerCount: number) => {
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;

    // Use current roster (from instructor lobby poll) and assign deterministically.
    const allPairs = roster.filter(u => u.role !== ('INSTRUCTOR' as Role));
    const shuffle = (arr: any[]) => arr.sort(() => Math.random() - 0.5);
    const shuffled = shuffle([...allPairs]);
    const customers = shuffled.slice(0, customerCount);
    const remaining = shuffled.slice(customerCount);

    const half = remaining.length / 2;
    const jms = remaining.slice(0, half);
    const qcs = remaining.slice(half);

    let teamsResp: { teams: Team[] } | null = null;
    try {
      teamsResp = await sessionService.getTeams();
    } catch {
      alert('Unable to fetch teams from server.');
      return;
    }

    const neededTeams = jms.length;
    const availableTeams = teamsResp.teams;
    if (availableTeams.length < neededTeams) {
      alert(`Not enough teams in backend. Need ${neededTeams}, found ${availableTeams.length}.`);
      return;
    }

    try {
      // Assign customers
      await Promise.all(
        customers.map(u =>
          instructorService.patchUser(roundId, u.user_id, { status: 'ASSIGNED', role: 'CUSTOMER', team_id: null }),
        ),
      );

      // Assign JM/QC per team
      await Promise.all(
        jms.map((jm, i) =>
          instructorService.patchUser(roundId, jm.user_id, {
            status: 'ASSIGNED',
            role: 'JM',
            team_id: availableTeams[i].id,
          }),
        ),
      );
      await Promise.all(
        qcs.map((qc, i) =>
          instructorService.patchUser(roundId, qc.user_id, {
            status: 'ASSIGNED',
            role: 'QC',
            team_id: availableTeams[i].id,
          }),
        ),
      );

      await updateConfig({ status: 'PLAYING' });
    } catch {
      alert('Failed to assign teams. Please try again.');
    }
  };

  const resetToLobby = () => {
    // Best-effort: instructor can move everyone back to WAITING by patching status only.
    // (Schema doesn’t specify a full “reset round” endpoint.)
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) {
      setConfig(prev => ({ ...prev, status: 'LOBBY', isActive: false, elapsedTime: 0 }));
      return;
    }

    (async () => {
      try {
        const lobby = await instructorService.lobby(roundId);
        const userIds: UserId[] = [];
        lobby.teams.forEach(t => t.members.forEach(m => userIds.push(m.user_id)));
        lobby.customers.forEach(c => userIds.push(c.user_id));

        await Promise.all(userIds.map(uid => instructorService.patchUser(roundId, uid, { status: 'WAITING' })));
        setConfig(prev => ({ ...prev, status: 'LOBBY', isActive: false, elapsedTime: 0 }));
        setBatches([]);
        setMarketItems([]);
      } catch {
        alert('Failed to reset to lobby.');
      }
    })();
  };

  // ------------------------------------

  const updateTeamName = (teamNum: string, name: string) => {
    const newNames = { ...teamNames, [teamNum]: name };
    setTeamNames(newNames);
    // No team rename endpoint provided in schema; keep local-only to avoid UI changes.
  };
  
  const updateUser = async (userId: string, updates: Partial<User>) => {
    if (!roundId) return;
    if (!user) return;
    const isInstructor = user.role === ('INSTRUCTOR' as Role);
    const isSelf = Number(userId) === user.user_id;
    // Allow DebugPanel to switch the current user's role/team in mock/demo mode (even if not instructor),
    // so you can jump between JM/QC/Customer views during local demos.
    if (!isInstructor && !(isMockModeEnabled() && isSelf)) return;
    const uid = Number(userId) as UserId;

    const role =
      updates.role === ('JOKE_MAKER' as Role) ? 'JM'
      : updates.role === ('QUALITY_CONTROL' as Role) ? 'QC'
      : updates.role === ('CUSTOMER' as Role) ? 'CUSTOMER'
      : updates.role === ('INSTRUCTOR' as Role) ? 'INSTRUCTOR'
      : undefined;

    const status =
      updates.role === ('UNASSIGNED' as Role) ? 'WAITING'
      : updates.role ? 'ASSIGNED'
      : undefined;
    const team_id = updates.team && updates.team !== 'N/A' ? (Number(updates.team) as TeamId) : undefined;

    try {
      await instructorService.patchUser(roundId, uid, {
        status,
        role,
        team_id: updates.team === 'N/A' ? null : team_id,
      });
    } catch {
      alert('Failed to update user assignment.');
    }
  };

  const addBatch = async (jokeContents: string[]) => {
    if (!user || !roundId || !user.team_id) return;

    try {
      const created = await jmService.createBatch(roundId, { team_id: user.team_id, jokes: jokeContents });
      // Cache joke text for UI history.
      submittedBatchJokesRef.current[String(created.batch.batch_id)] = jokeContents;
      // Trigger refresh: rely on poll; also do a quick local update for responsiveness.
      const batch: Batch = {
        batch_id: created.batch.batch_id,
        round_id: created.batch.round_id,
        team_id: created.batch.team_id,
        status: created.batch.status,
        jokes: jokeContents.map((txt, idx) => {
          const fakeJokeId = Number(`${created.batch.batch_id}${idx}`) as JokeId;
          return { joke_id: fakeJokeId, joke_text: txt, id: String(fakeJokeId), content: txt };
        }),
        submitted_at: created.batch.submitted_at,
        id: String(created.batch.batch_id),
        team: String(created.batch.team_id),
        round: config.round,
        submittedAt: Date.parse(created.batch.submitted_at),
      };
      setBatches(prev => [...prev.filter(b => b.batch_id !== batch.batch_id), batch]);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active. Please wait for the instructor to start.');
          return;
        }
        if (e.status === 400 && e.code === 'INVALID_BATCH_SIZE') {
          alert('Invalid batch size for this round.');
          return;
        }
      }
      alert('Failed to submit batch.');
    }
  };

  const rateBatch = async (
    batchId: string,
    ratings: { [jokeId: string]: number },
    tags: { [jokeId: string]: string[] },
    feedback: string,
  ) => {
    if (!roundId) return;
    const bid = Number(batchId) as BatchId;

    const active = qcQueue?.batch?.batch_id === bid ? qcQueue : null;
    if (!active) return;

    const ratingList = Object.entries(ratings).map(([jid, rating]) => ({
      joke_id: Number(jid) as JokeId,
      rating,
    }));

    try {
      const tagsList = Object.entries(tags).map(([jid, t]) => ({
        joke_id: Number(jid) as JokeId,
        tags: t,
      }));

      const resp = await qcService.submitRatings(bid, {
        ratings: ratingList,
        tags: tagsList,
        feedback,
      });
      // Build a local “rated batch” for UI history (API doesn't return tag/feedback but we preserve client-side).
      const ratedJokes: Joke[] = active.jokes.map(j => ({
        joke_id: j.joke_id,
        joke_text: j.joke_text,
        id: String(j.joke_id),
        content: j.joke_text,
        rating: ratings[String(j.joke_id)] ?? 1,
        tags: tags[String(j.joke_id)] ?? [],
      }));
      const avgRating = resp.batch.avg_score;
      const acceptedCount = resp.batch.passes_count;
      const batch: Batch = {
        batch_id: resp.batch.batch_id,
        round_id: roundId,
        team_id: active.batch.team_id,
        status: 'RATED',
        jokes: ratedJokes,
        rated_at: resp.batch.rated_at,
        avg_score: resp.batch.avg_score,
        passes_count: resp.batch.passes_count,
        id: String(resp.batch.batch_id),
        team: String(active.batch.team_id),
        round: config.round,
        ratedAt: Date.parse(resp.batch.rated_at),
        avgRating,
        acceptedCount,
        feedback,
      };
      qcRatedHistoryRef.current[String(batch.batch_id)] = batch;
      setBatches(Object.values(qcRatedHistoryRef.current));
      setQcQueue(null);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active. Please wait for the instructor to start.');
          return;
        }
        if (e.status === 409 && e.code === 'BATCH_ALREADY_RATED') {
          alert('This batch was already rated.');
          return;
        }
        if (e.status === 403 && e.code === 'NOT_ASSIGNED_TO_THIS_QC') {
          alert('You are not assigned to rate this batch.');
          return;
        }
      }
      alert('Failed to submit ratings.');
    }
  };

  const buyJoke = async (jokeId: string, _cost: number) => {
    if (!user || !roundId) return;
    const jid = Number(jokeId) as JokeId;
    try {
      const resp = await customerService.buy(roundId, jid);
      setUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          wallet: resp.budget.remaining_budget,
          purchasedJokes: Array.from(new Set([...prev.purchasedJokes, String(jid)])),
        };
      });
      const market = await customerService.market(roundId);
      setMarketItems(market.items);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active.');
          return;
        }
        if (e.status === 409 && e.code === 'INSUFFICIENT_BUDGET') {
          alert('Insufficient budget.');
          return;
        }
        if (e.status === 409 && e.code === 'ALREADY_BOUGHT') {
          alert('You already bought this joke.');
          return;
        }
      }
      alert('Failed to buy joke.');
    }
  };

  const returnJoke = async (jokeId: string, _cost: number) => {
    if (!user || !roundId) return;
    const jid = Number(jokeId) as JokeId;
    try {
      const resp = await customerService.return(roundId, jid);
      setUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          wallet: resp.budget.remaining_budget,
          purchasedJokes: prev.purchasedJokes.filter(id => id !== String(jid)),
        };
      });
      const market = await customerService.market(roundId);
      setMarketItems(market.items);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 409 && e.code === 'ROUND_NOT_ACTIVE') {
          alert('Round is not active.');
          return;
        }
        if (e.status === 409 && e.code === 'NOT_BOUGHT_YET') {
          alert('You have not bought this joke.');
          return;
        }
        if (e.status === 409 && e.code === 'ALREADY_RETURNED') {
          alert('This joke was already returned.');
          return;
        }
      }
      alert('Failed to return joke.');
    }
  };

  const setRound = (round: number) => {
    // In the real backend-driven flow, round selection is driven by active round state.
    // For mock/demo mode, allow instructor to toggle Round 1/2 to unlock the UI paths.
    if (!isMockModeEnabled()) return;
    const next = round === 2 ? 2 : 1;
    setConfig(prev => ({ ...prev, round: next }));
    try {
      setMockRoundNumber(next as 1 | 2);
    } catch {
      // ignore
    }
  };

  const setGameActive = async (isActive: boolean) => {
    // Backend schema supports start/end (no pause). We map `Start` to /start.
    // `Pause` remains local-only until backend supports a pause endpoint.
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) {
      setConfig(prev => ({ ...prev, isActive }));
      return;
    }
    try {
      if (isActive) await instructorService.start(roundId);
      setConfig(prev => ({ ...prev, isActive }));
    } catch {
      alert('Failed to start round.');
    }
  };
  const toggleTeamPopup = async (show: boolean) => updateConfig({ showTeamPopup: show });

  const endRound = async () => {
    if (!roundId || !user || user.role !== ('INSTRUCTOR' as Role)) return;
    try {
      await instructorService.end(roundId);
      setConfig(prev => ({ ...prev, isActive: false, status: 'LOBBY' }));
    } catch {
      alert('Failed to end round.');
    }
  };
  
  const resetGame = () => {
    // Best-effort: end round (instructor) then clear local session.
    if (roundId && user?.role === ('INSTRUCTOR' as Role)) {
      instructorService.end(roundId).catch(() => {
        // ignore
      });
    }
    logout();
  };

  return (
    <GameContext.Provider value={{
      user, login, logout, roster,
      config, updateConfig, setRound, setGameActive, endRound, resetGame, toggleTeamPopup,
      calculateValidCustomerOptions, formTeams, resetToLobby,
      teamNames, updateTeamName, updateUser,
      batches, addBatch, rateBatch,
      sales, buyJoke, returnJoke,
      roundId,
      marketItems,
      teamSummary,
      instructorLobby,
      instructorStats,
      qcQueue,
    }}>
      {children}
    </GameContext.Provider>
  );
};