
import { useQuery } from '@tanstack/react-query';
import * as api from '../api';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
    retry: 3,
  });
}
