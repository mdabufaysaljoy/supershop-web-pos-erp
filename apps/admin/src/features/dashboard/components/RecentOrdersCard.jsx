import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ORDER_STATUS_TONE } from '@/features/orders/status';
import { fmt } from '@/lib/format';

export function RecentOrdersCard({ orders = [] }) {
  const { t } = useTranslation();

  return (
    <Card className="col-span-full shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          {t('dashboard.recentOrders.title')}
        </CardTitle>
        <Link to="/orders" className="text-xs font-medium text-primary hover:underline">
          {t('dashboard.recentOrders.viewAll')} →
        </Link>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('dashboard.recentOrders.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.recentOrders.order')}</TableHead>
                <TableHead>{t('dashboard.recentOrders.channel')}</TableHead>
                <TableHead>{t('dashboard.recentOrders.status')}</TableHead>
                <TableHead>{t('dashboard.recentOrders.customer')}</TableHead>
                <TableHead>{t('dashboard.recentOrders.date')}</TableHead>
                <TableHead className="text-right">{t('dashboard.recentOrders.total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">
                    <Link to={`/orders/${o.id}`} className="text-primary hover:underline">
                      {o.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize text-xs">
                      {o.channel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={ORDER_STATUS_TONE[o.status]} className="capitalize text-xs">
                      {o.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.customerName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {o.placedAt ? fmt.dateTime(new Date(o.placedAt)) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt.money(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
