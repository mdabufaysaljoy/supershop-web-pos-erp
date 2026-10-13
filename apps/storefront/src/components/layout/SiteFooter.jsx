/** Site footer. Footer menus/content become admin-editable in P5.4. */
export function SiteFooter({ storeName, pricesIncludeVat, t, fmt }) {
  return (
    <footer className="mt-16 border-t">
      <div className="mx-auto grid max-w-7xl gap-1 px-4 py-8 text-sm text-muted-foreground">
        <p>{t('footer.rights', { year: fmt.plain(new Date().getFullYear()), store: storeName })}</p>
        {pricesIncludeVat && <p>{t('footer.vatIncluded')}</p>}
      </div>
    </footer>
  );
}
