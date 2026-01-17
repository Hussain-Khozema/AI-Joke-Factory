import type {
  ApiActiveRoundResponse,
  ApiCreateBatchRequest,
  ApiCreateBatchResponse,
  ApiCustomerBudgetResponse,
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  ApiMarketBuyReturnResponse,
  ApiMarketResponse,
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiQcSubmitRatingsRequest,
  ApiQcSubmitRatingsResponse,
  ApiSessionJoinRequest,
  ApiSessionJoinResponse,
  ApiSessionMeResponse,
  ApiTeamBatchesResponse,
  ApiTeamSummaryResponse,
  ApiTeamsResponse,
  ApiUser,
  BatchId,
  JokeId,
  RoundId,
  Team,
  TeamId,
  UserId,
} from '../types';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type MockOk<T> = { ok: true; status: number; json: T };
type MockErr = { ok: false; status: number; json: { code?: string; message: string; details?: unknown } };
type MockResp<T> = MockOk<T> | MockErr;

type ParticipantStatus = 'WAITING' | 'ASSIGNED';
type ApiRole = 'INSTRUCTOR' | 'JM' | 'QC' | 'CUSTOMER';
type BatchStatus = 'DRAFT' | 'SUBMITTED' | 'RATED';

type MockParticipant = {
  user_id: UserId;
  display_name: string;
  status: ParticipantStatus;
  joined_at: string;
  assigned_at: string | null;
};

type MockAssignment = { role: ApiRole | null; team_id: TeamId | null };

type MockRound = {
  id: RoundId;
  round_number: number;
  status: 'CONFIGURED' | 'ACTIVE' | 'ENDED';
  batch_size: number;
  customer_budget: number;
  started_at: string | null;
  ended_at: string | null;
  is_popped_active?: boolean;
};

type MockBatch = {
  batch_id: BatchId;
  round_id: RoundId;
  team_id: TeamId;
  status: BatchStatus;
  submitted_at: string;
  rated_at?: string;
  jokes: Array<{ joke_id: JokeId; joke_text: string; joke_title?: string }>;
  avg_score: number | null;
  passes_count: number | null;
};

type MockPurchase = {
  purchase_id: number;
  round_id: RoundId;
  buyer_user_id: UserId;
  joke_id: JokeId;
  team_id: TeamId;
  created_at: string;
  returned_at: string | null;
};

type MockDb = {
  seq: { user_id: number; batch_id: number; purchase_id: number };
  active_round_id: RoundId;
  round: MockRound;
  teams: Team[];
  participants: Record<string, MockParticipant>; // user_id -> participant
  assignments: Record<string, MockAssignment>; // user_id -> assignment
  batches: Record<string, MockBatch>; // batch_id -> batch
  purchases: Record<string, MockPurchase>; // purchase_id -> purchase
  // quick index: `${round_id}:${buyer_user_id}:${joke_id}` -> purchase_id
  purchaseIndex: Record<string, number>;
};

const LS_KEY = 'joke_factory_mock_db_v1';
const MAX_TEAMS = 20;

function isoNow(): string {
  return new Date().toISOString();
}

function loadDb(): MockDb {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const db = JSON.parse(raw) as MockDb;
      // Lightweight migration: older mock DBs used 30 teams; cap to 20 for the current demo setup.
      if (Array.isArray((db as any).teams) && (db as any).teams.length > MAX_TEAMS) {
        (db as any).teams = (db as any).teams.slice(0, MAX_TEAMS);
        persistDb(db);
      }
      return db;
    } catch {
      // fallthrough to fresh db
    }
  }

  const teams: Team[] = Array.from({ length: MAX_TEAMS }, (_, i) => ({
    id: (i + 1) as TeamId,
    name: `Team ${i + 1}`,
  }));

  const round: MockRound = {
    id: 1 as RoundId,
    round_number: 1,
    status: 'CONFIGURED',
    batch_size: 5,
    customer_budget: 10,
    started_at: null,
    ended_at: null,
    is_popped_active: false,
  };

  const db: MockDb = {
    seq: { user_id: 1000, batch_id: 5000, purchase_id: 9000 },
    active_round_id: round.id,
    round,
    teams,
    participants: {},
    assignments: {},
    batches: {},
    purchases: {},
    purchaseIndex: {},
  };
  persistDb(db);
  return db;
}

export function setMockRoundNumber(roundNumber: 1 | 2) {
  const db = loadDb();
  db.round.round_number = roundNumber;
  // Keep id stable so existing session round_id continues to work.
  persistDb(db);
}

function persistDb(db: MockDb) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

