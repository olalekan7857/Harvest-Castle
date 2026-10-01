/* ==========================================================================
   Harvest Castle Admin — Product source boundary (Stage 3A foundation)
   --------------------------------------------------------------------------
   There is no Django backend yet. The established source of truth is
   FD_CATALOG in assets/js/fresh-direct.js (canonical shape
   `{ id: { id, name, category, status, badge?, defaultVariant, desc,
   images[], variants[] } }`, exposed as window.FreshDirectCatalog).

   The admin NEVER loads fresh-direct.js (Stage 1/2 isolation rule: the
   customer cart store must not leak into the seller area), so this file
   keeps a clearly-marked DEVELOPMENT MIRROR in that exact canonical
   shape — not a second model. The mirror is verified field-for-field
   against the real FD_CATALOG (same ids, names, categories, statuses,
   badges, default variants, descriptions, images, variants, prices),
   so the two can never silently diverge.

   getCatalog() prefers a live window.FreshDirectCatalog when one is
   present (future shared bundle or Django-injected JSON) and falls back
   to the mirror otherwise. The list UI below only ever sees the
   canonical shape through getCatalog().

   DJANGO INTEGRATION (later stage, no list-UI rebuild needed):
     - Make getCatalog() fetch/return the Django product payload in this
       same canonical shape (or have Django inject window.FreshDirectCatalog).
     - The adapter in fd-admin-products.js and every renderer is reused
       untouched. Do NOT hardcode endpoint URLs here.
   ========================================================================== */
