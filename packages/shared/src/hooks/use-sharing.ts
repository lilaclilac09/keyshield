
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
import type { GrantSharePayload } from '../types';

export function useSharing() {
  const qc = useQueryClient();

  const sharesQuery = useQuery({
    queryKey: ['sharing'],
    queryFn: api.getShares,
    staleTime: 1000 * 30,
  });

  const grantMutation = useMutation({
    mutationFn: (payload: GrantSharePayload) => api.grantShare(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing'] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeShare(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing'] }),
  });

  return {
    incoming: sharesQuery.data?.incoming ?? [],
    outgoing: sharesQuery.data?.outgoing ?? [],
    isLoading: sharesQuery.isLoading,
    grant: grantMutation.mutateAsync,
    isGranting: grantMutation.isPending,
    revoke: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
    refetch: sharesQuery.refetch,
  };
}
