/* ==========================================================================
   Harvest Castle Admin — Blog Editor (static demo, Django-ready)
   --------------------------------------------------------------------------
   Mirrors the product-editor pattern: ?id= edits a known static post,
   no ?id= creates a new one, unknown ?id= shows the not-found state.
   Validation is inline + summary. Image file preview is local-only.
   Django persists the payload; the demo shows a truthful confirmation.
   ========================================================================== */
(function () {
  "use strict";

  var KNOWN = {
    "tomato-storage": { title: "How to Store Tomatoes So They Stay Fresh Longer", category: "Food Storage" },
    "ugu-leaves": { title: "Ugu Leaves: Choosing Fresh Bunches and Cooking Them Well", category: "Vegetables" },
    "scotch-pepper": { title: "Red Scotch Pepper: Heat, Flavour, and Three Simple Uses", category: "Recipes" },
    "seasonal-fruits": { title: "Seasonal Fruits Worth Buying Around Abeokuta Right Now", category: "Seasonal" },
    "onion-storage": { title: "Five Onion Storage Mistakes That Cost You Money", category: "Food Storage" },
    "banana-ripening": { title: "Banana Ripening at Home: From Green to Perfectly Sweet", category: "Fruits" }
  };

  function el(id) {
    return document.getElementById(id);
  }

  function esc(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      return null;
    }
  }

  function setError(inputId, errorId, message) {
    var input = el(inputId);
    var err = el(errorId);
    if (input) {
      if (message) {
        input.setAttribute("aria-invalid", "true");
      } else {
        input.removeAttribute("aria-invalid");
      }
    }
    if (err) {
      if (message) {
        err.textContent = message;
        err.removeAttribute("hidden");
      } else {
        err.textContent = "";
        err.setAttribute("hidden", "");
      }
    }
    return !message;
  }

  function showSummary(messages) {
    var box = el("fd-bed-summary");
    var list = el("fd-bed-summary-list");
    if (!box || !list) {
      return;
    }
    if (!messages.length) {
      box.setAttribute("hidden", "");
      list.innerHTML = "";
      return;
    }
    var html = "";
    for (var i = 0; i < messages.length; i++) {
      html += "<li>" + esc(messages[i]) + "</li>";
    }
    list.innerHTML = html;
    box.removeAttribute("hidden");
    box.focus();
  }

  function wirePreview() {
    var file = el("fd-bed-image-file");
    var src = el("fd-bed-image-src");
    var img = el("fd-bed-preview-img");
    var cap = el("fd-bed-preview-cap");
    var status = el("fd-bed-image-status");
    function render(url, label) {
      if (!img) {
        return;
      }
      if (url) {
        img.src = url;
        img.removeAttribute("hidden");
        if (cap) {
          cap.textContent = label || "Preview of the featured image.";
        }
      } else {
        img.removeAttribute("src");
        img.setAttribute("hidden", "");
        if (cap) {
          cap.textContent = "Image preview appears here.";
        }
      }
    }
    if (file) {
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        if (status) {
          status.textContent = f ? "Selected: " + f.name : "No image selected yet.";
        }
        if (f) {
          try {
            render(URL.createObjectURL(f), "Preview of " + f.name);
          } catch (e) {
            render("", "");
          }
        } else if (src && src.value.trim()) {
          render(src.value.trim(), "Preview of the pasted image address.");
        } else {
          render("", "");
        }
      });
    }
    if (src) {
      src.addEventListener("input", function () {
        if (file && file.files && file.files.length) {
          return;
        }
        var v = src.value.trim();
        render(v || "", v ? "Preview of the pasted image address." : "");
      });
    }
  }

  function init() {
    if (!el("fd-bed-form")) {
      return;
    }
    var id = param("id");
    var isEdit = !!id;
    var heading = el("fd-bed-heading");
    var lead = el("fd-bed-lead");
    var submitLabel = el("fd-bed-submit-label");
    var identity = el("fd-bed-identity-section");
    var missing = el("fd-bed-missing");
    var content = el("fd-bed-content");
    var title = el("fd-bed-title");
    var category = el("fd-bed-category");

    if (isEdit && !KNOWN[id]) {
      if (missing) {
        missing.removeAttribute("hidden");
      }
      if (content) {
        content.setAttribute("hidden", "");
      }
      return;
    }

    if (isEdit) {
      var known = KNOWN[id];
      if (heading) {
        heading.textContent = "Edit: " + known.title;
      }
      if (lead) {
        lead.textContent = "Update this Harvest Castle article. Saving keeps the same post ID.";
      }
      if (submitLabel) {
        submitLabel.textContent = "Save Changes";
      }
      if (identity) {
        identity.removeAttribute("hidden");
      }
      var idCode = el("fd-bed-post-id");
      if (idCode) {
        idCode.textContent = id;
      }
      if (title && !title.value) {
        title.value = known.title;
      }
      if (category && !category.value) {
        category.value = known.category;
      }
    } else {
      if (heading) {
        heading.textContent = "Add a New Post";
      }
      if (lead) {
        lead.textContent = "Create a new Harvest Castle article with its cover image and content.";
      }
      if (submitLabel) {
        submitLabel.textContent = "Publish Post";
      }
    }

    wirePreview();

    el("fd-bed-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var errors = [];
      var ok = true;
      var t = title ? title.value.trim() : "";
      var t = title ? title.value.trim() : "";
      if (!t) {
        ok = setError("fd-bed-title", "fd-bed-title-error", "Enter a post title.") && ok;
        errors.push("Post title is required.");
      } else {
        setError("fd-bed-title", "fd-bed-title-error", "");
      }
      var c = category ? category.value : "";
      if (!c) {
        ok = setError("fd-bed-category", "fd-bed-category-error", "Choose a category.") && ok;
        errors.push("Category is required.");
      } else {
        setError("fd-bed-category", "fd-bed-category-error", "");
      }
      var excerpt = el("fd-bed-excerpt");
      if (!excerpt || !excerpt.value.trim()) {
        ok = setError("fd-bed-excerpt", "fd-bed-excerpt-error", "Enter an excerpt.") && ok;
        errors.push("Excerpt is required.");
      } else {
        setError("fd-bed-excerpt", "fd-bed-excerpt-error", "");
      }
      var alt = el("fd-bed-image-alt");
      if (!alt || !alt.value.trim()) {
        ok = setError("fd-bed-image-alt", "fd-bed-image-alt-error", "Describe the image for screen readers.") && ok;
        errors.push("Image description (alt text) is required.");
      } else {
        setError("fd-bed-image-alt", "fd-bed-image-alt-error", "");
      }
      var body = el("fd-bed-body");
      if (!body || !body.value.trim()) {
        ok = setError("fd-bed-body", "fd-bed-body-error", "Enter the article content.") && ok;
        errors.push("Article content is required.");
      } else {
        setError("fd-bed-body", "fd-bed-body-error", "");
      }
      showSummary(ok ? [] : errors);
      if (!ok) {
        return;
      }
      /* Static demo confirmation; Django persists the payload. */
      var form = el("fd-bed-form");
      var result = el("fd-bed-result");
      var note = el("fd-bed-result-note");
      var summary = el("fd-bed-result-summary");
      var resultTitle = el("fd-bed-result-title");
      if (form) {
        form.setAttribute("hidden", "");
      }
      if (result) {
        result.removeAttribute("hidden");
      }
      var statusChecked = "published";
      try {
        var checked = document.querySelector('input[name="status"]:checked');
        if (checked) {
          statusChecked = checked.value;
        }
      } catch (e) {}
      if (resultTitle) {
        resultTitle.textContent = isEdit ? "Post updated" : "Post created";
      }
      if (note) {
        note.textContent = isEdit
          ? "Your changes were saved in this demo. The backend will persist them in production."
          : "Your post was created in this demo. The backend will persist it in production.";
      }
      if (summary) {
        summary.innerHTML =
          '<div class="fd-edit-result-card"><div class="fd-edit-result-body">' +
          '<span class="fd-edit-result-name">' + esc(t) + "</span>" +
          '<span class="fd-edit-result-meta">' + esc(c) + " · " + esc(statusChecked) + "</span>" +
          "</div></div>";
      }
      var view = el("fd-bed-result-view");
      if (view && !isEdit) {
        view.removeAttribute("hidden");
      }
      var again = el("fd-bed-result-new");
      if (again && !isEdit) {
        again.removeAttribute("hidden");
      }
      if (resultTitle) {
        resultTitle.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
