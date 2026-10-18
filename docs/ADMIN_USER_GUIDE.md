# Supershop Admin & Staff Operations Manual

**Comprehensive Single-File User Guide & Operational Reference**  
_Platform: Supershop Web POS & ERP (Saudi Arabia)_  
_Compliance: ZATCA Phase-1 Simplified Tax Invoices · Saudi VAT 15% · PDPL Data Privacy · KSA Mobile +966_

---

## Table of Contents

1. [Executive Overview & Architectural Invariants](#1-executive-overview--architectural-invariants)
2. [Authentication, Security & Staff Access Control](#2-authentication-security--staff-access-control)
3. [Point of Sale (POS) Counter Operations](#3-point-of-sale-pos-counter-operations)
4. [Cashier Shifts & Till Reconciliation](#4-cashier-shifts--till-reconciliation)
5. [Hardware, Thermal Receipts & Barcode Label Printing](#5-hardware-thermal-receipts--barcode-label-printing)
6. [Catalog & Product Management](#6-catalog--product-management)
7. [Inventory Control, Transfers & Stock Ledger](#7-inventory-control-transfers--stock-ledger)
8. [Omnichannel Orders & Fulfillment](#8-omnichannel-orders--fulfillment)
9. [Returns, Exchanges & Credit Notes](#9-returns-exchanges--credit-notes)
10. [Customer Management & Dynamic Segmentation](#10-customer-management--dynamic-segmentation)
11. [Customer Loyalty Program](#11-customer-loyalty-program)
12. [Marketing Campaigns & Omnichannel Messaging](#12-marketing-campaigns--omnichannel-messaging)
13. [Storefront CMS, Visual Page Builder & Navigation](#13-storefront-cms-visual-page-builder--navigation)
14. [Analytics, Forecasting & Universal Data Exports](#14-analytics-forecasting--universal-data-exports)
15. [Settings, Localization & Marketing Tracking](#15-settings-localization--marketing-tracking)
16. [Database Indexes, Backups & Disaster Recovery](#16-database-indexes-backups--disaster-recovery)
17. [Staff Checklists, Keyboard Shortcuts & Error Reference](#17-staff-checklists-keyboard-shortcuts--error-reference)

---

## 1. Executive Overview & Architectural Invariants

Supershop is a unified enterprise commerce platform designed for multi-branch retail in the Kingdom of Saudi Arabia. It unifies physical POS counter sales, online e-commerce storefronts, inventory management, customer loyalty, marketing automation, and financial reporting into a high-performance modular monolith.

### 1.1 Core Platform Invariants

To guarantee financial accuracy, auditability, and operational stability, the platform enforces strict structural invariants across all modules:

1. **Integer Money (Halalas):**  
   All monetary amounts are stored and calculated as integers in **Saudi Halalas** (`1 SAR = 100 Halalas`). Floating-point arithmetic is prohibited. Currency formatting uses the official Saudi Riyal symbol and locale rules (`SAR 125.50`).
2. **Append-Only Stock Ledger:**  
   Inventory counts are never directly overwritten in the database. Every movement (sales, purchases, adjustments, damaged write-offs, inter-branch transfers) writes an immutable record to the stock ledger. The on-hand balance is the exact transactional sum of recorded movements.
3. **Immutable Z-Reports & Ledgers:**  
   Closing cashier shifts write immutable `ZReport` documents guarded at the database level against modifications or deletions. Similarly, customer loyalty balances are backed by an append-only `LoyaltyLedger`.
4. **Zero-Halala Remainder Pricing on Returns:**  
   When calculating partial refunds on discounted multi-line orders, proportional VAT and discounts are distributed with largest-remainder math. On the final returnable unit, the exact remaining balance is refunded, guaranteeing zero-halala rounding discrepancies.
5. **Saudi Statutory Compliance:**
   - **ZATCA Phase-1 Simplified Tax Invoices:** All printable invoices and thermal receipts encode required TLV tags (Seller Name, VAT Number, Timestamp, Total with VAT, VAT Total) in UTF-8 Base64 rendered as ISO/IEC 18004 QR codes.
   - **Saudi VAT (15%):** Default tax calculation complies with GAZT/ZATCA regulations. Prices entered in the catalog are retail VAT-inclusive by default.
   - **Saudi Personal Data Protection Law (PDPL):** Explicit cookie and tracking consent gating, customer marketing opt-outs, and HMAC-signed one-click unsubscribe links.
   - **Saudi Phone Normalization:** Local phone numbers normalize to E.164 KSA mobile format (`+9665XXXXXXXX`).

---

## 2. Authentication, Security & Staff Access Control

Staff access to the admin dashboard and POS terminals is protected by enterprise authentication and granular Role-Based Access Control (RBAC).

### 2.1 Staff Login & Session Security

- **Access URL:** Navigate to `/login` on the admin panel domain.
- **Credentials:** Enter your registered corporate email and password.
- **Brute-Force Defense:** Rapid failed login attempts trigger automated exponential lockouts (`ACCOUNT_LOCKED`).
- **CSRF Defense:** Cookie-authenticated routes require the custom `X-CSRF-Protection: 1` header alongside strict origin verification.
- **Session Expiry:** Access tokens reside in memory; silent refreshes execute via `httpOnly`, `SameSite=Strict` secure cookies.

### 2.2 Two-Factor Authentication (2FA / TOTP)

Staff members can enforce hardware- or app-based 2FA adhering to RFC 6238 (TOTP):

1. Click your profile avatar in the top-right header and select **Two-Factor Security**.
2. Scan the displayed QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, or Apple Keychain). If unable to scan, enter the provided base32 secret key manually.
3. Enter the 6-digit verification code generated by your app to verify synchronization.
4. **Save Recovery Codes:** The system provides 10 single-use emergency recovery tokens (`xxxx-xxxx-xxxx`). Store these in a secure offline vault. Each code can be redeemed exactly once if your authenticator device is lost.
5. Once enabled, subsequent logins will prompt for a 6-digit TOTP code immediately after password verification.

### 2.3 Roles & Granular Permissions

Privileges are assigned through customizable roles. Key permissions include:

- `pos.sell`: Operate POS cash registers and execute counter sales.
- `pos.discount`: Apply manual line-item and basket discounts (capped by store policy).
- `pos.priceOverride`: Modify catalog retail prices during counter checkout.
- `shift.open`: Open a new cashier shift and register opening cash floats.
- `shift.close`: Count drawer cash and close shifts.
- `shift.cashMovement`: Record mid-shift Paid In / Paid Out cash operations.
- `shift.view`: View shift sales summaries, generate X-reports, and authorize discrepancy overrides.
- `product.viewCost`: View wholesale product costs, margins, and gross profit analytics.
- `order.update` / `order.cancel`: Update order fulfillment states and execute order cancellations.
- `inventory.view` / `inventory.manage`: View stock levels, record adjustments, and create transfers.
- `settings.printing` / `settings.manage`: Configure hardware, VAT numbers, and store policies.

### 2.4 Multi-Branch Scoping

- **Headquarters (HQ) Staff:** Users assigned roles with `allBranches: true` (e.g. Super Admin, Regional Auditor) have visibility across all physical store locations and warehouses.
- **Store-Scoped Staff:** Users assigned to specific branches are strictly sandboxed (`assertBranch`). A cashier assigned to the "Riyadh Olaya Branch" can only search inventory, process sales, and access shifts for that specific location.

---

## 3. Point of Sale (POS) Counter Operations

The POS terminal (`/pos`) is optimized for rapid checkout using barcode scanners or touchscreens, with zero dialog interruptions during standard sales.

```
┌────────────────────────────────────────────────────────┐
│                      POS SCREEN                        │
├──────────────────────────┬─────────────────────────────┤
│   LEFT: SCAN & BASKET    │    RIGHT: PAYMENT PANEL     │
│                          │                             │
│ [ Barcode / Search F2  ] │  Total Due: SAR 115.00      │
│ ──────────────────────── │  ────────────────────────── │
│ Item 1: Milk 1L    x 2   │  Customer: Walk-in          │
│ Item 2: Bread Pack x 1   │                             │
│                          │  [ Cash ]  [ Card / Mada ]  │
│ [ Hold ]   [ Clear ]     │  [ Complete Sale (Enter) ]  │
└──────────────────────────┴─────────────────────────────┘
```

### 3.1 Cashier Sales Workflow

1. **Ensure Shift is Open:** A sale cannot be processed unless the cashier has an active open shift (`409 SHIFT_NOT_OPEN` if `pos.requireOpenShift` is enabled).
2. **Scan / Add Items:**
   - **Barcode Scanner:** Scan the barcode using a USB or Bluetooth HID keyboard-wedge scanner. The item is automatically resolved and added to the basket with a single scan.
   - **Search Input (F2):** Cashiers can type product names, SKUs, or barcodes into the search field. Pressing `Enter` adds the top matching result.
3. **Adjust Quantities & Discounts:**
   - Increase or decrease line quantities in the basket table.
   - Enter line discounts (percentage or fixed SAR). Cashiers must possess `pos.discount` permission; discounts exceeding `pos.maxDiscountBps` (e.g., 20%) are refused.
4. **Attach Customer (Optional):**
   - Sales are processed as **Walk-in** by default.
   - Type a customer's registered phone number (`05XXXXXXXX`) or email to attach their account. Attaching a customer displays their current loyalty points balance and accrues points upon completion.
5. **Process Payment (F4):**
   - Select tender method: **Cash**, **Card (Mada/Visa/Mastercard)**, or **Store Credit**.
   - **Exact Amount:** Click "Exact" to populate the total due directly.
   - **Cash Tender & Change:** Type the cash amount received from the customer. The system automatically computes and displays the exact change due from the cash drawer.
   - **Split Tenders:** Add multiple tenders (e.g., SAR 50 in Cash + SAR 65 on Mada Card). The sale cannot be finalized until total tenders equal or exceed the total due.
6. **Finalize Sale (Enter):**
   - Click **Complete Sale** or press `Enter`.
   - The sale is recorded atomically as an order with `channel: 'pos'`, inventory is deducted from the current branch stock ledger, the cash drawer kicks open, and the thermal receipt prints automatically.

### 3.2 Held Baskets & Offline Resilience

- **Hold Sale:** If a customer needs to fetch an extra item, click **Hold Basket**. The current items and customer details are saved to local branch storage.
- **Resume Sale:** Click **Held Baskets** at the top of the till to resume or delete parked baskets.
- **Offline Tolerance:** If local network connectivity drops, the till preserves the active basket and alerts the cashier. Payment processing halts safely until connection is restored, preventing unquoted pricing errors.

---

## 4. Cashier Shifts & Till Reconciliation

The Shifts module (`/shifts`) guarantees physical cash reconciliation, discrepancy audits, and immutable end-of-day accounting.

### 4.1 Shift Lifecycle

- **Opening Shift:**
  - Before starting checkout operations, the cashier clicks **Open Shift**.
  - Enter the physical opening float (e.g., SAR 500.00 in petty cash).
  - Only one active open shift is permitted per cashier (`partial unique index` at database level).
- **Mid-Shift Cash Movements:**
  - **Paid In (Float In):** Add cash to the drawer (e.g. replenishing change). A documented operational reason is mandatory.
  - **Paid Out (Petty Cash):** Remove cash from the drawer for petty expenses (e.g., store supplies). Reason is mandatory.
- **Mid-Day Audit (X-Report):**
  - Cashiers or supervisors can click **View X-Report** at any point.
  - Generates a live, non-finalizing financial calculation: Opening float + Net cash sales (after change given) + Cash In - Cash Out = Expected Cash.
- **Closing Shift & Z-Report:**
  - At the end of the shift, the cashier clicks **Close Shift**.
  - Count the physical cash in the drawer and enter the **Closing Cash Count**.
  - The system computes the discrepancy: `Discrepancy = Closing Cash - Expected Cash`.

### 4.2 Shift Discrepancy Policy & Manager Authorization

To prevent cash shrinkage and protect cashiers:

- If `pos.shiftMaxDiscrepancy` is configured (e.g., SAR 50.00), and `|discrepancy| > threshold`, standard cashiers cannot close the shift directly (`SHIFT_DISCREPANCY_TOO_LARGE`).
- A manager or supervisor holding `shift.view` permission must inspect the drawer, review cash movements, and authorize the closure.
- Closing the shift generates an immutable **Z-Report** with a sequential gapless number (`Z-00001`), locks the shift against further transactions, kicks the drawer, and prints the thermal Z-report.

---

## 5. Hardware, Thermal Receipts & Barcode Label Printing

Supershop communicates directly with ESC/POS thermal printers and label printers using the **QZ Tray** hardware bridge.

### 5.1 QZ Tray Setup & Cryptographic Signing

1. Install **QZ Tray** on cashier workstations.
2. In the Admin Panel, navigate to **Settings → Printing**.
3. **Security Architecture:** The shop's private key never resides in the browser. When QZ Tray requests signature verification, the admin client requests a cryptographic signature from `POST /api/v1/printing/sign` using the store's AES-256 encrypted private key.
4. Set **Auto-Print Receipts** to `true` to immediately trigger receipt printing upon finalizing sales.

### 5.2 Thermal Receipt Customization & ZATCA QR

- **Printer Widths:** Supports standard 58 mm (32 chars), 76 mm (42 chars), 80 mm (48 chars), and 85 mm (50 chars) paper rolls.
- **Bilingual Receipts:** Configure receipts in English, Arabic, or Bilingual layout (`en / ar`). Line items, totals, and headers wrap cleanly without character corruption.
- **ZATCA TLV QR Code:** When the 15-digit Saudi VAT Number is configured in Settings, every receipt automatically prints a ZATCA Phase-1 compliant QR code.
- **Live Preview:** Edit header slogans, footer return policies, and toggle lines with real-time SVG simulation in Settings.

### 5.3 Barcode Label Printing

- Print product barcode labels directly from catalog listings or purchase order receiving.
- Supports shelf-edge and adhesive label sizes (e.g. 50×30 mm, 40×25 mm).
- Labels display product name, barcode, retail price with VAT, and optional SKU/currency symbols.

---

## 6. Catalog & Product Management

The Catalog module (`/products`, `/categories`, `/brands`, `/suppliers`) organizes multi-channel retail inventory.

### 6.1 Products & Variant Matrix

- **Single vs Multi-Variant:** Products can exist as simple items (single SKU) or configurable items with an attribute matrix (e.g., Size × Color × Material).
- **Matrix Ceiling:** Supports up to 3 option axes, 50 values per option, and a maximum of 250 variant combinations per product.
- **Cost Protection:** Product cost is strictly gated behind `product.viewCost`. Staff lacking this permission will never receive cost, margin, or wholesale pricing in API responses or UI screens.

### 6.2 Barcodes & Symbology Standards

- **In-Store Barcodes:** Auto-generated barcodes use GS1 restricted-circulation prefixes **20 through 29** (e.g., `200000012345`) with mod-10 check digits.
- **Code 128 Symbology:** Alphanumeric SKUs and supplier barcodes that do not conform to standard GTIN/EAN lengths are rendered and printed using Code 128.
- **Scale-Embedded Barcodes:** For produce or bulk deli items, scale labels embedding weight or price can be scanned directly at the till.

### 6.3 Category Tree Hierarchy

- Unlimited hierarchical category depth (structural safety ceiling of 20 levels).
- Optimized with materialized ancestor arrays for single-query breadcrumbs and deep subtree filtering.
- Reorder items via drag-and-drop within the same parent category.

### 6.4 Brands, Suppliers & Translation Protection

- **Glossary Protection (`protectName`):** When creating brand names (e.g., "Apple", "Orange", "Puma"), checking `protectName` automatically registers the brand in the i18n translation glossary as a _never-translate_ term. This prevents automated translation tools from corrupting brand names into generic Arabic words.
- **Supplier Records:** Store Saudi CR numbers, 15-digit VAT numbers, and contact details with automated E.164 phone normalization.

---

## 7. Inventory Control, Transfers & Stock Ledger

The Inventory module (`/inventory`) provides full visibility over stock across all branches and central warehouses.

```
┌────────────────────────────────────────────────────────┐
│                   STOCK LEDGER FLOW                    │
│                                                        │
│  [Purchase Order] ──> (+ Stock) Receiving              │
│  [POS Sale]       ──> (- Stock) Immediate deduction    │
│  [Return]         ──> (+ Stock) Restock                │
│  [Damaged Return] ──> (+ Stock Return) & (- Adjustment)│
│  [Branch Transfer]──> (- Source) ──> (+ Destination)   │
└────────────────────────────────────────────────────────┘
```

### 7.1 Stock Operations

1. **Stock Counts (Physical Audits):**
   - Conduct periodic shelf inventory counts.
   - Enter the counted physical quantity. The ledger automatically calculates the difference and books a reconciliation movement.
2. **Manual Adjustments:**
   - Add or remove units with a mandatory reason code: `breakage`, `shrinkage`, `expired`, `internal_use`, or `audit`.
   - On-hand stock is prevented from going below zero unless explicitly enabled.
3. **Inter-Branch Transfers:**
   - Create a transfer request from Branch A to Branch B.
   - **Dispatch:** Stock leaves Branch A immediately upon dispatch.
   - **Receipt:** Stock arrives at Branch B and is booked to sellable inventory upon physical receipt verification.
4. **Purchase Orders (POs):**
   - Manage procurement from suppliers.
   - Create PO → Send to supplier → Receive items. Supports full or partial shipments with landed cost calculation.

### 7.2 Stock-Out Forecasting & Reorder Points

The inventory system tracks sales velocity and days of inventory remaining:

- **Out of Stock:** 0 units on hand.
- **Critical (<= 3 Days):** Immediate reorder recommended.
- **Warning (<= 7 Days):** Approaching replenishment threshold.
- **Healthy:** Sufficient stock for target buffer horizon.

---

## 8. Omnichannel Orders & Fulfillment

The Orders module (`/orders`) manages orders placed through both online storefronts and physical store counters.

### 8.1 Standard Order Lifecycle

Orders advance through a formal finite state machine:

```
  [ Pending ]
       │
       ▼
  [ Paid / COD Confirmed ] ──> [ Processing ] ──> [ Shipped ] ──> [ Completed ]
       │                                             │
       ├───────────────────> [ Cancelled ] <─────────┘
       │
       ▼
  [ Partially Returned / Refunded / Exchanged ]
```

- **Pending:** Order placed online; awaiting online payment gateway confirmation.
- **Paid / COD Confirmed:** Payment settled via card or cash on delivery confirmed.
- **Processing:** Warehouse staff picking and packing items.
- **Shipped:** Parcel handed to courier (e.g., SMSA, Aramex, SPL). Customer receives SMS/email with tracking link.
- **Completed:** Goods delivered to customer or finalized at POS counter.
- **Cancelled:** Order aborted. Items are automatically reversed in the stock ledger and returned to the origin branch shelf.

### 8.2 Invoices & Tracking

- **Printable A4 Tax Invoice:** Click **Print Invoice** on any order to render a ZATCA-compliant Simplified Tax Invoice featuring store address, VAT registration number, line items, and TLV QR code.
- **Customer Tracking Portal (`/track`):** Customers can track parcel progress using their Order Number and phone number without requiring account sign-in.

---

## 9. Returns, Exchanges & Credit Notes

The Returns module (`/returns`) provides compliant processing of customer returns, exchanges, and damaged write-offs.

### 9.1 Processing Customer Returns

1. Navigate to `/returns` and lookup the original order by **Order Number** or **Customer Phone**.
2. Select the items and quantities being returned.
3. Choose the item **Disposition**:
   - **Restock:** Item is unopened and resaleable. Added back to the current branch sellable inventory.
   - **Damaged:** Item is defective or opened. Booked as a return and immediately written off via a negative adjustment in the stock ledger.
4. Select the **Refund Method**:
   - `cash`: Immediate cash refund from till drawer.
   - `card`: Payment gateway or card terminal reversal.
   - `store_credit`: Issued as customer account credit for future purchases.

### 9.2 Exchanges

1. In the returns terminal, toggle mode from **Return** to **Exchange**.
2. Search and add the replacement items chosen by the customer.
3. **Exchange Value Guard:** Total replacement value must equal or exceed the return credit (`exchangeTotal >= returnCredit`).
4. **Settling Difference Due:** The customer settles any remaining balance using standard POS tenders (Cash, Card, Mada).
5. Completing the exchange prints a thermal Exchange Receipt / Credit Note with ZATCA QR code.

---

## 10. Customer Management & Dynamic Segmentation

The Customers module (`/customers`) aggregates customer intelligence and loyalty metrics.

### 10.1 Customer Profiles

- View customer lifetime spend, average order value (AOV), total order count, and last purchase timestamp.
- Manage shipping address books with Saudi National Address short codes.
- Audit loyalty ledger balances and communication history.

### 10.2 Dynamic RFM Customer Segments

Customers are automatically categorized based on spending patterns and recency:

- **VIP:** Lifetime spend >= SAR 2,000 or Gold/Platinum loyalty tier.
- **Loyal:** 3 or more completed purchases.
- **Active:** Made a purchase within the last 60 days.
- **New:** Registered within the last 30 days with <= 1 order.
- **Slipping:** Last purchase between 60 and 120 days ago.
- **Churn Risk:** Last purchase over 120 days ago.
- **Idle:** Registered over 30 days ago with 0 completed orders.

---

## 11. Customer Loyalty Program

The Loyalty module (`/api/v1/loyalty`) incentivizes repeat purchases through an automated, append-only point ledger.

### 11.1 Point Accrual & Redemption Rules

- **Earning Points:** By default, customers earn **1 point for every SAR 100 spent** (`loyalty.earnSpendRate = 10000`). Accrual is idempotent on order ID.
- **Redemption Value:** Points can be redeemed at checkout as currency discount (e.g. 1 point = SAR 5.00). Configurable via `loyalty.pointRedemptionValue`.
- **Minimum Redemption:** Configurable minimum balance threshold before redemption is permitted.

### 11.2 Loyalty Tiers

Customer loyalty tiers dynamically evaluate based on cumulative lifetime earned points:

- **Bronze:** 0 – 499 points
- **Silver:** 500 – 1,499 points
- **Gold:** 1,500 – 4,999 points
- **Platinum:** 5,000+ points

### 11.3 Expiry Sweeps & Returns Clawback

- **Point Expiry:** Points can expire after a configurable duration (default: 365 days; set to `0` to disable expiry).
- **Return Clawbacks:** When a customer returns an order that earned loyalty points, the platform emits `EVENTS.LOYALTY_REVERSED` to claw back the earned points without allowing negative balances.

---

## 12. Marketing Campaigns & Omnichannel Messaging

The Campaigns module (`/campaigns`) powers segment-targeted marketing broadcasts via SMS and Email.

### 12.1 Authoring & Audience Targeting

- Select target audience by customer segment (e.g. VIP, Slipping, Churn Risk).
- Choose channel: **SMS** (via Taqnyat or Unifonic KSA gateways) or **Email** (SMTP).
- Dynamic personalization placeholders: `{{customerName}}`, `{{storeName}}`, `{{points}}`.
- Automated Arabic translation: Campaign copy entered in English is automatically translated to Arabic and delivered in each recipient's preferred language.

### 12.2 Scheduling, Delivery Logs & PDPL Opt-Out

- **Schedule Dispatches:** Broadcast immediately or schedule for optimal delivery windows.
- **Live Delivery Logs:** Monitor individual delivery outcomes (Sent, Delivered, Failed, Opted Out).
- **Privacy Compliance:** Every marketing message includes an automated, HMAC-SHA256 signed one-click opt-out link. When clicked, customer preferences update immediately without requiring login.

---

## 13. Storefront CMS, Visual Page Builder & Navigation

The CMS module (`/pages`, `/site`) enables visual site authoring without code deployments.

### 13.1 Visual Drag-and-Drop Page Builder

Build custom landing pages, promotional campaigns, or custom home pages using 13 modular blocks:

- **Hero Carousel:** Autoplay banners with responsive CTA buttons.
- **Product Row:** Dynamic product rails (Newest, Best Sellers, Category-specific, or Hand-picked).
- **Category Grid:** Visual category navigation cards.
- **FAQ Accordion:** Frequently asked questions with automated `FAQPage` JSON-LD structured data.
- **Countdown Timer:** Urgent promotional countdown clocks.
- **Brand Strip:** Carousel of brand logos with direct catalog links.
- **Customer Quotes & Selling Points:** Trust badges and testimonials.

### 13.2 Menus, Appearance & Redirects

- **Header & Footer Navigation:** Configure multi-level mega menus with direct links to categories, pages, or search filters.
- **URL Redirects (SEO):** Create permanent 301, temporary 302, or gone 410 redirects for legacy URLs to protect search rankings.
- **Automated Sitemap & Robots:** XML sitemaps and `robots.txt` dynamically compile based on published CMS pages and SEO settings.

---

## 14. Analytics, Forecasting & Universal Data Exports

The Analytics and Reporting module (`/reports`) provides data-driven operational intelligence.

### 14.1 Dimensional Performance Reporting

Generate comprehensive sales, volume, and profit metrics sliced across 6 dimensions:

1. **Product:** Top-selling items, units sold, gross revenue, margin %.
2. **Category:** Category share and revenue contribution.
3. **Brand:** Brand performance and velocity.
4. **Staff / Cashier:** Sales per cashier, transactions rang up, average ticket size.
5. **Branch:** Cross-branch revenue comparisons.
6. **Channel:** Online storefront vs POS counter sales breakdown.

### 14.2 Demand Forecasting Models

- **Simple Moving Average (SMA):** Projects upcoming 30-day inventory demand based on historical velocity with a 95% confidence interval.
- **Day-of-Week Seasonality:** Applies cyclical day multipliers (e.g. Friday peak footfall in KSA) to refine daily replenishment recommendations.

### 14.3 Universal Background Exports

Export massive datasets without freezing browser screens:

- **Formats:** Microsoft Excel (`.xlsx`), CSV (`.csv`), or JSON.
- **Excel Arabic Compatibility:** CSV exports automatically include a UTF-8 Byte Order Mark (BOM) to display Arabic characters correctly in Excel.
- **Spreadsheet Formula Injection Defense:** Cell values beginning with dangerous formula characters (`=`, `+`, `-`, `@`) are automatically escaped to prevent formula injection exploits.
- **Private TTL Links:** Export jobs execute via background BullMQ workers; download links remain private and expire automatically after 24 hours.

---

## 15. Settings, Localization & Marketing Tracking

Platform settings (`/settings`) allow complete customization of store policies, printers, and integrations.

### 15.1 Store Information & Saudi Tax

- Store legal name, commercial registration (CR), and physical address.
- **VAT Registration Number:** 15-digit number beginning and ending with `3`. Essential for ZATCA QR codes.
- Tax-inclusive vs tax-exclusive retail pricing policy.

### 15.2 Arabic Translation & Glossary Overrides

- **Automated Translation Engine:** Self-hosted LibreTranslate or external translation providers translate content on save.
- **Glossary Management:** Register proprietary brand names and technical terms as _never-translate_.
- **Manual Overrides:** Override automated storefront UI translations in **Settings → Languages** without requiring code updates or server restarts.

### 15.3 Marketing Tracking & Consent Mode

- Pluggable integrations for **Google Tag Manager (GTM)**, **GA4**, **Meta Pixel & CAPI**, **Google Ads Enhanced Conversions**, **TikTok**, and **Snapchat**.
- **PDPL Cookie Consent Banner:** Integrates Google Consent Mode v2, ensuring analytics and marketing signals are only dispatched when user consent is granted.

---

## 16. Database Indexes, Backups & Disaster Recovery

System administrators maintain platform performance and data redundancy through built-in automation scripts.

### 16.1 Idempotent Index Synchronization

Ensure all 34 Mongoose models have optimized database indexes built across primary query paths:

```bash
# Run index synchronization CLI
npm run db:indexes
```

Builds 51 critical compound indexes across `orders`, `products`, `variants`, `customers`, and `stock_movements`.

### 16.2 Automated Production Backups

The backup utility creates point-in-time, compressed archives of MongoDB replica sets and Redis state:

```bash
# Execute full operational backup
npm run ops:backup

# Backups are created in /var/backups/supershop:
# - mongodump archive with gzip compression
# - redis BGSAVE snapshot (dump.rdb)
# - sha256 checksum manifest
# - automated pruning of backups older than 7 days
```

### 16.3 Database Restoration

Restore from an existing backup archive in staging or disaster recovery environments:

```bash
# Restore from a specific backup folder
tools/ops/restore.sh /var/backups/supershop/backup_20261018_120000 --confirm
```

---

## 17. Staff Checklists, Keyboard Shortcuts & Error Reference

### 17.1 Morning Opening Checklist (Cashiers & Supervisors)

- [ ] Turn on POS terminal and barcode scanner.
- [ ] Launch **QZ Tray**; verify green indicator icon in system tray.
- [ ] Log in to Admin Panel (`/pos`).
- [ ] Click **Open Shift**; count opening cash drawer float and record amount.
- [ ] Verify thermal receipt printer has sufficient paper roll. Print a test receipt if needed.
- [ ] Perform a test scan of a product barcode to verify scanner connectivity.

### 17.2 Evening Closing Checklist (Cashiers & Supervisors)

- [ ] Finish all open orders and clear any lingering held sales.
- [ ] Review mid-shift cash movements (Paid In / Paid Out) against physical vouchers.
- [ ] Open **Shifts** (`/shifts`) and click **View X-Report** for preliminary audit.
- [ ] Click **Close Shift**; perform physical cash drawer count and enter total.
- [ ] If a discrepancy exceeds the store threshold, call a supervisor with `shift.view` to review and authorize.
- [ ] Review and archive the generated **Z-Report**.
- [ ] Deposit cash in store safe according to branch security protocols.

### 17.3 POS Keyboard Shortcuts Cheatsheet

| Key Combination    | Action Description                                | Context               |
| :----------------- | :------------------------------------------------ | :-------------------- |
| **`F2`**           | Jump to Barcode / Product Search input            | Till screen (`/pos`)  |
| **`F4`**           | Jump to Payment Tender amount input               | Till screen (`/pos`)  |
| **`Enter`**        | Add highlighted search result to basket           | Search input active   |
| **`Enter`**        | Complete sale and trigger payment                 | Tender panel active   |
| **`Esc`**          | Clear search input / close active modal dialog    | Global admin          |
| **`Ctrl + P`**     | Open printable receipt or invoice dialog          | Orders & Shifts       |
| **`Barcode Scan`** | Auto-adds item without clicking or pressing Enter | USB/Bluetooth scanner |

### 17.4 Common Error Codes & Troubleshooting

| Error Code                    | Root Cause                                                         | Staff Resolution                                                                           |
| :---------------------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------------------------------- |
| `SHIFT_NOT_OPEN`              | Attempting to process a sale without an open shift.                | Click **Open Shift** on the till and enter opening float.                                  |
| `SHIFT_ALREADY_OPEN`          | Cashier already has an active open shift.                          | Resume existing shift or close the previous shift.                                         |
| `SHIFT_DISCREPANCY_TOO_LARGE` | Cash discrepancy exceeds `pos.shiftMaxDiscrepancy`.                | Request a manager with `shift.view` permission to authorize and close the shift.           |
| `RETURN_QTY_EXCEEDED`         | Return quantity exceeds original purchased quantity.               | Check order history; item was already partially or fully returned.                         |
| `EXCHANGE_VALUE_TOO_LOW`      | Exchange replacement value is lower than return credit.            | Customer must select replacement items equal to or exceeding returned credit value.        |
| `ORDER_NOT_RETURNABLE`        | Order status does not permit returns (e.g., cancelled or pending). | Returns can only be booked against `completed`, `shipped`, or `partially_returned` orders. |
| `BRANCH_SCOPE_DENIED`         | Staff member attempted to access another branch's data.            | Switch to your assigned branch or request HQ multi-branch permissions.                     |
| `SLUG_TAKEN`                  | Attempting to assign an existing URL slug.                         | Modify category or page slug to ensure uniqueness.                                         |
| `QZ Tray Connection Failed`   | Hardware bridge is not running on cashier PC.                      | Start QZ Tray desktop app; ensure SSL certificate is trusted.                              |

---

_End of Supershop Admin & Staff Operations Manual._
