/* ==========================================================================
   Harvest Castle Admin — Product List (Stage 3A list; Stage 3B wired Edit)
   --------------------------------------------------------------------------
   Presentation: one semantic list — each product renders as a single
   bordered card (<li class="fd-prod-card">). Hierarchy inside the card
   comes from spacing and typography only: no table, no cell dividers,
   no inner boxes, so product information can never touch a nested
   border line. Variant chips are borderless and pair every variant
   label with its own price; the price line shows the honest full
   range (or the single price). The same list reflows from a
   multi-column desktop row to a stacked mobile card via scoped CSS.
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   Layers (kept separate on purpose):
     1. adapter    - canonical catalog entry -> admin row model (one place;
                      variants stay product-specific, never flattened).
     2. filter     - search + category + availability intersection.
     3. sort       - default / name A-Z / name Z-A / price range.
     4. render     - rows, category options, count, empty states.
     5. interact   - toolbar wiring, clear-filters, retry.

   Data boundary: loadProducts() is the ONLY place the UI meets data.
   Today it reads window.FreshDirectAdminProducts.getCatalog() (canonical
   FD_CATALOG shape). Django stage: point getCatalog() at the backend
   payload in the same shape; every function below is reused untouched.

   Row model (all display values derived — nothing invented):
     { id, name, category, desc, status, badge, image{src,alt,w,h},
       variants[{id,label,price}], defaultVariant{id,label,price}|null,
       priceMin, priceMax, variantCount }
   Price basis for sorting and ranges is priceMin (documented in the UI
   via the "From" wording only where a single figure shows; ranges show
   the full min–max span so no price is misrepresented).

   Manual QA scenarios (?mock=... on admin-products.html):
     normal (default) | empty | error
   ========================================================================== */
