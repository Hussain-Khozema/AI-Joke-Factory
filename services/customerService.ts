import { apiRequest } from './apiClient';
import type {
  ApiCustomerBudgetResponse,
  ApiMarketBuyReturnResponse,
  ApiMarketResponse,
  JokeId,
  RoundId,
} from '../types';

export const customerService = {
  market(round_id: RoundId): Promise<ApiMarketResponse> {
    return apiRequest<ApiMarketResponse>(`/v1/rounds/${round_id}/market`, { method: 'GET' });
  },

  budget(round_id: RoundId): Promise<ApiCustomerBudgetResponse> {
    return apiRequest<ApiCustomerBudgetResponse>(`/v1/rounds/${round_id}/customers/budget`, { method: 'GET' });
  },

  buy(round_id: RoundId, joke_id: JokeId): Promise<ApiMarketBuyReturnResponse> {
    return apiRequest<ApiMarketBuyReturnResponse>(`/v1/rounds/${round_id}/market/${joke_id}/buy`, { method: 'POST' });
  },

  return(round_id: RoundId, joke_id: JokeId): Promise<ApiMarketBuyReturnResponse> {
    return apiRequest<ApiMarketBuyReturnResponse>(`/v1/rounds/${round_id}/market/${joke_id}/return`, { method: 'POST' });
  },
};


