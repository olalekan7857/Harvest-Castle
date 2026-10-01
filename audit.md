# Harvest Castle — Backend Requirements Audit

> **Status: AUDIT ONLY.** No backend code has been written. This document is the
> backend implementation blueprint and progress tracker. It describes everything
> the existing static frontend expects Django to eventually provide.
>
> Source of truth: the static files in this repo — 25 `.html` pages,
> `assets/js/fresh-direct.js` (storefront logic), `assets/js/fd-blog.js`,
> `assets/js/fd-theme.js`, `assets/js/fd-admin*.js` (12 admin scripts), and the
> HTML comments marked `Django:` / `Django will ...` left by the frontend.
>
> Status legend used throughout: `[ ] Not started` · `[ ] Planned` ·
> `[ ] In progress` · `[ ] Implemented` · `[ ] Tested` · `[ ] Production ready`.
> **Everything below is `[ ] Not started` unless stated otherwise.**

---

## 1. Frontend Inventory (what was audited)

### 1.1 Customer pages

| File | Type | Backend data needed |
|---|---|---|
| `index.html` | Hybrid | Featured products, categories (see §8) |
| `product.html` (Shop) | Hybrid | Product queryset: search/filter/sort/paginate |
| `product-category.html` | Hybrid | Category + filtered products |
| `product-details.html` | Hybrid | Single product + variants + related |
| `cart.html` | Hybrid (local cart) | Product existence/price validation at checkout |
| `checkout.html` | Hybrid (local cart + form) | Order creation, price re-validation |
| `order-confirmation.html` | Hybrid (session snapshot) | Persisted order lookup by reference |
| `about.html` | Static | None (settings-driven address/hours optional) |
| `contact.html` | Hybrid | Contact submission endpoint (or WhatsApp handoff) |
| `blog.html` / `blog-detail.html` / `blog-category.html` / `blog-search.html` | Hybrid (static markup, Django placeholders) | Full blog CMS |
| `privacy.html` / `terms.html` | Static | None (flat pages; optional DB versioning) |
| `404.html` | Static | None (`meta robots=NOINDEX,FOLLOW`) |

### 1.2 Admin pages (custom HTML seller interface — the real admin UI)

`admin-login.html`, `admin-dashboard.html`, `admin-products.html`,
`admin-product-edit.html`, `admin-orders.html`, `admin-order.html`,
`admin-blog.html`, `admin-blog-edit.html`, `admin-settings.html`.
Django's built-in Django Admin is **not** the planned product-management UI;
these custom pages are. Django Admin may still serve as a superuser fallback.

### 1.3 JavaScript modules

| File | Role today |
|---|---|
| `fresh-direct.js` | WhatsApp links, toasts, cart store, shop filter/sort, `FD_CATALOG` mock, PDP renderer, cart page, checkout, order snapshot + confirmation, contact form, scroll progress |
| `fd-blog.js` | Blog share/copy-link + toasts only (explicitly: no data, routing, rendering) |
| `fd-theme.js` | Light/dark toggle, `localStorage:freshdirect_theme_v1`, `window.FreshDirectTheme` API |
| `fd-admin.js` | Auth boundary stub (`FreshDirectAdminAuth` — always rejects `AUTH_NOT_CONFIGURED`), login/forgot/logout wiring |
| `fd-admin-store.js` | Seller product overlay store (`freshdirect_admin_products_v1`) |
| `fd-admin-products.js` / `fd-admin-products-data.js` | Admin product list + catalog mirror/merge |
| `fd-admin-product-editor.js` | Create/edit form, validation, image preview, payload builder, upload stub (`IMAGE_UPLOAD_NOT_CONFIGURED`) |
| `fd-admin-orders.js` / `fd-admin-orders-data.js` | Admin order list + order store (`freshdirect_admin_orders_v1`, imports session snapshot) |
| `fd-admin-order-detail.js` | Order detail render + status-change service |
| `fd-admin-dashboard.js` / `fd-admin-dashboard-data.js` | Dashboard aggregates (mock products + real order store + static blog/review counts) |
| `fd-admin-blog.js` / `fd-admin-blog-editor.js` | Blog list filter + delete-from-view; editor form + `KNOWN`-slug map |
| `fd-admin-settings.js` / `fd-admin-settings-data.js` | Settings record (`freshdirect_admin_settings_v1`), validation, WhatsApp test link |
| `main.js`, vendor (`jquery`, `bootstrap`, `slick`, `isotope`, `magnific-popup`) | Template chrome (menus, sliders, popups). No backend relevance |

### 1.4 Browser storage keys in use (must all be superseded or kept deliberately)

| Key | Scope | Purpose |
|---|---|---|
| `freshdirect_cart_v1` | localStorage | Customer cart lines |
| `freshdirect_last_order` | sessionStorage | Checkout order snapshot → confirmation page + admin import |
| `freshdirect_theme_v1` | localStorage | `light`/`dark` (keep) |
| `freshdirect_shop_view` / `freshdirect_home_view` / `freshdirect_related_view` | sessionStorage | Grid/list view prefs (keep client-side) |
| `freshdirect_admin_products_v1` | localStorage | Seller-created/edited products (replace with API) |
| `freshdirect_admin_orders_v1` | localStorage | Seller order store + status edits (replace with API) |
| `freshdirect_admin_settings_v1` | localStorage | Seller settings (replace with API/settings model) |

---

## 2. Feature Audit (what users/admins can do → what Django must do)

### 2.1 Product catalog & discovery (customer)

