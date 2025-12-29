import { apiRequest } from './apiClient';
import type {
  ApiCreateBatchRequest,
  ApiCreateBatchResponse,
  ApiTeamBatchesResponse,
  ApiTeamSummaryResponse,
  RoundId,
  TeamId,
} from '../types';

export const jmService = {
  teamSummary(round_id: RoundId, team_id: TeamId): Promise<ApiTeamSummaryResponse> {
    return apiRequest<ApiTeamSummaryResponse>(`/v1/rounds/${round_id}/teams/${team_id}/summary`, { method: 'GET' });
  },

  createBatch(round_id: RoundId, body: ApiCreateBatchRequest): Promise<ApiCreateBatchResponse> {
    return apiRequest<ApiCreateBatchResponse>(`/v1/rounds/${round_id}/batches`, { method: 'POST', body });
  },

  listTeamBatches(round_id: RoundId, team_id: TeamId): Promise<ApiTeamBatchesResponse> {
    return apiRequest<ApiTeamBatchesResponse>(`/v1/rounds/${round_id}/teams/${team_id}/batches`, { method: 'GET' });
  },
};


