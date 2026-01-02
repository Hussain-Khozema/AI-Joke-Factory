import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
const LS_SUBMITTED_BATCH_JOKES = 'joke_factory_submitted_batch_jokes_v1';
const LS_QC_RATED_HISTORY = 'joke_factory_qc_rated_history_v1';

const DEFAULT_ROUND2_BATCH_LIMIT = 10;

// Helper to init team names (fallback, will be replaced by /v1/teams where possible)
const INITIAL_TEAM_NAMES: Record<string, string> = {};
for (let i = 1; i <= 20; i++) INITIAL_TEAM_NAMES[i.toString()] = `Team ${i}`;

// Map UI tag labels to backend enum values for QC submission.
const QC_TAG_MAP: Record<string, string> = {
  'EXCELLENT / STANDOUT': 'EXCELLENT_STANDOUT',
  'EXCELLENT_STANDOUT': 'EXCELLENT_STANDOUT',
  'GENUINELY FUNNY': 'GENUINELY_FUNNY',
  'MADE ME SMILE': 'MADE_ME_SMILE',
  'ORIGINAL IDEA': 'ORIGINAL_IDEA',
  'POLITE SMILE': 'POLITE_SMILE',
  "DIDN'T LAND": 'DIDNT_LAND',
  'DIDNT LAND': 'DIDNT_LAND',
  'NOT ACCEPTABLE': 'NOT_ACCEPTABLE',
  OTHER: 'OTHER',
};

