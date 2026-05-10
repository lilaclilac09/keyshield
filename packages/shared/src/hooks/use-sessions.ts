
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';

export function useSessions() {
  const qc = useQueryClient();

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 15,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return {
    sessions: sessionsQuery.data ?? [],
    isLoading: sessionsQuery.isLoading,
    revoke: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
  };
}
