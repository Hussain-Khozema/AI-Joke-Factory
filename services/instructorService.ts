import { apiRequest } from './apiClient';
import type {
  ApiInstructorLobbyResponse,
  ApiInstructorStatsResponse,
  ApiInstructorDeleteUserResponse,
  ApiInstructorLoginRequest,
  ApiInstructorLoginResponse,
  RoundId,
  TeamId,
  UserId,
} from '../types';

export const instructorService = {
  login(body: ApiInstructorLoginRequest): Promise<ApiInstructorLoginResponse> {
    return apiRequest<ApiInstructorLoginResponse>('/v1/instructor/login', { method: 'POST', body });
  },

  lobby(round_id: RoundId): Promise<ApiInstructorLobbyResponse> {
    return apiRequest<ApiInstructorLobbyResponse>(`/v1/instructor/rounds/${round_id}/lobby`, { method: 'GET' });
  },

  stats(round_id: RoundId): Promise<ApiInstructorStatsResponse> {
    return apiRequest<ApiInstructorStatsResponse>(`/v1/instructor/rounds/${round_id}/stats`, { method: 'GET' });
  },

  autoAssign(round_id: RoundId, body: { customer_count: number; team_count: number }): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/assign`, { method: 'POST', body });
  },

  patchUser(
    round_id: RoundId,
    user_id: UserId,
    body: { status?: 'WAITING' | 'ASSIGNED'; role?: 'INSTRUCTOR' | 'JM' | 'QC' | 'CUSTOMER'; team_id?: TeamId | null },
  ): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'PATCH', body });
  },

  deleteUser(round_id: RoundId, user_id: UserId): Promise<ApiInstructorDeleteUserResponse> {
    return apiRequest<ApiInstructorDeleteUserResponse>(`/v1/instructor/rounds/${round_id}/users/${user_id}`, { method: 'DELETE' });
  },

  start(round_id: RoundId, body: { customer_budget: number; batch_size: number }): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/start`, { method: 'POST', body });
  },

  end(round_id: RoundId): Promise<void> {
    return apiRequest<void>(`/v1/instructor/rounds/${round_id}/end`, { method: 'POST' });
  },

  reset(): Promise<{ status?: string; message?: string }> {
    return apiRequest<{ status?: string; message?: string }>(`/v1/admin/reset`, { method: 'POST', body: {} });
  },
};