- **Can do:** browse Shop, search by name/category substring (`#fd-shop-search`,
  150 ms debounce), filter by category pills (`#fd-shop-pills`, navigate to
  `product-category.html?category=<name>`), filter by availability
  (`all|in|out`; note `limited` counts as available), sort
  (`featured|price-asc|price-desc|name`), toggle grid/list (per-collection,
  sessionStorage), deep-link `?category=` (case-insensitive, unknown → `All`).
- **Data:** id, name, category, price (default variant), unit/variant id, stock
  status, image, description — carried on card `data-*` attributes.
- **Django:** `Product` queryset + server-side search/filter/sort + `Paginator`
  (`?page=` placeholders already in markup); category resolution for
  `?category=` (future `/products/?category=<slug>`); preserve the card
  `data-*` contract or render the same `FD_CATALOG` JSON shape.
- **Endpoint type:** public, unauthenticated, GET.

### 2.2 Product details + variants + KG quantities

- **Can do:** view gallery, pick variant (radio-like buttons, `aria-pressed`),
  adjust quantity (KG variants: `±0.5 kg` steps from current value, typable
  decimals ≤2 places, min `0.5`, max `99`; other units: integer `±1`, min `1`),
  see live total (`qty × selected variant price`, rounded to whole ₦), add to
  cart, order via WhatsApp (`(Qty: 1.3 kg)`), restock-notify when `out`.
- **Rule:** variant price = price per unit (per kg for KG variants); totals are
  `Math.round(price × qty)`; display strips trailing zeros (`1`, `1.5`, `1.3`).
- **Statuses:** `in` (orderable) · `limited` (orderable + badge) · `out`
  (blocked, notify-me). No stock counts anywhere — availability is a flag.
- **Django:** serve canonical product + variants + images + status; **re-validate
  existence, availability, and price at checkout** (frontend totals are
  display-only); keep variant ids stable (cart lines key on them).

### 2.3 Cart (preview + `cart.html`)

- **Can do:** add (merge by `productId__variantId` key), `±` step
  (`0.5 kg` / `1`), type KG quantities inline (live line-price + subtotal while
  typing, commit on blur/Enter, revert if invalid), remove, clear; badge shows
  **line-item count**; preview list scrolls independently (`max-height`) with
  subtotal + actions pinned.
- **Line shape:** `{key, id, name, variant, price, qty, unit, category, image,
  alt}` — price/qty are the only math inputs.
- **Django (later):** optional server cart is **not** required by the frontend;
  the hard requirement is checkout-time re-validation against live
  product/variant records. Keep the localStorage cart as-is until/unless a
  decision is made to add authenticated carts. (See §19.)

### 2.4 Checkout → order → confirmation (see §5 for full audit)

Guest-first, single seller. Form validates name/phone(Nigerian mobile
regex)/optional email/delivery fields; delivery modes `on-campus`
(hostel, room/block, optional faculty/office) vs `off-campus` (address,
optional landmark) + optional instructions/notes. Ordering method
`website|whatsapp`. Website path without a gateway stops honestly
(`not-configured`); WhatsApp path snapshots the order, opens
`wa.me/<number>?text=<order lines + customer + delivery + subtotal>`, and lands
on `order-confirmation.html?order=<ref>`. Confirmation renders **only** from a
persisted snapshot whose `?order=` matches; `paid` renders **only** with
backend-set `payment.verified === true` + reference.

### 2.5 Contact/help

Fields: name (≥2), phone (Nigerian mobile regex, shared `checkoutPhoneOk`),
optional email, subject (≥2), message (≥2); gentle validation (blur after first
submit attempt, instant clear on input). `FRESH_DIRECT.contactEndpoint = ""`
today → validated payload handed to WhatsApp (`Name/Phone/[Email]/Subject +
message`) via shared `wa.me` builder; nothing claimed as sent; no PII stored.
**Django:** `POST` endpoint (e.g. `/api/contact/`) accepting
`{name, phone, email, subject, message}` returning `sent|failed`; decide
storage vs email notification (see §19).

### 2.6 WhatsApp system

Single source of truth `FRESH_DIRECT.whatsappNumber = "2349011058873"`
(mirrors future Django setting `WHATSAPP_NUMBER`). Modes via `data-whatsapp`:
`general` (default message), `product` (`name [— variant] (Qty: q [unit])`),
`cart`, `restock` (back-in-stock ask). Cart/checkout/contact/order-follow-up
messages are built by dedicated builders reusing this number. **Django:**
own the number in settings/env; never hardcode; keep message builders'
content contract (names, variants, `1.3 kg`-style quantities, line totals,
subtotal, customer + delivery for checkout).

### 2.7 Theme, toasts, chrome

Theme: Light default, pre-paint inline snippet reads
`freshdirect_theme_v1`, toggle persists, `meta[name=theme-color]` synced,
`window.FreshDirectTheme` API, Django may seed `<html data-theme>`. No backend
need. Toasts: transient `Added/Removed/Cleared`, status `<p>` on forms, empty
states — UI-only. Footer year, mobile menu a11y, category show-more, scroll
progress ring — UI-only.

---

## 3. Product/Catalog Management Audit (custom admin is the real UI)

### 3.1 Admin product list (`admin-products.html` + `fd-admin-products.js`)

- Search (`#fd-prod-search`, matches name + category + id + variant labels,
  150 ms debounce, `Escape` clears) · category select (built dynamically,
  exact match) · availability (`all|in|limited|out`) · sort
  (`default|name-asc|name-desc|price-asc|price-desc`, price sorts use **lowest
  variant price**) · `Showing X of Y products` · empty-filtered vs empty-all
  states · static `?page=` pagination placeholder (Django to implement) ·
  `?mock=empty|error` QA hooks.
