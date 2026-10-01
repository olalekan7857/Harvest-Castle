/* ==========================================================================
   Harvest Castle Blog — UI interactions only (no data, no routing)
   --------------------------------------------------------------------------
   This file owns FRONTEND BEHAVIOR ONLY:
     - article share-on-WhatsApp link (built from the current page URL)
     - copy-link button with toast feedback
   It does NOT store articles, render cards, filter categories, search,
   paginate, route, or inject content. All blog content lives in static
   HTML (blog.html / blog-detail.html / blog-category.html /
   blog-search.html) so Django can later render these same templates
   server-side without touching this file.
   Toast markup reuses the storefront #fd-toast-region / .fd-toast
   visuals so feedback looks identical everywhere.
   ========================================================================== */
(function () {
  "use strict";

  function toast(message) {
    var region = document.getElementById("fd-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "fd-toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    var el = document.createElement("div");
    el.className = "fd-toast";
    var icon = document.createElement("i");
    icon.className = "fas fa-check-circle";
    icon.setAttribute("aria-hidden", "true");
    el.appendChild(icon);
    el.appendChild(document.createTextNode(message));
    region.appendChild(el);
    window.setTimeout(function () {
      el.classList.add("is-leaving");
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 320);
    }, 2600);
  }

  function legacyCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) {
      done(false);
    }
  }

  // Share row on the article template: WhatsApp share points at the
  // current page; the copy button copies it with toast feedback.
  function wireShare() {
    var wa = document.querySelector("[data-share-whatsapp]");
    var copy = document.querySelector("[data-copy-link]");
    if (!wa && !copy) return;
    var pageUrl = window.location.href;
    var shareText = document.title + " " + pageUrl;
    if (wa) {
      wa.setAttribute(
        "href",
        "https://wa.me/?text=" + encodeURIComponent(shareText)
      );
    }
    if (!copy) return;
    copy.addEventListener("click", function () {
      function done(ok) {
        toast(ok ? "Link copied." : "Could not copy the link.");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pageUrl).then(
          function () { done(true); },
          function () { legacyCopy(pageUrl, done); }
        );
      } else {
        legacyCopy(pageUrl, done);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireShare);
  } else {
    wireShare();
  }
})();