function err(status: number, code: string | undefined, message: string, details?: unknown): MockErr {
  return { ok: false, status, json: { code, message, details } };
}

function ok<T>(json: T, status = 200): MockOk<T> {
  return { ok: true, status, json };
}

function getUserIdFromHeaders(headers?: Record<string, string | undefined>): UserId | null {
  const raw = headers?.['X-User-Id'] ?? headers?.['x-user-id'];
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n as UserId;
}

function normalizePath(path: string): string {
  // `apiClient` passes a path like "/v1/..." or "v1/..."
  const p = path.startsWith('/') ? path : `/${path}`;
  // strip query for router matching
  const q = p.indexOf('?');
  return q >= 0 ? p.slice(0, q) : p;
}

function getQuery(path: string): URLSearchParams {
  const q = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  return new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
}

function ensureMe(db: MockDb, user_id: UserId | null): { user: ApiUser; participant: MockParticipant; assignment: MockAssignment } | MockErr {
  if (!user_id) return err(401, 'UNAUTHENTICATED', 'Missing X-User-Id header.');
  const p = db.participants[String(user_id)];
  if (!p) return err(401, 'INVALID_SESSION', 'Unknown session. Please login again.');
  const a = db.assignments[String(user_id)] ?? { role: null, team_id: null };
  return {
    user: { user_id: p.user_id, display_name: p.display_name },
    participant: p,
    assignment: a,
  };
}

function isRoundActive(db: MockDb): boolean {
  return db.round.status === 'ACTIVE';
}

function requireRoundActive(db: MockDb): MockErr | null {
  if (!isRoundActive(db)) return err(409, 'ROUND_NOT_ACTIVE', 'Round is not active.');
  return null;
}

function computeBudget(db: MockDb, round_id: RoundId, buyer_user_id: UserId): ApiCustomerBudgetResponse {
  const starting_budget = db.round.customer_budget;
  const spent = Object.values(db.purchases).reduce((sum, p) => {
    if (p.round_id !== round_id) return sum;
    if (p.buyer_user_id !== buyer_user_id) return sum;
    if (p.returned_at) return sum;
    return sum + 1;
  }, 0);
  return {
    round_id,
    starting_budget,
    remaining_budget: Math.max(0, starting_budget - spent),
  };
}

function getMarketItems(db: MockDb, round_id: RoundId, buyer_user_id: UserId): ApiMarketResponse {
  const items = Object.values(db.batches)
    .filter(b => b.round_id === round_id && b.status === 'RATED')
    .flatMap(b => b.jokes.map(j => ({ batch: b, joke: j })))
    .filter(({ batch, joke }) => {
      // only accepted jokes are sellable (passes_count is per-batch; we approximate by rating threshold in submitRatings)
      // Here we publish all jokes for simplicity, but keep it stable.
      // If passes_count is 0, publish none.
      const pc = batch.passes_count ?? 0;
      if (pc <= 0) return false;
      // publish only first `passes_count` jokes (stable order)
      const idx = batch.jokes.findIndex(x => x.joke_id === joke.joke_id);
      return idx >= 0 && idx < pc;
    })
    .map(({ batch, joke }) => {
      const key = `${round_id}:${buyer_user_id}:${joke.joke_id}`;
      const purchaseId = db.purchaseIndex[key];
      const purchase = purchaseId ? db.purchases[String(purchaseId)] : null;
      const team = db.teams.find(t => t.id === batch.team_id) ?? { id: batch.team_id, name: `Team ${batch.team_id}` };
      return {
        joke_id: joke.joke_id,
        joke_title: (joke as any).joke_title ?? undefined,
        joke_text: joke.joke_text,
        team,
        is_bought_by_me: !!purchase && !purchase.returned_at,
      };
    });

  return { items };
}

function computeTeamPoints(db: MockDb, team_id: TeamId): number {
  // Simple: +1 per non-returned purchase for jokes of this team.
  return Object.values(db.purchases).reduce((sum, p) => {
    if (p.team_id !== team_id) return sum;
    if (p.returned_at) return sum;
    return sum + 1;
  }, 0);
}

function computeTeamStats(db: MockDb, team_id: TeamId) {
  const teamBatches = Object.values(db.batches).filter(b => b.team_id === team_id);
  const batches_created = teamBatches.length;
  const rated = teamBatches.filter(b => b.status === 'RATED');
  const batches_rated = rated.length;
  const accepted_jokes = rated.reduce((sum, b) => sum + (b.passes_count ?? 0), 0);
  const avg_score_overall = rated.length
    ? rated.reduce((sum, b) => sum + (b.avg_score ?? 0), 0) / rated.length
    : 0;
  const total_sales = Object.values(db.purchases).reduce((sum, p) => {
    if (p.team_id !== team_id) return sum;
    if (p.returned_at) return sum;
    return sum + 1;
  }, 0);
  const points = computeTeamPoints(db, team_id);
  const unrated_batches = teamBatches.filter(b => b.status !== 'RATED').length;
  return {
    points,
    total_sales,
    batches_created,
    batches_rated,
    accepted_jokes,
    avg_score_overall,
    unrated_batches,
  };
}

