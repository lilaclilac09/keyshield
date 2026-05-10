import { useQuery } from '@tanstack/react-query';
import * as api from '../api';
export function useBilling(limit = 50) {
    const billingQuery = useQuery({
        queryKey: ['billing'],
        queryFn: api.getBillingInfo,
        staleTime: 1000 * 60,
    });
    const usageQuery = useQuery({
        queryKey: ['billing', 'usage', limit],
        queryFn: () => api.getUsageHistory(limit),
        staleTime: 1000 * 30,
    });
    return {
        info: billingQuery.data ?? null,
        isLoading: billingQuery.isLoading,
        usage: usageQuery.data ?? [],
        isUsageLoading: usageQuery.isLoading,
    };
}
//# sourceMappingURL=use-billing.js.map