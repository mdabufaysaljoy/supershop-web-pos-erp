import sharp from 'sharp';
import { uploadMedia } from '../modules/media/index.js';

/**
 * Fifty more products for a shop that is being looked at rather than sold from: enough rows for
 * the lists, the search, the POS grid and the storefront to be worth judging.
 *
 * Everything here is DERIVED from the name — slug, SKU, barcode and picture — so the seed is
 * idempotent: run it again and it finds what it made last time instead of making it twice.
 */

/** `[name, categorySlug, brandSlug, price, cost]` — prices in halalas. */
const CATALOGUE = [
  ['Apple iPad Air 13-inch M2 256GB', 'smartphones-tablets', 'apple', 329900, 268000],
  ['Apple iPhone 16 128GB Ultramarine', 'smartphones-tablets', 'apple', 379900, 310000],
  ['Samsung Galaxy Z Flip6 256GB Mint', 'smartphones-tablets', 'samsung', 429900, 352000],
  ['Samsung Galaxy Tab S10+ 256GB', 'smartphones-tablets', 'samsung', 379900, 305000],
  ['Xiaomi Redmi Note 14 Pro 256GB', 'smartphones-tablets', 'xiaomi', 119900, 88000],
  ['Xiaomi Pad 7 Pro 12.1-inch', 'smartphones-tablets', 'xiaomi', 159900, 121000],
  ['Apple MagSafe Charger 25W', 'mobile-accessories', 'apple', 18900, 12800],
  ['Samsung Silicone Case Galaxy S24', 'mobile-accessories', 'samsung', 9900, 5200],
  ['Anker Tempered Glass Screen Guard', 'mobile-accessories', 'anker', 4900, 1900],
  ['Xiaomi 67W Travel Charger Combo', 'mobile-accessories', 'xiaomi', 12900, 7800],
  ['Sony WF-1000XM5 Earbuds', 'headphones-earbuds', 'sony', 109900, 82000],
  ['Sony ULT Wear Bass Headphones', 'headphones-earbuds', 'sony', 79900, 58000],
  ['Apple AirPods Max USB-C Midnight', 'headphones-earbuds', 'apple', 219900, 178000],
  ['Samsung Galaxy Buds3 Pro', 'headphones-earbuds', 'samsung', 94900, 70000],
  ['Anker Soundcore Space One Pro', 'headphones-earbuds', 'anker', 59900, 38000],
  ['Xiaomi Buds 5 Pro Wireless', 'headphones-earbuds', 'xiaomi', 54900, 36000],
  ['Apple Watch Series 10 46mm GPS', 'audio-wearables', 'apple', 189900, 152000],
  ['Samsung Galaxy Watch7 44mm', 'audio-wearables', 'samsung', 139900, 108000],
  ['Xiaomi Smart Band 9 Pro', 'audio-wearables', 'xiaomi', 24900, 15000],
  ['Sony SRS-XE300 Portable Speaker', 'audio-wearables', 'sony', 64900, 46000],
  ['Apple MacBook Air 15-inch M3 512GB', 'laptops-ultrabooks', 'apple', 699900, 580000],
  ['Apple MacBook Pro 14-inch M4 Pro', 'laptops-ultrabooks', 'apple', 1099900, 920000],
  ['Samsung Galaxy Book4 Pro 16-inch', 'laptops-ultrabooks', 'samsung', 759900, 620000],
  ['Xiaomi RedmiBook Pro 15 Ultra 7', 'laptops-ultrabooks', 'xiaomi', 349900, 275000],
  ['Logitech MX Master 3S Graphite', 'keyboards-mice', 'logitech', 44900, 31000],
  ['Logitech MX Keys S Wireless Keyboard', 'keyboards-mice', 'logitech', 49900, 34000],
  ['Logitech G Pro X Superlight 2', 'keyboards-mice', 'logitech', 64900, 47000],
  ['Logitech Signature Slim Combo MK955', 'keyboards-mice', 'logitech', 39900, 26000],
  ['Apple Magic Keyboard with Touch ID', 'keyboards-mice', 'apple', 74900, 58000],
  ['Logitech Brio 505 1080p Webcam', 'computing-tech', 'logitech', 54900, 38000],
  ['Logitech Litra Beam Streaming Light', 'computing-tech', 'logitech', 44900, 30000],
  ['Samsung T9 Portable SSD 2TB', 'computing-tech', 'samsung', 99900, 74000],
  ['Samsung ViewFinity S8 27-inch 4K', 'computing-tech', 'samsung', 169900, 132000],
  ['Zara Relaxed Linen Blend Shirt', 'mens-streetwear', 'zara', 16900, 8200],
  ['Zara Wide Leg Cargo Trousers', 'mens-streetwear', 'zara', 22900, 11500],
  ['Zara Heavyweight Crew Sweatshirt', 'mens-streetwear', 'zara', 19900, 9800],
  ['Zara Textured Knit Polo Shirt', 'mens-streetwear', 'zara', 14900, 7200],
  ['Zara Lightweight Bomber Jacket', 'mens-streetwear', 'zara', 32900, 17500],
  ['Nike Air Force 1 07 White', 'lifestyle-sneakers', 'nike', 42900, 28000],
  ['Nike Dunk Low Retro Panda', 'lifestyle-sneakers', 'nike', 46900, 31000],
  ['Nike Pegasus 41 Road Running', 'lifestyle-sneakers', 'nike', 54900, 36000],
  ['Nike Tech Fleece Joggers', 'fashion-apparel', 'nike', 38900, 24000],
  ['Nike Dri-FIT Training Tee', 'fashion-apparel', 'nike', 12900, 6400],
  ['Xiaomi Smart Humidifier 2 Lite', 'smart-appliances', 'xiaomi', 29900, 18000],
  ['Xiaomi Robot Vacuum X20 Max', 'smart-appliances', 'xiaomi', 189900, 143000],
  ['Xiaomi Smart Kettle Pro 1.7L', 'smart-appliances', 'xiaomi', 24900, 15000],
  ['Samsung SmartThings Hub Station', 'smart-home', 'samsung', 44900, 30000],
  ['Anker 737 Power Bank 24000mAh', 'powerbanks-cables', 'anker', 54900, 37000],
  ['Anker Nano 3-Port 65W Charger', 'powerbanks-cables', 'anker', 29900, 18000],
  ['Anker PowerLine III USB-C Cable 2m', 'powerbanks-cables', 'anker', 7900, 3200],
];