function listTeamBatches(db: MockDb, round_id: RoundId, team_id: TeamId): ApiTeamBatchesResponse {
  const batches = Object.values(db.batches)
    .filter(b => b.round_id === round_id && b.team_id === team_id)
    .sort((a, b) => a.batch_id - b.batch_id)
    .map(b => ({
      batch_id: b.batch_id,
      status: b.status,
      submitted_at: b.submitted_at,
      rated_at: b.rated_at,
      avg_score: b.avg_score,
      passes_count: b.passes_count,
    }));
  return { batches };
}

function route(
  db: MockDb,
  method: HttpMethod,
  pathWithQuery: string,
  opts: { headers?: Record<string, string | undefined>; body?: unknown },
): MockResp<unknown> {
  const path = normalizePath(pathWithQuery);
  const query = getQuery(pathWithQuery);
  const meUserId = getUserIdFromHeaders(opts.headers);

  // --- Session ---
  if (method === 'POST' && path === '/v1/session/join') {
    const body = (opts.body ?? {}) as ApiSessionJoinRequest;
    const display_name = String(body.display_name ?? '').trim();
    if (!display_name) return err(400, 'INVALID_REQUEST', 'display_name is required.');

    // enforce NAME_TAKEN
    const taken = Object.values(db.participants).some(p => p.display_name.toLowerCase() === display_name.toLowerCase());
    if (taken) return err(409, 'NAME_TAKEN', 'Name already taken.');

    const user_id = (++db.seq.user_id) as UserId;
    const joined_at = isoNow();
    const participant: MockParticipant = {
      user_id,
      display_name,
      status: 'WAITING',
      joined_at,
      assigned_at: null,
    };
    db.participants[String(user_id)] = participant;

    // Instructor login in the existing UI maps password -> display_name (e.g. "Charles2026").
    // In the real backend, that name would be assigned INSTRUCTOR. Mirror that behavior here
    // so users can access the Instructor page while using mock API.
    const isInstructorName = display_name === 'Charles2026' || display_name === 'Fernanda2026';
    db.assignments[String(user_id)] = { role: isInstructorName ? 'INSTRUCTOR' : null, team_id: null };
    if (isInstructorName) {
      participant.status = 'ASSIGNED';
      participant.assigned_at = isoNow();
    }
    persistDb(db);

    const resp: ApiSessionJoinResponse = {
      user: { user_id, display_name },
      participant: {
        status: participant.status,
        joined_at: participant.joined_at,
        assigned_at: participant.assigned_at,
      },
    };
    return ok(resp, 200);
  }

  if (method === 'GET' && path === '/v1/session/me') {
    const me = ensureMe(db, meUserId);
    if ('ok' in me) return me;
    const resp: ApiSessionMeResponse = {
      user: me.user,
      round_id: db.active_round_id,
      participant: {
        status: me.participant.status,
        joined_at: me.participant.joined_at,
        assigned_at: me.participant.assigned_at,
      },
      assignment: me.assignment,
    };
    return ok(resp, 200);
  }

  if (method === 'GET' && path === '/v1/rounds/active') {
    const resp: ApiActiveRoundResponse = {
      rounds: db.round
        ? [
            {
              id: db.round.id,
              round_number: db.round.round_number,
              status: db.round.status,
              batch_size: db.round.batch_size,
              customer_budget: db.round.customer_budget,
              started_at: db.round.started_at,
              ended_at: db.round.ended_at,
              is_popped_active: db.round.is_popped_active ?? false,
            },
          ]
        : [],
    };
    return ok(resp, 200);
  }

  if (method === 'GET' && path === '/v1/teams') {
    const resp: ApiTeamsResponse = { teams: db.teams };
    return ok(resp, 200);
  }

  if (method === 'GET' && path === '/v1/session/team') {
    const me = ensureMe(db, meUserId);
    if ('ok' in me) return me;
    const round_id = Number(query.get('round_id') ?? db.active_round_id) as RoundId;
    const team_id = me.assignment.team_id;
    const members =
      team_id == null
        ? []
        : Object.entries(db.assignments)
            .filter(([, a]) => a.team_id === team_id)
            .map(([uid, a]) => {
              const p = db.participants[uid];
              if (!p) return null;
              return {
                user_id: p.user_id,
                display_name: p.display_name,
                role: a.role ?? null,
                team_id,
                round_id,
              };
            })
            .filter(Boolean);

    // Minimal shape; caller treats as `any`.
    return ok({ members }, 200);
  }

  // --- Instructor ---
  if (path.startsWith('/v1/instructor/rounds/')) {
    const me = ensureMe(db, meUserId);
    if ('ok' in me) return me;
    if (me.assignment.role !== 'INSTRUCTOR') {
      // Be permissive: allow debug panel / dev to still act like instructor in mock if needed.
      // But keep a 403 for non-instructor to avoid confusing flows.
      // (UI doesn't explicitly handle this.)
      // return err(403, 'FORBIDDEN', 'Instructor only.');
    }

    const m = path.match(/^\/v1\/instructor\/rounds\/(\d+)(\/.*)?$/);
    if (!m) return err(404, 'NOT_FOUND', 'Not found.');
    const round_id = Number(m[1]) as RoundId;
    const sub = m[2] ?? '';

    if (method === 'GET' && sub === '/lobby') {
      const teams = db.teams.map(t => {
        const members = Object.entries(db.assignments)
          .filter(([, a]) => a.team_id === t.id && (a.role === 'JM' || a.role === 'QC'))
          .map(([uid, a]) => {
            const p = db.participants[uid];
            return { user_id: p.user_id, display_name: p.display_name, role: a.role as ApiRole };
          });
        return { team: t, members };
      });

      const customers = Object.entries(db.assignments)
        .filter(([, a]) => a.role === 'CUSTOMER')
        .map(([uid, a]) => {
          const p = db.participants[uid];
          return { user_id: p.user_id, display_name: p.display_name, role: a.role as ApiRole };
        });

      const unassigned = Object.entries(db.participants)
        .filter(([uid]) => {
          const a = db.assignments[uid];
          return !a || a.role == null;
        })
        .map(([uid, p]) => ({ user_id: p.user_id, display_name: p.display_name, status: p.status }));

      const waiting = unassigned.length;
      const assigned = Object.values(db.assignments).filter(a => a.role != null).length;
      const resp: ApiInstructorLobbyResponse = {
        round_id,
        summary: {
          waiting,
          assigned,
          dropped: 0,
          team_count: db.teams.length,
          customer_count: customers.length,
        },
        teams,
        customers,
        unassigned,
      };
      return ok(resp, 200);
    }

    const deleteUserMatch = sub.match(/^\/users\/(\d+)$/);
    if (method === 'DELETE' && deleteUserMatch) {
      const user_id = Number(deleteUserMatch[1]) as UserId;
      const p = db.participants[String(user_id)];
      if (!p) return err(404, 'NOT_FOUND', 'User not found.');
      const a = db.assignments[String(user_id)] ?? { role: null, team_id: null };
      if (a.role === 'INSTRUCTOR') return err(409, 'CONFLICT', 'Cannot delete instructor.');

      delete db.participants[String(user_id)];
      delete db.assignments[String(user_id)];

      // Clean up purchases made by this user (best-effort)
      for (const [pid, pur] of Object.entries(db.purchases)) {
        if (pur.buyer_user_id === user_id) {
          delete db.purchases[pid];
        }
      }
      // Rebuild purchaseIndex (cheap and safe)
      db.purchaseIndex = {};
      for (const pur of Object.values(db.purchases)) {
        db.purchaseIndex[`${pur.round_id}:${pur.buyer_user_id}:${pur.joke_id}`] = pur.purchase_id;
      }

      persistDb(db);
      return ok({ deleted_user_id: user_id }, 200);
    }

    if (method === 'GET' && sub === '/stats') {
      const teamsStats = db.teams
        .map(t => ({ team: t, ...computeTeamStats(db, t.id) }))
        .sort((a, b) => b.points - a.points);

      const teamNameById = new Map<TeamId, string>(db.teams.map(t => [t.id, t.name]));

      const ratedBatches = Object.values(db.batches).filter(b => b.round_id === round_id && b.status === 'RATED');
      const allBatches = Object.values(db.batches).filter(b => b.round_id === round_id);

      // Cumulative sales events: one event per purchase (count-based in mock mode).
      const purchases = Object.values(db.purchases)
        .filter(p => p.round_id === round_id && !p.returned_at)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

      const runningSales: Record<string, number> = {};
      const cumulative_sales: ApiInstructorStatsResponse['cumulative_sales'] = purchases.map((p, idx) => {
        const key = String(p.team_id);
        runningSales[key] = (runningSales[key] ?? 0) + 1;
        return {
          event_index: idx + 1,
          timestamp: p.created_at,
          team_id: p.team_id,
          team_name: teamNameById.get(p.team_id) || `Team ${p.team_id}`,
          total_sales: runningSales[key],
        };
      });

      const batch_quality_by_size: ApiInstructorStatsResponse['batch_quality_by_size'] = ratedBatches.map(b => ({
        batch_id: b.batch_id,
        team_id: b.team_id,
        team_name: teamNameById.get(b.team_id) || `Team ${b.team_id}`,
        submitted_at: b.submitted_at,
        batch_size: b.jokes.length,
        avg_score: b.avg_score ?? 0,
      }));

      const learning_curve: ApiInstructorStatsResponse['learning_curve'] = db.teams.flatMap(t => {
        const teamRated = ratedBatches
          .filter(b => b.team_id === t.id)
          .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
        return teamRated.map((b, i) => ({
          team_id: t.id,
          team_name: t.name,
          batch_order: i + 1,
          avg_score: b.avg_score ?? 0,
        }));
      });

      const ratedJokesByTeam: Record<string, number> = {};
      ratedBatches.forEach(b => {
        ratedJokesByTeam[String(b.team_id)] = (ratedJokesByTeam[String(b.team_id)] ?? 0) + b.jokes.length;
      });

      const totalJokesByTeam: Record<string, number> = {};
      allBatches.forEach(b => {
        totalJokesByTeam[String(b.team_id)] = (totalJokesByTeam[String(b.team_id)] ?? 0) + b.jokes.length;
      });

      const output_vs_rejection: ApiInstructorStatsResponse['output_vs_rejection'] = db.teams.map(t => {
        const rated_jokes = ratedJokesByTeam[String(t.id)] ?? 0;
        const accepted_jokes = computeTeamStats(db, t.id).accepted_jokes;
        const rejection_rate = rated_jokes > 0 ? Math.max(0, (rated_jokes - accepted_jokes) / rated_jokes) : 0;
        return {
          team_id: t.id,
          team_name: t.name,
          total_jokes: totalJokesByTeam[String(t.id)] ?? 0,
          rated_jokes,
          accepted_jokes,
          rejection_rate,
        };
      });

      const revenue_vs_acceptance: ApiInstructorStatsResponse['revenue_vs_acceptance'] = db.teams.map(t => {
        const rated_jokes = ratedJokesByTeam[String(t.id)] ?? 0;
        const s = computeTeamStats(db, t.id);
        const acceptance_rate = rated_jokes > 0 ? Math.max(0, s.accepted_jokes / rated_jokes) : 0;
        return {
          team_id: t.id,
          team_name: t.name,
          total_sales: s.total_sales,
          accepted_jokes: s.accepted_jokes,
          acceptance_rate,
        };
      });

      const resp: ApiInstructorStatsResponse = {
        round_id,
        leaderboard: teamsStats.map((t, idx) => ({
          rank: idx + 1,
          team: t.team,
          points: t.points,
          total_sales: t.total_sales,
          batches_rated: t.batches_rated,
          avg_score_overall: t.avg_score_overall,
          accepted_jokes: t.accepted_jokes,
        })),
        cumulative_sales,
        batch_quality_by_size,
        learning_curve,
        output_vs_rejection,
        revenue_vs_acceptance,
      };
      return ok(resp, 200);
    }

    if ((method === 'PUT' || method === 'POST') && sub === '/config') {
      const body = (opts.body ?? {}) as { customer_budget: number; batch_size: number; is_popped_active?: boolean };
      const customer_budget = Number(body.customer_budget);
      const batch_size = Number(body.batch_size);
      if (!Number.isFinite(customer_budget) || !Number.isFinite(batch_size)) {
        return err(400, 'INVALID_REQUEST', 'customer_budget and batch_size must be numbers.');
      }
      db.round.customer_budget = customer_budget;
      db.round.batch_size = batch_size;
      persistDb(db);
      return ok(
        {
          data: {
            round: {
              id: db.round.id,
              round_number: db.round.round_number,
              status: db.round.status,
              customer_budget: db.round.customer_budget,
              batch_size: db.round.batch_size,
              started_at: db.round.started_at,
              ended_at: db.round.ended_at,
              created_at: isoNow(),
              is_popped_active: db.round.is_popped_active ?? false,
            },
          },
        },
        200,
      );
    }

    if (method === 'POST' && sub === '/popups') {
      const body = (opts.body ?? {}) as { is_popped_active?: boolean };
      if (typeof body.is_popped_active !== 'boolean') {
        return err(400, 'INVALID_REQUEST', 'is_popped_active must be a boolean.');
      }
      db.round.is_popped_active = body.is_popped_active;
      persistDb(db);
      return ok(
        {
          data: {
            round: {
              id: db.round.id,
              round_number: db.round.round_number,
              status: db.round.status,
              customer_budget: db.round.customer_budget,
              batch_size: db.round.batch_size,
              started_at: db.round.started_at,
              ended_at: db.round.ended_at,
              created_at: isoNow(),
              is_popped_active: db.round.is_popped_active ?? false,
            },
          },
        },
        200,
      );
    }

    if (method === 'POST' && sub === '/assign') {
      // best-effort: no-op; teams are assigned via PATCH /users/:id in this app.
      return ok(undefined, 204);
    }

    const patchUserMatch = sub.match(/^\/users\/(\d+)$/);
    if (method === 'PATCH' && patchUserMatch) {
      const user_id = Number(patchUserMatch[1]) as UserId;
      const body = (opts.body ?? {}) as { status?: ParticipantStatus; role?: ApiRole; team_id?: TeamId | null };
      const p = db.participants[String(user_id)];
      if (!p) return err(404, 'NOT_FOUND', 'User not found.');

      if (body.status) {
        p.status = body.status;
        if (body.status === 'ASSIGNED' && !p.assigned_at) p.assigned_at = isoNow();
        if (body.status === 'WAITING') p.assigned_at = null;
      }

      const a = db.assignments[String(user_id)] ?? { role: null, team_id: null };
      if (body.role !== undefined) a.role = body.role ?? null;
      if (body.team_id !== undefined) a.team_id = body.team_id ?? null;
      db.assignments[String(user_id)] = a;
      persistDb(db);
      return ok(undefined, 204);
    }

    if (method === 'POST' && sub === '/start') {
      db.round.status = 'ACTIVE';
      db.round.started_at = isoNow();
      db.round.ended_at = null;
      db.round.is_popped_active = true;
      persistDb(db);
      return ok(undefined, 204);
    }

    if (method === 'POST' && sub === '/end') {
      db.round.status = 'ENDED';
      db.round.ended_at = isoNow();
      db.round.is_popped_active = false;
      persistDb(db);
      return ok(undefined, 204);
    }
  }

  // --- JM ---
  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/teams\/(\d+)\/summary$/);
    if (method === 'GET' && m) {
      const round_id = Number(m[1]) as RoundId;
      const team_id = Number(m[2]) as TeamId;
      const team = db.teams.find(t => t.id === team_id) ?? { id: team_id, name: `Team ${team_id}` };
      const stats = computeTeamStats(db, team_id);
      const points = stats.points;
      const resp: ApiTeamSummaryResponse = {
        team,
        round_id,
        rank: 1,
        points,
        total_sales: stats.total_sales,
        batches_created: stats.batches_created,
        batches_rated: stats.batches_rated,
        accepted_jokes: stats.accepted_jokes,
        avg_score_overall: stats.avg_score_overall,
        unrated_batches: stats.unrated_batches,
      };
      return ok(resp, 200);
    }
  }

  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/teams\/(\d+)\/batches$/);
    if (method === 'GET' && m) {
      const round_id = Number(m[1]) as RoundId;
      const team_id = Number(m[2]) as TeamId;
      const resp: ApiTeamBatchesResponse = listTeamBatches(db, round_id, team_id);
      return ok(resp, 200);
    }
  }

  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/batches$/);
    if (method === 'POST' && m) {
      const round_id = Number(m[1]) as RoundId;
      const activeErr = requireRoundActive(db);
      if (activeErr) return activeErr;

      const body = (opts.body ?? {}) as ApiCreateBatchRequest;
      const team_id = Number(body.team_id) as TeamId;
      const jokes = Array.isArray(body.jokes) ? body.jokes.map(x => String(x)) : [];

      if (!Number.isFinite(team_id) || jokes.length <= 0) {
        return err(400, 'INVALID_REQUEST', 'team_id and jokes are required.');
      }

      // Round 1 strict batch size
      if (db.round.round_number === 1 && jokes.length !== db.round.batch_size) {
        return err(400, 'INVALID_BATCH_SIZE', 'Invalid batch size for this round.');
      }
      // Round 2 max batch size
      if (db.round.round_number === 2 && jokes.length > db.round.batch_size) {
        return err(400, 'INVALID_BATCH_SIZE', 'Invalid batch size for this round.');
      }

      const batch_id = (++db.seq.batch_id) as BatchId;
      const submitted_at = isoNow();
      const payloadJokes = jokes.map((txt, idx) => {
        const joke_id = Number(`${batch_id}${idx}`) as JokeId;
        return { joke_id, joke_text: txt };
      });

      const batch: MockBatch = {
        batch_id,
        round_id,
        team_id,
        status: 'SUBMITTED',
        submitted_at,
        jokes: payloadJokes,
        avg_score: null,
        passes_count: null,
      };
      db.batches[String(batch_id)] = batch;
      persistDb(db);

      const resp: ApiCreateBatchResponse = {
        batch: {
          batch_id,
          round_id,
          team_id,
          status: 'SUBMITTED',
          submitted_at,
          jokes_count: payloadJokes.length,
        },
      };
      return ok(resp, 200);
    }
  }

  // --- QC ---
  if (method === 'GET' && path === '/v1/qc/queue/count') {
    const round_id = Number(query.get('round_id') ?? db.active_round_id) as RoundId;
    const queue_size = Object.values(db.batches).filter(b => b.round_id === round_id && b.status === 'SUBMITTED').length;
    const resp: ApiQcQueueCountResponse = { queue_size };
    return ok(resp, 200);
  }

  if (method === 'GET' && path === '/v1/qc/queue/next') {
    const round_id = Number(query.get('round_id') ?? db.active_round_id) as RoundId;
    const next = Object.values(db.batches)
      .filter(b => b.round_id === round_id && b.status === 'SUBMITTED')
      .sort((a, b) => a.batch_id - b.batch_id)[0];
    const queue_size = Object.values(db.batches).filter(b => b.round_id === round_id && b.status === 'SUBMITTED').length;
    if (!next) return err(404, 'EMPTY_QUEUE', 'No batches in queue.');
    const resp: ApiQcQueueNextResponse = {
      batch: { batch_id: next.batch_id, round_id: next.round_id, team_id: next.team_id, submitted_at: next.submitted_at },
      jokes: next.jokes,
      queue_size,
    };
    return ok(resp, 200);
  }

  {
    const m = path.match(/^\/v1\/qc\/batches\/(\d+)\/ratings$/);
    if (method === 'POST' && m) {
      const batch_id = Number(m[1]) as BatchId;
      const activeErr = requireRoundActive(db);
      if (activeErr) return activeErr;

      const batch = db.batches[String(batch_id)];
      if (!batch) return err(404, 'NOT_FOUND', 'Batch not found.');
      if (batch.status === 'RATED') return err(409, 'BATCH_ALREADY_RATED', 'This batch was already rated.');

      const body = (opts.body ?? {}) as ApiQcSubmitRatingsRequest;
      const ratings = Array.isArray(body.ratings) ? body.ratings : [];

      // Compute avg + passes_count (>=3 accepted)
      const ratingByJoke: Record<string, number> = {};
      const titleByJoke: Record<string, string> = {};
      for (const r of ratings) {
        const jid = Number((r as any).joke_id);
        const val = Number((r as any).rating);
        if (!Number.isFinite(jid) || !Number.isFinite(val)) continue;
        ratingByJoke[String(jid)] = Math.max(1, Math.min(5, val));
        const title = String((r as any).joke_title ?? '').trim();
        if (title) titleByJoke[String(jid)] = title;
      }

      const vals = batch.jokes.map(j => ratingByJoke[String(j.joke_id)] ?? 1);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const passes = vals.filter(v => v >= 3).length;

      batch.status = 'RATED';
      batch.rated_at = isoNow();
      batch.avg_score = Number(avg.toFixed(2));
      batch.passes_count = passes;
      // Persist joke titles for accepted jokes (rating 5)
      batch.jokes = batch.jokes.map(j => {
        const rating = ratingByJoke[String(j.joke_id)] ?? 1;
        if (rating === 5 && titleByJoke[String(j.joke_id)]) {
          return { ...j, joke_title: titleByJoke[String(j.joke_id)] };
        }
        return j;
      });
      persistDb(db);

      const publishedIds = batch.jokes.slice(0, passes).map(j => j.joke_id);
      const resp: ApiQcSubmitRatingsResponse = {
        batch: {
          batch_id: batch.batch_id,
          status: batch.status,
          rated_at: batch.rated_at!,
          avg_score: batch.avg_score ?? 0,
          passes_count: batch.passes_count ?? 0,
        },
        published: { count: publishedIds.length, joke_ids: publishedIds },
      };
      return ok(resp, 200);
    }
  }

  // --- Customer ---
  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/customers\/budget$/);
    if (method === 'GET' && m) {
      const round_id = Number(m[1]) as RoundId;
      const me = ensureMe(db, meUserId);
      if ('ok' in me) return me;
      const budget = computeBudget(db, round_id, me.user.user_id);
      return ok(budget, 200);
    }
  }

  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/market$/);
    if (method === 'GET' && m) {
      const round_id = Number(m[1]) as RoundId;
      const me = ensureMe(db, meUserId);
      if ('ok' in me) return me;
      const market = getMarketItems(db, round_id, me.user.user_id);
      return ok(market, 200);
    }
  }

  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/market\/(\d+)\/buy$/);
    if (method === 'POST' && m) {
      const round_id = Number(m[1]) as RoundId;
      const joke_id = Number(m[2]) as JokeId;
      const activeErr = requireRoundActive(db);
      if (activeErr) return activeErr;

      const me = ensureMe(db, meUserId);
      if ('ok' in me) return me;

      const key = `${round_id}:${me.user.user_id}:${joke_id}`;
      const existingId = db.purchaseIndex[key];
      if (existingId) {
        const existing = db.purchases[String(existingId)];
        if (existing && !existing.returned_at) return err(409, 'ALREADY_BOUGHT', 'You already bought this joke.');
      }

      const budget = computeBudget(db, round_id, me.user.user_id);
      if (budget.remaining_budget <= 0) return err(409, 'INSUFFICIENT_BUDGET', 'Insufficient budget.');

      // infer team from joke_id prefix: batch_id is first digits; find in batches
      const jokeBatch = Object.values(db.batches).find(b => b.jokes.some(j => j.joke_id === joke_id));
      if (!jokeBatch) return err(404, 'NOT_FOUND', 'Joke not found.');

      const purchase_id = (++db.seq.purchase_id) as number;
      const purchase: MockPurchase = {
        purchase_id,
        round_id,
        buyer_user_id: me.user.user_id,
        joke_id,
        team_id: jokeBatch.team_id,
        created_at: isoNow(),
        returned_at: null,
      };
      db.purchases[String(purchase_id)] = purchase;
      db.purchaseIndex[key] = purchase_id;
      persistDb(db);

      const nextBudget = computeBudget(db, round_id, me.user.user_id);
      const resp: ApiMarketBuyReturnResponse = {
        purchase: { purchase_id, joke_id },
        budget: { starting_budget: nextBudget.starting_budget, remaining_budget: nextBudget.remaining_budget },
        team_points_awarded: { team_id: jokeBatch.team_id, points_delta: 1 },
      };
      return ok(resp, 200);
    }
  }

  {
    const m = path.match(/^\/v1\/rounds\/(\d+)\/market\/(\d+)\/return$/);
    if (method === 'POST' && m) {
      const round_id = Number(m[1]) as RoundId;
      const joke_id = Number(m[2]) as JokeId;
      const activeErr = requireRoundActive(db);
      if (activeErr) return activeErr;

      const me = ensureMe(db, meUserId);
      if ('ok' in me) return me;

      const key = `${round_id}:${me.user.user_id}:${joke_id}`;
      const purchaseId = db.purchaseIndex[key];
      if (!purchaseId) return err(409, 'NOT_BOUGHT_YET', 'You have not bought this joke.');
      const purchase = db.purchases[String(purchaseId)];
      if (!purchase || purchase.returned_at) return err(409, 'ALREADY_RETURNED', 'This joke was already returned.');

      purchase.returned_at = isoNow();
      persistDb(db);

      const nextBudget = computeBudget(db, round_id, me.user.user_id);
      const resp: ApiMarketBuyReturnResponse = {
        purchase: { purchase_id: purchase.purchase_id, joke_id },
        budget: { starting_budget: nextBudget.starting_budget, remaining_budget: nextBudget.remaining_budget },
        team_points_awarded: { team_id: purchase.team_id, points_delta: -1 },
      };
      return ok(resp, 200);
    }
  }

  return err(404, 'NOT_FOUND', `No mock route for ${method} ${path}`);
}

export async function mockApiRequest<T>(
  path: string,
  opts: { method?: string; headers?: Record<string, string | undefined>; body?: unknown } = {},
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: { code?: string; message: string; details?: unknown } }> {
  const db = loadDb();
  const method = (String(opts.method ?? 'GET').toUpperCase() as HttpMethod) || 'GET';

  const resp = route(db, method, path, { headers: opts.headers, body: opts.body });
  if (resp.ok) return { ok: true, status: resp.status, data: resp.json as T };
  return { ok: false, status: resp.status, error: resp.json };
}


