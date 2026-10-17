/**
 * @supershop/ui — shared React components for admin and storefront.
 * Field components (CLAUDE.md §5.3) + form kit. Text props are already-translated strings.
 */
export { FormField, useFieldControlProps } from './form/FormField.jsx';
export { SanitizedInput } from './fields/SanitizedInput.jsx';
export {
  AddressInput,
  CodeInput,
  EmailInput,
  IntegerInput,
  MoneyInput,
  NameInput,
  PhoneInput,
  PlainTextArea,
  PlainTextInput,
  SlugInput,
} from './fields/fields.jsx';
export { QtyInput } from './fields/QtyInput.jsx';
export { PasswordInput } from './fields/PasswordInput.jsx';
export { applySanitizer, blockInvalidInsertion } from './fields/sanitizeInput.js';
export { inputClass } from './fields/styles.js';
export { Barcode } from './scanner/Barcode.jsx';
export { QrCode } from './scanner/QrCode.jsx';
export { BarcodeInput } from './scanner/BarcodeInput.jsx';
export { charFromKeyEvent } from './scanner/keys.js';
export { createWedgeDetector } from './scanner/wedge.js';
export { useBarcodeScanner } from './scanner/useBarcodeScanner.js';
export { BlockRenderer } from './blocks/BlockRenderer.jsx';
export { hrefIn, money, number } from './blocks/context.js';
export { PagePreview } from './blocks/PagePreview.jsx';
export {
  ALL_BLOCK_COMPONENTS,
  ButtonLinkBlock,
  CORE_BLOCK_COMPONENTS,
  HeadingBlock,
  ImageBlock,
  RichTextBlock,
  SpacerBlock,
} from './blocks/coreBlocks.jsx';
export {
  BannerBlock,
  BrandStripBlock,
  CategoryGridBlock,
  ColumnsBlock,
  CustomHtmlBlock,
  FaqBlock,
  FeaturesBlock,
  NewsletterBlock,
  ProductRailBlock,
  SHOP_BLOCK_COMPONENTS,
  TestimonialsBlock,
  VideoBlock,
} from './blocks/shopBlocks.jsx';
export { CountdownBlock } from './blocks/CountdownBlock.jsx';
export { HeroCarouselBlock } from './blocks/HeroCarouselBlock.jsx';