- Row: thumbnail (hides on error), name, category, availability pill, variant
  list (label + ₦ price each), price range `₦min – ₦max` / single / unavailable,
  actions **View** (storefront `product-details.html?id=`, suppressed for
  seller-local items) · **Edit** (`admin-product-edit.html?id=`) ·
  **Delete** (modal confirm, today removes only the local overlay).
- **Django:** product list endpoint with search/filter/sort/paginate;
  real delete (decide soft vs hard, see §19); image fallback handling.

### 3.2 Create/edit form (`admin-product-edit.html` + editor JS)

- Modes: no `?id|`/`?mode=new` → create; `?id=` → edit (unknown id → not-found,
  never auto-create); `?mock=error` → load error. Product ID shown read-only
  in edit (immutable).
- Fields: name (2–120) · category (required, must be a known category) ·
  description (required, ≤2000, plain text) · badge (optional, ≤24, omitted when
  empty) · image file (`png|jpeg|webp|gif`, ≤5 MB, dimension-probed preview;
  file wins over URL) **or** existing-image picker / pasted URL (≤500) · image
  alt (**required**, ≤125) · variants list (label ≤40 + price + Default radio;
  1–20 rows; labels/derived-ids unique case-insensitively; price `>0`,
  `≤50,000,000`, accepts `₦2,500` formatting) · status radios
  (`in|limited|out`, required) · dirty-guard (`confirm()` + `beforeunload`) ·
  result panel (created/saved + back/create-another/view-on-storefront).
- Variant id derivation: `Per bunch|tuber|piece(s)` → `bunch|tuber|piece`, else
  lowercased/alphanumeric token, uniquified (`-2`, `-3…`); existing rows keep
  `originalId` so cart lines keep resolving; deleting the default row promotes
  the first remaining.
- Image save today: `src = filename`, measured `w/h` (or preserved/0), upload
  always rejects `IMAGE_UPLOAD_NOT_CONFIGURED` with an honest "previewed on
  this device only" note.
- **Django:** full product CRUD API (or server-rendered form posts) + image
  upload endpoint + validation mirroring above + stable variant ids (cart
  compatibility) + category vocabulary enforcement.

### 3.3 Implied entities (requirements, not model code)

- **Product** (required): id/slug (immutable), name, category FK-or-vocabulary,
  description, badge (nullable), status (`in|limited|out`), default variant FK,
  timestamps. Drives shop, PDP, cards, dashboard, orders.
- **Category** (required — decide table vs vocabulary, §19): name, slug,
  optional description + image; shop pills, category page, admin filters,
  current 8 storefront values (`Fresh Produce, Fruits, Vegetables, Healthy
  Living, Recipes, Food Storage, Farm Tips, Seasonal`) plus product categories
  (`Tomatoes, Peppers, Onions, Tubers, Herbs & Spices, …`).
- **ProductImage** (required): FK → Product (1 image today — keep 1:N for
  gallery growth), src/storage path, alt (required), width/height, ordering.
  Today exactly one image per product; gallery markup supports many.
- **ProductVariant** (required): FK → Product, variant id/slug (stable,
  cart-keyed), label, price (integer ₦), is-default (exactly one per product).
  Variant price = unit price; KG math happens client-side.
- Rationale: each maps 1:1 to a frontend structure (`FD_CATALOG` product /
  `variants[]` / `images[]` / `defaultVariant`) and a distinct admin editing
  surface.

---

## 4. Admin Authentication & Authorization Audit

- **Login UI** (`admin-login.html`): email + password (+remember-me checkbox,
  show/hide toggle, forgot-panel). Client validation only (email format,
  non-empty). `FreshDirectAdminAuth.signIn()` **always rejects
  `AUTH_NOT_CONFIGURED`** with a neutral message (no account oracle); no
  session/token/storage write; success branch marked unreachable until Django.
- **Forgot flow:** honest "no reset email was sent — contact the store owner";
  `requestPasswordReset()` rejected + ignored.
