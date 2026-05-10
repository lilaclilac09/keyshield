
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
import type { RegisterAgentPayload } from '../types';

export function useAgents() {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: ['agents', 'list'],
    queryFn: api.getAgentsList,
    staleTime: 1000 * 30,
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterAgentPayload) => api.registerAgent(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeAgent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  });

  const walletsQuery = useQuery({
    queryKey: ['agents', 'wallets'],
    queryFn: api.getAgentWallets,
    staleTime: 1000 * 60,
  });

  return {
    agents: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    revoke: revokeMutation.mutateAsync,
    isRevoking: revokeMutation.isPending,
    wallets: walletsQuery.data ?? [],
    refetch: listQuery.refetch,
  };
}
