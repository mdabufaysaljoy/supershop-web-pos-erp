import { FormField, IntegerInput, PlainTextInput } from '@supershop/ui';
import { ArrowDown, ArrowUp, ExternalLink, ImageIcon, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaPickerDialog } from '@/features/media/components/MediaPickerDialog';
import { useMediaList } from '@/features/media/hooks';
import { pages, usePage, usePageAction, useSaveDraft } from '@/features/pages/resource';

const DEFAULT_SLIDE = {
  mediaId: null,
  heading: 'New Promotion Headline',
  text: 'Exclusive seasonal discounts and Kingdom-wide express delivery.',
  buttonLabel: 'Explore Collection',
  href: '/search',
};

/**
 * Hero Slider Management Card:
 * Allows store admins to add, delete, reorder, and edit all storefront hero slides,
 * including images, titles, supporting copy, CTA buttons, and autoplay timings.
 * Directly saves and publishes to the Home page CMS blocks.
 */
export function HeroSliderCard({ disabled }) {
  const { t } = useTranslation();
  const pageList = pages.useList({ limit: 50 });
  const homeMeta = pageList.data?.data?.find((p) => p.isHome || p.slug === 'home');
  const homeId = homeMeta?.id;

  const { data: page, isLoading } = usePage(homeId);
  const saveDraft = useSaveDraft(homeId);
  const pageAction = usePageAction(homeId);

  // Find heroCarousel block in page draft
  const heroBlock = page?.draft?.blocks?.find(
    (b) => b.type === 'heroCarousel' || b.id === 'home-hero',
  );

  // Local state for edits
  const [slidesState, setSlidesState] = useState(null);
  const [autoplayState, setAutoplayState] = useState(null);
  const [pickingIndex, setPickingIndex] = useState(null);

  // Media library items for live thumbnail preview
  const mediaList = useMediaList({ limit: 100 });
  const mediaMap = new Map((mediaList.data?.data ?? []).map((m) => [m.id, m]));

  // Derived effective values
  const slides = slidesState ?? heroBlock?.props?.slides ?? [DEFAULT_SLIDE];
  const autoplaySeconds = autoplayState ?? heroBlock?.props?.autoplaySeconds ?? 5;

  const isSaving = saveDraft.isPending || pageAction.isPending;

  const handleAddSlide = () => {
    setSlidesState([...slides, { ...DEFAULT_SLIDE }]);
  };

  const handleDeleteSlide = (index) => {
    if (slides.length <= 1) {
      toast.error('The slider must contain at least one slide.');
      return;
    }
    setSlidesState(slides.filter((_, i) => i !== index));
  };

  const handleMove = (from, to) => {
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    [next[from], next[to]] = [next[to], next[from]];
    setSlidesState(next);
  };

  const updateSlideField = (index, field, value) => {
    setSlidesState(slides.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSaveAndPublish = async () => {
    if (!homeId || !page) return;
    try {
      const cleanSlides = slides.map((s) => ({
        mediaId: s.mediaId || null,
        heading: s.heading || '',
        text: s.text || '',
        buttonLabel: s.buttonLabel || '',
        href: s.href || '/search',
      }));

      const existingBlocks = page.draft?.blocks ?? [];
      let found = false;
      const updatedBlocks = existingBlocks.map((b) => {
        if (b.type === 'heroCarousel' || b.id === 'home-hero') {
          found = true;
          return {
            ...b,
            props: {
              ...b.props,
              slides: cleanSlides,
              autoplaySeconds: Number(autoplaySeconds) || 0,
            },
          };
        }
        return b;
      });

      if (!found) {
        updatedBlocks.unshift({
          id: 'home-hero',
          type: 'heroCarousel',
          props: {
            slides: cleanSlides,
            autoplaySeconds: Number(autoplaySeconds) || 0,
          },
        });
      }

      await saveDraft.mutateAsync({ draft: { blocks: updatedBlocks } });
      await pageAction.mutateAsync('publish');
      toast.success('Hero slider saved & published to storefront!');
    } catch {
      toast.error('Failed to save and publish hero slider.');
    }
  };

  if (isLoading || pageList.isPending) {
    return <Skeleton className="h-96" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            <CardTitle>Hero Slider Management</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Manage your storefront flagship hero carousel slides, headlines, images,
            call-to-actions, and autoplay speeds.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {homeId && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/pages/${homeId}`}>
                <ExternalLink className="me-1.5 size-4" />
                Open Page Builder
              </Link>
            </Button>
          )}
          <Button
            type="button"
            disabled={disabled || isSaving}
            onClick={handleSaveAndPublish}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          >
            {isSaving ? 'Publishing...' : 'Save & Publish Slider'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 pt-6">
        {/* Autoplay setting */}
        <div className="max-w-xs">
          <FormField
            label="Slide Rotation Interval (Seconds)"
            description="Time before auto-sliding smoothly to the next slide. Set to 0 to disable auto-slide."
          >
            <IntegerInput
              value={autoplaySeconds}
              disabled={disabled || isSaving}
              onChange={(e) => setAutoplayState(Math.max(0, parseInt(e.target.value, 10) || 0))}
              min={0}
              max={30}
            />
          </FormField>
        </div>

        {/* Slides list */}
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">
              Active Slides ({slides.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isSaving || slides.length >= 10}
              onClick={handleAddSlide}
            >
              <Plus className="me-1.5 size-4" />
              Add New Slide
            </Button>
          </div>

          <div className="grid gap-5">
            {slides.map((slide, index) => (
              <fieldset
                key={index}
                className="relative grid gap-4 rounded-2xl border border-border/80 bg-card/60 p-5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="font-semibold text-sm">
                      {slide.heading || `Slide #${index + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move slide up"
                      disabled={disabled || isSaving || index === 0}
                      onClick={() => handleMove(index, index - 1)}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Move slide down"
                      disabled={disabled || isSaving || index === slides.length - 1}
                      onClick={() => handleMove(index, index + 1)}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete slide"
                      disabled={disabled || isSaving || slides.length <= 1}
                      onClick={() => handleDeleteSlide(index)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Headline */}
                  <FormField
                    label="Headline (Title)"
                    description="Main bold display title for this slide"
                  >
                    <PlainTextInput
                      value={slide.heading ?? ''}
                      disabled={disabled || isSaving}
                      placeholder="e.g. Flagship Smartphones & 4K Living"
                      onChange={(e) => updateSlideField(index, 'heading', e.target.value)}
                    />
                  </FormField>

                  {/* Supporting text */}
                  <FormField
                    label="Supporting Text"
                    description="Descriptive tagline or promotional line"
                  >
                    <PlainTextInput
                      value={slide.text ?? ''}
                      disabled={disabled || isSaving}
                      placeholder="e.g. Up to 40% off top electronics with Saudi warranty"
                      onChange={(e) => updateSlideField(index, 'text', e.target.value)}
                    />
                  </FormField>

                  {/* CTA Label */}
                  <FormField label="Button Label (CTA)" description="Call-to-action button text">
                    <PlainTextInput
                      value={slide.buttonLabel ?? ''}
                      disabled={disabled || isSaving}
                      placeholder="e.g. Shop Electronics"
                      onChange={(e) => updateSlideField(index, 'buttonLabel', e.target.value)}
                    />
                  </FormField>

                  {/* CTA Href */}
                  <FormField
                    label="Button Destination Link"
                    description="Internal path or external link"
                  >
                    <PlainTextInput
                      value={slide.href ?? ''}
                      disabled={disabled || isSaving}
                      placeholder="e.g. /search?q=electronics"
                      onChange={(e) => updateSlideField(index, 'href', e.target.value)}
                    />
                  </FormField>
                </div>

                {/* Slide Image */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/80 p-3 bg-muted/20">
                  <div className="flex items-center gap-3">
                    {mediaMap.get(slide.mediaId) ? (
                      <img
                        src={
                          mediaMap.get(slide.mediaId)?.variants?.thumb?.url ||
                          mediaMap.get(slide.mediaId)?.url
                        }
                        alt=""
                        className="size-14 rounded-lg object-cover border border-border shadow-xs"
                      />
                    ) : (
                      <div className="grid size-14 place-items-center rounded-lg bg-muted text-muted-foreground border border-border">
                        <ImageIcon className="size-6" />
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-semibold">
                        {slide.mediaId
                          ? mediaMap.get(slide.mediaId)?.name || 'Custom Image Attached'
                          : 'Ambient Gradient Theme'}
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        {slide.mediaId
                          ? `${mediaMap.get(slide.mediaId)?.width ? `${mediaMap.get(slide.mediaId)?.width}×${mediaMap.get(slide.mediaId)?.height}px · ` : ''}ID: ${slide.mediaId}`
                          : 'No image uploaded (uses atmospheric dark gradient)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled || isSaving}
                      onClick={() => setPickingIndex(index)}
                    >
                      {slide.mediaId ? 'Change Image' : 'Choose Image'}
                    </Button>
                    {slide.mediaId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled || isSaving}
                        onClick={() => updateSlideField(index, 'mediaId', null)}
                      >
                        {t('common.remove')}
                      </Button>
                    )}
                  </div>
                </div>
              </fieldset>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed py-5"
            disabled={disabled || isSaving || slides.length >= 10}
            onClick={handleAddSlide}
          >
            <Plus className="me-2 size-4" />
            Add Another Slide
          </Button>
        </div>
      </CardContent>

      {pickingIndex !== null && (
        <MediaPickerDialog
          open
          onOpenChange={() => setPickingIndex(null)}
          onSelect={(media) => {
            updateSlideField(pickingIndex, 'mediaId', media.id);
            setPickingIndex(null);
          }}
        />
      )}
    </Card>
  );
}
