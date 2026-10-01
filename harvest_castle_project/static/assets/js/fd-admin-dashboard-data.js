/* ==========================================================================
   Harvest Castle Admin — Dashboard DEVELOPMENT / MOCK data (Stage 2,
   products only since Stage 4)
   --------------------------------------------------------------------------
   There is no Django backend yet, so this file is the single, clearly
   labelled stand-in that the Dashboard UI reads FOR PRODUCTS. NOTHING
   here is real production business data:

      - PRODUCTS mirrors the storefront SHOP MASTER (product.html
        #fd-shop-grid data-attributes, same 12 ids / names / categories /
        default-variant prices / availability states in|limited|out). It is
        kept as a static copy on purpose: the admin never loads
        fresh-direct.js, so the customer cart store can never leak into the
        seller area. Django will replace this list with real product rows.
      - ORDERS below are Stage 2 illustrative placeholders, RETAINED ONLY
        so the file's history stays intact. Since Stage 4 they are NOT
        read anywhere: the dashboard and the Orders pages share the one
        order service (fd-admin-orders-data.js, checkout snapshots kept
        in this browser). Do not add new consumers of ORDERS here.
       reference, customer, placedAt, total, payment + order status.
       Names, dates and totals are invented for layout only. The status
       vocabulary is reused EXACTLY from the customer confirmation flow
       (whatsapp-submitted | pending | failed | paid) so no conflicting
       order architecture is introduced.
     - "Orders needing attention" = whatsapp-submitted + pending
       (awaiting a seller reply or payment verification). Paid and failed
       are terminal and are shown honestly without counting as action.

   DJANGO INTEGRATION (later stage, no dashboard redesign needed):
     - Delete this file's contents as a source and make
       loadDashboardData() in fd-admin-dashboard.js fetch the Django
       endpoints instead (summary from real queries, recent orders from
       real order rows, availability from real product rows).
     - Keep the snapshot shape { summary, recentOrders, products,
       attentionItems, meta } identical so every renderer below is reused.
   ========================================================================== */
(function () {
  "use strict";

  /* Hours/days are relative to NOW so "recent" stays true without claiming
     real timestamps. Offsets only — the moments themselves are mock. */
  var HOUR = 3600 * 1000;
  var NOW = Date.now();

  var PRODUCTS = [
    { id: "mock-tomatoes", name: "Fresh Tomatoes", category: "Tomatoes", variantLabel: "1kg pack", status: "in" },
    { id: "mock-pepper", name: "Red Scotch Pepper", category: "Peppers", variantLabel: "1kg pack", status: "in" },
    { id: "mock-onions", name: "Sweet Onions", category: "Onions", variantLabel: "2kg pack", status: "in" },
    { id: "mock-ugu", name: "Fresh Ugu Leaves", category: "Vegetables", variantLabel: "Per bunch", status: "limited" },
    { id: "mock-bananas", name: "Ripe Bananas", category: "Fruits", variantLabel: "1 bunch", status: "in" },
    { id: "mock-oranges", name: "Fresh Oranges", category: "Fruits", variantLabel: "2kg pack", status: "in" },
    { id: "mock-yam", name: "White Yam", category: "Tubers", variantLabel: "Per tuber", status: "in" },
    { id: "mock-pineapple", name: "Ripe Pineapple", category: "Fruits", variantLabel: "Per piece", status: "in" },
    { id: "mock-tatashe", name: "Tatashe Peppers", category: "Peppers", variantLabel: "1kg pack", status: "out" },
    { id: "mock-spring-onions", name: "Spring Onions", category: "Vegetables", variantLabel: "Per bunch", status: "in" },
    { id: "mock-cassava", name: "Cassava Tubers", category: "Tubers", variantLabel: "3kg pack", status: "in" },
    { id: "mock-scent-leaves", name: "Scent Leaves", category: "Herbs & Spices", variantLabel: "Per bunch", status: "in" }
  ];

  /* Static development stand-ins for the two new overview metrics.
     Django will replace these with real queries (blog post count,
     unread product-review count). Numbers are illustrative only. */
  var BLOG_POSTS = 6;
  var UNREAD_REVIEWS = 3;

  var ORDERS = [
    {
      ref: "FD-7K2PQA",
      customer: "Adaeze Okafor",
      placedAt: new Date(NOW - 2 * HOUR).toISOString(),
      total: 8900,
      paymentStatus: "unpaid",
      orderStatus: "whatsapp-submitted"
    },
    {
      ref: "FD-3M8RTX",
      customer: "Emeka Nwosu",
      placedAt: new Date(NOW - 6 * HOUR).toISOString(),
      total: 4500,
      paymentStatus: "pending",
      orderStatus: "pending"
    },
    {
      ref: "FD-9Q4WED",
      customer: "Fatima Sule",
      placedAt: new Date(NOW - 26 * HOUR).toISOString(),
      total: 12300,
      paymentStatus: "paid",
      orderStatus: "paid"
    },
    {
      ref: "FD-2Z6HJK",
      customer: "Tunde Adeyemi",
      placedAt: new Date(NOW - 30 * HOUR).toISOString(),
      total: 2800,
      paymentStatus: "unpaid",
      orderStatus: "whatsapp-submitted"
    },
    {
      ref: "FD-5N1CVB",
      customer: "Ngozi Eze",
      placedAt: new Date(NOW - 49 * HOUR).toISOString(),
      total: 6100,
      paymentStatus: "failed",
      orderStatus: "failed"
    }
  ];

  window.FreshDirectAdminDashboardMock = {
    /* Hard label so no consumer can mistake this for live data. */
    source: "development-mock",
    sourceNote:
      "Illustrative placeholders for layout only. Replace with Django queries.",
    products: PRODUCTS,
    orders: ORDERS,
    blogPosts: BLOG_POSTS,
    unreadReviews: UNREAD_REVIEWS
  };
})();
