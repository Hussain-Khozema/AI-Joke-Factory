import { apiRequest } from './apiClient';
import type {
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  RoundId,
  TeamId,
  UserId,
} from '../types';

export const instructorService = {
  lobby(round_id: RoundId): Promise<ApiInstructorLobbyResponse> {
    return apiRequest<ApiInstructorLobbyResponse>(`/v1/instructor/rounds/${round_id}/lobby`, { method: 'GET' });
  },

  stats(round_id: RoundId): Promise<ApiInstructorStatsResponse> {
    return apiRequest<ApiInstructorStatsResponse>(`/v1/instructor/rounds/${round_id}/stats`, { method: 'GET' });
  },

  updateConfig(round_id: RoundId, body: { customer_budget: number; batch_size: number }): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/config`, { method: 'PUT', body });
  },

  autoAssign(round_id: RoundId): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/assign`, { method: 'POST' });
  },

  patchUser(
    round_id: RoundId,
    user_id: UserId,
    body: { status?: 'WAITING' | 'ASSIGNED'; role?: 'INSTRUCTOR' | 'JM' | 'QC' | 'CUSTOMER'; team_id?: TeamId | null },
  ): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'PATCH', body });
  },

  start(round_id: RoundId): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/start`, { method: 'POST' });
  },

  end(round_id: RoundId): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/end`, { method: 'POST' });
  },
};


