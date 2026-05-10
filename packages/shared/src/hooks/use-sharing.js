import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
export function useSharing() {
    const qc = useQueryClient();
    const sharesQuery = useQuery({
        queryKey: ['sharing'],
        queryFn: api.getShares,
        staleTime: 1000 * 30,
    });
    const grantMutation = useMutation({
        mutationFn: (payload) => api.grantShare(payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sharing'] }),
    });
    const revokeMutation = useMutation({
        mutationFn: (id) => api.revokeShare(id),
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
    };
}
//# sourceMappingURL=use-sharing.js.map