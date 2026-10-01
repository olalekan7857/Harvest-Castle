/* ==========================================================================
   Harvest Castle Admin — Order detail renderer (Stage 4)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   Boundary:
     window.FreshDirectAdminOrders (fd-admin-orders-data.js) is the ONLY
     place this UI meets order data. The detail route is
     admin-order.html?id=<order reference> (same ?id= convention as the
     product editor), deep-linkable: a valid id renders the snapshot, an
     unknown id renders the not-found state. Django stage: the service
     internals become API calls; every renderer below is reused untouched.

   Snapshot principle: every price shown comes from the order's own item
   lines (unitPrice/lineTotal recorded at order time). The catalog is
   never consulted, so later price edits cannot rewrite history.
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

  function fmtDateFull(iso) {
    var s = svc();
    if (s && s.formatDateFull) {
      return s.formatDateFull(iso);
    }
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "Date unavailable" : d.toLocaleString();
  }

  function orNotProvided(value) {
    return value ? value : "Not provided";
  }

  function readId() {
    try {
      var params = new URLSearchParams(window.location.search);
      return (params.get("id") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function pill(label, tone) {
    return (
      '<span class="fd-dash-pill' +
      (tone ? " " + tone : "") +
      '">' +
      esc(label) +
      "</span>"
    );
  }

  /* ---------- Page states ---------- */
  function showLoading(on) {
    var loading = document.getElementById("fd-order-loading");
    var content = document.getElementById("fd-order-content");
    var error = document.getElementById("fd-order-error");
    var missing = document.getElementById("fd-order-missing");
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
    if (on) {
      if (error) {
        error.setAttribute("hidden", "");
      }
      if (missing) {
        missing.setAttribute("hidden", "");
      }
    }
  }

  function showError() {
    var loading = document.getElementById("fd-order-loading");
    var content = document.getElementById("fd-order-content");
    var error = document.getElementById("fd-order-error");
    var missing = document.getElementById("fd-order-missing");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (missing) {
      missing.setAttribute("hidden", "");
    }
    if (error) {
      error.removeAttribute("hidden");
      var retry = document.getElementById("fd-order-retry");
      if (retry) {
        retry.focus();
      }
    }
  }

  function showMissing() {
    var loading = document.getElementById("fd-order-loading");
    var content = document.getElementById("fd-order-content");
    var error = document.getElementById("fd-order-error");
    var missing = document.getElementById("fd-order-missing");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (error) {
      error.setAttribute("hidden", "");
    }
    if (missing) {
      missing.removeAttribute("hidden");
      document.title = "Order not found | Harvest Castle Admin";
    }
  }

  /* ---------- Renderers ---------- */
  function renderHeader(order) {
    var s = svc();
    var ref = document.getElementById("fd-order-ref");
    var date = document.getElementById("fd-order-date");
    var pills = document.getElementById("fd-order-pills");
    var heading = document.getElementById("fd-order-heading");
    var ob = s.orderStatusMeta(order.status);
    var pb = s.paymentMeta(order);
    if (ref) {
      ref.textContent = order.id;
    }
    if (date) {
      date.textContent = fmtDateFull(order.placedAt);
    }
    if (pills) {
      pills.innerHTML = pill("Order: " + ob.label, ob.tone) + pill("Payment: " + pb.label, pb.tone);
    }
    if (heading) {
      heading.textContent = "Order " + order.id;
    }
    document.title = "Order " + order.id + " | Harvest Castle Admin";
  }

  function renderCustomer(order) {
    var host = document.getElementById("fd-order-customer");
    if (!host) {
      return;
    }
    var rows = [
      ["Name", orNotProvided(order.customer.name)],
      ["Phone", orNotProvided(order.customer.phone)],
      ["Email", orNotProvided(order.customer.email)]
    ];
    host.innerHTML = "";
    for (var i = 0; i < rows.length; i++) {
      host.appendChild(factRow(rows[i][0], rows[i][1]));
    }
  }

  function factRow(label, value) {
    var li = document.createElement("li");
    var lab = document.createElement("span");
    lab.textContent = label + ":";
    var val = document.createElement("strong");
    val.textContent = " " + value;
    li.appendChild(lab);
    li.appendChild(val);
    return li;
  }

  function renderItems(order) {
    var tbody = document.getElementById("fd-order-items-body");
    var wrap = document.getElementById("fd-order-items-wrap");
    if (!tbody || !wrap) {
      return;
    }
    tbody.innerHTML = "";
    for (var i = 0; i < order.items.length; i++) {
      (function (it) {
        var tr = document.createElement("tr");
        var name = document.createElement("th");
        name.setAttribute("scope", "row");
        name.setAttribute("data-label", "Product");
        var nameStrong = document.createElement("strong");
        nameStrong.textContent = it.name;
        name.appendChild(nameStrong);
        if (it.variantLabel) {
          var variant = document.createElement("span");
          variant.className = "fd-orders-sub";
          variant.textContent = it.variantLabel;
          name.appendChild(variant);
        }
        tr.appendChild(name);
        var qty = document.createElement("td");
        qty.setAttribute("data-label", "Qty");
        qty.textContent = String(it.quantity);
        tr.appendChild(qty);
        var unit = document.createElement("td");
        unit.setAttribute("data-label", "Unit price");
        unit.className = "is-amount";
        unit.textContent = fmtNaira(it.unitPrice);
        tr.appendChild(unit);
        var line = document.createElement("td");
        line.setAttribute("data-label", "Line total");
        line.className = "is-amount";
        line.textContent = fmtNaira(it.lineTotal);
        tr.appendChild(line);
        tbody.appendChild(tr);
      })(order.items[i]);
    }
    var total = document.getElementById("fd-order-total");
    if (total) {
      /* Recorded snapshot total — never recalculated from the catalog. */
      total.textContent = fmtNaira(order.total);
    }
  }

  function renderDelivery(order) {
    var s = svc();
    var host = document.getElementById("fd-order-delivery");
    var modeEl = document.getElementById("fd-order-delivery-mode");
    if (!host) {
      return;
    }
    var d = order.delivery;
    if (modeEl) {
      modeEl.textContent = s.deliveryLabel(d.mode);
    }
    host.innerHTML = "";
    var rows = [];
    if (d.mode === "off-campus") {
      /* Only the fields checkout collects for off-campus orders. */
      rows.push(["Full address", orNotProvided(d.address)]);
      rows.push(["Landmark", orNotProvided(d.landmark)]);
    } else {
      /* Only the fields checkout collects for on-campus orders. */
      rows.push(["Hostel / building", orNotProvided(d.hostel)]);
      rows.push(["Room / block", orNotProvided(d.roomBlock)]);
      rows.push(["Faculty / office", orNotProvided(d.facultyOffice)]);
    }
    rows.push(["Delivery instructions", orNotProvided(d.instructions)]);
    for (var i = 0; i < rows.length; i++) {
      host.appendChild(factRow(rows[i][0], rows[i][1]));
    }
  }

  function renderPayment(order) {
    var s = svc();
    var host = document.getElementById("fd-order-payment");
    if (!host) {
      return;
    }
    var pb = s.paymentMeta(order);
    var method =
      order.orderingMethod === "website" ? "Website order" : "Order via WhatsApp";
    host.innerHTML = "";
    host.appendChild(factRow("Ordering method", method));
    host.appendChild(factRow("Payment status", pb.label));
    /* A payment reference is shown ONLY when the snapshot carries a
       backend-verified one. Nothing is ever invented here. */
    if (
      order.payment &&
      order.payment.verified === true &&
      order.payment.reference
    ) {
      host.appendChild(factRow("Payment reference", order.payment.reference));
    } else {
      host.appendChild(factRow("Payment reference", "No verified payment"));
    }
  }

  function renderActions(order) {
    var s = svc();
    var waBtn = document.getElementById("fd-order-wa");
    if (waBtn) {
      waBtn.setAttribute("href", s.getOrderWhatsAppHref(order));
      waBtn.setAttribute("target", "_blank");
      waBtn.setAttribute("rel", "noopener");
    }
    var callBtn = document.getElementById("fd-order-call");
    if (callBtn) {
      var href = s.getCustomerCallHref(order);
      if (href) {
        callBtn.removeAttribute("hidden");
        callBtn.setAttribute("href", href);
        callBtn.setAttribute(
          "aria-label",
          "Call " + (order.customer.name || "customer") + " on " + order.customer.phone
        );
      } else {
        callBtn.setAttribute("hidden", "");
      }
    }
    var select = document.getElementById("fd-order-status");
    if (select) {
      select.value = order.status;
    }
    setStatusNote("", false);
  }

  /* ---------- Status update (idle / submitting / success / failure) ---------- */
  function setStatusNote(message, isError) {
    var note = document.getElementById("fd-order-status-note");
    if (!note) {
      return;
    }
    if (!message) {
      note.textContent = "";
      note.setAttribute("hidden", "");
      note.classList.remove("is-error");
      return;
    }
    note.textContent = message;
    note.removeAttribute("hidden");
    note.classList.toggle("is-error", !!isError);
  }

  function setSubmitting(on) {
    var btn = document.getElementById("fd-order-status-btn");
    var select = document.getElementById("fd-order-status");
    if (btn) {
      btn.disabled = on;
      btn.setAttribute("aria-busy", on ? "true" : "false");
    }
    if (select) {
      select.disabled = on;
    }
  }

  function wireStatusForm(order) {
    var form = document.getElementById("fd-order-status-form");
    var select = document.getElementById("fd-order-status");
    if (!form || !select) {
      return;
    }
    select.addEventListener("change", function () {
      setStatusNote("", false);
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var s = svc();
      if (!s) {
        setStatusNote("Order data is unavailable. Please try again.", true);
        return;
      }
      var next = select.value;
      if (next === order.status) {
        setStatusNote("That is already the current status — no change was made.", false);
        return;
      }
      /* Genuine submitting state: the control locks while the service
         persists. No artificial delay — the result lands immediately. */
      setStatusNote("", false);
      setSubmitting(true);
      var result = s.updateOrderStatus(order.id, next);
      setSubmitting(false);
      if (result.ok && result.order) {
        order.status = result.order.status;
        renderHeader(order);
        renderPayment(order);
        setStatusNote("Order status updated to “" + s.orderStatusMeta(order.status).label + "”.", false);
      } else {
        var message =
          (result.error && result.error.message) ||
          "The status could not be saved. Please try again.";
        setStatusNote(message, true);
        select.value = order.status;
        select.focus();
      }
    });
  }

  /* ---------- Load ---------- */
  function load() {
    var s = svc();
    if (!s) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(true);
    var id = readId();
    if (!id) {
      showLoading(false);
      showMissing();
      return;
    }
    var order;
    try {
      order = s.getOrder(id);
    } catch (e) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(false);
    if (!order) {
      showMissing();
      return;
    }
    var content = document.getElementById("fd-order-content");
    if (content) {
      content.removeAttribute("hidden");
    }
    renderHeader(order);
    renderCustomer(order);
    renderItems(order);
    renderDelivery(order);
    renderPayment(order);
    renderActions(order);
    wireStatusForm(order);
  }

  function wireRetry() {
    var retry = document.getElementById("fd-order-retry");
    if (!retry) {
      return;
    }
    retry.addEventListener("click", function () {
      var error = document.getElementById("fd-order-error");
      var content = document.getElementById("fd-order-content");
      if (error) {
        error.setAttribute("hidden", "");
      }
      if (content) {
        content.removeAttribute("hidden");
      }
      load();
    });
  }

  function init() {
    if (!document.getElementById("fd-order-content")) {
      return;
    }
    wireRetry();
    load();
  }

  /* Testable seam: automated checks use these. */
  window.FreshDirectAdminOrderDetail = {
    load: load,
    id: readId
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
