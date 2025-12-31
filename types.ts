
/**
 * UI-facing role enum (kept backward-compatible with existing UI text rendering).
 * The API uses `ApiRole` (JM/QC/etc), which we map in the service layer/context.
 */
export enum Role {
  INSTRUCTOR = 'INSTRUCTOR',
  JOKE_MAKER = 'JOKE_MAKER',
  QUALITY_CONTROL = 'QUALITY_CONTROL',
  CUSTOMER = 'CUSTOMER',
  UNASSIGNED = 'UNASSIGNED', // Local-only: represents lobby / WAITING participant status
}

// --- ID types (schema-aligned) ---
export type UserId = number;
export type TeamId = number;
export type RoundId = number;
export type BatchId = number;
export type JokeId = number;

// --- API enums (schema-aligned) ---
export type ApiRole = 'INSTRUCTOR' | 'JM' | 'QC' | 'CUSTOMER';
export type ParticipantStatus = 'WAITING' | 'ASSIGNED';
export type RoundStatus = 'CONFIGURED' | 'ACTIVE' | 'ENDED';
export type BatchStatus = 'DRAFT' | 'SUBMITTED' | 'RATED';

// --- App/UI state ---
export type GameStatus = 'LOBBY' | 'PLAYING';

/**
 * App User model: includes schema-aligned fields (`user_id`, `display_name`, `team_id`)
 * plus backward-compatible aliases (`id`, `name`, `team`) so we do not touch UI components.
 */
export interface User {
  // Schema-aligned
  user_id: UserId;
  display_name: string;
  role: Role;
  team_id: TeamId | null;

  // UI compatibility (derived / mirrored)
  id: string;
  name: string;
  team: string; // "1", "2", etc. or "N/A"

  // Customer view compatibility
  wallet: number;
  purchasedJokes: string[]; // joke ids as strings (legacy); kept for UI compatibility
}

/**
 * App Joke model: includes schema-aligned fields (`joke_id`, `joke_text`) plus legacy aliases.
 */
export interface Joke {
  joke_id: JokeId;
  joke_text: string;

  // UI compatibility
  id: string;
  content: string;

  // QC feedback (client-side only; schema does not include tags/feedback)
  rating?: number; // 1-5
  tags?: string[];
}

/**
 * App Batch model: includes schema-aligned fields (`batch_id`, `round_id`, `team_id`)
 * plus legacy aliases (`id`, `team`, `round`) used by existing views.
 */
export interface Batch {
  batch_id: BatchId;
  round_id: RoundId;
  team_id: TeamId;
  status: BatchStatus;

  jokes: Joke[];

  submitted_at?: string;
  rated_at?: string;
  avg_score?: number | null;
  passes_count?: number | null;

  // UI compatibility aliases
  id: string;
  team: string;
  round: number;
  submittedAt?: number;
  ratedAt?: number;
  avgRating?: number;
  acceptedCount?: number;
  feedback?: string;
  tagSummary?: Array<{ tag: string; count: number }>;
}

export interface GameConfig {
  status: GameStatus;
  round: number; // displayed round number (round_number)
  isActive: boolean;
  showTeamPopup: boolean;
  startTime: number | null;
  elapsedTime: number; // seconds
  customerBudget: number;
  round1BatchSize: number;
  round2BatchLimit: number;
}

// --- API shapes (schema-aligned) ---
export interface Team {
  id: TeamId;
  name: string;
}

