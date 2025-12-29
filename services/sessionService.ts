import { apiRequest } from './apiClient';
import type {
  ApiActiveRoundResponse,
  ApiSessionJoinRequest,
  ApiSessionJoinResponse,
  ApiSessionMeResponse,
  ApiTeamsResponse,
  RoundId,
} from '../types';

export const sessionService = {
  join(body: ApiSessionJoinRequest): Promise<ApiSessionJoinResponse> {
    return apiRequest<ApiSessionJoinResponse>('/v1/session/join', { method: 'POST', body });
  },

  me(): Promise<ApiSessionMeResponse> {
    return apiRequest<ApiSessionMeResponse>('/v1/session/me', { method: 'GET' });
  },

  activeRound(): Promise<ApiActiveRoundResponse> {
    return apiRequest<ApiActiveRoundResponse>('/v1/rounds/active', { method: 'GET' });
  },

  /**
   * Provisional endpoint (no formal spec provided): used only to populate
   * JM/QC “Meet Your Team” modal without using instructor-only lobby API.
   *
   * If the backend path/shape differs, update this one function + mapper.
   */
  myTeam(round_id: RoundId): Promise<unknown> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<unknown>(`/v1/session/team?round_id=${q}`, { method: 'GET' });
  },
};


