/* ==========================================================================
   Harvest Castle Admin — Orders list renderer (Stage 4)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   Boundary:
     window.FreshDirectAdminOrders (fd-admin-orders-data.js) is the ONLY
     place this UI meets order data. Every number, row and summary on the
     page is derived from getOrders() — no hardcoded counts live in
     markup. Django stage: the service internals become API calls with
     the same signatures; every render*() function below is reused
     untouched.

   Manual QA scenario (?mock=error on admin-orders.html):
     forces the loading-error state to verify the retry path.
   ========================================================================== */
(function () {
  "use strict";

  function svc() {
    return window.FreshDirectAdminOrders || null;
  }

  function esc(text) {
    var s = svc();
    if (s && s.escape) {
      return s.escape(text);
    }
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
    var s = svc();
    if (s && s.formatNaira) {
      return s.formatNaira(n);
    }
    return "\u20A6" + Number(n).toLocaleString("en-NG");
  }

  function fmtDate(iso) {
    var s = svc();
    if (s && s.formatDate) {
      return s.formatDate(iso);
    }
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "Date unavailable" : d.toLocaleString();
  }

  function detailUrl(order) {
    return "admin-order.html?id=" + encodeURIComponent(order.id);
  }

  /* ---------- State ---------- */
  var state = {
    q: "",
    orderStatus: "all",
    paymentStatus: "all",
    delivery: "all",
    sort: "newest"
  };

  var allOrders = [];

  /* ---------- Matching ---------- */
  function matchesSearch(order) {
    if (!state.q) {
      return true;
    }
    var q = state.q;
    var hay = [
      order.id,
      order.customer.name,
      order.customer.phone
    ];
    for (var i = 0; i < hay.length; i++) {
      if ((hay[i] || "").toLowerCase().indexOf(q) !== -1) {
        return true;
      }
    }
    return false;
  }

  function matchesFilters(order) {
    var s = svc();
    if (state.orderStatus !== "all" && order.status !== state.orderStatus) {
      return false;
    }
    if (state.paymentStatus !== "all") {
      var key = s ? s.paymentMeta(order).key : "unpaid";
      if (key !== state.paymentStatus) {
        return false;
      }
    }
    if (state.delivery !== "all" && order.delivery.mode !== state.delivery) {
      return false;
    }
    return true;
  }

  function applySort(list) {
    var out = list.slice();
    if (state.sort === "oldest") {
      out.sort(function (a, b) {
        return new Date(a.placedAt) - new Date(b.placedAt);
      });
    } else if (state.sort === "total-desc") {
      out.sort(function (a, b) {
        return b.total - a.total;
      });
    } else if (state.sort === "total-asc") {
      out.sort(function (a, b) {
        return a.total - b.total;
      });
    } else {
      /* newest (service already returns newest-first; re-assert here so
         the sort control owns the ordering, not load order). */
      out.sort(function (a, b) {
        return new Date(b.placedAt) - new Date(a.placedAt);
      });
    }
    return out;
  }

  function visibleOrders() {
    var kept = [];
    for (var i = 0; i < allOrders.length; i++) {
      if (matchesSearch(allOrders[i]) && matchesFilters(allOrders[i])) {
        kept.push(allOrders[i]);
      }
    }
    return applySort(kept);
  }

  function hasActiveControls() {
    return !!(
      state.q ||
      state.orderStatus !== "all" ||
      state.paymentStatus !== "all" ||
      state.delivery !== "all" ||
      state.sort !== "newest"
    );
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

  function renderSummary(orders) {
    var s = svc();
    var host = document.getElementById("fd-orders-cards");
    if (!host || !s) {
      return;
    }
    var awaiting = 0;
    var paid = 0;
    var failed = 0;
    for (var i = 0; i < orders.length; i++) {
      if (s.needsAttention(orders[i])) {
        awaiting += 1;
      }
      if (orders[i].status === "paid") {
        paid += 1;
      }
      if (orders[i].status === "failed") {
        failed += 1;
      }
    }
    var cards = [
      { icon: "fas fa-receipt", label: "Total orders", value: String(orders.length), context: "All orders placed through Harvest Castle." },
      { icon: "fas fa-bell", label: "Awaiting action", value: String(awaiting), context: "Waiting for your reply or verification." },
      { icon: "fas fa-check-circle", label: "Paid", value: String(paid), context: "Orders with a paid status." },
      { icon: "fas fa-exclamation-circle", label: "Failed", value: String(failed), context: "Payments that did not go through." }
    ];
    var html = "";
    for (var j = 0; j < cards.length; j++) {
      html +=
        '<li class="fd-dash-card">' +
        '<span class="fd-dash-card-icon" aria-hidden="true"><i class="' + cards[j].icon + '"></i></span>' +
        '<span class="fd-dash-card-label">' + esc(cards[j].label) + "</span>" +
        '<span class="fd-dash-card-value">' + esc(cards[j].value) + "</span>" +
        '<span class="fd-dash-card-context">' + esc(cards[j].context) + "</span>" +
        "</li>";
    }
    host.innerHTML = html;
  }

  function orderRow(order) {
    var s = svc();
    var ob = s.orderStatusMeta(order.status);
    var pb = s.paymentMeta(order);
    var tr = document.createElement("tr");

    var ref = document.createElement("th");
    ref.setAttribute("scope", "row");
    var refLink = document.createElement("a");
    refLink.setAttribute("href", detailUrl(order));
    refLink.className = "fd-orders-ref";
    refLink.textContent = order.id;
    ref.appendChild(refLink);
    tr.appendChild(ref);

    var cust = document.createElement("td");
    cust.setAttribute("data-label", "Customer");
    var custName = document.createElement("strong");
    custName.className = "fd-orders-cust";
    custName.textContent = order.customer.name || "Not provided";
    cust.appendChild(custName);
    var custMode = document.createElement("span");
    custMode.className = "fd-orders-sub";
    custMode.textContent = s.deliveryLabel(order.delivery.mode);
    cust.appendChild(custMode);
    tr.appendChild(cust);

    var date = document.createElement("td");
    date.setAttribute("data-label", "Date");
    date.textContent = fmtDate(order.placedAt);
    tr.appendChild(date);

    var items = document.createElement("td");
    items.setAttribute("data-label", "Items");
    items.textContent = String(s.itemCount(order));
    tr.appendChild(items);

    var total = document.createElement("td");
    total.setAttribute("data-label", "Total");
    total.className = "is-amount";
    /* Recorded total from the snapshot — never recalculated. */
    total.textContent = fmtNaira(order.total);
    tr.appendChild(total);

    var pay = document.createElement("td");
    pay.setAttribute("data-label", "Payment");
    pay.innerHTML = pill(pb.label, pb.tone);
    tr.appendChild(pay);

    var ost = document.createElement("td");
    ost.setAttribute("data-label", "Order status");
    ost.innerHTML = pill(ob.label, ob.tone);
    tr.appendChild(ost);

    var act = document.createElement("td");
    act.setAttribute("data-label", "Action");
    var view = document.createElement("a");
    view.setAttribute("href", detailUrl(order));
    view.className = "fd-prod-btn";
    view.setAttribute("aria-label", "Open order " + order.id);
    view.innerHTML = '<i class="far fa-eye" aria-hidden="true"></i>Open';
    act.appendChild(view);
    tr.appendChild(act);

    return tr;
  }

  function renderList() {
    var s = svc();
    if (!s) {
      return;
    }
    var list = visibleOrders();
    var count = document.getElementById("fd-orders-count");
    var tableWrap = document.getElementById("fd-orders-table-wrap");
    var tbody = document.getElementById("fd-orders-body");
    var emptyAll = document.getElementById("fd-orders-empty-all");
    var emptyFiltered = document.getElementById("fd-orders-empty-filtered");
    if (!tableWrap || !tbody || !emptyAll || !emptyFiltered) {
      return;
    }
    /* Never leave stale rows behind a hidden table. */
    tbody.innerHTML = "";
    if (count) {
      if (!allOrders.length) {
        count.textContent = "";
      } else if (list.length === allOrders.length && !hasActiveControls()) {
        count.textContent =
          "Showing " + list.length + " of " + allOrders.length + " orders.";
      } else {
        count.textContent =
          "Showing " + list.length + " of " + allOrders.length + " orders (filtered).";
      }
    }
    if (!allOrders.length) {
      tableWrap.setAttribute("hidden", "");
      emptyFiltered.setAttribute("hidden", "");
      emptyAll.removeAttribute("hidden");
      return;
    }
    emptyAll.setAttribute("hidden", "");
    if (!list.length) {
      tableWrap.setAttribute("hidden", "");
      emptyFiltered.removeAttribute("hidden");
      return;
    }
    emptyFiltered.setAttribute("hidden", "");
    tableWrap.removeAttribute("hidden");
    for (var i = 0; i < list.length; i++) {
      tbody.appendChild(orderRow(list[i]));
    }
    var clear = document.getElementById("fd-orders-clear");
    if (clear) {
      if (hasActiveControls()) {
        clear.removeAttribute("disabled");
      } else {
        clear.setAttribute("disabled", "");
      }
    }
  }

  /* ---------- Page states ---------- */
  function showLoading(on) {
    var loading = document.getElementById("fd-orders-loading");
    var content = document.getElementById("fd-orders-content");
    var error = document.getElementById("fd-orders-error");
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
    var loading = document.getElementById("fd-orders-loading");
    var content = document.getElementById("fd-orders-content");
    var error = document.getElementById("fd-orders-error");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (error) {
      error.removeAttribute("hidden");
      var retry = document.getElementById("fd-orders-retry");
      if (retry) {
        retry.focus();
      }
    }
  }

  function readScenario() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("mock") === "error" ? "error" : "normal";
    } catch (e) {
      return "normal";
    }
  }

  function load() {
    var s = svc();
    if (!s) {
      showLoading(false);
      showError();
      return;
    }
    if (readScenario() === "error") {
      showLoading(false);
      showError();
      return;
    }
    showLoading(true);
    var orders;
    try {
      orders = s.getOrders();
    } catch (e) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(false);
    allOrders = orders;
    var content = document.getElementById("fd-orders-content");
    if (content) {
      content.removeAttribute("hidden");
    }
    renderSummary(allOrders);
    renderList();
  }

  /* ---------- Controls ---------- */
  function resetControls() {
    state.q = "";
    state.orderStatus = "all";
    state.paymentStatus = "all";
    state.delivery = "all";
    state.sort = "newest";
    var search = document.getElementById("fd-orders-search");
    var os = document.getElementById("fd-orders-status");
    var ps = document.getElementById("fd-orders-payment");
    var dm = document.getElementById("fd-orders-delivery");
    var sort = document.getElementById("fd-orders-sort");
    if (search) {
      search.value = "";
    }
    if (os) {
      os.value = "all";
    }
    if (ps) {
      ps.value = "all";
    }
    if (dm) {
      dm.value = "all";
    }
    if (sort) {
      sort.value = "newest";
    }
    renderList();
    if (search) {
      search.focus();
    }
  }

  function wireControls() {
    var search = document.getElementById("fd-orders-search");
    var os = document.getElementById("fd-orders-status");
    var ps = document.getElementById("fd-orders-payment");
    var dm = document.getElementById("fd-orders-delivery");
    var sort = document.getElementById("fd-orders-sort");
    var clear = document.getElementById("fd-orders-clear");
    var resetEmpty = document.getElementById("fd-orders-reset-empty");
    var retry = document.getElementById("fd-orders-retry");
    var debounce = null;
    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(function () {
          state.q = search.value.trim().toLowerCase();
          renderList();
        }, 150);
      });
      /* Clearing via the native search "x" fires search, not input, in
         some browsers — keep the list honest either way. */
      search.addEventListener("search", function () {
        window.clearTimeout(debounce);
        state.q = search.value.trim().toLowerCase();
        renderList();
      });
    }
    if (os) {
      os.addEventListener("change", function () {
        state.orderStatus = os.value;
        renderList();
      });
    }
    if (ps) {
      ps.addEventListener("change", function () {
        state.paymentStatus = ps.value;
        renderList();
      });
    }
    if (dm) {
      dm.addEventListener("change", function () {
        state.delivery = dm.value;
        renderList();
      });
    }
    if (sort) {
      sort.addEventListener("change", function () {
        state.sort = sort.value;
        renderList();
      });
    }
    if (clear) {
      clear.addEventListener("click", resetControls);
    }
    if (resetEmpty) {
      resetEmpty.addEventListener("click", resetControls);
    }
    if (retry) {
      retry.addEventListener("click", function () {
        /* Retry the same order request (the future backend re-issues
           its fetch here instead). */
        var error = document.getElementById("fd-orders-error");
        var content = document.getElementById("fd-orders-content");
        if (error) {
          error.setAttribute("hidden", "");
        }
        if (content) {
          content.removeAttribute("hidden");
        }
        load();
      });
    }
  }

  function init() {
    if (!document.getElementById("fd-orders-content")) {
      return;
    }
    wireControls();
    load();
  }

  /* Testable seam: automated checks use these. */
  window.FreshDirectAdminOrderList = {
    load: load,
    visible: visibleOrders,
    reset: resetControls,
    state: state
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
