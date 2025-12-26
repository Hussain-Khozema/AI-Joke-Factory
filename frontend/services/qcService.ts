import { apiRequest } from './apiClient';
import type {
  ApiQcQueueCountResponse,
  ApiQcQueueNextResponse,
  ApiQcSubmitRatingsRequest,
  ApiQcSubmitRatingsResponse,
  BatchId,
  RoundId,
} from '../types';

export const qcService = {
  queueNext(round_id: RoundId): Promise<ApiQcQueueNextResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueNextResponse>(`/v1/qc/queue/next?round_id=${q}`, { method: 'GET' });
  },

  queueCount(round_id: RoundId): Promise<ApiQcQueueCountResponse> {
    const q = encodeURIComponent(String(round_id));
    return apiRequest<ApiQcQueueCountResponse>(`/v1/qc/queue/count?round_id=${q}`, { method: 'GET' });
  },

  submitRatings(batch_id: BatchId, body: ApiQcSubmitRatingsRequest): Promise<ApiQcSubmitRatingsResponse> {
    return apiRequest<ApiQcSubmitRatingsResponse>(`/v1/qc/batches/${batch_id}/ratings`, { method: 'POST', body });
  },
};


