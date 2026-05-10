import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../api';
export function useVault() {
    const qc = useQueryClient();
    const listQuery = useQuery({
        queryKey: ['vault', 'list'],
        queryFn: api.getVaultList,
        staleTime: 1000 * 30,
    });
    const storeMutation = useMutation({
        mutationFn: (payload) => api.postStoreKey(payload),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['vault'] }),
    });
    const decryptMutation = useMutation({
        mutationFn: (id) => api.getDecryptKey(id),
    });
    const deleteMutation = useMutation({
        mutationFn: (id) => api.deleteVaultKey(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['vault'] }),
    });
    return {
        items: listQuery.data ?? [],
        isLoading: listQuery.isLoading,
        error: listQuery.error,
        store: storeMutation.mutateAsync,
        isStoring: storeMutation.isPending,
        decrypt: decryptMutation.mutateAsync,
        isDecrypting: decryptMutation.isPending,
        deleteKey: deleteMutation.mutateAsync,
        isDeleting: deleteMutation.isPending,
        refetch: listQuery.refetch,
    };
}
//# sourceMappingURL=use-vault.js.map