(function () {
  "use strict";

  var SORT_DEFAULT = "default";

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

  /* ---------- 1. Adapter ---------- */
  /* Default-variant lookup mirrors fdDefaultVariant() in fresh-direct.js
     (kept local so the admin never depends on the customer bundle; an
     automated check asserts both agree on every catalog entry). */
  function defaultVariantOf(entry) {
    var variants = entry.variants || [];
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].id === entry.defaultVariant) {
        return variants[i];
      }
    }
    return variants[0] || null;
  }

  function adminRowFromEntry(entry) {
    var variants = (entry.variants || []).slice();
    var prices = [];
    for (var i = 0; i < variants.length; i++) {
      if (isFinite(variants[i].price)) {
        prices.push(variants[i].price);
      }
    }
    var image = (entry.images && entry.images[0]) || { src: "", alt: entry.name };
    return {
      id: entry.id,
      name: entry.name,
      category: entry.category || "Uncategorised",
      desc: entry.desc || "",
      status: entry.status || "in",
      badge: entry.badge || "",
      image: {
        src: image.src || "",
        alt: image.alt || entry.name,
        w: image.w || 0,
        h: image.h || 0
      },
      variants: variants,
      defaultVariant: defaultVariantOf(entry),
      priceMin: prices.length ? Math.min.apply(null, prices) : 0,
      priceMax: prices.length ? Math.max.apply(null, prices) : 0,
      variantCount: variants.length
    };
  }

  /* Availability language mirrors pdpStatusMeta() (Available / Limited /
     Out of Stock) with the dashboard pill tones. Text never relies on
     color alone. */
  function availabilityBadge(status) {
    if (status === "out") {
      return { label: "Out of Stock", tone: "is-bad" };
    }
    if (status === "limited") {
      return { label: "Limited", tone: "is-warn" };
    }
    return { label: "Available", tone: "is-ok" };
  }

  function priceText(row) {
    if (!row.variantCount) {
      return "Price unavailable";
    }
    if (row.priceMin === row.priceMax) {
      return fmtNaira(row.priceMin);
    }
    return fmtNaira(row.priceMin) + " – " + fmtNaira(row.priceMax);
  }

  function variantText(row) {
    if (!row.variantCount) {
      return "No variants";
    }
    var labels = [];
    for (var i = 0; i < row.variants.length; i++) {
      labels.push(row.variants[i].label);
    }
    return labels.join(" · ") + (row.variantCount > 1 ? " (" + row.variantCount + ")" : "");
  }

  /* ---------- Data boundary ---------- */
  function readScenario() {
    try {
      var params = new URLSearchParams(window.location.search);
      var mock = params.get("mock") || "normal";
      if (mock === "empty" || mock === "error") {
        return mock;
      }
    } catch (e) {
      /* URL parsing unavailable — fall through to normal. */
    }
    return "normal";
  }

  function loadProducts(scenario) {
    /* DJANGO SEAM: getCatalog() becomes the backend payload; this
       function's contract (array of admin rows, catalog order) stays. */
    if (scenario === "error") {
      var err = new Error("Product data could not be loaded.");
      err.code = "PRODUCTS_LOAD_FAILED";
      throw err;
    }
    var source =
      (window.FreshDirectAdminProducts &&
        window.FreshDirectAdminProducts.getCatalog()) ||
      {};
    var ids = Object.keys(source);
    if (scenario === "empty") {
      ids = [];
    }
    var rows = [];
    for (var i = 0; i < ids.length; i++) {
      if (source[ids[i]]) {
        rows.push(adminRowFromEntry(source[ids[i]]));
      }
    }
    return rows;
  }

  /* ---------- 2 + 3. Filter + sort (pure; same conventions as Shop) ---------- */
  function matches(row, state) {
    if (
      state.avail !== "all" &&
      (row.status || "in") !== state.avail
    ) {
      return false;
    }
    if (state.cat !== "all" && (row.category || "") !== state.cat) {
      return false;
    }
    if (state.q) {
      var needle = String(state.q).toLowerCase();
      var haystack = (
        row.name +
        " " +
        row.category +
        " " +
        row.id +
        " " +
        variantText(row)
      ).toLowerCase();
      if (haystack.indexOf(needle) === -1) {
        return false;
      }
    }
    return true;
  }

  function sortRows(rows, sort) {
    var out = rows.slice();
    if (sort === "name-asc") {
      out.sort(function (a, b) {
        var an = a.name.toLowerCase();
        var bn = b.name.toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
    } else if (sort === "name-desc") {
      out.sort(function (a, b) {
        var an = a.name.toLowerCase();
        var bn = b.name.toLowerCase();
        return an > bn ? -1 : an < bn ? 1 : 0;
      });
    } else if (sort === "price-asc") {
      out.sort(function (a, b) {
        return a.priceMin - b.priceMin;
      });
    } else if (sort === "price-desc") {
      out.sort(function (a, b) {
        return b.priceMin - a.priceMin;
      });
    }
    /* SORT_DEFAULT keeps catalog order (the Shop "Featured" order). */
    return out;
  }

  function isPristine(state) {
    return (
      state.q === "" &&
      state.cat === "all" &&
      state.avail === "all" &&
      state.sort === SORT_DEFAULT
    );
  }

  /* ---------- 4. Render ---------- */
  function pill(label, tone) {
    return (
      '<span class="fd-dash-pill' +
      (tone ? " " + tone : "") +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  function buildCategoryOptions(select, rows) {
    if (!select) {
      return;
    }
    var seen = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].category && seen.indexOf(rows[i].category) === -1) {
        seen.push(rows[i].category);
      }
    }
    seen.sort();
    select.innerHTML = "";
    var all = document.createElement("option");
    all.value = "all";
    all.textContent = "All Categories";
    select.appendChild(all);
    for (var j = 0; j < seen.length; j++) {
      var opt = document.createElement("option");
      opt.value = seen[j];
      opt.textContent = seen[j];
      select.appendChild(opt);
    }
  }

  /* One bordered card per product — the ONLY border in the item.
     Identity (thumb + name + category) leads, the availability pill sits
     top-right, borderless chips pair each variant label with its own
     price, and the foot holds the honest price range plus actions.
     Edit links to the product editor (?id= stable product ID). Delete
     opens a confirmation modal; the backend performs the real delete. */
  function variantChips(row) {
    if (!row.variantCount) {
      return '<p class="fd-prod-no-variants">No variants</p>';
    }
    var items = "";
    for (var i = 0; i < row.variants.length; i++) {
      var v = row.variants[i];
      var vPrice = isFinite(v.price)
        ? fmtNaira(v.price)
        : "Price unavailable";
      items +=
        "<li>" +
        '<span class="fd-prod-var-label">' +
        esc(v.label) +
        "</span>" +
        '<span class="fd-prod-var-price">' +
        esc(vPrice) +
        "</span>" +
        "</li>";
    }
    return (
      '<ul class="fd-prod-variants" aria-label="Variants and prices for ' +
      esc(row.name) +
      '">' +
      items +
      "</ul>"
    );
  }

  function rowHtml(row) {
    var badge = availabilityBadge(row.status);
    /* Seller-kept photos live on the seller's device only, so a stored
       filename may resolve to nothing — hide the broken thumb instead of
       showing a broken-image icon. */
    var img = row.image.src
      ? '<img src="' +
        esc(row.image.src) +
        '" alt="' +
        esc(row.image.alt) +
        '" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">'
      : "";
    /* Items kept in this browser have no customer page yet (customer pages
       read the static storefront catalog until the backend connects), so
       View is offered only for built-in products. Edit always works. */
    var sellerKept = false;
    try {
      sellerKept = !!(
        window.FreshDirectAdminStore &&
        window.FreshDirectAdminStore.isLocal &&
        window.FreshDirectAdminStore.isLocal(row.id)
      );
    } catch (e) {
      sellerKept = false;
    }
    var viewBtn = sellerKept
      ? ""
      : '<a class="fd-prod-btn" href="product-details.html?id=' +
        encodeURIComponent(row.id) +
        '" target="_blank" rel="noopener" aria-label="View ' +
        esc(row.name) +
        ' on the storefront">' +
        '<i class="far fa-eye" aria-hidden="true"></i>View</a>';
    return (
      '<li class="fd-prod-card">' +
      '<div class="fd-prod-card-top">' +
      '<span class="fd-prod-thumb" aria-hidden="true">' +
      img +
      "</span>" +
      '<div class="fd-prod-id-block">' +
      '<h3 class="fd-prod-name">' +
      esc(row.name) +
      "</h3>" +
      '<p class="fd-prod-cat">' +
      esc(row.category) +
      "</p>" +
      "</div>" +
      pill(badge.label, badge.tone) +
      "</div>" +
      variantChips(row) +
      '<div class="fd-prod-card-foot">' +
      '<p class="fd-prod-price"><span class="visually-hidden">Price: </span>' +
      esc(priceText(row)) +
      "</p>" +
      '<div class="fd-prod-actions">' +
      viewBtn +
      '<a class="fd-prod-btn" href="admin-product-edit.html?id=' +
      encodeURIComponent(row.id) +
      '" aria-label="Edit ' +
      esc(row.name) +
      ' in the product editor">' +
      '<i class="far fa-edit" aria-hidden="true"></i>Edit</a>' +
      '<button type="button" class="fd-prod-btn is-danger" data-delete-id="' +
      esc(row.id) +
      '" data-delete-name="' +
      esc(row.name) +
      '" aria-label="Delete ' +
      esc(row.name) +
      '">' +
      '<i class="far fa-trash-alt" aria-hidden="true"></i>Delete</button>' +
      "</div>" +
      "</div>" +
      "</li>"
    );
  }

  /* ---------- Page controller ---------- */
  var allRows = [];
  var filterState = { q: "", cat: "all", avail: "all", sort: SORT_DEFAULT };

  function el(id) {
    return document.getElementById(id);
  }

  function applyAndRender() {
    var list = el("fd-prod-list");
    var listWrap = el("fd-prod-list-wrap");
    var noneAll = el("fd-prod-empty-all");
    var noneFiltered = el("fd-prod-empty-filtered");
    var count = el("fd-prod-count");
    var clear = el("fd-prod-clear");
    if (!list || !listWrap || !noneAll || !noneFiltered) {
      return;
    }
    var visible = sortRows(
      allRows.filter(function (row) {
        return matches(row, filterState);
      }),
      filterState.sort
    );
    if (count) {
      count.textContent =
        "Showing " + visible.length + " of " + allRows.length + " products.";
    }
    if (clear) {
      if (isPristine(filterState)) {
        clear.setAttribute("disabled", "");
      } else {
        clear.removeAttribute("disabled");
      }
    }
    if (!allRows.length) {
      /* No products at all: the catalog is empty, not the filter. */
      listWrap.setAttribute("hidden", "");
      noneFiltered.setAttribute("hidden", "");
      noneAll.removeAttribute("hidden");
      list.innerHTML = "";
      return;
    }
    noneAll.setAttribute("hidden", "");
    if (!visible.length) {
      listWrap.setAttribute("hidden", "");
      list.innerHTML = "";
      noneFiltered.removeAttribute("hidden");
      return;
    }
    noneFiltered.setAttribute("hidden", "");
    listWrap.removeAttribute("hidden");
    var html = "";
    for (var i = 0; i < visible.length; i++) {
      html += rowHtml(visible[i]);
    }
    list.innerHTML = html;
  }

  function resetFilters() {
    filterState = { q: "", cat: "all", avail: "all", sort: SORT_DEFAULT };
    var search = el("fd-prod-search");
    var cat = el("fd-prod-cat");
    var avail = el("fd-prod-avail");
    var sort = el("fd-prod-sort");
    if (search) {
      search.value = "";
    }
    if (cat) {
      cat.value = "all";
    }
    if (avail) {
      avail.value = "all";
    }
    if (sort) {
      sort.value = SORT_DEFAULT;
    }
    applyAndRender();
  }

  /* ---------- Page states ---------- */
  function showLoading(on) {
    var loading = el("fd-prod-loading");
    var content = el("fd-prod-content");
    var error = el("fd-prod-error");
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
    var loading = el("fd-prod-loading");
    var content = el("fd-prod-content");
    var error = el("fd-prod-error");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (error) {
      error.removeAttribute("hidden");
      var retry = el("fd-prod-retry");
      if (retry) {
        retry.focus();
      }
    }
  }

  /* ---------- 5. Interactions ---------- */
  function wireToolbar() {
    var search = el("fd-prod-search");
    var cat = el("fd-prod-cat");
    var avail = el("fd-prod-avail");
    var sort = el("fd-prod-sort");
    var clear = el("fd-prod-clear");
    var resetEmpty = el("fd-prod-reset-empty");
    var debounce = null;

    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(function () {
          filterState.q = search.value.trim().toLowerCase();
          applyAndRender();
        }, 150);
      });
      /* Clearing via the native search-field X fires input too; Escape
         always resets the field for keyboard users. */
      search.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && search.value) {
          search.value = "";
          filterState.q = "";
          applyAndRender();
        }
      });
    }
    if (cat) {
      cat.addEventListener("change", function () {
        filterState.cat = cat.value;
        applyAndRender();
      });
    }
    if (avail) {
      avail.addEventListener("change", function () {
        filterState.avail = avail.value;
        applyAndRender();
      });
    }
    if (sort) {
      sort.addEventListener("change", function () {
        filterState.sort = sort.value;
        applyAndRender();
      });
    }
    if (clear) {
      clear.addEventListener("click", resetFilters);
    }
    if (resetEmpty) {
      resetEmpty.addEventListener("click", function () {
        resetFilters();
        if (search) {
          search.focus();
        }
      });
    }
  }

  function wireRetry() {
    var retry = el("fd-prod-retry");
    if (!retry) {
      return;
    }
    retry.addEventListener("click", function () {
      /* Retry the same product request (the future backend re-issues its
         fetch here instead). */
      initWith("normal");
    });
  }

  /* Delete confirmation modal: Django performs the real deletion.
     Static demo removes the card from the current view (and drops any
     seller-kept copy) so the confirmation is truthful in this browser. */
  var pendingDeleteId = null;
  var pendingDeleteName = "";
  var lastDeleteFocus = null;

  function openDeleteModal(id, name) {
    var modal = el("fd-delete-modal");
    var text = el("fd-delete-text");
    if (!modal) {
      return;
    }
    pendingDeleteId = id;
    pendingDeleteName = name || id;
    if (text) {
      text.textContent = '"' + pendingDeleteName + '" will be permanently removed. This cannot be undone.';
    }
    lastDeleteFocus = document.activeElement;
    modal.removeAttribute("hidden");
    var cancel = el("fd-delete-cancel");
    if (cancel) {
      cancel.focus();
    }
  }

  function closeDeleteModal() {
    var modal = el("fd-delete-modal");
    if (!modal) {
      return;
    }
    modal.setAttribute("hidden", "");
    pendingDeleteId = null;
    if (lastDeleteFocus && lastDeleteFocus.focus) {
      try {
        lastDeleteFocus.focus();
      } catch (e) {}
    }
  }

  function wireDeleteModal() {
    var list = el("fd-prod-list");
    var modal = el("fd-delete-modal");
    if (!list || !modal) {
      return;
    }
    list.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-delete-id]") : null;
      if (!btn) {
        return;
      }
      openDeleteModal(btn.getAttribute("data-delete-id"), btn.getAttribute("data-delete-name"));
    });
    var cancel = el("fd-delete-cancel");
    var scrim = el("fd-delete-scrim");
    var confirm = el("fd-delete-confirm");
    if (cancel) {
      cancel.addEventListener("click", closeDeleteModal);
    }
    if (scrim) {
      scrim.addEventListener("click", closeDeleteModal);
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && modal && !modal.hasAttribute("hidden")) {
        closeDeleteModal();
      }
    });
    if (confirm) {
      confirm.addEventListener("click", function () {
        if (!pendingDeleteId) {
          closeDeleteModal();
          return;
        }
        /* Drop any seller-kept copy so a reload stays consistent. */
        try {
          if (window.FreshDirectAdminStore && window.FreshDirectAdminStore.isLocal(pendingDeleteId)) {
            var store = null;
            try {
              store = window.localStorage;
            } catch (e) {
              store = null;
            }
            if (store) {
              var raw = store.getItem(window.FreshDirectAdminStore.key);
              if (raw) {
                var data = JSON.parse(raw);
                if (data && data.products && data.products[pendingDeleteId]) {
                  delete data.products[pendingDeleteId];
                  store.setItem(window.FreshDirectAdminStore.key, JSON.stringify(data));
                }
              }
            }
          }
        } catch (e) {}
        /* Remove from the current view; Django deletes the real row. */
        for (var i = 0; i < allRows.length; i++) {
          if (allRows[i].id === pendingDeleteId) {
            allRows.splice(i, 1);
            break;
          }
        }
        closeDeleteModal();
        applyAndRender();
      });
    }
  }

  function initWith(scenario) {
    showLoading(true);
    var rows;
    try {
      rows = loadProducts(scenario);
    } catch (e) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(false);
    allRows = rows;
    filterState = { q: "", cat: "all", avail: "all", sort: SORT_DEFAULT };
    buildCategoryOptions(el("fd-prod-cat"), allRows);
    var content = el("fd-prod-content");
    if (content) {
      content.removeAttribute("hidden");
    }
    /* Toolbar may already hold values after a retry; re-read them so a
       retry never silently changes what the seller sees. */
    var search = el("fd-prod-search");
    var cat = el("fd-prod-cat");
    var avail = el("fd-prod-avail");
    var sort = el("fd-prod-sort");
    if (search) {
      search.value = "";
    }
    if (cat) {
      cat.value = "all";
    }
    if (avail) {
      avail.value = "all";
    }
    if (sort) {
      sort.value = SORT_DEFAULT;
    }
    applyAndRender();
  }

  function init() {
    if (!el("fd-prod-content")) {
      return;
    }
    wireToolbar();
    wireRetry();
    wireDeleteModal();
    initWith(readScenario());
  }

  /* Testable seam: Django integration plus automated checks use these. */
  window.FreshDirectAdminProductsList = {
    load: loadProducts,
    adapt: adminRowFromEntry,
    matches: matches,
    sort: sortRows,
    render: applyAndRender,
    reset: resetFilters,
    scenario: readScenario,
    badge: availabilityBadge
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
