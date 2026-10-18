import { Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ExportDialog } from './ExportDialog';

/**
 * Universal export button for toolbar integration on any list page.
 */
export function ExportButton({
  resource,
  filters = {},
  defaultTitle = '',
  variant = 'outline',
  size = 'sm',
  className = '',
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Download className="size-4 me-1.5" aria-hidden />
        {t('export.button')}
      </Button>

      {open && (
        <ExportDialog
          open={open}
          onOpenChange={setOpen}
          resource={resource}
          filters={filters}
          defaultTitle={defaultTitle}
        />
      )}
    </>
  );
}
