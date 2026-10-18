import { Branch } from '../modules/branches/branch.model.js';
import { Brand } from '../modules/brands/brand.model.js';
import { Category } from '../modules/categories/category.model.js';
import { Customer } from '../modules/customers/customer.model.js';
import { StockLevel } from '../modules/inventory/stock.model.js';
import { Product, Variant } from '../modules/products/product.model.js';
import { rebuildIndex } from '../modules/search/search.service.js';
import { Supplier } from '../modules/suppliers/supplier.model.js';

/**
 * Idempotent catalog seeder for the supershop e-commerce store.
 * Seeds rich non-food departments: Electronics, Audio, Computing,
 * Modern Fashion, Smart Home, and Power Accessories.
 */
export async function seedDefaultCatalog() {
  const counts = {
    brands: 0,
    suppliers: 0,
    categories: 0,
    products: 0,
    customers: 0,
  };

  // 1. Ensure Main Branch
  const mainBranch = (await Branch.findOne({ code: 'MAIN' })) || (await Branch.findOne({}));
  const branchId = mainBranch?._id;

  // 2. Seed Brands
  const brandsData = [
    { name: 'Apple', slug: 'apple', website: 'https://www.apple.com' },
    { name: 'Samsung', slug: 'samsung', website: 'https://www.samsung.com' },
    { name: 'Sony', slug: 'sony', website: 'https://www.sony.com' },
    { name: 'Anker', slug: 'anker', website: 'https://www.anker.com' },
    { name: 'Logitech', slug: 'logitech', website: 'https://www.logitech.com' },
    { name: 'Nike', slug: 'nike', website: 'https://www.nike.com' },
    { name: 'Zara', slug: 'zara', website: 'https://www.zara.com' },
    { name: 'Xiaomi', slug: 'xiaomi', website: 'https://www.mi.com' },
  ];

  const brandMap = new Map();
  for (const b of brandsData) {
    let brand = await Brand.findOne({ slug: b.slug, deletedAt: null });
    if (!brand) {
      brand = await Brand.create({
        name: b.name,
        nameKey: b.name.toLowerCase(),
        slug: b.slug,
        website: b.website,
        isActive: true,
        protectName: true,
      });
      counts.brands += 1;
    }
    brandMap.set(b.slug, brand._id);
  }

  // 3. Seed Suppliers
  const suppliersData = [
    {
      name: 'Al-Haddad Telecom Distribution',
      contactName: 'Tariq Al-Ghamdi',
      phone: '+966501112233',
      email: 'distribution@alhaddad.example.com',
      taxNumber: '300123456700003',
      registrationNumber: '1010123456',
    },
    {
      name: 'Redington Gulf Saudi Arabia',
      contactName: 'Nasser Al-Otaibi',
      phone: '+966552223344',
      email: 'orders@redingtonksa.example.com',
      taxNumber: '300234567800003',
      registrationNumber: '4030123456',
    },
    {
      name: 'Al-Futtaim Trading Co.',
      contactName: 'Majed Al-Shehri',
      phone: '+966543334455',
      email: 'commercial@alfuttaim.example.com',
      taxNumber: '300345678900003',
      registrationNumber: '2050123456',
    },
    {
      name: 'Global Lifestyle & Fashion KSA',
      contactName: 'Rayan Al-Harbi',
      phone: '+966564445566',
      email: 'supply@globallifestyle.example.com',
      taxNumber: '300456789000003',
      registrationNumber: '1010654321',
    },
  ];

  const supplierMap = new Map();
  for (const s of suppliersData) {
    const key = s.name.toLowerCase();
    let supplier = await Supplier.findOne({ nameKey: key, deletedAt: null });
    if (!supplier) {
      supplier = await Supplier.create({
        ...s,
        nameKey: key,
        isActive: true,
      });
      counts.suppliers += 1;
    }
    supplierMap.set(s.name, supplier._id);
  }
  const defaultSupplierId = supplierMap.values().next().value;

  // 4. Seed Categories (Top-level and Subcategories)
  const categoriesData = [
    {
      name: { en: 'Smartphones & Tablets' },
      slug: 'smartphones-tablets',
      position: 0,
      subcategories: [{ name: { en: 'Mobile Accessories' }, slug: 'mobile-accessories' }],
    },
    {
      name: { en: 'Audio & Wearables' },
      slug: 'audio-wearables',
      position: 1,
      subcategories: [{ name: { en: 'Headphones & Earbuds' }, slug: 'headphones-earbuds' }],
    },
    {
      name: { en: 'Computing & Tech Gear' },
      slug: 'computing-tech',
      position: 2,
      subcategories: [
        { name: { en: 'Laptops & Ultrabooks' }, slug: 'laptops-ultrabooks' },
        { name: { en: 'Keyboards & Mice' }, slug: 'keyboards-mice' },
      ],
    },
    {
      name: { en: 'Modern Fashion & Apparel' },
      slug: 'fashion-apparel',
      position: 3,
      subcategories: [
        { name: { en: 'Men Streetwear' }, slug: 'mens-streetwear' },
        { name: { en: 'Lifestyle Sneakers' }, slug: 'lifestyle-sneakers' },
      ],
    },
    {
      name: { en: 'Smart Home & Living' },
      slug: 'smart-home',
      position: 4,
      subcategories: [{ name: { en: 'Smart Appliances' }, slug: 'smart-appliances' }],
    },
    {
      name: { en: 'Power & Charging' },
      slug: 'power-charging',
      position: 5,
      subcategories: [{ name: { en: 'Power Banks & Cables' }, slug: 'powerbanks-cables' }],
    },
  ];

  const categoryMap = new Map();
  for (const parentData of categoriesData) {
    let parent = await Category.findOne({ slug: parentData.slug, deletedAt: null });
    if (!parent) {
      parent = await Category.create({
        name: parentData.name,
        slug: parentData.slug,
        depth: 0,
        position: parentData.position,
        ancestors: [],
        isActive: true,
      });
      counts.categories += 1;
    }
    categoryMap.set(parentData.slug, parent._id);

    if (parentData.subcategories) {
      for (let pos = 0; pos < parentData.subcategories.length; pos++) {
        const sub = parentData.subcategories[pos];
        let child = await Category.findOne({ slug: sub.slug, deletedAt: null });
        if (!child) {
          child = await Category.create({
            name: sub.name,
            slug: sub.slug,
            parentId: parent._id,
            ancestors: [parent._id],
            depth: 1,
            position: pos,
            isActive: true,
          });
          counts.categories += 1;
        }
        categoryMap.set(sub.slug, child._id);
      }
    }
  }

  // 5. Seed Products & Sellable Variants
  const productsData = [
    {
      name: 'iPhone 16 Pro Max 256GB Titanium',
      slug: 'iphone-16-pro-max-256gb',
      shortDescription: 'Latest Apple A18 Pro chip, 48MP camera system, and titanium finish.',
      description:
        'The iPhone 16 Pro Max features a durable and lightweight titanium design with a larger 6.9-inch Super Retina XDR display.',
      brandSlug: 'apple',
      categorySlugs: ['smartphones-tablets'],
      price: 519900,
      compareAtPrice: 549900,
      cost: 440000,
      sku: 'IP16PM-256-NAT',
      barcode: '6281001000018',
    },
    {
      name: 'Samsung Galaxy S24 Ultra 512GB Titanium Black',
      slug: 'samsung-galaxy-s24-ultra-512gb',
      shortDescription: 'Galaxy AI smartphone with 200MP camera and embedded S Pen.',
      description:
        'Unleash new levels of creativity and productivity with Galaxy AI on the stunning 6.8-inch Dynamic AMOLED 2X display.',
      brandSlug: 'samsung',
      categorySlugs: ['smartphones-tablets'],
      price: 479900,
      compareAtPrice: 519900,
      cost: 400000,
      sku: 'GS24U-512-BLK',
      barcode: '6281001000025',
    },
    {
      name: 'Sony WH-1000XM5 Wireless Noise-Cancelling Headphones',
      slug: 'sony-wh-1000xm5-headphones',
      shortDescription:
        'Industry-leading noise cancellation with two processors and 8 microphones.',
      description:
        'Magnificent sound engineered with the Integrated Processor V1, Hi-Res Audio wireless support, and up to 30-hour battery life.',
      brandSlug: 'sony',
      categorySlugs: ['audio-wearables', 'headphones-earbuds'],
      price: 139900,
      compareAtPrice: 169900,
      cost: 105000,
      sku: 'SONY-WH5-BLK',
      barcode: '6281001000032',
    },
    {
      name: 'Apple AirPods Pro (2nd Gen) with MagSafe USB-C',
      slug: 'apple-airpods-pro-2-usbc',
      shortDescription:
        'Active Noise Cancellation, Adaptive Audio, and Personalized Spatial Audio.',
      description:
        'The H2-powered AirPods Pro feature up to 2x more noise cancellation, Transparency mode, and dust/sweat resistance.',
      brandSlug: 'apple',
      categorySlugs: ['audio-wearables', 'headphones-earbuds'],
      price: 89900,
      compareAtPrice: 99900,
      cost: 72000,
      sku: 'APP-APP2-USBC',
      barcode: '6281001000049',
    },
    {
      name: 'MacBook Pro 14" M3 Pro 18GB 512GB Space Black',
      slug: 'macbook-pro-14-m3-pro',
      shortDescription: 'Phenomenal performance with Apple M3 Pro chip and Liquid Retina XDR.',
      description:
        'Pro laptops with up to 18 hours of battery life, advanced connectivity, and Liquid Retina XDR display with 1000 nits brightness.',
      brandSlug: 'apple',
      categorySlugs: ['computing-tech', 'laptops-ultrabooks'],
      price: 849900,
      compareAtPrice: 899900,
      cost: 740000,
      sku: 'MBP14-M3P-512',
      barcode: '6281001000056',
    },
    {
      name: 'Logitech MX Master 3S Wireless Performance Mouse',
      slug: 'logitech-mx-master-3s-mouse',
      shortDescription: 'Quiet clicks and 8K DPI track-on-glass sensor for power users.',
      description:
        'An icon remastered with Quiet Clicks, 8,000 DPI tracking on any surface, and MagSpeed electromagnetic scrolling.',
      brandSlug: 'logitech',
      categorySlugs: ['computing-tech', 'keyboards-mice'],
      price: 42900,
      compareAtPrice: 49900,
      cost: 31000,
      sku: 'LOGI-MX3S-GRY',
      barcode: '6281001000063',
    },
    {
      name: 'Keychron Q1 Pro Wireless Custom Mechanical Keyboard',
      slug: 'keychron-q1-pro-mechanical-keyboard',
      shortDescription: 'QMK/VIA wireless mechanical keyboard with CNC aluminum body.',
      description:
        'Full aluminum 75% layout custom keyboard with hot-swappable switches, double-gasket design, and South-facing RGB.',
      brandSlug: 'logitech',
      categorySlugs: ['computing-tech', 'keyboards-mice'],
      price: 79900,
      compareAtPrice: 89900,
      cost: 59000,
      sku: 'KEY-Q1P-RGB',
      barcode: '6281001000070',
    },
    {
      name: 'Anker Prime 200W GaN 6-Port Fast Desktop Charger',
      slug: 'anker-prime-200w-gan-charger',
      shortDescription: 'Multipack ultra-fast charging for laptops, phones, and tablets.',
      description:
        'Simultaneously charge 6 devices at high speed with multi-port GaN technology and intelligent temperature control.',
      brandSlug: 'anker',
      categorySlugs: ['power-charging'],
      price: 38900,
      compareAtPrice: 44900,
      cost: 27000,
      sku: 'ANK-P200-GAN',
      barcode: '6281001000087',
    },
    {
      name: 'Anker 737 Power Bank (PowerCore 24K 140W)',
      slug: 'anker-737-power-bank-24k',
      shortDescription: 'Ultra-powerful two-way fast charging with smart digital display.',
      description:
        '24,000mAh portable charger with 140W high-speed charging and real-time digital power output display.',
      brandSlug: 'anker',
      categorySlugs: ['power-charging', 'powerbanks-cables'],
      price: 49900,
      compareAtPrice: 57900,
      cost: 36000,
      sku: 'ANK-737-140W',
      barcode: '6281001000094',
    },
    {
      name: 'Xiaomi Robot Vacuum X10+ Auto-Cleaning Dock',
      slug: 'xiaomi-robot-vacuum-x10-plus',
      shortDescription: 'Automatic dust collection, mop cleaning, and LDS laser navigation.',
      description:
        'Smart all-in-one hands-free cleaning station with 4000Pa suction power, dual rotating mop pads, and 3D obstacle avoidance.',
      brandSlug: 'xiaomi',
      categorySlugs: ['smart-home', 'smart-appliances'],
      price: 229900,
      compareAtPrice: 269900,
      cost: 175000,
      sku: 'XIA-ROB-X10P',
      barcode: '6281001000100',
    },
    {
      name: 'Xiaomi Smart Air Purifier 4 Pro High-Efficiency',
      slug: 'xiaomi-smart-air-purifier-4-pro',
      shortDescription: 'High-efficiency particle filter capturing 99.97% of 0.3μm particles.',
      description:
        'Clean air for large rooms up to 60m² with OLED touch display, negative air ionization, and low-noise sleep mode.',
      brandSlug: 'xiaomi',
      categorySlugs: ['smart-home', 'smart-appliances'],
      price: 84900,
      compareAtPrice: 99900,
      cost: 62000,
      sku: 'XIA-AP4-PRO',
      barcode: '6281001000117',
    },
    {
      name: 'Nike Air Max 270 Black & White Lifestyle Sneakers',
      slug: 'nike-air-max-270-bw',
      shortDescription: 'Max Air 270 unit delivers unrivaled, all-day cushioning.',
      description:
        'The sleek, running-inspired design roots you to the Nike heritage with engineered mesh upper and dual-density foam sole.',
      brandSlug: 'nike',
      categorySlugs: ['fashion-apparel', 'lifestyle-sneakers'],
      price: 64900,
      compareAtPrice: 72900,
      cost: 45000,
      sku: 'NKE-AM270-BW',
      barcode: '6281001000124',
    },
    {
      name: 'Zara Heavyweight Minimalist Oversized Hoodie',
      slug: 'zara-heavyweight-oversized-hoodie',
      shortDescription: '100% premium French terry cotton with relaxed dropped shoulders.',
      description:
        'Modern luxury streetwear silhouette with ribbed cuffs, deep kangaroo pocket, and thermal warmth for all seasons.',
      brandSlug: 'zara',
      categorySlugs: ['fashion-apparel', 'mens-streetwear'],
      price: 29900,
      compareAtPrice: 34900,
      cost: 17000,
      sku: 'ZRA-HOOD-BLK',
      barcode: '6281001000131',
    },
    {
      name: 'Oxford Tailored Slim-Fit Cotton Button-Down Shirt',
      slug: 'oxford-tailored-slim-shirt',
      shortDescription: 'Timeless crisp Oxford weave with reinforced mother-of-pearl buttons.',
      description:
        'Versatile wardrobe staple crafted from breathable Egyptian cotton, styled for smart-casual and formal settings.',
      brandSlug: 'zara',
      categorySlugs: ['fashion-apparel'],
      price: 18900,
      compareAtPrice: 22900,
      cost: 9500,
      sku: 'SUP-OXF-WHT',
      barcode: '6281001000148',
    },
  ];

  for (const p of productsData) {
    let product = await Product.findOne({ slug: p.slug, deletedAt: null });
    if (!product) {
      const catIds = p.categorySlugs.map((s) => categoryMap.get(s)).filter(Boolean);
      const bId = brandMap.get(p.brandSlug);

      product = await Product.create({
        name: { en: p.name },
        slug: p.slug,
        shortDescription: { en: p.shortDescription },
        description: { en: p.description },
        status: 'active',
        categoryIds: catIds,
        brandId: bId ?? null,
        supplierId: defaultSupplierId ?? null,
        taxCategory: 'standard',
        priceMin: p.price,
        priceMax: p.price,
        variantCount: 1,
        tags: [p.brandSlug, 'supershop', 'featured'],
      });
      counts.products += 1;

      // Create primary sellable variant
      const variant = await Variant.create({
        productId: product._id,
        sku: p.sku,
        barcode: p.barcode,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        cost: p.cost,
        isActive: true,
        position: 0,
      });

      // Initialize stock on-hand if branch is available
      if (branchId) {
        await StockLevel.findOneAndUpdate(
          { variantId: variant._id, branchId },
          {
            $set: {
              productId: product._id,
              onHand: 50,
              lastMovementAt: new Date(),
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
      }
    }
  }

  // 6. Seed Realistic Saudi Customers
  const customersData = [
    {
      name: 'Fahad Al-Otaibi',
      email: 'fahad.otaibi@example.com',
      phone: '+966501234567',
      address: {
        recipientName: 'Fahad Al-Otaibi',
        phone: '+966501234567',
        city: 'Riyadh',
        district: 'Al-Malqa',
        street: 'King Fahd Road',
        buildingNumber: '1240',
        postalCode: '13521',
      },
    },
    {
      name: 'Sara Al-Ghamdi',
      email: 'sara.ghamdi@example.com',
      phone: '+966551234567',
      address: {
        recipientName: 'Sara Al-Ghamdi',
        phone: '+966551234567',
        city: 'Jeddah',
        district: 'Al-Rawdah',
        street: 'Prince Sultan Road',
        buildingNumber: '3120',
        postalCode: '23432',
      },
    },
    {
      name: 'Mohammed Al-Shehri',
      email: 'mohammed.shehri@example.com',
      phone: '+966541234567',
      address: {
        recipientName: 'Mohammed Al-Shehri',
        phone: '+966541234567',
        city: 'Khobar',
        district: 'Al-Hizam Al-Thahabi',
        street: 'Corniche Boulevard',
        buildingNumber: '4450',
        postalCode: '34431',
      },
    },
    {
      name: 'Nouf Al-Harbi',
      email: 'nouf.harbi@example.com',
      phone: '+966561234567',
      address: {
        recipientName: 'Nouf Al-Harbi',
        phone: '+966561234567',
        city: 'Dammam',
        district: 'Al-Shati',
        street: 'Al-Ashriah Street',
        buildingNumber: '2100',
        postalCode: '32414',
      },
    },
    {
      name: 'Abdullah Al-Dosari',
      email: 'abdullah.dosari@example.com',
      phone: '+966531234567',
      address: {
        recipientName: 'Abdullah Al-Dosari',
        phone: '+966531234567',
        city: 'Riyadh',
        district: 'Al-Nakheel',
        street: 'Imam Saud Road',
        buildingNumber: '8910',
        postalCode: '12385',
      },
    },
  ];

  for (const c of customersData) {
    let customer = await Customer.findOne({ email: c.email, deletedAt: null });
    if (!customer) {
      customer = await Customer.create({
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: 'active',
        lang: 'en',
        addresses: [
          {
            label: 'Home',
            address: c.address,
            isDefault: true,
          },
        ],
      });
      counts.customers += 1;
    }
  }

  // 7. Synchronize search documents for immediate live storefront search
  try {
    await rebuildIndex();
  } catch {
    // Non-fatal if search adapter not connected in standalone seed run
  }

  return counts;
}
