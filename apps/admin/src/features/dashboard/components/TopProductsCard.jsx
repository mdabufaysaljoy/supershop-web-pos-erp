import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fmt } from '@/lib/format';

export function TopProductsCard({ products = [] }) {
  const { t } = useTranslation();

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          {t('dashboard.topProducts.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            {t('dashboard.topProducts.empty')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('dashboard.topProducts.product')}</TableHead>
                <TableHead className="text-right">{t('dashboard.topProducts.qty')}</TableHead>
                <TableHead className="text-right">{t('dashboard.topProducts.revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.productId || p.sku}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="h-8 w-8 rounded-md object-cover border"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium line-clamp-1">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt.number(p.qty ?? 0)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmt.money(p.revenue ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
