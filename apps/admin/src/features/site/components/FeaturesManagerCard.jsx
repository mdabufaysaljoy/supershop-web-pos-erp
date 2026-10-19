import { FormField, PlainTextInput } from '@supershop/ui';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Headphones,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  Trash2,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { pages, usePage, usePageAction, useSaveDraft } from '@/features/pages/resource';

const DEFAULT_ITEMS = [
  {
    title: 'Delivery across the Kingdom',
    text: 'Dispatched within one working day.',
    icon: 'truck',
  },
  {
    title: 'Easy returns',
    text: 'Change your mind within 14 days.',
    icon: 'refresh',
  },
  {
    title: 'Here to help',
    text: 'Call or message us any day of the week.',
    icon: 'headset',
  },
];

const ICONS = [
  { id: 'truck', label: 'Delivery / Shipping', Icon: Truck },
  { id: 'refresh', label: 'Returns & Exchanges', Icon: RefreshCw },
  { id: 'headset', label: 'Customer Support', Icon: Headphones },
  { id: 'shield', label: 'Warranty & Genuine', Icon: ShieldCheck },
  { id: 'offers', label: 'Deals & Savings', Icon: Tag },
];

/**
 * Why Shop With Us / Selling Points Manager Card:
 * Allows store admins to add, edit, reorder, and delete the "Why shop with us" section
 * and its individual feature cards directly from the Appearance panel.
 * Automatically persists to the Home page draft and publishes to the storefront.
 */
