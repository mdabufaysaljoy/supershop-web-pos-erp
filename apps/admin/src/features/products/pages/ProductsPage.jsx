import { PERMISSIONS as P, PRODUCT } from '@supershop/shared';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '@/components/Pagination';
import { SearchForm } from '@/components/SearchForm';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCategories } from '@/features/categories/hooks';
import { parentOptions } from '@/features/categories/tree';
import { Select } from '@/features/settings/components/controls';
import { fmt } from '@/lib/format';
import { errorMessage } from '@/lib/i18n';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { products } from '../resource';
import { STATUS_TONE } from '../status';

const PAGE_SIZE = 25;

/** Product list: search (name, slug, SKU, barcode), filters and sort in the URL. */
export function ProductsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const { page, q, go } = useListParams(searchParams);
  const [params] = searchParams;
  const status = params.get('status') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const sort = params.get('sort') ?? '-updatedAt';
  const { data: categories = [] } = useCategories();
  const { data, isPending, isError, error } = products.useList({
    page,
    limit: PAGE_SIZE,
    sort,
    ...(q && { q }),
    ...(status && { status }),
    ...(categoryId && { categoryId }),
  });
  const items = data?.data ?? [];
  const pages = Math.max(1, Math.ceil((data?.meta?.total ?? 0) / PAGE_SIZE));
  const price = (p) =>
    p.priceMin === p.priceMax
      ? fmt.money(p.priceMin)
      : `${fmt.money(p.priceMin)} – ${fmt.money(p.priceMax)}`;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('products.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('products.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(P.CUSTOM_FIELD_MANAGE) && (
            <Button variant="outline" asChild>
              <Link to="/products/fields">
                <SlidersHorizontal className="size-4" aria-hidden />
                {t('products.customFields')}
              </Link>
            </Button>
          )}
          {can(P.PRODUCT_CREATE) && (
            <Button asChild>
              <Link to="/products/new">
                <Plus className="size-4" aria-hidden />
                {t('products.add')}
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SearchForm
          initial={q}
          label={t('products.search')}
          onSearch={(v) => go({ q: v, page: 1 })}
        />
        <div className="w-40">
          <Select
            aria-label={t('products.form.status')}
            value={status}
            onChange={(e) => go({ status: e.target.value, page: 1 })}
          >
            <option value="">{t('products.allStatuses')}</option>
            {PRODUCT.STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`products.status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Select
            aria-label={t('products.form.categories')}
            value={categoryId}
            onChange={(e) => go({ categoryId: e.target.value, page: 1 })}
          >
            <option value="">{t('products.allCategories')}</option>
            {parentOptions(categories).map((c) => (
              <option key={c.id} value={c.id}>{`${' '.repeat(c.depth * 3)}${c.label}`}</option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label={t('products.sort.label')}
            value={sort}
            onChange={(e) => go({ sort: e.target.value, page: 1 })}
          >
            {['-updatedAt', 'name', 'priceMin', '-priceMin', '-createdAt'].map((s) => (
              <option key={s} value={s}>
                {t(`products.sort.${s.replace('-', 'desc_')}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isError && <Alert variant="destructive">{errorMessage(t, error)}</Alert>}
      {isPending ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('products.empty')}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">
                <span className="sr-only">{t('products.gallery.main')}</span>
              </TableHead>
              <TableHead>{t('products.form.name')}</TableHead>
              <TableHead>{t('products.form.status')}</TableHead>
              <TableHead>{t('products.variants.price')}</TableHead>
              <TableHead>{t('products.variantsCount')}</TableHead>
              <TableHead>{t('products.updated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <TableRow
                key={p.id}
                className="cursor-pointer"
                onClick={() => navigate(`/products/${p.id}`)}
              >
                <TableCell>
                  {p.image ? (
                    <img src={p.image.thumbUrl} alt="" className="size-10 rounded object-cover" />
                  ) : (
                    <span className="block size-10 rounded bg-muted" aria-hidden />
                  )}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/products/${p.id}`}
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.name.en}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[p.status]}>{t(`products.status.${p.status}`)}</Badge>
                </TableCell>
                <TableCell>{price(p)}</TableCell>
                <TableCell>{p.variantCount}</TableCell>
                <TableCell className="text-muted-foreground">{fmt.dateTime(p.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pages={pages} onPage={(p) => go({ page: p })} />
    </div>
  );
}
