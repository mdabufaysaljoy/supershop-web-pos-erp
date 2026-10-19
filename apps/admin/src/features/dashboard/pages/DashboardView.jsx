import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/features/auth/store';
import { PageHeader } from '@/pages/PageHeader';
import { ChannelBreakdownCard } from '../components/ChannelBreakdownCard';
import { DashboardFilters } from '../components/DashboardFilters';
import { DashboardKpis } from '../components/DashboardKpis';
import { RecentOrdersCard } from '../components/RecentOrdersCard';
import { ReturnExchangeStatsCard } from '../components/ReturnExchangeStatsCard';
import { SalesOverTimeChart } from '../components/SalesOverTimeChart';
import { TopProductsCard } from '../components/TopProductsCard';
import { useDashboardOverview } from '../resource';

export function DashboardView() {
  const { t } = useTranslation();
  const name = useAuthStore((s) => s.profile?.name ?? '');

  const [range, setRange] = useState('7d');
  const [branchId, setBranchId] = useState(null);

  const { data, isPending, isError, error } = useDashboardOverview({ range, branchId });

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={t('pages.dashboard.welcome', { name })}
          description={t('pages.dashboard.intro')}
        />
      </div>

      <DashboardFilters
        range={range}
        onRangeChange={setRange}
        branchId={branchId}
        onBranchChange={setBranchId}
      />

      {isError && <Alert variant="destructive">{error?.message ?? t('common.loadFailed')}</Alert>}

      {isPending ? (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        data && (
          <div className="grid gap-6">
            <DashboardKpis kpis={data.kpis} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SalesOverTimeChart data={data.salesOverTime} />
              </div>
              <div>
                <ChannelBreakdownCard channels={data.channelBreakdown} />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <TopProductsCard products={data.topProducts} />
              </div>
              <div className="lg:col-span-2">
                <RecentOrdersCard orders={data.recentOrders} />
              </div>
            </div>

            <ReturnExchangeStatsCard returnsOverview={data.returnsOverview} />
          </div>
        )
      )}
    </div>
  );
}