(function () {
  "use strict";

  /* Development mirror of FD_CATALOG — same ids, names, categories,
     statuses, badges, default variants, descriptions, images and
     product-specific variants. Prices illustrative until Django owns them.
     status: "in" | "limited" | "out" (never invent counts). */
  var MIRROR = {
    "mock-tomatoes": {
      id: "mock-tomatoes",
      name: "Fresh Tomatoes",
      category: "Tomatoes",
      status: "in",
      badge: "Fresh",
      defaultVariant: "1kg",
      desc: "Fresh red tomatoes, picked ripe and handled carefully. An everyday staple for stews, sauces and salads.",
      images: [{ src: "assets/img/product/product-1-1.png", alt: "Fresh red tomatoes", w: 203, h: 190 }],
      variants: [
        { id: "0.5kg", label: "0.5kg", price: 1200 },
        { id: "1kg", label: "1kg", price: 2500 },
        { id: "2kg", label: "2kg", price: 4800 },
        { id: "5kg", label: "5kg", price: 11500 }
      ]
    },
    "mock-pepper": {
      id: "mock-pepper",
      name: "Red Scotch Pepper",
      category: "Peppers",
      status: "in",
      badge: "Fresh",
      defaultVariant: "1kg",
      desc: "Hot red scotch peppers for soups, stews and sauces. Choose the pack size you need.",
      images: [{ src: "assets/img/product/product-1-2.png", alt: "Fresh red scotch peppers", w: 212, h: 190 }],
      variants: [
        { id: "0.5kg", label: "0.5kg", price: 1700 },
        { id: "1kg", label: "1kg", price: 3200 },
        { id: "2kg", label: "2kg", price: 6200 }
      ]
    },
    "mock-onions": {
      id: "mock-onions",
      name: "Sweet Onions",
      category: "Onions",
      status: "in",
      defaultVariant: "2kg",
      desc: "Firm sweet onions for cooking and salads. Choose the pack size you need.",
      images: [{ src: "assets/img/product/product-1-3.png", alt: "Fresh sweet onions", w: 201, h: 190 }],
      variants: [
        { id: "1kg", label: "1kg", price: 1500 },
        { id: "2kg", label: "2kg", price: 2800 },
        { id: "5kg", label: "5kg", price: 6800 }
      ]
    },
    "mock-ugu": {
      id: "mock-ugu",
      name: "Fresh Ugu Leaves",
      category: "Vegetables",
      status: "limited",
      defaultVariant: "bunch",
      desc: "Freshly harvested ugu leaves, sold per bunch. Best used soon after delivery.",
      images: [{ src: "assets/img/product/product-1-4.png", alt: "Fresh ugu leaves", w: 240, h: 190 }],
      variants: [{ id: "bunch", label: "Per bunch", price: 800 }]
    },
    "mock-bananas": {
      id: "mock-bananas",
      name: "Ripe Bananas",
      category: "Fruits",
      status: "in",
      defaultVariant: "bunch",
      desc: "Ripe bananas, sold per bunch. Good for eating fresh and for smoothies.",
      images: [{ src: "assets/img/product/product-1-5.png", alt: "Ripe yellow bananas", w: 110, h: 190 }],
      variants: [
        { id: "bunch", label: "1 bunch", price: 1500 },
        { id: "3bunch", label: "3 bunches", price: 4200 }
      ]
    },
    "mock-oranges": {
      id: "mock-oranges",
      name: "Fresh Oranges",
      category: "Fruits",
      status: "in",
      defaultVariant: "2kg",
      desc: "Juicy fresh oranges, sold by weight. Choose the pack size you need.",
      images: [{ src: "assets/img/product/product-1-6.png", alt: "Fresh juicy oranges", w: 173, h: 190 }],
      variants: [
        { id: "1kg", label: "1kg", price: 1100 },
        { id: "2kg", label: "2kg", price: 2000 },
        { id: "5kg", label: "5kg", price: 4800 }
      ]
    },
    "mock-yam": {
      id: "mock-yam",
      name: "White Yam",
      category: "Tubers",
      status: "in",
      defaultVariant: "tuber",
      desc: "Whole white yam tubers, sold per tuber.",
      images: [{ src: "assets/img/product/product-1-7.png", alt: "Fresh white yam tubers", w: 134, h: 190 }],
      variants: [{ id: "tuber", label: "Per tuber", price: 4500 }]
    },
    "mock-pineapple": {
      id: "mock-pineapple",
      name: "Ripe Pineapple",
      category: "Fruits",
      status: "in",
      defaultVariant: "piece",
      desc: "Ripe pineapples, sold per piece.",
      images: [{ src: "assets/img/product/product-1-8.png", alt: "Ripe pineapple", w: 210, h: 190 }],
      variants: [{ id: "piece", label: "Per piece", price: 1200 }]
    },
    "mock-tatashe": {
      id: "mock-tatashe",
      name: "Tatashe Peppers",
      category: "Peppers",
      status: "out",
      defaultVariant: "1kg",
      desc: "Mild tatashe peppers for stews and sauces. Currently out of stock — message us and we will let you know when it returns.",
      images: [{ src: "assets/img/product/product-1-2.png", alt: "Tatashe peppers, currently out of stock", w: 212, h: 190 }],
      variants: [
        { id: "0.5kg", label: "0.5kg", price: 1500 },
        { id: "1kg", label: "1kg", price: 2800 }
      ]
    },
    "mock-spring-onions": {
      id: "mock-spring-onions",
      name: "Spring Onions",
      category: "Vegetables",
      status: "in",
      defaultVariant: "bunch",
      desc: "Fresh spring onions, sold per bunch.",
      images: [{ src: "assets/img/product/product-1-3.png", alt: "Fresh spring onions", w: 201, h: 190 }],
      variants: [{ id: "bunch", label: "Per bunch", price: 600 }]
    },
    "mock-cassava": {
      id: "mock-cassava",
      name: "Cassava Tubers",
      category: "Tubers",
      status: "in",
      defaultVariant: "3kg",
      desc: "Fresh cassava tubers, sold by weight. Choose the pack size you need.",
      images: [{ src: "assets/img/product/product-1-7.png", alt: "Fresh cassava tubers", w: 134, h: 190 }],
      variants: [
        { id: "2kg", label: "2kg", price: 1700 },
        { id: "3kg", label: "3kg", price: 2400 },
        { id: "5kg", label: "5kg", price: 3800 }
      ]
    },
    "mock-scent-leaves": {
      id: "mock-scent-leaves",
      name: "Scent Leaves",
      category: "Herbs & Spices",
      status: "in",
      defaultVariant: "bunch",
      desc: "Fragrant scent leaves, sold per bunch.",
      images: [{ src: "assets/img/product/product-1-4.png", alt: "Fresh scent leaves", w: 240, h: 190 }],
      variants: [{ id: "bunch", label: "Per bunch", price: 500 }]
    }
  };

  /* The single product source the admin reads: the built-in catalog plus
     anything the seller created or edited in this browser (via
     window.FreshDirectAdminStore). A fresh object is returned every time
     so no caller can mutate the built-in mirror. */
  function getCatalog() {
    var base;
    if (
      window.FreshDirectCatalog &&
      typeof window.FreshDirectCatalog === "object" &&
      Object.keys(window.FreshDirectCatalog).length
    ) {
      base = window.FreshDirectCatalog;
    } else {
      base = MIRROR;
    }
    var out = {};
    var ids = Object.keys(base);
    for (var i = 0; i < ids.length; i++) {
      out[ids[i]] = base[ids[i]];
    }
    try {
      if (window.FreshDirectAdminStore && window.FreshDirectAdminStore.getLocal) {
        var local = window.FreshDirectAdminStore.getLocal() || {};
        var localIds = Object.keys(local);
        for (var j = 0; j < localIds.length; j++) {
          out[localIds[j]] = local[localIds[j]];
        }
      }
    } catch (e) {
      /* Seller-kept items unavailable — the built-in catalog still shows. */
    }
    return out;
  }

  window.FreshDirectAdminProducts = {
    /* Hard label so no consumer can mistake the fallback for live data. */
    source: "development-mock",
    sourceNote:
      "Development mirror of FD_CATALOG for layout only. Replace with Django data.",
    mirror: MIRROR,
    getCatalog: getCatalog
  };
})();