function normalizeQcTag(label: string): string | null {
  const key = label.trim().toUpperCase().replace(/\s+/g, ' ');
  return QC_TAG_MAP[key] ?? null;
}

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
  const jokesFromApi = Array.isArray(teamBatches.jokes) ? teamBatches.jokes : null;
  const jokes: Joke[] = jokesFromApi
    ? jokesFromApi.map(j => ({
        joke_id: j.joke_id as JokeId,
        joke_text: j.joke_text,
        id: String(j.joke_id),
        content: j.joke_text,
      }))
    : (jokeTexts || []).map((txt, idx) => {
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
    feedback: teamBatches.feedback ?? undefined,
    tagSummary: teamBatches.tag_summary ?? [],
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

function normalizeInstructorStats(raw: any): ApiInstructorStatsResponse {
  const data = raw?.data ?? raw ?? {};
  const normalizeTeam = (t: any) => ({
    id: Number(t?.id ?? t?.ID ?? 0) as TeamId,
    name: String(t?.name ?? t?.Name ?? `Team ${t?.id ?? t?.ID ?? ''}`),
  });
  // Backend variants: some implementations return `leaderboard`, others return `teams`.
  const leaderboard = Array.isArray(data.leaderboard ?? data.Leaderboard)
    ? (data.leaderboard ?? data.Leaderboard)
    : Array.isArray(data.teams ?? data.Teams)
      ? (data.teams ?? data.Teams)
      : [];
  const normLeaderboard = leaderboard.map((item: any) => ({
    rank: Number(item.rank ?? item.Rank ?? 0),
    team: normalizeTeam(item.team ?? item.Team ?? {}),
    points: Number(item.points ?? item.Points ?? 0),
    total_sales: Number(item.total_sales ?? item.TotalSales ?? 0),
    batches_rated: Number(item.batches_rated ?? item.BatchesRated ?? 0),
    avg_score_overall: Number(item.avg_score_overall ?? item.AvgScoreOverall ?? 0),
    accepted_jokes: Number(item.accepted_jokes ?? item.AcceptedJokes ?? 0),
  }));

  const cumulative_sales = Array.isArray(data.cumulative_sales ?? data.CumulativeSales) ? (data.cumulative_sales ?? data.CumulativeSales) : [];
  const batch_quality_by_size = Array.isArray(data.batch_quality_by_size ?? data.BatchQualityBySize) ? (data.batch_quality_by_size ?? data.BatchQualityBySize) : [];
  const learning_curve = Array.isArray(data.learning_curve ?? data.LearningCurve) ? (data.learning_curve ?? data.LearningCurve) : [];
  const output_vs_rejection = Array.isArray(data.output_vs_rejection ?? data.OutputVsRejection) ? (data.output_vs_rejection ?? data.OutputVsRejection) : [];
  const revenue_vs_acceptance = Array.isArray(data.revenue_vs_acceptance ?? data.RevenueVsAcceptance) ? (data.revenue_vs_acceptance ?? data.RevenueVsAcceptance) : [];

  const mapKeys = (arr: any[], keyMap: Record<string, string>) =>
    arr.map((item: any) => {
      const out: any = {};
      Object.entries(item).forEach(([k, v]) => {
        const nk = keyMap[k] ?? keyMap[k.toLowerCase()] ?? k;
        out[nk] = v;
      });
      return out;
    });

  return {
    round_id: Number(data.round_id ?? data.RoundId ?? data.roundId ?? 0) as RoundId,
    leaderboard: normLeaderboard,
    cumulative_sales: mapKeys(cumulative_sales, {
      event_index: 'event_index',
      EventIndex: 'event_index',
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      total_sales: 'total_sales',
      TotalSales: 'total_sales',
      timestamp: 'timestamp',
      Timestamp: 'timestamp',
    }),
    batch_quality_by_size: mapKeys(batch_quality_by_size, {
      batch_id: 'batch_id',
      BatchId: 'batch_id',
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      submitted_at: 'submitted_at',
      SubmittedAt: 'submitted_at',
      batch_size: 'batch_size',
      BatchSize: 'batch_size',
      avg_score: 'avg_score',
      AvgScore: 'avg_score',
    }),
    learning_curve: mapKeys(learning_curve, {
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      batch_order: 'batch_order',
      BatchOrder: 'batch_order',
      avg_score: 'avg_score',
      AvgScore: 'avg_score',
    }),
    output_vs_rejection: mapKeys(output_vs_rejection, {
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      total_jokes: 'total_jokes',
      TotalJokes: 'total_jokes',
      rated_jokes: 'rated_jokes',
      RatedJokes: 'rated_jokes',
      accepted_jokes: 'accepted_jokes',
      AcceptedJokes: 'accepted_jokes',
      rejection_rate: 'rejection_rate',
      RejectionRate: 'rejection_rate',
    }),
    revenue_vs_acceptance: mapKeys(revenue_vs_acceptance, {
      team_id: 'team_id',
      TeamId: 'team_id',
      team_name: 'team_name',
      TeamName: 'team_name',
      total_sales: 'total_sales',
      TotalSales: 'total_sales',
      accepted_jokes: 'accepted_jokes',
      AcceptedJokes: 'accepted_jokes',
      acceptance_rate: 'acceptance_rate',
      AcceptanceRate: 'acceptance_rate',
    }),
  };
}

interface GameContextType {
  user: User | null;
  roster: User[]; // Instructor: lobby; JM/QC: teammates
  login: (name: string, role: Role) => Promise<void>;
  instructorLogin: (displayName: string, password: string) => Promise<void>;
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
  deleteUser: (userId: string) => Promise<void>;

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

  // Polling controls
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const initialConfig = (): GameConfig => ({
    status: 'LOBBY', // Start in LOBBY to show setup screen
    round: 1,
    isActive: false,
    showTeamPopup: false,
    startTime: null,
    elapsedTime: 0,
    customerBudget: 10,
    round1BatchSize: 5,
    round2BatchLimit: DEFAULT_ROUND2_BATCH_LIMIT,
  });

  const [config, setConfig] = useState<GameConfig>(initialConfig());

  // Restore local caches across refresh (best-effort).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_SUBMITTED_BATCH_JOKES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          submittedBatchJokesRef.current = parsed as Record<string, string[]>;
        }
      }
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(LS_QC_RATED_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          qcRatedHistoryRef.current = parsed as Record<string, Batch>;
        }
      }
    } catch {
      // ignore
    }
  }, []);
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
    // Start polling only when a user is present (after login/join).
    if (!user) {
      // ensure no timers are running
      pollAbortRef.current?.abort();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const poll = async () => {
      pollAbortRef.current?.abort();
      pollAbortRef.current = new AbortController();

      try {
        // Instructors: only poll lobby (and stats when active); skip session/me + active.
        if (user.role === ('INSTRUCTOR' as Role)) {
          // If we don't yet know roundId (e.g., after page reload),
          // re-hydrate it best-effort via /session/me. We intentionally do NOT call /v1/rounds/active here.
          let effectiveRoundId = roundId;
          if (!effectiveRoundId) {
            try {
              const me = await sessionService.me();
              if (!cancelled) {
                effectiveRoundId = me.round_id;
                setRoundId(me.round_id);
              }
            } catch (e) {
              // If /session/me fails due to session loss, don't spin forever.
              if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
                // Treat as unauthenticated; don't spin forever.
                logout();
                return;
              }
            }
          }
          if (!effectiveRoundId) return;
          try {
            const rawLobby = await instructorService.lobby(effectiveRoundId);
            let stats: any = null;
            try {
              // Stats availability is backend-dependent; if unavailable, keep lobby data.
              stats = await instructorService.stats(effectiveRoundId);
            } catch {
              // ignore stats failures when backend not ready / no data yet
            }

            if (!cancelled) {
              const lobbyAny: any = rawLobby;
              const data = lobbyAny?.data ?? lobbyAny;

              const teamsArr: any[] = Array.isArray(data?.Teams ?? data?.teams) ? (data.Teams ?? data.teams) : [];
              const customersArr: any[] = Array.isArray(data?.Customers ?? data?.customers) ? (data.Customers ?? data.customers) : [];
              const unassignedArr: any[] = Array.isArray(data?.Unassigned ?? data?.unassigned) ? (data.Unassigned ?? data.unassigned) : [];

              const lobbyNormalized = {
                round_id: data?.RoundID ?? data?.round_id ?? effectiveRoundId,
                summary: {
                  waiting: data?.Summary?.Waiting ?? data?.summary?.waiting ?? 0,
                  assigned: data?.Summary?.Assigned ?? data?.summary?.assigned ?? 0,
                  dropped: data?.Summary?.Dropped ?? data?.summary?.dropped ?? 0,
                  team_count: data?.Summary?.TeamCount ?? data?.summary?.team_count ?? teamsArr.length,
                  customer_count: data?.Summary?.CustomerCount ?? data?.summary?.customer_count ?? customersArr.length,
                },
                teams: teamsArr.map(t => {
                  const members = Array.isArray(t.Members ?? t.members) ? (t.Members ?? t.members) : [];
                  const team = t.Team ?? t.team ?? {};
                  const teamId = team.ID ?? team.Id ?? team.id ?? t.TeamID ?? t.team_id;
                  const teamName = team.Name ?? team.name ?? `Team ${teamId ?? ''}`;
                  return {
                    team: { id: Number(teamId) as TeamId, name: String(teamName) },
                    members: members.map(m => ({
                      user_id: Number(m.UserID ?? m.user_id) as UserId,
                      display_name: String(m.DisplayName ?? m.display_name ?? ''),
                      role: m.Role ?? m.role ?? null,
                    })),
                  };
                }),
                customers: customersArr.map(c => ({
                  user_id: Number(c.UserID ?? c.user_id) as UserId,
                  display_name: String(c.DisplayName ?? c.display_name ?? ''),
                  role: c.Role ?? c.role ?? 'CUSTOMER',
                })),
                unassigned: unassignedArr.map(u => ({
                  user_id: Number(u.UserID ?? u.user_id) as UserId,
                  display_name: String(u.DisplayName ?? u.display_name ?? ''),
                  status: u.Status ?? u.status ?? 'WAITING',
                })),
              };

              setInstructorLobby(lobbyNormalized as any);
              if (stats) setInstructorStats(normalizeInstructorStats((stats as any)?.data ?? stats ?? null));

              // Build roster for instructor drag/drop (teams + customers + unassigned)
              const rosterUsers: User[] = [];
              lobbyNormalized.teams.forEach(t => {
                t.members.forEach(m => {
                  rosterUsers.push(makeUser({ user_id: m.user_id, display_name: m.display_name }, toRole(m.role), t.team.id));
                });
              });
              lobbyNormalized.customers.forEach(c => {
                rosterUsers.push(makeUser({ user_id: c.user_id, display_name: c.display_name }, 'CUSTOMER' as Role, null));
              });
              lobbyNormalized.unassigned.forEach(u => {
                rosterUsers.push(makeUser({ user_id: u.user_id, display_name: u.display_name }, 'UNASSIGNED' as Role, null));
              });
              setRoster(rosterUsers);
            }
          } catch (e) {
            // If the backend wiped the instructor during reset, stop polling and force re-login.
            if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
              logout();
              return;
            }
            // otherwise ignore; instructor endpoints will surface errors on action
          }
          return;
        }

        const me = await sessionService.me();
        if (cancelled) return;

        // Determine effective round id from session/me or active round fallback.
        // Some backends may omit round_id from /session/me; use active round id if present.
        const effectiveRoundIdFromMe = me.round_id ?? null;

        let role = toRole(me.assignment.role);
        // Only demote to UNASSIGNED when participant is waiting and not an instructor.
        if (role !== ('INSTRUCTOR' as Role) && me.participant?.status === 'WAITING') {
          role = 'UNASSIGNED' as Role;
        }
        const teamId = role === ('UNASSIGNED' as Role) ? null : me.assignment.team_id;
        const nextUser = makeUser(me.user, role, teamId);

        // Customer-only: hydrate wallet/purchases from budget + market.
        if (role === ('CUSTOMER' as Role)) {
          try {
            const [budgetRaw, marketRaw] = await Promise.all([
              customerService.budget(me.round_id),
              customerService.market(me.round_id),
            ]);
            const budget: any = (budgetRaw as any)?.data ?? budgetRaw;
            const market: any = (marketRaw as any)?.data ?? marketRaw;
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

        // If user is still unassigned, skip rounds/active call to avoid noise in waiting room.
        if (role === ('UNASSIGNED' as Role)) {
          setConfig(prev => ({
            ...prev,
            status: 'LOBBY',
            isActive: false,
            startTime: null,
            elapsedTime: 0,
          }));
          return;
        }

        const active = await sessionService.activeRound();
        if (cancelled) return;

        const activePayload: any = active as any;
        const rounds = Array.isArray(activePayload?.data?.rounds ?? active.rounds)
          ? (activePayload?.data?.rounds ?? active.rounds)
          : [];
        const pickStatus = (r: any) => normalizeRoundStatus(r?.status);
        const r1 = rounds.find(r => Number(r?.round_number) === 1) ?? null;
        const r2 = rounds.find(r => Number(r?.round_number) === 2) ?? null;
        const round1Status = pickStatus(r1);

        const activeRound = rounds.find(r => pickStatus(r) === 'ACTIVE') ?? null;
        // If nothing is ACTIVE, prefer Round 2 once Round 1 has ended.
        const selectedRound =
          activeRound ??
          (round1Status === 'ENDED' ? r2 : null) ??
          r1 ??
          rounds[0] ??
          null;

        const effectiveRoundId =
          (selectedRound?.id as RoundId | undefined) ??
          effectiveRoundIdFromMe ??
          roundId;
        if (effectiveRoundId && effectiveRoundId !== roundId) {
          setRoundId(effectiveRoundId);
        } else if (effectiveRoundIdFromMe && roundId == null) {
          setRoundId(effectiveRoundIdFromMe);
        }
        const apiRoundNumber = selectedRound?.round_number as number | undefined;
        const normalizedStatus = pickStatus(selectedRound) ?? 'CONFIGURED';
        const isActive = normalizedStatus === 'ACTIVE';

        // Backend-controlled Round 2 team popup flag.
        const popupActiveRaw = Boolean(
          (apiRoundNumber === 2 ? selectedRound?.is_popped_active : r2?.is_popped_active) ?? false,
        );
        const popupActive = (apiRoundNumber ?? 1) === 2 && popupActiveRaw;

        setConfig(prev => {
          const baseRound = apiRoundNumber ?? prev.round ?? 1;
          // Auto-advance UI: after Round 1 is ENDED, default to Round 2 even before it becomes ACTIVE.
          const nextRound = round1Status === 'ENDED' ? 2 : baseRound;
          const elapsed =
            isActive && selectedRound?.started_at
              ? Math.max(0, Math.floor((nowMs() - Date.parse(selectedRound.started_at)) / 1000))
              : prev.elapsedTime;
          return {
            ...prev,
            status: isActive ? 'PLAYING' : (round1Status === 'ENDED' ? 'PLAYING' : 'LOBBY'),
            round: nextRound,
            isActive,
            showTeamPopup: popupActive,
            startTime: isActive && selectedRound?.started_at ? Date.parse(selectedRound.started_at) : null,
            elapsedTime: elapsed,
            customerBudget: selectedRound?.customer_budget ?? prev.customerBudget,
            round1BatchSize: r1?.batch_size ?? prev.round1BatchSize,
            round2BatchLimit: r2?.batch_size ?? prev.round2BatchLimit ?? DEFAULT_ROUND2_BATCH_LIMIT,
          };
        });

        // Role-specific data
        if (role === ('INSTRUCTOR' as Role)) {
          try {
            const rawLobby = await instructorService.lobby(me.round_id);
            let stats: any = null;
            // NOTE: do not depend on React state `config` here; this polling closure
            // does not re-bind on config changes. Use the freshly computed round status
            // from this poll cycle (isActive / normalizedStatus).
            if (isActive || normalizedStatus === 'ENDED') {
              try {
                stats = await instructorService.stats(me.round_id);
              } catch {
                // ignore stats failures; keep lobby data
              }
            }
            if (!cancelled) {
              const lobbyAny: any = rawLobby;
              const data = lobbyAny?.data ?? lobbyAny;

              const teamsArr: any[] = Array.isArray(data?.Teams ?? data?.teams) ? (data.Teams ?? data.teams) : [];
              const customersArr: any[] = Array.isArray(data?.Customers ?? data?.customers) ? (data.Customers ?? data.customers) : [];
              const unassignedArr: any[] = Array.isArray(data?.Unassigned ?? data?.unassigned) ? (data.Unassigned ?? data.unassigned) : [];

              const lobbyNormalized = {
                round_id: data?.RoundID ?? data?.round_id ?? me.round_id,
                summary: {
                  waiting: data?.Summary?.Waiting ?? data?.summary?.waiting ?? 0,
                  assigned: data?.Summary?.Assigned ?? data?.summary?.assigned ?? 0,
                  dropped: data?.Summary?.Dropped ?? data?.summary?.dropped ?? 0,
                  team_count: data?.Summary?.TeamCount ?? data?.summary?.team_count ?? teamsArr.length,
                  customer_count: data?.Summary?.CustomerCount ?? data?.summary?.customer_count ?? customersArr.length,
                },
                teams: teamsArr.map(t => {
                  const members = Array.isArray(t.Members ?? t.members) ? (t.Members ?? t.members) : [];
                  const team = t.Team ?? t.team ?? {};
                  const teamId = team.ID ?? team.Id ?? team.id ?? t.TeamID ?? t.team_id;
                  const teamName = team.Name ?? team.name ?? `Team ${teamId ?? ''}`;
                  return {
                    team: { id: Number(teamId) as TeamId, name: String(teamName) },
                    members: members.map(m => ({
                      user_id: Number(m.UserID ?? m.user_id) as UserId,
                      display_name: String(m.DisplayName ?? m.display_name ?? ''),
                      role: m.Role ?? m.role ?? null,
                    })),
                  };
                }),
                customers: customersArr.map(c => ({
                  user_id: Number(c.UserID ?? c.user_id) as UserId,
                  display_name: String(c.DisplayName ?? c.display_name ?? ''),
                  role: c.Role ?? c.role ?? 'CUSTOMER',
                })),
                unassigned: unassignedArr.map(u => ({
                  user_id: Number(u.UserID ?? u.user_id) as UserId,
                  display_name: String(u.DisplayName ?? u.display_name ?? ''),
                  status: u.Status ?? u.status ?? 'WAITING',
                })),
              };

              setInstructorLobby(lobbyNormalized as any);
              if (stats) setInstructorStats(normalizeInstructorStats((stats as any)?.data ?? stats ?? null));

              // Build roster for instructor drag/drop (teams + customers + unassigned)
              const rosterUsers: User[] = [];
              lobbyNormalized.teams.forEach(t => {
                t.members.forEach(m => {
                  rosterUsers.push(makeUser({ user_id: m.user_id, display_name: m.display_name }, toRole(m.role), t.team.id));
                });
              });
              lobbyNormalized.customers.forEach(c => {
                rosterUsers.push(makeUser({ user_id: c.user_id, display_name: c.display_name }, 'CUSTOMER' as Role, null));
              });
              lobbyNormalized.unassigned.forEach(u => {
                rosterUsers.push(makeUser({ user_id: u.user_id, display_name: u.display_name }, 'UNASSIGNED' as Role, null));
              });
              setRoster(rosterUsers);
            }
          } catch {
            // ignore; instructor endpoints will surface errors on action
          }
        } else if (role === ('JOKE_MAKER' as Role) && me.assignment.team_id) {
          const effectiveRound = effectiveRoundId ?? me.round_id ?? null;
          if (!effectiveRound) {
            // cannot fetch team data without round id; wait for next poll
            return;
          }
          try {
            const [summaryRaw, listRaw] = await Promise.all([
              jmService.teamSummary(effectiveRound, me.assignment.team_id),
              jmService.listTeamBatches(effectiveRound, me.assignment.team_id),
            ]);
            if (!cancelled) {
              const summaryData: any = (summaryRaw as any)?.data ?? summaryRaw;
              const listData: any = (listRaw as any)?.data ?? listRaw;
              const batchesArr: any[] = Array.isArray(listData?.batches) ? listData.batches : [];

              setTeamSummary(summaryData as any);
              const roundNumber = apiRoundNumber ?? config.round ?? 1;
              const mapped = batchesArr.map(b =>
                mapBatchFromTeamList(
                  roundNumber,
                  me.assignment.team_id!,
                  b,
                  submittedBatchJokesRef.current[`${effectiveRound}:${String(b.batch_id)}`],
                ),
              );
              // Merge QC-rated history (if any) so JM can still see feedback in same session.
              const qcExtra = Object.values(qcRatedHistoryRef.current).filter((b: Batch) => b.team_id === me.assignment.team_id);
              const merged = [...mapped, ...qcExtra].reduce<Record<string, Batch>>((acc, b: Batch) => {
                acc[String(b.batch_id)] = b;
                return acc;
              }, {} as Record<string, Batch>);
              setBatches(Object.values(merged).sort((a, b) => (a.batch_id - b.batch_id)));
            }
          } catch {
            // ignore; action will surface
          }

          // Round 2: show team popup members when backend says popup is active.
          if (popupActive) {
            try {
              const raw = await sessionService.myTeam(effectiveRound);
              const anyRaw: any = raw;
              const data: any = anyRaw?.data ?? anyRaw;
              const members: any[] = Array.isArray(data?.members) ? data.members : [];
              if (!cancelled) {
                const users = members.map(m =>
                  makeUser(
                    { user_id: Number(m.user_id) as UserId, display_name: String(m.display_name ?? '') },
                    toRole(m.role),
                    (m.team_id ?? me.assignment.team_id) as TeamId,
                  ),
                );
                setRoster(users.length ? users : [nextUser]);
              }
            } catch {
              if (!cancelled) setRoster([nextUser]);
            }
          } else {
            // Default: keep roster minimal (self only)
            setRoster([nextUser]);
          }
        } else if (role === ('QUALITY_CONTROL' as Role)) {
          const effectiveRound = effectiveRoundId ?? me.round_id ?? null;
          if (!effectiveRound) {
            setQcQueue(null);
            return;
          }
          // QC queue (live work)
          let normalizedQueue: ApiQcQueueNextResponse | null = null;
          try {
            const rawQ = await qcService.queueNext(effectiveRound);
            const qAny: any = rawQ;
            const qData = (qAny?.data ?? qAny) as any;
            normalizedQueue = qData
              ? {
                  batch: qData.batch,
                  jokes: Array.isArray(qData.jokes) ? qData.jokes : [],
                  queue_size: qData.queue_size ?? 0,
                }
              : null;
            if (!cancelled) setQcQueue(normalizedQueue);
          } catch {
            if (!cancelled) setQcQueue(null);
          }

          // Team summary for QC (rank/points/avg quality). Prefer batch team_id; fallback to assignment team.
          const summaryTeamId = (normalizedQueue?.batch?.team_id ?? me.assignment?.team_id ?? null) as TeamId | null;
          if (summaryTeamId) {
            try {
              const ts = await jmService.teamSummary(effectiveRound, summaryTeamId);
              if (!cancelled) {
                setTeamSummary((ts as any)?.data ?? ts ?? null);
              }
            } catch {
              // ignore summary failures; will retry on next poll
            }
          }

          if (popupActive) {
            try {
              const raw = await sessionService.myTeam(effectiveRound);
              const anyRaw: any = raw;
              const data: any = anyRaw?.data ?? anyRaw;
              const members: any[] = Array.isArray(data?.members) ? data.members : [];
              if (!cancelled) {
                const users = members.map(m =>
                  makeUser(
                    { user_id: Number(m.user_id) as UserId, display_name: String(m.display_name ?? '') },
                    toRole(m.role),
                    (m.team_id ?? summaryTeamId ?? me.assignment.team_id ?? null) as TeamId,
                  ),
                );
                setRoster(users.length ? users : [nextUser]);
              }
            } catch {
              if (!cancelled) setRoster([nextUser]);
            }
          } else {
            setRoster([nextUser]);
          }

          // Keep local rated history visible in QC UI (no API endpoint for history provided).
          if (!cancelled) {
            const hist = Object.values(qcRatedHistoryRef.current);
            setBatches(hist);
          }
        }
      } catch (e) {
        // If session/me fails because user is not found, clear session so user can re-join lobby.
        if (e instanceof ApiError && e.status === 404) {
          logout();
          return;
        }
        // Otherwise ignore transient errors; user can retry.
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, 1500);

    return () => {
      cancelled = true;
      pollAbortRef.current?.abort();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [user?.user_id, user?.role, roundId]);

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

  const instructorLogin = async (displayName: string, password: string) => {
    const display_name = displayName.trim();
    if (!display_name || !password.trim()) return;
    try {
      const resp = await instructorService.login({ display_name, password });
      localStorage.setItem(LS_USER_ID, String(resp.user.user_id));
      localStorage.setItem(LS_DISPLAY_NAME, resp.user.display_name);
      const next = makeUser(
        { user_id: resp.user.user_id as UserId, display_name: resp.user.display_name },
        'INSTRUCTOR' as Role,
        null,
      );
      setUser(next);
      setRoundId(resp.round_id);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          alert('Incorrect password or instructor access not configured.');
          return;
        }
        if (e.status === 400) {
          alert('Invalid login payload.');
          return;
        }
      }
      alert('Failed to login as instructor.');
    }
  };

  const logout = () => {
    // stop polling immediately
    pollAbortRef.current?.abort();
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    setUser(null);
    localStorage.removeItem(LS_USER_ID);
    localStorage.removeItem(LS_DISPLAY_NAME);
    setRoundId(null);
    setConfig(initialConfig());
    setRoster([]);
    setBatches([]);
    setMarketItems([]);
    setTeamSummary(null);
    setInstructorLobby(null);
    setInstructorStats(null);
    setQcQueue(null);

    // Clear local caches (avoid leaking state across users).
    submittedBatchJokesRef.current = {};
    qcRatedHistoryRef.current = {};
    localStorage.removeItem(LS_SUBMITTED_BATCH_JOKES);
    localStorage.removeItem(LS_QC_RATED_HISTORY);
  };

  const updateConfig = async (updates: Partial<GameConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    // No server-side config endpoint; values are sent when starting the round.
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

    // Delegate auto-assignment to backend.
    const productionPairs = roster.filter(u => u.role !== ('INSTRUCTOR' as Role)).length - customerCount;
    const teamCount = productionPairs / 2;
    if (teamCount <= 0 || !Number.isInteger(teamCount)) {
      alert('Invalid team count. Please check participant numbers.');
      return;
    }

    try {
      await instructorService.autoAssign(roundId, { customer_count: customerCount, team_count: teamCount });
      await updateConfig({ status: 'PLAYING' });
    } catch {
      alert('Failed to auto-assign teams. Please try again.');
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

  const deleteUser = async (userId: string) => {
    if (!roundId) return;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return;

    try {
      await instructorService.deleteUser(roundId, uid as UserId);
      // Optimistic removal; poll will re-sync.
      setRoster(prev => prev.filter(u => Number(u.id) !== uid));
      setInstructorLobby(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          teams: prev.teams.map(t => ({ ...t, members: t.members.filter(m => m.user_id !== (uid as UserId)) })),
          customers: prev.customers.filter(c => c.user_id !== (uid as UserId)),
          unassigned: prev.unassigned.filter(u => u.user_id !== (uid as UserId)),
        };
      });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          alert('User not found (may have already been deleted).');
          return;
        }
        if (e.status === 409) {
          alert('Cannot delete an instructor account.');
          return;
        }
        if (e.status === 400) {
          alert('Invalid user id.');
          return;
        }
      }
      alert('Failed to delete user.');
    }
  };

  const addBatch = async (jokeContents: string[]) => {
    if (!user || !roundId || !user.team_id) return;
    // Round 2: enforce max batch size (UI also enforces, but this guards refresh/paste edge cases).
    if (config.round === 2 && jokeContents.length > config.round2BatchLimit) {
      alert(`Round 2 allows up to ${config.round2BatchLimit} jokes per batch.`);
      return;
    }

    try {
      const created = await jmService.createBatch(roundId, { team_id: user.team_id, jokes: jokeContents });
      const createdBatch: any = (created as any)?.data?.batch ?? (created as any)?.batch ?? created;
      // Cache joke text for UI history.
      submittedBatchJokesRef.current[`${roundId}:${String(createdBatch.batch_id)}`] = jokeContents;
      try {
        localStorage.setItem(LS_SUBMITTED_BATCH_JOKES, JSON.stringify(submittedBatchJokesRef.current));
      } catch {
        // ignore
      }
      // Trigger refresh: rely on poll; also do a quick local update for responsiveness.
      const batch: Batch = {
        batch_id: createdBatch.batch_id,
        round_id: createdBatch.round_id,
        team_id: createdBatch.team_id,
        status: createdBatch.status,
        jokes: jokeContents.map((txt, idx) => {
          const fakeJokeId = Number(`${createdBatch.batch_id}${idx}`) as JokeId;
          return { joke_id: fakeJokeId, joke_text: txt, id: String(fakeJokeId), content: txt };
        }),
        submitted_at: createdBatch.submitted_at,
        id: String(createdBatch.batch_id),
        team: String(createdBatch.team_id),
        round: config.round,
        submittedAt: createdBatch.submitted_at ? Date.parse(createdBatch.submitted_at) : undefined,
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
      tag: '',
    }));

    try {
      // Attach normalized tag per rating (single tag allowed).
      for (const entry of ratingList) {
        const selected = tags[String(entry.joke_id)]?.[0] ?? '';
        const mapped = normalizeQcTag(selected);
        if (!mapped) {
          alert('One or more feedback tags are invalid. Please reselect tags.');
          return;
        }
        entry.tag = mapped;
      }

      const tagSummaryCounts = ratingList.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.tag] = (acc[entry.tag] || 0) + 1;
        return acc;
      }, {});
      const tagSummary = Object.entries(tagSummaryCounts).map(([tag, count]) => ({ tag, count }));

      const resp = await qcService.submitRatings(bid, {
        ratings: ratingList,
        feedback,
      });
      const respAny: any = (resp as any)?.data ?? resp;
      const respBatch: any = respAny?.batch ?? respAny;
      const respPublished: any = respAny?.published ?? respAny?.Published ?? null;
      // Build a local “rated batch” for UI history (API doesn't return tag/feedback but we preserve client-side).
      const ratedJokes: Joke[] = active.jokes.map(j => ({
        joke_id: j.joke_id,
        joke_text: j.joke_text,
        id: String(j.joke_id),
        content: j.joke_text,
        rating: ratings[String(j.joke_id)] ?? 1,
        tags: [ratingList.find(r => r.joke_id === j.joke_id)?.tag ?? ''],
      }));
      const avgRating = respBatch?.avg_score ?? null;
      const acceptedCount = respBatch?.passes_count ?? null;
      const batch: Batch = {
        batch_id: respBatch.batch_id,
        round_id: roundId,
        team_id: active.batch.team_id,
        status: 'RATED',
        jokes: ratedJokes,
        rated_at: respBatch.rated_at,
        avg_score: respBatch.avg_score,
        passes_count: respBatch.passes_count,
        id: String(respBatch.batch_id),
        team: String(active.batch.team_id),
        round: config.round,
        ratedAt: respBatch.rated_at ? Date.parse(respBatch.rated_at) : undefined,
        avgRating,
        acceptedCount,
        feedback,
        tagSummary,
      };
      qcRatedHistoryRef.current[`${roundId}:${String(batch.batch_id)}`] = batch;
      setBatches(Object.values(qcRatedHistoryRef.current));
      try {
        localStorage.setItem(LS_QC_RATED_HISTORY, JSON.stringify(qcRatedHistoryRef.current));
      } catch {
        // ignore
      }
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
      const respRaw = await customerService.buy(roundId, jid);
      const resp: any = (respRaw as any)?.data ?? respRaw;
      setUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          wallet: resp?.budget?.remaining_budget ?? prev.wallet,
          purchasedJokes: Array.from(new Set([...prev.purchasedJokes, String(jid)])),
        };
      });
      const marketRaw = await customerService.market(roundId);
      const market: any = (marketRaw as any)?.data ?? marketRaw;
      setMarketItems(market?.items ?? []);
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
      const respRaw = await customerService.return(roundId, jid);
      const resp: any = (respRaw as any)?.data ?? respRaw;
      setUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          wallet: resp?.budget?.remaining_budget ?? prev.wallet,
          purchasedJokes: prev.purchasedJokes.filter(id => id !== String(jid)),
        };
      });
      const marketRaw = await customerService.market(roundId);
      const market: any = (marketRaw as any)?.data ?? marketRaw;
      setMarketItems(market?.items ?? []);
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

  const ensureInstructorRoundId = async (): Promise<RoundId | null> => {
    if (roundId) return roundId;
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return null;
    try {
      const me = await sessionService.me();
      if (me?.round_id) {
        setRoundId(me.round_id);
        return me.round_id;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const ensureInstructorRoundIdForRoundNumber = async (roundNumber: number): Promise<RoundId | null> => {
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return null;
    // Prefer resolving by round_number from /v1/rounds/active (supports separate ids for round 1 vs round 2).
    try {
      const active = await sessionService.activeRound();
      const payload: any = active as any;
      const rounds = Array.isArray(payload?.data?.rounds ?? payload?.rounds) ? (payload?.data?.rounds ?? payload?.rounds) : [];
      const match = rounds.find((r: any) => Number(r?.round_number) === Number(roundNumber));
      const rid = (match?.id ?? null) as RoundId | null;
      if (rid) {
        setRoundId(rid);
        return rid;
      }
    } catch {
      // ignore
    }

    // Fallback: use session/me (older backends).
    return await ensureInstructorRoundId();
  };

  const setGameActive = async (isActive: boolean) => {
    // Backend schema supports start/end (no pause). We map `Start` to /start.
    // `Pause` remains local-only until backend supports a pause endpoint.
    if (!user || user.role !== ('INSTRUCTOR' as Role)) {
      setConfig(prev => ({ ...prev, isActive }));
      return;
    }
    const rid = isActive ? await ensureInstructorRoundIdForRoundNumber(config.round) : await ensureInstructorRoundId();
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      if (isActive) {
        const batch_size = config.round === 2 ? config.round2BatchLimit : config.round1BatchSize;
        await instructorService.start(rid, {
          customer_budget: config.customerBudget,
          batch_size,
        });
      }
      setConfig(prev => ({
        ...prev,
        isActive,
        status: 'PLAYING',
        startTime: isActive ? Date.now() : prev.startTime,
        elapsedTime: isActive ? 0 : prev.elapsedTime,
      }));
    } catch {
      alert('Failed to start round.');
    }
  };
  const toggleTeamPopup = async (show: boolean) => {
    // Backend now controls Round 2 popups via /v1/rounds/active -> is_popped_active.
    // Best-effort: update server config when instructor toggles; polling will sync all clients.
    if (!user || user.role !== ('INSTRUCTOR' as Role)) {
      updateConfig({ showTeamPopup: show });
      return;
    }
    const rid = await ensureInstructorRoundIdForRoundNumber(config.round);
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      const resp = await instructorService.popups(rid, { is_popped_active: show });
      const roundAny: any = (resp as any)?.data?.round ?? (resp as any)?.round ?? resp;
      updateConfig({ showTeamPopup: Boolean(roundAny?.is_popped_active ?? show) });
    } catch {
      alert('Failed to update popup state.');
    }
  };

  const endRound = async () => {
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;
    const rid = await ensureInstructorRoundIdForRoundNumber(config.round);
    if (!rid) {
      alert('Missing round id; please refresh and try again.');
      return;
    }
    try {
      await instructorService.end(rid);
      setConfig(prev => {
        // Auto-advance: after ending Round 1, default the UI to Round 2 and keep teams.
        if (prev.round === 1) {
          if (isMockModeEnabled()) {
            try {
              setMockRoundNumber(2);
            } catch {
              // ignore
            }
          }
          return {
            ...prev,
            round: 2,
            isActive: false,
            status: 'PLAYING',
            startTime: null,
            elapsedTime: 0,
          };
        }

        // After ending Round 2, go back to lobby.
        return { ...prev, isActive: false, status: 'LOBBY', startTime: null, elapsedTime: 0 };
      });
    } catch {
      alert('Failed to end round.');
    }
  };
  
  const resetGame = async () => {
    // Only instructors can reset; requires X-User-Id header (already set by apiClient via localStorage).
    if (!user || user.role !== ('INSTRUCTOR' as Role)) return;
    try {
      await instructorService.reset();
    } catch {
      alert('Failed to reset game.');
      return;
    }
    // Clear local game state but keep instructor logged in (do NOT logout).
    // Polling will re-hydrate roundId/lobby after reset.
    setConfig(initialConfig());
    setRoster([]);
    setBatches([]);
    setMarketItems([]);
    setTeamSummary(null);
    setInstructorLobby(null);
    setInstructorStats(null);
    setQcQueue(null);
    setTeamNames(INITIAL_TEAM_NAMES);
    submittedBatchJokesRef.current = {};
    qcRatedHistoryRef.current = {};
    localStorage.removeItem(LS_SUBMITTED_BATCH_JOKES);
    localStorage.removeItem(LS_QC_RATED_HISTORY);
  };

  return (
    <GameContext.Provider value={{
      user, login, instructorLogin, logout, roster,
      config, updateConfig, setRound, setGameActive, endRound, resetGame, toggleTeamPopup,
      calculateValidCustomerOptions, formTeams, resetToLobby,
      teamNames, updateTeamName, updateUser, deleteUser,
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