/** A colour of its own per brand, so a shelf of placeholders is still readable at a glance. */
const BRAND_COLOUR = {
  apple: ['#1f2937', '#6b7280'],
  samsung: ['#1d4ed8', '#60a5fa'],
  sony: ['#0f172a', '#475569'],
  anker: ['#0369a1', '#38bdf8'],
  logitech: ['#047857', '#34d399'],
  nike: ['#b91c1c', '#f87171'],
  zara: ['#44403c', '#a8a29e'],
  xiaomi: ['#ea580c', '#fb923c'],
};

const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** SKU from the name: three letters of the brand and the first letters of the model. */
const skuFor = (name, brandSlug, i) =>
  `${brandSlug.slice(0, 3)}-${name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .slice(1, 4)
    .map((w) => w.slice(0, 3))
    .join('')}-${String(i).padStart(3, '0')}`.toUpperCase();

/** A real EAN-13: twelve digits and the check digit they imply, so a scanner is happy with it. */
function ean13(base12) {
  const digits = [...base12].map(Number);
  const sum = digits.reduce((n, d, i) => n + d * (i % 2 === 0 ? 1 : 3), 0);
  return `${base12}${(10 - (sum % 10)) % 10}`;
}

/**
 * A picture for a product that has none: its initials on the brand's own colour. Deterministic,
 * so the same product makes the same bytes — the media library dedupes on their hash, and
 * seeding twice does not fill it with copies.
 */
async function placeholderImage(name, brandSlug, code) {
  const [from, to] = BRAND_COLOUR[brandSlug] ?? ['#334155', '#94a3b8'];
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <text x="600" y="640" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="360" font-weight="700" fill="#ffffff" fill-opacity="0.92">${initials}</text>
  <text x="600" y="840" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="64" font-weight="600" fill="#ffffff" fill-opacity="0.75">${brandSlug.toUpperCase()}</text>
  <text x="600" y="930" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="38" font-weight="500" fill="#ffffff" fill-opacity="0.6">${code}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The fifty rows themselves: everything but the picture, which costs an encode and a write and is
 * only worth making for a product that is actually going to be created.
 */
export const DUMMY_PRODUCTS = CATALOGUE.map(([name, categorySlug, brandSlug, price, cost], i) => ({
  name,
  slug: slugify(name),
  shortDescription: `${name} — in stock at the shop.`,
  description: `${name}. Seeded demonstration product for trying the catalogue, the till and the storefront.`,
  brandSlug,
  categorySlugs: [categorySlug],
  price,
  compareAtPrice: Math.round((price * 1.15) / 100) * 100,
  cost,
  sku: skuFor(name, brandSlug, i + 1),
  barcode: ean13(`628100200${String(i + 1).padStart(3, '0')}`),
}));

/**
 * Makes and stores this product's picture, and returns its media id — or null, because a shop
 * without pictures still sells, and a placeholder is not worth failing a seed over.
 * @param {{ name: string, slug: string, brandSlug: string, sku: string }} product
 */
export async function makeProductImage(product) {
  try {
    const buffer = await placeholderImage(product.name, product.brandSlug, product.sku);
    const { media } = await uploadMedia(
      { staffId: null },
      { buffer, originalName: `${product.slug}.png` },
      { alt: product.name },
    );
    return media.id;
  } catch {
    return null;
  }
}
