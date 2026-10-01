/* ==========================================================================
   Harvest Castle Admin — Blog List (static demo, Django-ready)
   --------------------------------------------------------------------------
   Mirrors the product-list interaction pattern: search + category +
   status filter over static cards, result count, empty state, and a
   delete-confirmation modal. The backend performs the real deletion;
   the demo removes the card from the current view.
   ========================================================================== */
(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  var pendingId = null;
  var lastFocus = null;

  function cards() {
    var list = el("fd-blog-list");
    if (!list) {
      return [];
    }
    return Array.prototype.slice.call(list.querySelectorAll(".fd-prod-card"));
  }

  function state() {
    var q = (el("fd-blog-search") && el("fd-blog-search").value || "").trim().toLowerCase();
    var cat = el("fd-blog-cat") ? el("fd-blog-cat").value : "all";
    var status = el("fd-blog-status") ? el("fd-blog-status").value : "all";
    return { q: q, cat: cat, status: status };
  }

  function applyAndRender() {
    var list = cards();
    var s = state();
    var visible = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var title = (c.getAttribute("data-title") || "").toLowerCase();
      var cat = c.getAttribute("data-category") || "";
      var st = c.getAttribute("data-status") || "";
      var ok = true;
      if (s.cat !== "all" && cat !== s.cat) {
        ok = false;
      }
      if (s.status !== "all" && st !== s.status) {
        ok = false;
      }
      if (s.q && title.indexOf(s.q) === -1 && cat.toLowerCase().indexOf(s.q) === -1) {
        ok = false;
      }
      if (ok) {
        c.removeAttribute("hidden");
        visible += 1;
      } else {
        c.setAttribute("hidden", "");
      }
    }
    var count = el("fd-blog-count");
    if (count) {
      count.textContent = "Showing " + visible + " of " + list.length + " posts.";
    }
    var empty = el("fd-blog-empty");
    var wrap = el("fd-blog-list-wrap");
    if (empty && wrap) {
      if (!visible) {
        empty.removeAttribute("hidden");
      } else {
        empty.setAttribute("hidden", "");
      }
    }
    var clear = el("fd-blog-clear");
    if (clear) {
      if (!s.q && s.cat === "all" && s.status === "all") {
        clear.setAttribute("disabled", "");
      } else {
        clear.removeAttribute("disabled");
      }
    }
  }

  function resetFilters() {
    var search = el("fd-blog-search");
    var cat = el("fd-blog-cat");
    var status = el("fd-blog-status");
    if (search) {
      search.value = "";
    }
    if (cat) {
      cat.value = "all";
    }
    if (status) {
      status.value = "all";
    }
    applyAndRender();
  }

  function openModal(id, name) {
    var modal = el("fd-blog-delete-modal");
    var text = el("fd-blog-delete-text");
    if (!modal) {
      return;
    }
    pendingId = id;
    if (text) {
      text.textContent = '"' + (name || id) + '" will be permanently removed. This cannot be undone.';
    }
    lastFocus = document.activeElement;
    modal.removeAttribute("hidden");
    var cancel = el("fd-blog-delete-cancel");
    if (cancel) {
      cancel.focus();
    }
  }

  function closeModal() {
    var modal = el("fd-blog-delete-modal");
    if (!modal) {
      return;
    }
    modal.setAttribute("hidden", "");
    pendingId = null;
    if (lastFocus && lastFocus.focus) {
      try {
        lastFocus.focus();
      } catch (e) {}
    }
  }

  function init() {
    if (!el("fd-blog-list")) {
      return;
    }
    applyAndRender();
    var search = el("fd-blog-search");
    var cat = el("fd-blog-cat");
    var status = el("fd-blog-status");
    var clear = el("fd-blog-clear");
    var resetEmpty = el("fd-blog-reset-empty");
    var debounce = null;
    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(applyAndRender, 150);
      });
    }
    if (cat) {
      cat.addEventListener("change", applyAndRender);
    }
    if (status) {
      status.addEventListener("change", applyAndRender);
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
    var list = el("fd-blog-list");
    if (list) {
      list.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-delete-id]") : null;
        if (!btn) {
          return;
        }
        openModal(btn.getAttribute("data-delete-id"), btn.getAttribute("data-delete-name"));
      });
    }
    var cancel = el("fd-blog-delete-cancel");
    var scrim = el("fd-blog-delete-scrim");
    var confirm = el("fd-blog-delete-confirm");
    if (cancel) {
      cancel.addEventListener("click", closeModal);
    }
    if (scrim) {
      scrim.addEventListener("click", closeModal);
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        var modal = el("fd-blog-delete-modal");
        if (modal && !modal.hasAttribute("hidden")) {
          closeModal();
        }
      }
    });
    if (confirm) {
      confirm.addEventListener("click", function () {
        if (pendingId && list) {
          var target = list.querySelector('[data-delete-id="' + pendingId + '"]');
          if (target) {
            var card = target.closest ? target.closest(".fd-prod-card") : null;
            if (card && card.parentNode) {
              card.parentNode.removeChild(card);
            }
          }
        }
        closeModal();
        applyAndRender();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
