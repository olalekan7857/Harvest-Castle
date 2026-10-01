/* ==========================================================================
   Harvest Castle Admin — Dashboard renderer (Stage 2)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   Boundary:
     loadDashboardData(scenario) is the ONLY place the UI meets data.
     Products still read the development placeholders (plus seller-kept
     items) and derive every number on the page — no hardcoded metric
     lives in markup. Orders read the shared Stage 4 order service
     (window.FreshDirectAdminOrders), the same source the Orders pages
     use. Django stage: replace the bodies of the product read and the
     order-service internals with fetch() calls that resolve the SAME
     snapshot shape { summary, recentOrders, products, attentionItems,
     meta }; every render*() function below is reused untouched.

    Snapshot shape:
      summary: { totalProducts, availableProducts, outOfStockProducts,
                 ordersNeedingAttention, blogPosts, unreadReviews }
     recentOrders: [{ ref, customer, placedAt, total, paymentStatus,
                      orderStatus }] (newest first, max 5)
     products: [{ id, name, category, variantLabel, status }]
     attentionItems: [{ kind: "order"|"product", text, detail }]
     meta: { source } — always surfaced in the UI boundary note.

   Manual QA scenarios (?mock=... on admin-dashboard.html):
     normal (default) | empty-orders | empty-products | empty-all | error
   ========================================================================== */