- **Logout:** disabled buttons (`aria-disabled="true"`, "available after
  sign-in"); `signOut()` stub. Settings page mirrors the same pattern.
- **Protection today: none.** All 8 admin pages render fully unauthenticated;
  zero `requireAuth`/redirect logic (by design — "Django gates admin pages
  server-side"). Display-only `Seller Admin` role string; no roles enforced;
  password "Managed by the store owner".
- **Django must provide — Authentication (who):** credential login (email +
  password), session or token handling with CSRF, remember-me semantics,
  logout, password-reset flow (email), minimal seller profile for the UI.
  **Authorization (allowed):** server-gate every admin page/endpoint to
  staff/seller users; decide single `Seller Admin` role vs multiple
  staff roles (§19); product/order/blog/settings mutations admin-only;
  customers remain anonymous (no customer accounts exist in the frontend).
- Sensitive ops: status changes, product CRUD, image uploads, settings edits,
  any payment-verification flag — all server-side, permission-checked.

---

## 5. Orders & Checkout Audit

### 5.1 Flow trace

`Product → Cart (localStorage) → Checkout form → buildOrder() →
stampOrder() → WhatsApp handoff or (blocked) website payment →
order-confirmation.html?order=<ref> → Admin Orders (same-browser import)`.

### 5.2 Data captured (checkout `buildOrder()` shape — persist all of it)

- **Customer:** name (≥2), phone (Nigerian mobile regex
  `/^(\+?234|0)[789][01]\d{8}$/` after stripping spaces/dashes/parens), email
  (optional, simple format check).
- **Delivery:** `mode: on-campus|off-campus`; on-campus → hostel (≥2),
  room/block (≥1), faculty/office (optional); off-campus → address (≥5),
  landmark (optional); instructions/notes (optional, both modes).
- **Items (snapshot, historical):** per line `productId, variantId, name,
  variantLabel, quantity (decimal KG preserved, e.g. `1.3`), quantityLabel
  (`1.3 kg`), unitPrice, lineTotal` — **recorded at order time, never
  re-derived**; admin detail renders recorded `total`, never recalculates.
- **Totals:** `subtotal` (+ `total`; equal today — no fees/tax in UI).
- **Reference:** client placeholder `FD-XXXXXX` (6 chars, no `0/1/I/O`) —
  Django must replace with the real order id/reference scheme.
- **Timestamps:** `placedAt` ISO; admin formats `EEE, d MMM yyyy, h:mm`;
  missing → "Date unavailable".
- **Statuses:** order `whatsapp-submitted|pending|paid|failed` (admin may set
  any→any today; decide transition rules, §19); payment
  `{provider, reference, status: unpaid|pending|paid|failed, verified: bool}`.
  Derived payment display: `Paid` (verified + reference + paid) ·
  `Unverified` (paid claim, no verification) · `Pending` · `Failed` · `Unpaid`.
- **Ordering method:** `website|whatsapp`.
- **WhatsApp order text:** greeting + customer + delivery + numbered lines
  (`name — variant × qty` + `unitPrice each — lineTotal`) + subtotal +
  confirm-availability close; PDP variant carries `data-qty` + `data-unit=kg`;
  admin follow-up link is a short ref/customer/count/status text (no private
  details).
- **Confirmation states:** `whatsapp-submitted` (send-prompt + reopen-WhatsApp)
  · `pending` · `failed` (retry + WhatsApp) · `paid` (only on verified flag +
  reference) · anything else incl. URL-tampered `paid` → "Order not found".
  Cart is preserved across the WhatsApp handoff.

### 5.3 Persistence requirements

`Order` (+ `OrderItem` lines, or JSON snapshot — decide, §19) must retain the
**exact purchase-time** name/variant/qty/prices/totals/customer/delivery,
independent of later product edits; plus status history (at least current
status + who/when changed, once admin edits exist), payment provider +
reference + verified flag, ordering method, timestamps. Order lookup by
reference for confirmation + admin detail; admin list needs
search (ref/name/phone) + filters (order status, derived payment status,
delivery mode) + sort (newest/oldest/total) + counts + pagination.

---

## 6. Payment Audit

- **Today:** `window.FreshDirectPay = {configured: false,
  initializePayment(order) → {status: "not-configured"}}`. Website-path submit
  calls it and **stops honestly** ("use Order via WhatsApp — details kept");
  unknown states stop too. No gateway SDK, no keys, no callbacks in the repo.
- **Contract comments (binding on backend):** replace `initializePayment()`
  with the real provider call; resolve **only after provider + Django both
  confirm**; backend **re-validates product/variant existence, availability,
  and prices** (frontend totals display-only); success UI only on verified
  backend state; `confirmationPaidOk()` stays the single paid gate
  (`status === "paid" && payment.verified === true && payment.reference`).
- **Must be server-side:** amount computation/verification, secret keys,
  webhook signature verification, `verified` flag + reference issuance, order
  status transitions driven by payment outcome, idempotent callback handling.
  Never trust `?status=`, localStorage, or client totals.
- **Decisions required:** provider (Paystack vs Flutterwave, §19), currency
  minors (kobo vs naira integers), reference scheme, retry/reconciliation for
  `pending`, refund/dispute handling (none in UI today).

---

## 7. Blog Audit

- **Storefront is 100% static markup + Django placeholder comments**;
  `fd-blog.js` does share/copy-link + toasts only (no data/routing/rendering).
- **Listing** (`blog.html`): one featured post section + card grid (6 shown,
  page size undefined); static category pills (8 + All, currently all
  `href="blog-category.html"`; future `/blog/category/<slug>/`); newest-first
  copy; static `?page=2` pagination; no tags UI, no sort, no result count, no
  authors on cards; one `.has-fallback` icon card; unused `.fd-skeleton` /
  load-more CSS hints at planned async that was never wired.
- **Detail** (`blog-detail.html`): bare `href="blog-detail.html"` links (no
  slug param today; future slug path); TOC anchors, topic sidebar with counts,
  3 related cards (same-category-first rule in comment), shop CTA band,
  share row; SEO (`seo_title`, `seo_description`, `BlogPosting` JSON-LD with
  `datePublished/dateModified`, org author); commented-out "Article not found".
- **Category** (`blog-category.html`): example `Recipes` instance; pills with
  `aria-current`; static `?page=`; commented-out "No articles here yet".
- **Search** (`blog-search.html`): plain GET form (`?q=`, input `fd-blog-q`),
  static `2 articles found` example; searched fields undefined (editor hints
  tags feed search + related); no pagination/sort on template.
- **No** comments, newsletter, likes, or author pages anywhere.
- **Admin blog:** 6 static cards (5 published incl. featured-capable, 1 draft)
  with title/category/status filter (title + category match only), modal
  delete-from-view; editor with title · category (8-value select) · excerpt ·
  author (default `Harvest Castle Team`) · tags (comma-separated, feeds related
  + search) · featured image file/URL + required alt + caption · body (plain
  text) · `published|draft` radios (no scheduling/review) · featured checkbox
  (Editor's-pick slot) · optional SEO title/description; slug = immutable post
  ID, dates/read-time not editable.
- **Django:** `BlogPost` (slug, title, excerpt, category FK/table, author,
  tags, featured image + alt + caption, body, status, featured flag, SEO
  fields, `published_at`, reading time) + `BlogCategory`; public list/detail/
  category/search with `?page=` + `?q=` + `/blog/<slug>/` (+ redirects on slug
  change); admin CRUD + publish/unpublish + delete; related-posts rule;
  image handling; counts for sidebar.

---

## 8. Customer Pages: Static / Dynamic / Hybrid

| Page | Class | Django responsibility |
|---|---|---|
| Home (`index.html`) | Hybrid | Featured products + categories (or reuse shop querysets); static hero/steps/visit copy |
| Shop (`product.html`) | Dynamic | Product queryset: `?q=&category=&avail=&sort=&page=` |
| Category (`product-category.html`) | Dynamic | Category resolve + filtered queryset (same params) |
| Product details | Dynamic | Product + variants + images + related (same-category-first, exclude self, 4) |
| Cart / Checkout | Hybrid | No server cart required; **checkout = order-create + re-validation endpoint** |
| Order confirmation | Hybrid | Order-by-reference lookup; verified-payment gate |
| About / Privacy / Terms / 404 | Static | Serve as-is (optional flat-CMS later) |
| Contact | Hybrid |Submission endpoint (or intentional WhatsApp-only — decide §19) |
| Blog ×4 | Dynamic | Full blog CMS (list/detail/category/search) |
| Admin ×9 | Dynamic (authed) | Auth + CRUD + order ops + settings + dashboard aggregates |

---

## 9. Search / Filtering / Sorting / Pagination

| Surface | Controls today (client) | Django target |
|---|---|---|
| Shop | `q` (name/category substring, debounced), pills→`?category=`, `avail=all\|in\|out`, `sort=featured\|price-asc\|price-desc\|name`, `Showing X of Y` | GET queryset + `Paginator(?page=)`; DB indexes on name/category/price (see §15) |
| Category page | Same + category pre-filter | Same, scoped to category slug |
| Admin products | `q` (name/category/id/variants), category, availability, sort incl. min-variant-price | Same server-side + real `?page=` |
| Admin orders | `q` (ref/name/phone), order status, derived payment status, delivery mode, `newest\|oldest\|total-*` | Same server-side + `?page=` |
| Admin blog | `q` (title/category), category, status | Same server-side + `?page=` |
| Blog search | GET `?q=` (fields TBD) | Full-text-ish search over title/excerpt/body/tags (+category?) + `?page=` |
| Blog list/category | Static `?page=` | `Paginator(?page=)`; page size TBD (§19) |

All are GET-appropriate (read-only, bookmarkable). View-toggle prefs and theme
stay client-side.

---

## 10. Images & Media

- **Static assets (keep as files):** logos, icons, hero/category art, decorative
  404 produce shots, template photography under `assets/img/`.
- **Django-managed media (near-term):** product images (upload/replace/remove
  + required alt + dimensions; 1 per product today, 1:N ready), blog featured
  images (+ alt required, caption). Constraints from the editor UIs:
  `png|jpeg|webp|gif`, ≤5 MB, extension fallback when MIME empty, decode
  probing, `blob:` previews never persisted.
- **Needs:** `MEDIA_ROOT`/storage backend, upload validation (type, size,
  dimensions, safe filenames), variant: images belong to products (gallery
  markup ready), featured image belongs to post; alt-text required at form
  level; deletion semantics (decide orphan cleanup, §19); thumbnails
  (card 58 px → detail ~200 px → blog cover) — decide on-demand vs prebuilt.

---

## 11. Forms & Submissions

| Form | Fields (*required) | Validation | Destination today → Django target |
|---|---|---|---|
| Checkout (`#fd-checkout-form`) | name* · phone* (NG mobile) · email · mode radio · hostel*/room* (on-campus) · address* (off-campus) · landmark · faculty · notes · method radio | Inline + summary, focus-first-error, gentle blur | → Order-create endpoint (persist snapshot, §5); WhatsApp handoff stays |
| Contact (`#fd-contact-form`) | name* · phone* · email · subject* · message* | Same pattern | → WhatsApp handoff today → `POST /api/contact/` (store and/or email — decide) |
| Admin login (`#fd-admin-*`) | email* · password* · remember | Format/non-empty | → session/token auth endpoints + CSRF |
| Product create/edit (`#fd-ed-*`) | name* · category* · desc* · badge · image file/URL + alt* · variants* + default* · status* | 5+ rule groups, linked summary (§3.2) | → Product CRUD + image upload endpoints |
| Blog create/edit (`#fd-bed-*`) | title* · category* · excerpt* · author · tags · image + alt* · caption · body* · status* · featured · SEO | Required-5 + summary | → Blog CRUD endpoints |
| Order status (`#fd-order-status-form`) | status select (4 values) | Any→any today | → Status-update endpoint (permission-checked; never sets payment) |
| Settings (`#fd-set-*`) | businessName* · contactPhone · address* · description · whatsapp* | Length/phone rules | → Settings endpoint (single record) |
| Blog search | `q` (GET) | — | → server-rendered results |
| Shop toolbar | Not a form (controls) | — | → GET params (§9) |

No newsletter/comment/account forms exist — anything like that is new scope.

---

## 12. JavaScript Responsibilities

### 12.1 What JS handles correctly (keep client-side)

WhatsApp link building from one config number · toasts/status/empty states ·
grid/list persistence · category show-more · shop client pre-filter/sort (until
server rendering lands) · PDP stepper + KG math + live totals · cart CRUD +
badge + preview scroll · gentle form validation UX · theme · copy-link/share ·
scroll progress · mobile menu a11y · year stamp.

### 12.2 What JS simulates and Django must replace/connect

| Simulation | Replacement |
|---|---|
| `FD_CATALOG` static products | Product/Category/Variant/Image tables + rendered cards/JSON |
| localStorage cart as system of record | Keep UX; add checkout re-validation (server cart optional) |
| `makeOrderRef`/`stampOrder`/`saveLastOrder` | Real order ids + persisted snapshots |
| `confirmationPaidOk` client flag | Webhook-verified `payment.verified` + reference |
| `FreshDirectPay` stub | Provider integration (server-side) |
| `FreshDirectAdminAuth` rejects | Session/token auth + server-gated admin |
| Admin localStorage overlays (products/orders/settings) | Admin APIs + same payload shapes |
| `ImageUpload.uploadPendingFile` reject | Media upload endpoint |
| Static blog markup + `KNOWN` slugs | BlogPost/Category tables + slug routes |
| `BLOG_POSTS=6`, `UNREAD_REVIEWS=3`, dashboard mock products | Real aggregates (reviews: none exist — decide §19) |
| `contactEndpoint=""` → WhatsApp | Contact endpoint or intentional handoff |
| Hardcoded address/hours/footer copy | Settings context (optional) |

---

## 13. Proposed Backend Entities

> Requirements only — no model code. `Required` = frontend cannot function
> without it; `Optional` = implied but confirmable.

1. **User / Seller account** (Required) — email(login), password hash,
   display name, role (`Seller Admin` today; multi-role TBD), active flag,
   timestamps. Depends: all admin auth + gating.
2. **Product** (Required) — immutable id/slug, name (2–120), category,
   description (≤2000), badge (nullable ≤24), status `in|limited|out`,
   default-variant link, timestamps. Used by: shop, PDP, cards, cart
   validation, orders, dashboard.
3. **Category** (Required, table-vs-vocabulary TBD) — name, slug,
   optional description/image. Used by: pills, category page, admin filters,
   blog (separate vocabulary or shared — recommend separate `BlogCategory`).
4. **ProductVariant** (Required) — FK→Product, stable variant id (cart-keyed,
   immutable-ish), label (≤40, unique per product), price (int ₦, >0),
   is-default (exactly one). Used by: PDP, pricing, cart lines, order lines.
5. **ProductImage** (Required) — FK→Product, file, alt (required ≤125),
   width/height, order. Used by: cards, PDP gallery, admin preview. (1 row
   today; 1:N for growth.)
6. **Order** (Required) — reference (PK-ish, human-readable), status
   (`whatsapp-submitted|pending|paid|failed`), customer name/phone/email,
   delivery mode + mode-specific fields + instructions, subtotal + total,
   ordering method, placedAt, payment provider/reference/status/verified.
   Used by: checkout, confirmation, admin list/detail/dashboard.
7. **OrderItem** (Required, or snapshot-JSON — decide §19) — FK→Order (+
   nullable FK→Product/Variant for linkage), purchase-time name, variant id +
   label, quantity (decimal-capable for KG), `quantityLabel`, unitPrice,
   lineTotal. Used by: confirmation, admin detail, WhatsApp text.
8. **BlogCategory** (Required) — name, slug, optional description. Used by:
   pills, category page, related-posts rule.
9. **BlogPost** (Required) — slug (immutable id), title (≤160), excerpt
   (≤500), category FK, author (default `Harvest Castle Team`), tags,
   featured image + alt (required) + caption, body, status
   (`published|draft`), featured flag, SEO title/description, `published_at`,
   reading time (stored or computed — decide). Used by: all 4 blog pages +
   admin blog + dashboard count.
10. **SiteSettings** (Required, singleton) — businessName, contactPhone,
    whatsapp (canonical digits), address, description (+ hours/fee fields only
    if decided). Used by: admin settings, WhatsApp builders, footer/contact
    display.
11. **ContactEnquiry** (Optional — decide store vs email-only) — name, phone,
    email, subject, message, createdAt, handled flag. Used by: contact form.
12. **PasswordResetToken** (Required if email reset chosen) — user FK,
    token hash, expiry, used flag. Used by: forgot-password flow.

Out of scope (no frontend evidence): customer accounts, newsletter
subscriptions, reviews/ratings (`UNREAD_REVIEWS=3` is a static mock with no UI
behind it — decide), coupons, delivery fees/tax, inventory counts, multi-seller.

---

## 14. Backend Operations Required

> Only operations the frontend implies. Statuses: all `[ ] Not started`.

### Authentication & access — `[ ] Not started`

- Seller login (email + password, remember-me) · logout · session protection
  (+ CSRF) · password-reset request/confirm · server-gate all admin pages/APIs
  · seller profile for UI (`Seller Admin` display).

### Products — `[ ] Not started`

- Public: list (search/filter/sort/paginate), category-scoped list, retrieve
  by id/slug (+ variants/images/related), availability guard (`out` blocked).
- Admin: create, update (stable ids), delete (soft/hard TBD), image
  upload/replace/remove (+ alt/dimensions), variant add/edit/remove +
  set-default, category vocabulary list, price-range aggregates for list/sort.

### Categories — `[ ] Not started`

- Public: list (pills), resolve slug→category page. Admin: decide CRUD scope
  (today vocabulary is implicit — at minimum list; create/rename needs slug
  + product-reassignment rules).

### Orders — `[ ] Not started`

- Public: create order from validated cart + form (server recomputes +
  re-validates everything; returns reference), retrieve confirmation by
  reference (never trust URL state).
- Admin: list (search/filters/sort/paginate + counts), retrieve detail,
  update order status (permission-checked; must not touch payment fields),
  WhatsApp follow-up uses stored data.

### Payments — `[ ] Not started`

- Initialize transaction (server-computed amount) · provider callback/webhook
  (signature-verified, idempotent) · mark `verified` + reference only on
  confirmed funds · expose derived status (`paid|unverified|pending|failed|
  unpaid`) to admin list/badges · reconciliation path for `pending`.

### Blog — `[ ] Not started`

- Public: list (+ featured slot, `?page=`), detail by slug (+ related,
  same-category-first), category page (+ `?page=`), search `?q=` (+ count,
  fields TBD) · SEO meta + JSON-LD per post · slug-change redirects.
- Admin: CRUD, publish/unpublish, delete, featured flag, image handling, list
  with search/filter + `?page=`.

### Settings & contact — `[ ] Not started`

- Singleton settings read/update (validated, canonical phone digits) ·
  contact submit endpoint (persist and/or email — decide).

### Dashboard — `[ ] Not started`

- Aggregates: product totals/availability, orders needing attention
  (`whatsapp-submitted|pending`), paid/failed counts, recent orders (5),
  restock-first product sample (6), blog count (real), reviews (decide).

---

## 15. Security Requirements

`[ ] Not started` (documented for build time):

- **AuthN/Z:** hashed passwords (never stored/compared in plain text),
  session security + CSRF on all mutations, brute-force throttling on login,
  server-side gating of every admin page *and* API (the static frontend gates
  nothing — do not rely on hidden buttons/`aria-disabled`).
- **Price & order integrity:** recompute all totals server-side; re-validate
  product/variant existence + availability + current price at order creation;
  reject client-supplied totals; KG decimals validated (`0.5–99`, ≤2 places)
  but amounts always in integer ₦ (kobo decision, §19).
- **Payment:** secrets in env, webhook signature checks, idempotent
  processing, `verified` settable only by verified provider events (admin
  status edits must never verify payment — mirrors the UI hint), no
  `?status=`/localStorage trust.
- **Validation:** server-side mirrors of all client rules (lengths, email,
  NG-phone regex, variant/price bounds, image type/size), plus slug/id
  uniqueness, exactly-one-default-variant, order-minimums (≥1 line).
- **Uploads:** MIME + extension + size (5 MB) + decode/dimension checks, safe
  randomized filenames, no executable storage, orphan cleanup policy.
- **Input hygiene:** escape/sanitize descriptions, bodies, reviews of
  user content (XSS); Nigerian-phone canonicalization (`0…` → `234…`);
  древесные `tel:` links digit-filtered (already client-side — repeat
  server-side where used).
- **Config:** `WHATSAPP_NUMBER`, gateway keys, `SECRET_KEY`, DB creds in
  environment; no secrets in templates/JS; `NOINDEX` kept on admin + 404.
- **Indexes:** products (name, category, price, status), orders (reference,
  customer name/phone, status, `placedAt`), posts (slug, status,
  `published_at`, category) — admin search/sort and shop queries hit these.

---

## 16. Frontend → Backend Dependency Map

```text
SiteSettings (WHATSAPP_NUMBER, business info)
 └─► WhatsApp builders (PDP / cart / checkout / contact / admin follow-up)
 └─► footer / contact / header display

Auth (Seller account + session)
 └─► admin page gating ─► everything below

Category (+ BlogCategory)
 ├─► product admin (category select / filters)
 ├─► Shop pills + ?category= + category page
 └─► PDP facts + related

Product ─► ProductVariant (default) ─► ProductImage
 ├─► product admin CRUD + editor + image upload
 ├─► Shop cards (data-* contract) ─► PDP (variants/gallery/pricing/KG math)
 │    └─► Cart lines (keyed productId__variantId) ─► Checkout re-validation
 │         └─► Order + OrderItems (frozen snapshot) ─► Confirmation (?order=)
 │              └─► Admin Orders (list/detail/status) ─► Dashboard aggregates
 └─► restock/notify + availability pills everywhere

Payment provider + webhook ─► payment.verified/reference ─► paid confirmation
 └─► admin payment pills (paid/unverified/pending/failed/unpaid)

BlogCategory ─► BlogPost (+ image) ─► list / detail / category / search / SEO
 └─► admin blog CRUD + publish flow ─► dashboard post count

ContactEnquiry? ─► contact endpoint ─► (store and/or email)
```

Critical path for a first sellable slice: Settings → Auth → Category →
Product/Variant/Image → public Shop/PDP → checkout re-validation → Order
snapshot → confirmation → admin order view/status → payments → blog → contact.

---

## 17. Preliminary Backend Dependency Order

> Phases only — not implementation instructions. Order derived from §16
> (auth gates admin; products precede cart/checkout/orders; payments precede
> paid states; blog is independent and can parallelize late).

1. `[ ] Not started` — Core foundation: Django project, settings/env split,
   database, static/media serving, base templates wired to existing HTML/CSS.
2. `[ ] Not started` — Authentication & admin access: seller login/logout/
   reset, session + CSRF, server-side admin gating, role decision.
3. `[ ] Not started` — Catalog data: Category, Product, ProductVariant,
   ProductImage (+ media pipeline) with seed parity to `FD_CATALOG`.
4. `[ ] Not started` — Product admin: custom-pages CRUD, image upload,
   variant management, list search/filter/sort/pagination, delete semantics.
5. `[ ] Not started` — Public product surfaces: shop, category, PDP,
   related, availability guards (keep KG math + card contract client-side).
6. `[ ] Not started` — Orders: snapshot-preserving create endpoint with
   server re-validation, reference scheme, confirmation lookup.
7. `[ ] Not started` — Checkout hardening: mode-specific delivery validation,
   WhatsApp handoff continuity, failure/empty states.
8. `[ ] Not started` — Payments: provider init, webhook verification,
   `verified` lifecycle, derived statuses, reconciliation.
9. `[ ] Not started` — Order administration: list/detail/status workflow,
   dashboard aggregates, follow-up links.
10. `[ ] Not started` — Blog CMS: categories, posts, public list/detail/
    category/search + SEO, admin publishing workflow, media.
11. `[ ] Not started` — Contact & settings: singleton settings API, contact
    endpoint (store/email decision), footer/header context.
12. `[ ] Not started` — Security hardening pass: §15 checklist, permission
    review, upload abuse tests, price-tamper tests.
13. `[ ] Not started` — Production preparation: env/config, backups, logging,
    error pages (`404.html` + `500`), performance (indexes, pagination,
    image sizes), handover notes.

---

## 18. Progress Tracking

Track each §14 operation with `[ ] Not started → Planned → In progress →
Implemented → Tested → Production ready`. Rule: nothing is marked
`Implemented` or above until code exists **and** the corresponding static JS
simulation is retired or wired behind it (e.g. `FD_CATALOG` served from DB,
`FreshDirectAdminAuth` resolving against real sessions, `FreshDirectPay`
calling the provider through Django).

---

## 19. Open Questions / Decisions Required

1. `DECISION REQUIRED` — Category model vs controlled vocabulary (products
   and blog share 8 names today; product categories like `Tomatoes`/`Tubers`
   differ — one shared table or two?).
2. `DECISION REQUIRED` — Order lines: separate `OrderItem` table vs JSON
   snapshot field (admin never edits lines — snapshot-friendly).
3. `DECISION REQUIRED` — Payment provider (Paystack vs Flutterwave),
   currency minors (kobo vs naira ints), reference format replacing
   `FD-XXXXXX`, `pending` reconciliation + refunds.
4. `DECISION REQUIRED` — Order status transitions: keep admin any→any or
   enforce a graph (e.g. `failed → pending` allowed? `paid` editable?).
5. `DECISION REQUIRED` — Product delete: hard delete vs soft
   (`is_archived`) given historical order linkage + `View`-suppression
   behavior for seller-local items.
6. `DECISION REQUIRED` — Image orphan cleanup + thumbnail strategy
   (on-demand vs prebuilt) + max count per product (1 today).
7. `DECISION REQUIRED` — Contact form: persist enquiries, email notify,
   or intentional WhatsApp-only (frontend supports all three).
8. `DECISION REQUIRED` — Blog: page size, search fields (title/excerpt/body/
   tags?), slug-change redirects, reading-time computed vs stored, comment
   system (none today — confirm out of scope).
9. `DECISION REQUIRED` — Reviews: dashboard mocks `UNREAD_REVIEWS=3` but no
   review UI exists anywhere — drop it or build a review feature?
10. `DECISION REQUIRED` — Authenticated customer carts/accounts: frontend is
    guest-only with a localStorage cart — confirm no customer accounts in v1.
11. `DECISION REQUIRED` — Roles: single `Seller Admin` vs multiple staff
    roles/permissions.
12. `DECISION REQUIRED` — Delivery fees, tax, delivery time windows: none in
    UI (delivery "arranged personally") — confirm out of scope for v1.
13. `DECISION REQUIRED` — KG catalog semantics: variant price = per-kg is a
    frontend convention — confirm products store unit prices and quantities
    stay client-side until checkout (vs server-side KG line computation).
14. `DECISION REQUIRED` — Stock counts: availability is flag-only (`in/
    limited/out`) — confirm no quantity inventory in v1.

---

## 20. Backend Scope Summary

- **Domains (7):** authentication & admin access · product/catalog management ·
  orders & checkout · payments · blog CMS · contact & site settings ·
  media/dashboard.
- **Entities (12 proposed):** Seller/User, Product, Category, ProductVariant,
  ProductImage, Order, OrderItem, BlogCategory, BlogPost, SiteSettings,
  ContactEnquiry (optional), PasswordResetToken. No customer accounts,
  coupons, inventory counts, or reviews in the frontend — excluded unless
  decided otherwise (§19).
- **Admin:** 9 custom HTML pages are the real seller UI (login, dashboard,
  products, product editor, orders, order detail, blog, blog editor,
  settings). All mutations currently hit localStorage overlays or honest
  `NOT_CONFIGURED` stubs with payload shapes Django should keep.
- **Customer:** guest-only commerce — hybrid shop/PDP/cart/checkout backed by
  a localStorage cart, purchase-time order snapshots, WhatsApp as the working
  order rail, website payment deliberately blocked pending a gateway.
- **Auth:** login/logout/reset + remember-me + server-gated admin; single
  `Seller Admin` role today; password managed by store owner.
- **Payments:** provider + webhook + verified-flag lifecycle entirely
  server-side; frontend totals untrusted; `paid` only on verified + reference.
- **Media:** product + blog images (≤5 MB, 4 types, alt required) move to a
  validated upload pipeline; everything else stays static.
- **Blog:** 4 public pages + admin publishing, slug-routed, SEO/JSON-LD,
  search + pagination — currently 100% static markup with `Django:` markers.
- **Dependencies:** settings → auth → catalog → public surfaces → orders →
  payments → order-admin → blog → contact; security + production last.
- **Security core:** server-side price/order/payment truth, permission-gated
  admin, upload validation, no secret or state trust in the client.
- **Unresolved:** 14 decisions in §19 — no backend build should assume
  answers; each must be recorded here before implementation.

---

*End of audit. Next step (separate task): resolve §19 decisions, then
implement §17 phases in order, updating statuses in §14/§17 as we go.*
