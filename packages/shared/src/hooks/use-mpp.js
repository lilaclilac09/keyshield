import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
export function useMpp(streamId) {
    const qc = useQueryClient();
    const streamsQuery = useQuery({
        queryKey: ['mpp', 'streams'],
        queryFn: api.getMppStreams,
        staleTime: 1000 * 30,
    });
    const openMutation = useMutation({
        mutationFn: ({ agentId, amountSol }) => api.openMppStream(agentId, amountSol),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['mpp'] }),
    });
    const settleMutation = useMutation({
        mutationFn: (sid) => api.settleMppStream(sid),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['mpp'] }),
    });
    const closeMutation = useMutation({
        mutationFn: (sid) => api.closeMppStream(sid),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['mpp'] }),
    });
    const recordTxMutation = useMutation({
        mutationFn: ({ streamId, txSig }) => api.recordMppTx(streamId, txSig),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['mpp'] }),
    });
    const usageQuery = useQuery({
        queryKey: ['mpp', 'usage', streamId],
        queryFn: () => (streamId ? api.getMppUsage(streamId) : Promise.resolve([])),
        enabled: !!streamId,
        staleTime: 1000 * 30,
    });
    return {
        streams: streamsQuery.data ?? [],
        isLoading: streamsQuery.isLoading,
        open: openMutation.mutateAsync,
        isOpening: openMutation.isPending,
        settle: settleMutation.mutateAsync,
        close: closeMutation.mutateAsync,
        recordTx: recordTxMutation.mutateAsync,
        usage: usageQuery.data ?? [],
        refetch: streamsQuery.refetch,
    };
}
//# sourceMappingURL=use-mpp.js.map