export function FeaturesManagerCard({ disabled }) {
  const pageList = pages.useList({ limit: 50 });
  const homeMeta = pageList.data?.data?.find((p) => p.isHome || p.slug === 'home');
  const homeId = homeMeta?.id;

  const { data: page, isLoading } = usePage(homeId);
  const saveDraft = useSaveDraft(homeId);
  const pageAction = usePageAction(homeId);

  // Find features block in page draft
  const featuresBlock = page?.draft?.blocks?.find(
    (b) => b.type === 'features' || b.id === 'home-features',
  );
  const blockExists = Boolean(featuresBlock);

  // Local state for edits
  const [headingState, setHeadingState] = useState(null);
  const [itemsState, setItemsState] = useState(null);
  const [deletedState, setDeletedState] = useState(null);

  const isDeleted = deletedState ?? !blockExists;
  const heading = headingState ?? featuresBlock?.props?.heading ?? 'Why shop with us';
  const items = itemsState ?? featuresBlock?.props?.items ?? DEFAULT_ITEMS;

  const isSaving = saveDraft.isPending || pageAction.isPending;

  const handleAddItem = () => {
    if (items.length >= 12) {
      toast.error('Maximum 12 selling points allowed.');
      return;
    }
    setItemsState([
      ...items,
      {
        title: 'New Feature Benefit',
        text: 'Short description highlighting why customers trust your store.',
        icon: 'shield',
      },
    ]);
  };

  const handleDeleteItem = (index) => {
    if (items.length <= 1) {
      toast.error(
        'The section must contain at least one point, or you can delete the whole section.',
      );
      return;
    }
    setItemsState(items.filter((_, i) => i !== index));
  };

  const handleMove = (from, to) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[from], next[to]] = [next[to], next[from]];
    setItemsState(next);
  };

  const updateItemField = (index, field, value) => {
    setItemsState(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  };

  const handleSaveAndPublish = async () => {
    if (!homeId || !page) return;
    try {
      const cleanItems = items.map((it) => ({
        title: (it.title || '').trim(),
        text: (it.text || '').trim(),
        icon: it.icon || 'truck',
      }));

      const existingBlocks = page.draft?.blocks ?? [];
      let found = false;
      const updatedBlocks = existingBlocks.map((b) => {
        if (b.type === 'features' || b.id === 'home-features') {
          found = true;
          return {
            ...b,
            props: {
              ...b.props,
              heading: heading.trim(),
              items: cleanItems,
            },
          };
        }
        return b;
      });

      if (!found) {
        const newBlock = {
          id: 'home-features',
          type: 'features',
          props: {
            heading: heading.trim(),
            items: cleanItems,
          },
        };
        // Insert after categoryGrid or heroCarousel
        const insertIdx = existingBlocks.findIndex(
          (b) => b.type === 'categoryGrid' || b.id === 'home-categories',
        );
        if (insertIdx !== -1) {
          updatedBlocks.splice(insertIdx + 1, 0, newBlock);
        } else {
          updatedBlocks.push(newBlock);
        }
      }

      await saveDraft.mutateAsync({ draft: { blocks: updatedBlocks } });
      await pageAction.mutateAsync('publish');
      setDeletedState(false);
      toast.success('Section saved & published to storefront!');
    } catch {
      toast.error('Failed to save and publish section.');
    }
  };

  const handleDeleteEntireSection = async () => {
    if (!homeId || !page) return;
    try {
      const existingBlocks = page.draft?.blocks ?? [];
      const updatedBlocks = existingBlocks.filter(
        (b) => b.type !== 'features' && b.id !== 'home-features',
      );
      await saveDraft.mutateAsync({ draft: { blocks: updatedBlocks } });
      await pageAction.mutateAsync('publish');
      setDeletedState(true);
      toast.success('"Why shop with us" section removed from storefront!');
    } catch {
      toast.error('Failed to remove section.');
    }
  };

  const handleAddEntireSection = async () => {
    if (!homeId || !page) return;
    try {
      const existingBlocks = page.draft?.blocks ?? [];
      const newBlock = {
        id: 'home-features',
        type: 'features',
        props: {
          heading: 'Why shop with us',
          items: DEFAULT_ITEMS,
        },
      };
      const updatedBlocks = [...existingBlocks];
      const insertIdx = existingBlocks.findIndex(
        (b) => b.type === 'categoryGrid' || b.id === 'home-categories',
      );
      if (insertIdx !== -1) {
        updatedBlocks.splice(insertIdx + 1, 0, newBlock);
      } else {
        updatedBlocks.push(newBlock);
      }
      await saveDraft.mutateAsync({ draft: { blocks: updatedBlocks } });
      await pageAction.mutateAsync('publish');
      setDeletedState(false);
      setHeadingState('Why shop with us');
      setItemsState(DEFAULT_ITEMS);
      toast.success('"Why shop with us" section added & published to storefront!');
    } catch {
      toast.error('Failed to add section.');
    }
  };

  if (isLoading || pageList.isPending) {
    return <Skeleton className="h-96" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <CardTitle>Why Shop With Us (Value Proposition)</CardTitle>
          <CardDescription>
            Manage the trust cards shown on the home page — fast delivery, easy returns, warranty,
            and customer support.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {homeId && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/pages/${homeId}/builder`}>
                <ExternalLink className="mr-1.5 size-3.5" />
                Open Page Builder
              </Link>
            </Button>
          )}
          {!isDeleted && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isSaving}
                onClick={handleDeleteEntireSection}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete Section
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={disabled || isSaving}
                onClick={handleSaveAndPublish}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {isSaving ? 'Publishing...' : 'Save & Publish Section'}
              </Button>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 pt-6">
        {isDeleted ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center bg-muted/20">
            <div className="mb-3 flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="text-base font-semibold">Section Currently Removed</h3>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              {
                'The "Why shop with us" section is not displayed on your storefront home page. You can re-add it anytime with one click.'
              }
            </p>
            <Button
              type="button"
              disabled={disabled || isSaving}
              onClick={handleAddEntireSection}
              className="mt-5"
            >
              <Plus className="mr-1.5 size-4" />
              {'Add "Why Shop With Us" Section'}
            </Button>
          </div>
        ) : (
          <>
            {/* Section Heading Input */}
            <div className="max-w-md">
              <FormField
                label="Section Heading"
                description="Headline displayed above the feature cards on the storefront"
              >
                <PlainTextInput
                  value={heading}
                  disabled={disabled || isSaving}
                  placeholder="Why shop with us"
                  onChange={(e) => setHeadingState(e.target.value)}
                />
              </FormField>
            </div>

            {/* Feature Cards List */}
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight">
                  Feature Cards ({items.length}/12)
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || isSaving || items.length >= 12}
                  onClick={handleAddItem}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Add Point
                </Button>
              </div>

              <div className="grid gap-4">
                {items.map((item, index) => {
                  const currentIconObj = ICONS.find((ic) => ic.id === item.icon) || ICONS[0];
                  const IconComp = currentIconObj.Icon;

                  return (
                    <fieldset
                      key={index}
                      className="relative grid gap-4 rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {index + 1}
                          </span>
                          <span className="font-semibold text-sm">
                            {item.title || `Point #${index + 1}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Move point up"
                            disabled={disabled || isSaving || index === 0}
                            onClick={() => handleMove(index, index - 1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Move point down"
                            disabled={disabled || isSaving || index === items.length - 1}
                            onClick={() => handleMove(index, index + 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Delete point"
                            disabled={disabled || isSaving || items.length <= 1}
                            onClick={() => handleDeleteItem(index)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-12 items-start">
                        {/* Icon Picker */}
                        <div className="sm:col-span-3">
                          <FormField label="Icon" description="Card badge illustration">
                            <div className="flex items-center gap-2">
                              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                                <IconComp className="size-5" />
                              </div>
                              <select
                                value={item.icon || 'truck'}
                                disabled={disabled || isSaving}
                                onChange={(e) => updateItemField(index, 'icon', e.target.value)}
                                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-xs focus:border-primary focus:outline-none"
                              >
                                {ICONS.map((ic) => (
                                  <option key={ic.id} value={ic.id}>
                                    {ic.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </FormField>
                        </div>

                        {/* Title */}
                        <div className="sm:col-span-4">
                          <FormField label="Card Title" description="Main bold point heading">
                            <PlainTextInput
                              value={item.title ?? ''}
                              disabled={disabled || isSaving}
                              placeholder="e.g. Delivery across the Kingdom"
                              onChange={(e) => updateItemField(index, 'title', e.target.value)}
                            />
                          </FormField>
                        </div>

                        {/* Description */}
                        <div className="sm:col-span-5">
                          <FormField label="Description" description="Supporting explanatory text">
                            <PlainTextInput
                              value={item.text ?? ''}
                              disabled={disabled || isSaving}
                              placeholder="e.g. Dispatched within one working day."
                              onChange={(e) => updateItemField(index, 'text', e.target.value)}
                            />
                          </FormField>
                        </div>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </div>

            {/* Live Visual Preview */}
            <div className="rounded-xl border border-border/80 bg-muted/20 p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
                Storefront Preview
              </h4>
              <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight text-foreground">{heading}</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {items.map((it, idx) => {
                    const iconObj = ICONS.find((ic) => ic.id === it.icon) || ICONS[0];
                    const PreviewIcon = iconObj.Icon;
                    return (
                      <div
                        key={idx}
                        className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-4 shadow-2xs"
                      >
                        <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <PreviewIcon className="size-4.5" />
                        </div>
                        <span className="text-sm font-bold text-foreground">
                          {it.title || 'Point Title'}
                        </span>
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          {it.text || 'Point description'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