export interface ApiErrorResponse {
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

export interface ApiUser {
  user_id: UserId;
  display_name: string;
}

export interface ApiParticipant {
  status: ParticipantStatus;
  joined_at: string;
  assigned_at: string | null;
}

export interface ApiSessionJoinRequest {
  display_name: string;
}

export interface ApiSessionJoinResponse {
  user: ApiUser;
  participant: ApiParticipant;
}

export interface ApiSessionMeResponse {
  user: { user_id: UserId; display_name: string };
  round_id: RoundId;
  participant: ApiParticipant;
  assignment: { role: ApiRole | null; team_id: TeamId | null };
}

export interface ApiInstructorLoginRequest {
  display_name: string;
  password: string;
}

export interface ApiInstructorLoginResponse {
  user: { user_id: UserId; display_name: string; role: 'INSTRUCTOR' };
  round_id: RoundId;
}

export interface ApiRound {
  id: RoundId;
  round_number: number;
  status: string; // backend may return "Active"/"Ended"/"Configured"; we normalize client-side
  batch_size: number;
  customer_budget: number;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  is_popped_active?: boolean;
}

export interface ApiActiveRoundResponse {
  rounds: ApiRound[];
}

export interface ApiInstructorRoundConfigResponse {
  data: { round: ApiRound };
}

export interface ApiTeamSummaryResponse {
  team: Team;
  round_id: RoundId;
  rank: number;
  points: number;
  total_sales: number;
  batches_created: number;
  batches_rated: number;
  accepted_jokes: number;
  avg_score_overall: number;
  unrated_batches: number;
}

export interface ApiTeamBatchesResponse {
  batches: Array<{
    batch_id: BatchId;
    status: BatchStatus;
    submitted_at: string;
    rated_at?: string;
    avg_score: number | null;
    passes_count: number | null;
    feedback?: string | null;
    tag_summary?: Array<{ tag: string; count: number }>;
    jokes?: Array<{ joke_id: JokeId; joke_text: string }>;
  }>;
}

export interface ApiCreateBatchRequest {
  team_id: TeamId;
  jokes: string[];
}

export interface ApiCreateBatchResponse {
  batch: {
    batch_id: BatchId;
    round_id: RoundId;
    team_id: TeamId;
    status: BatchStatus;
    submitted_at: string;
    jokes_count: number;
  };
}

export interface ApiQcQueueNextResponse {
  batch: { batch_id: BatchId; round_id: RoundId; team_id: TeamId; submitted_at: string };
  jokes: Array<{ joke_id: JokeId; joke_text: string }>;
  queue_size: number;
}

export interface ApiQcQueueCountResponse {
  queue_size: number;
}

export interface ApiQcSubmitRatingsRequest {
  ratings: Array<{ joke_id: JokeId; rating: number; tag: string }>;
  feedback?: string;
}

export interface ApiQcSubmitRatingsResponse {
  batch: { batch_id: BatchId; status: BatchStatus; rated_at: string; avg_score: number; passes_count: number };
  published: { count: number; joke_ids: JokeId[] };
}

export interface ApiMarketItem {
  joke_id: JokeId;
  joke_text: string;
  team: Team;
  is_bought_by_me: boolean;
}

export interface ApiMarketResponse {
  items: ApiMarketItem[];
}

export interface ApiCustomerBudgetResponse {
  round_id: RoundId;
  starting_budget: number;
  remaining_budget: number;
}

export interface ApiMarketBuyReturnResponse {
  purchase: { purchase_id: number; joke_id: JokeId };
  budget: { starting_budget: number; remaining_budget: number };
  team_points_awarded: { team_id: TeamId; points_delta: number };
}

export interface ApiInstructorLobbyResponse {
  round_id: RoundId;
  summary: {
    waiting: number;
    assigned: number;
    dropped: number;
    team_count: number;
    customer_count: number;
  };
  teams: Array<{ team: Team; members: Array<{ user_id: UserId; display_name: string; role: ApiRole }> }>;
  customers: Array<{ user_id: UserId; display_name: string; role: ApiRole }>;
  unassigned: Array<{ user_id: UserId; display_name: string; status: ParticipantStatus }>;
}

export interface ApiInstructorStatsResponse {
  round_id: RoundId;
  leaderboard: Array<{
    rank: number;
    team: Team;
    points: number;
    total_sales: number;
    batches_rated: number;
    avg_score_overall: number;
    accepted_jokes: number;
  }>;
  cumulative_sales: Array<{
    event_index: number;
    timestamp: string;
    team_id: TeamId;
    team_name: string;
    total_sales: number;
  }>;
  batch_quality_by_size: Array<{
    batch_id: BatchId;
    team_id: TeamId;
    team_name: string;
    submitted_at: string;
    batch_size: number;
    avg_score: number;
  }>;
  learning_curve: Array<{
    team_id: TeamId;
    team_name: string;
    batch_order: number;
    avg_score: number;
  }>;
  output_vs_rejection: Array<{
    team_id: TeamId;
    team_name: string;
    total_jokes: number;
    rated_jokes: number;
    accepted_jokes: number;
    rejection_rate: number;
  }>;
  revenue_vs_acceptance: Array<{
    team_id: TeamId;
    team_name: string;
    total_sales: number;
    accepted_jokes: number;
    acceptance_rate: number;
  }>;
}

export interface ApiInstructorDeleteUserResponse {
  deleted_user_id: UserId;
}

export interface ApiTeamsResponse {
  teams: Team[];
}