(function () {
  "use strict";

  var MAX_ORDERS = 5;
  var MAX_PRODUCTS = 6;
  var ATTENTION_STATUSES = ["whatsapp-submitted", "pending"];

  /* ---------- Small local helpers (admin copies; no customer dep) ---------- */
  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    });
  }

  function fmtNaira(n) {
    return "\u20A6" + Number(n).toLocaleString("en-NG");
  }

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) {
      return "Date unavailable";
    }
    return d.toLocaleString("en-NG", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  /* ---------- Status language (reused from confirmation flow) ---------- */
  function orderBadge(status) {
    if (status === "paid") {
      return { label: "Paid", tone: "is-ok" };
    }
    if (status === "pending") {
      return { label: "Payment pending", tone: "is-warn" };
    }
    if (status === "failed") {
      return { label: "Payment failed", tone: "is-bad" };
    }
    /* whatsapp-submitted + anything unknown: neutral, never alarming. */
    return { label: "WhatsApp order", tone: "is-muted" };
  }

  function paymentBadge(status) {
    if (status === "paid") {
      return { label: "Paid", tone: "is-ok" };
    }
    if (status === "pending") {
      return { label: "Pending", tone: "is-warn" };
    }
    if (status === "failed") {
      return { label: "Failed", tone: "is-bad" };
    }
    if (status === "unverified") {
      /* Paid claimed but no backend verification — honest, never "Paid". */
      return { label: "Unverified", tone: "is-warn" };
    }
    return { label: "Unpaid", tone: "is-muted" };
  }
  function availabilityBadge(status) {
    if (status === "out") {
      return { label: "Out of Stock", tone: "is-bad" };
    }
    if (status === "limited") {
      return { label: "Limited", tone: "is-warn" };
    }
    return { label: "Available", tone: "is-ok" };
  }

  /* Preview ordering only: out-of-stock first, then limited, then
     available. Never invents quantities — status only. */
  function productRank(status) {
    if (status === "out") {
      return 2;
    }
    if (status === "limited") {
      return 1;
    }
    return 0;
  }

  /* ---------- Data boundary ---------- */
  function readScenario() {
    try {
      var params = new URLSearchParams(window.location.search);
      var mock = params.get("mock") || "normal";
      if (
        mock === "empty-orders" ||
        mock === "empty-products" ||
        mock === "empty-all" ||
        mock === "error"
      ) {
        return mock;
      }
    } catch (e) {
      /* URL parsing unavailable — fall through to normal. */
    }
    return "normal";
  }

  /* Orders come from the SAME order service the Orders pages use
     (window.FreshDirectAdminOrders, Stage 4: checkout snapshots kept in
     this browser). There is deliberately no dashboard-only order dataset:
     recent orders, attention counts and the Orders pages can never
     disagree. The development placeholders in
     fd-admin-dashboard-data.js are no longer read for orders; they remain
     only as the product-availability fallback until Django owns products.
     Throws when the order service itself cannot load, so the UI shows an
     honest error instead of stale numbers. */
  function readServiceOrders() {
    if (
      !window.FreshDirectAdminOrders ||
      typeof window.FreshDirectAdminOrders.getOrders !== "function"
    ) {
      var missing = new Error("Dashboard data could not be loaded.");
      missing.code = "DASHBOARD_LOAD_FAILED";
      throw missing;
    }
    var list = window.FreshDirectAdminOrders.getOrders();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      var payKey = "unpaid";
      try {
        payKey = window.FreshDirectAdminOrders.paymentMeta(o).key;
      } catch (e) {
        payKey = "unpaid";
      }
      out.push({
        ref: o.id,
        customer: (o.customer && o.customer.name) || "Not provided",
        placedAt: o.placedAt,
        total: o.total,
        paymentStatus: payKey,
        orderStatus: o.status
      });
    }
    return out;
  }

  function loadDashboardData(scenario) {
    /* DJANGO SEAM: replace this body with backend fetching. The resolved
       snapshot shape must stay identical; renderers below do not change. */
    if (scenario === "error") {
      var err = new Error("Dashboard data could not be loaded.");
      err.code = "DASHBOARD_LOAD_FAILED";
      throw err;
    }
    var mock = window.FreshDirectAdminDashboardMock || {
      source: "development-mock",
      products: [],
      orders: []
    };
    var products =
      scenario === "empty-products" || scenario === "empty-all"
        ? []
        : (mock.products || []).slice();
    /* Same order source as the Orders pages — never a dashboard-only copy.
       Empty scenarios stay empty on purpose for QA. */
    var orders =
      scenario === "empty-orders" || scenario === "empty-all"
        ? []
        : readServiceOrders();

    /* Seller-created or edited products (kept in this browser) join the
       overview, so counts stay consistent with the Products page. Empty
       test scenarios stay empty on purpose. */
    if (scenario !== "empty-products" && scenario !== "empty-all") {
      try {
        if (window.FreshDirectAdminStore && window.FreshDirectAdminStore.getLocal) {
          var local = window.FreshDirectAdminStore.getLocal() || {};
          var localIds = Object.keys(local);
          for (var m = 0; m < localIds.length; m++) {
            var entry = local[localIds[m]];
            if (!entry || typeof entry.id !== "string") {
              continue;
            }
            var row = dashboardRowFromEntry(entry);
            var replaced = false;
            for (var r = 0; r < products.length; r++) {
              if (products[r].id === row.id) {
                products[r] = row;
                replaced = true;
              }
            }
            if (!replaced) {
              products.push(row);
            }
          }
        }
      } catch (e) {
        /* Seller-kept items unavailable — the built-in list still shows. */
      }
    }

    orders.sort(function (a, b) {
      return new Date(b.placedAt) - new Date(a.placedAt);
    });

    var available = 0;
    var outOfStock = 0;
    for (var i = 0; i < products.length; i++) {
      if (products[i].status === "out") {
        outOfStock += 1;
      } else {
        /* "in" and "limited" can both be ordered today. */
        available += 1;
      }
    }

    var needingAttention = 0;
    var attentionItems = [];
    for (var j = 0; j < orders.length; j++) {
      if (ATTENTION_STATUSES.indexOf(orders[j].orderStatus) !== -1) {
        needingAttention += 1;
        attentionItems.push({
          kind: "order",
          text: orders[j].ref + " · " + orders[j].customer,
          detail:
            orders[j].orderStatus === "pending"
              ? "Payment awaiting verification."
              : "Waiting for your reply on WhatsApp."
        });
      }
    }
    for (var k = 0; k < products.length; k++) {
      if (products[k].status === "out") {
        attentionItems.push({
          kind: "product",
          text: products[k].name,
          detail: "Currently out of stock."
        });
      }
    }

    return {
      summary: {
        totalProducts: products.length,
        availableProducts: available,
        outOfStockProducts: outOfStock,
        ordersNeedingAttention: needingAttention,
        /* Static stand-ins until Django owns them: blog post count and
           unread review count come from the backend in production. */
        blogPosts: typeof mock.blogPosts === "number" ? mock.blogPosts : 0,
        unreadReviews: typeof mock.unreadReviews === "number" ? mock.unreadReviews : 0
      },
      recentOrders: orders.slice(0, MAX_ORDERS),
      products: products,
      attentionItems: attentionItems,
      meta: { source: mock.source || "development-mock" }
    };
  }

  /* Canonical catalog entry -> dashboard row (same fields the built-in
     dashboard list uses). Keeps seller-kept products consistent with the
     Products page without a second product model. */
  function dashboardRowFromEntry(entry) {
    var variants = (entry && entry.variants) || [];
    var def = null;
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].id === entry.defaultVariant) {
        def = variants[i];
      }
    }
    var shown = def || variants[0] || { label: "" };
    return {
      id: entry.id,
      name: entry.name,
      category: entry.category || "Uncategorised",
      variantLabel: shown.label || "",
      status: entry.status || "in"
    };
  }

  /* ---------- Renderers (pure UI; never compute business rules) ---------- */
  function pill(label, tone) {
    return (
      '<span class="fd-dash-pill' +
      (tone ? " " + tone : "") +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function renderOverview(summary) {
    var host = document.getElementById("fd-dash-cards");
    if (!host) {
      return;
    }
    var cards = [
      {
        icon: "fas fa-box",
        label: "Total products",
        value: String(summary.totalProducts),
        context: "Products in your catalog."
      },
      {
        icon: "fas fa-check-circle",
        label: "Available products",
        value: String(summary.availableProducts),
        context: "Can be ordered right now."
      },
      {
        icon: "fas fa-times-circle",
        label: "Out-of-stock products",
        value: String(summary.outOfStockProducts),
        context: "Unavailable until restocked."
      },
      {
        icon: "fas fa-receipt",
        label: "Orders needing attention",
        value: String(summary.ordersNeedingAttention),
        context: "Awaiting your reply or verification."
      },
      {
        icon: "fas fa-newspaper",
        label: "Blog posts",
        value: String(summary.blogPosts || 0),
        context: "Published articles on the blog."
      },
      {
        icon: "fas fa-star",
        label: "Unread reviews",
        value: String(summary.unreadReviews || 0),
        context: "Customer reviews awaiting review."
      }
    ];
    var html = "";
    for (var i = 0; i < cards.length; i++) {
      html +=
        '<li class="fd-dash-card">' +
        '<span class="fd-dash-card-icon" aria-hidden="true"><i class="' +
        cards[i].icon +
        '"></i></span>' +
        '<span class="fd-dash-card-label">' +
        esc(cards[i].label) +
        "</span>" +
        '<span class="fd-dash-card-value">' +
        esc(cards[i].value) +
        "</span>" +
        '<span class="fd-dash-card-context">' +
        esc(cards[i].context) +
        "</span>" +
        "</li>";
    }
    host.innerHTML = html;
  }

  function renderOrders(orders) {
    var tableHost = document.getElementById("fd-dash-orders-wrap");
    var emptyHost = document.getElementById("fd-dash-orders-empty");
    var count = document.getElementById("fd-dash-orders-count");
    if (!tableHost || !emptyHost) {
      return;
    }
    if (count) {
      count.textContent = orders.length
        ? "Showing " + orders.length + " most recent order" +
          (orders.length === 1 ? "" : "s") + "."
        : "";
    }
    if (!orders.length) {
      tableHost.setAttribute("hidden", "");
      emptyHost.removeAttribute("hidden");
      return;
    }
    emptyHost.setAttribute("hidden", "");
    tableHost.removeAttribute("hidden");
    var tbody = document.getElementById("fd-dash-orders-body");
    if (!tbody) {
      return;
    }
    var html = "";
    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      var ob = orderBadge(o.orderStatus);
      var pb = paymentBadge(o.paymentStatus);
      /* Deep link into the Stage 4 order detail (same ?id= convention as
         the product editor). The reference is URL-encoded; nothing
         private travels in the URL beyond the reference itself. */
      var refHref = "admin-order.html?id=" + encodeURIComponent(o.ref);
      html +=
        "<tr>" +
        '<th scope="row"><a class="fd-orders-ref" href="' +
        esc(refHref) +
        '">' +
        esc(o.ref) +
        "</a></th>" +
        "<td>" +
        esc(o.customer) +
        "</td>" +
        "<td>" +
        esc(fmtDate(o.placedAt)) +
        "</td>" +
        '<td class="is-amount">' +
        esc(fmtNaira(o.total)) +
        "</td>" +
        "<td>" +
        pill(pb.label, pb.tone) +
        "</td>" +
        "<td>" +
        pill(ob.label, ob.tone) +
        "</td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
  }

  function renderProducts(products) {
    var listHost = document.getElementById("fd-dash-products-list");
    var emptyHost = document.getElementById("fd-dash-products-empty");
    var count = document.getElementById("fd-dash-products-count");
    if (!listHost || !emptyHost) {
      return;
    }
    if (count) {
      count.textContent = products.length
        ? "Showing " +
          Math.min(products.length, MAX_PRODUCTS) +
          " of " +
          products.length +
          " products."
        : "";
    }
    if (!products.length) {
      listHost.setAttribute("hidden", "");
      emptyHost.removeAttribute("hidden");
      return;
    }
    emptyHost.setAttribute("hidden", "");
    listHost.removeAttribute("hidden");
    /* Most useful first: unavailable lines surface at the top so the
       preview always shows what needs restocking. Full ordering arrives
       with Product Management sorting. */
    var sorted = products.slice().sort(function (a, b) {
      return productRank(b.status) - productRank(a.status);
    });
    var html = "";
    var shown = sorted.slice(0, MAX_PRODUCTS);
    for (var i = 0; i < shown.length; i++) {
      var p = shown[i];
      var badge = availabilityBadge(p.status);
      html +=
        "<li>" +
        '<div class="fd-dash-product-id">' +
        "<strong>" +
        esc(p.name) +
        "</strong>" +
        "<span>" +
        esc(p.category) +
        " · " +
        esc(p.variantLabel) +
        "</span>" +
        "</div>" +
        pill(badge.label, badge.tone) +
        "</li>";
    }
    listHost.innerHTML = html;
  }

  function renderAttention(items) {
    var listHost = document.getElementById("fd-dash-attention-list");
    var emptyHost = document.getElementById("fd-dash-attention-empty");
    if (!listHost || !emptyHost) {
      return;
    }
    if (!items.length) {
      listHost.setAttribute("hidden", "");
      emptyHost.removeAttribute("hidden");
      return;
    }
    emptyHost.setAttribute("hidden", "");
    listHost.removeAttribute("hidden");
    var html = "";
    for (var i = 0; i < items.length; i++) {
      html +=
        "<li>" +
        '<i class="far fa-bell" aria-hidden="true"></i>' +
        '<div><strong>' +
        esc(items[i].text) +
        "</strong><span>" +
        esc(items[i].detail) +
        "</span></div>" +
        "</li>";
    }
    listHost.innerHTML = html;
  }

  /* ---------- Page states ---------- */
  function showLoading(on) {
    var loading = document.getElementById("fd-dash-loading");
    var content = document.getElementById("fd-dash-content");
    var error = document.getElementById("fd-dash-error");
    if (loading) {
      if (on) {
        loading.removeAttribute("hidden");
      } else {
        loading.setAttribute("hidden", "");
      }
    }
    if (content) {
      content.setAttribute("aria-busy", on ? "true" : "false");
    }
    if (on && error) {
      error.setAttribute("hidden", "");
    }
  }

  function showError() {
    var loading = document.getElementById("fd-dash-loading");
    var content = document.getElementById("fd-dash-content");
    var error = document.getElementById("fd-dash-error");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (error) {
      error.removeAttribute("hidden");
      var retry = document.getElementById("fd-dash-retry");
      if (retry) {
        retry.focus();
      }
    }
  }

  function renderScenario(scenario) {
    showLoading(true);
    var snapshot;
    try {
      snapshot = loadDashboardData(scenario);
    } catch (e) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(false);
    var content = document.getElementById("fd-dash-content");
    if (content) {
      content.removeAttribute("hidden");
    }
    renderOverview(snapshot.summary);
    renderOrders(snapshot.recentOrders);
    renderProducts(snapshot.products);
    renderAttention(snapshot.attentionItems);
  }

  function wireRetry() {
    var retry = document.getElementById("fd-dash-retry");
    if (!retry) {
      return;
    }
    retry.addEventListener("click", function () {
      /* Retry the same overview request (the future backend re-issues its
         fetch here instead). */
      renderScenario("normal");
    });
  }

  function init() {
    if (!document.getElementById("fd-dash-content")) {
      return;
    }
    wireRetry();
    renderScenario(readScenario());
  }

  /* Testable seam: Django integration plus automated checks use these. */
  window.FreshDirectAdminDashboard = {
    load: loadDashboardData,
    render: renderScenario,
    scenario: readScenario
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
