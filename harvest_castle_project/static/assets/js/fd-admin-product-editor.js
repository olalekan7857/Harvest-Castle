/* ==========================================================================
   Harvest Castle Admin — Product Editor (Stage 3B: Add / Edit, frontend only)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   One page (admin-product-edit.html) serves two deliberate modes:
     Add  -> admin-product-edit.html            (no ?id=, or ?mode=new)
     Edit -> admin-product-edit.html?id=<prod>  (stable catalog ID)
   An unknown ?id= renders the product-not-found state and NEVER creates
   a product silently.

   Layers (kept separate on purpose):
     1. catalog   - read-only access to the canonical product shape via
                     window.FreshDirectAdminProducts.getCatalog() (built-in
                     catalog plus seller-kept items from
                     window.FreshDirectAdminStore).
     2. pure      - categories, IDs, price parsing, image-file validation,
                     validation, payload. No DOM here; exercised by the
                     manual QA below and exposed on
                     window.FreshDirectAdminProductEditor.
     3. store     - window.FreshDirectAdminProductStore.savePayload().
                     Saves through window.FreshDirectAdminStore (kept in
                     this browser today; a real API later) and resolves
                     "saved" or "dev-boundary". The future backend replaces
                     the storage internals and the result drives the same
                     success/review states; the editor UI is reused
                     untouched. Do NOT hardcode endpoints here.
     3b. images   - window.FreshDirectAdminImageUpload. Client-side file
                     checks + object-URL preview helpers only. The real
                     upload (file bytes to media storage) plugs in here
                     later; selected files are previewed locally only.
     4. ui        - mode detection, form population, variant rows, preview,
                     validation display, result summary, dirty guard.

   Canonical product shape (exactly FD_CATALOG, nothing invented):
     { id, name, category, status("in"|"limited"|"out"), badge?,
       defaultVariant(variant id), desc, images[{src,alt,w,h}],
       variants[{id,label,price}] }
   No vendor/farmer/SKU/stock-count/price-discount fields exist here
   because the storefront does not understand them.

   Manual QA (?mock=... on admin-product-edit.html):
     create:  no query string            -> blank Add form
     edit:    ?id=mock-tomatoes          -> populated Edit form
     missing: ?id=does-not-exist        -> not-found state, no form
     error:   ?mock=error               -> load-error state, no form
   ========================================================================== */
(function () {
  "use strict";

  var MAX_VARIANTS = 20;
  var MAX_PRICE = 50000000;
  var NEW_ID_PREFIX = "mock-";

  /* Frontend file guard for the picker only — not a server policy. */
  var IMAGE_MAX_SIZE = 5 * 1024 * 1024;
  var IMAGE_MAX_LABEL = "5 MB";
  var IMAGE_ACCEPTED_TYPES = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif"
  ];
  var IMAGE_ACCEPTED_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

  /* ---------- Small local helpers (admin copies; no customer dep) ---------- */
  function fmtNaira(n) {
    return "\u20A6" + Number(n).toLocaleString("en-NG");
  }

  function trim(text) {
    return String(text == null ? "" : text).replace(/^\s+|\s+$/g, "");
  }

  function slugify(text) {
    var s = String(text || "").toLowerCase();
    s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s;
  }

  function el(id) {
    if (typeof document === "undefined") {
      return null;
    }
    return document.getElementById(id);
  }

  /* Human-size for the picker status line only (never a backend value). */
  function formatFileSize(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n < 0) {
      return "";
    }
    if (n < 1024) {
      return n + " B";
    }
    if (n < 1024 * 1024) {
      return (Math.round((n / 1024) * 10) / 10) + " KB";
    }
    return (Math.round((n / (1024 * 1024)) * 10) / 10) + " MB";
  }

  /* Client-side file gate: MIME type first, extension fallback only when
     the browser reports an empty type. Never executed, never trusted as
     a security boundary — Django re-validates everything server-side. */
  function validateImageFile(file) {
    if (!file) {
      return { ok: false, error: "empty" };
    }
    var type = String((file.type || "")).toLowerCase();
    if (type) {
      if (IMAGE_ACCEPTED_TYPES.indexOf(type) === -1) {
        return { ok: false, error: "type" };
      }
    } else {
      var name = String(file.name || "").toLowerCase();
      var ext = name.indexOf(".") !== -1 ? name.split(".").pop() : "";
      if (IMAGE_ACCEPTED_EXTS.indexOf(ext) === -1) {
        return { ok: false, error: "type" };
      }
    }
    if (typeof file.size === "number" && file.size > IMAGE_MAX_SIZE) {
      return { ok: false, error: "too-large" };
    }
    if (typeof file.size === "number" && file.size <= 0) {
      return { ok: false, error: "empty" };
    }
    return { ok: true, error: "" };
  }

  function imageFileErrorText(code, fileName) {
    var name = fileName ? "“" + fileName + "” " : "That file ";
    if (code === "empty") {
      return "Choose an image file first.";
    }
    if (code === "type") {
      return name + "is not a supported image. Use PNG, JPEG, WebP or GIF.";
    }
    if (code === "too-large") {
      return name + "is larger than " + IMAGE_MAX_LABEL + ". Choose a smaller image.";
    }
    if (code === "unreadable") {
      return name + "could not be read as an image. Try another file.";
    }
    return "That image could not be used. Try another file.";
  }

  /* ==========================================================================
     1. Catalog boundary (read-only; the ONLY place the editor meets data)
     ========================================================================== */
  function getCatalog() {
    var source =
      (typeof window !== "undefined" &&
        window.FreshDirectAdminProducts &&
        window.FreshDirectAdminProducts.getCatalog()) ||
      null;
    if (!source || typeof source !== "object" || !Object.keys(source).length) {
      var err = new Error("Product data could not be loaded.");
      err.code = "PRODUCTS_LOAD_FAILED";
      throw err;
    }
    return source;
  }

  function listCategories(catalog) {
    var seen = [];
    var ids = Object.keys(catalog);
    for (var i = 0; i < ids.length; i++) {
      var cat = catalog[ids[i]] && catalog[ids[i]].category;
      if (cat && seen.indexOf(cat) === -1) {
        seen.push(cat);
      }
    }
    seen.sort();
    return seen;
  }

  /* Known image references (for the datalist + dimension reuse only —
     never a second catalog; sellers may type any path or URL). */
  function listKnownImages(catalog) {
    var out = [];
    var seenSrc = [];
    var ids = Object.keys(catalog);
    for (var i = 0; i < ids.length; i++) {
      var images = (catalog[ids[i]] && catalog[ids[i]].images) || [];
      for (var j = 0; j < images.length; j++) {
        if (images[j] && images[j].src && seenSrc.indexOf(images[j].src) === -1) {
          seenSrc.push(images[j].src);
          out.push({
            src: images[j].src,
            alt: images[j].alt || "",
            w: images[j].w || 0,
            h: images[j].h || 0
          });
        }
      }
    }
    return out;
  }

  /* ==========================================================================
     2. Pure logic: IDs, prices, validation, payload (no DOM)
     ========================================================================== */

  /* Variant IDs follow the catalog convention: compact lowercase tokens
     ("1kg", "bunch", "3bunch", "tuber"). "Per X" selling-unit labels map
     to their unit id so "Per bunch" and "bunch" never collide silently. */
  function variantIdFromLabel(label) {
    var s = trim(label).toLowerCase();
    var perUnit = s.match(/^per\s+(bunch|tuber|piece)s?$/);
    if (perUnit) {
      return perUnit[1];
    }
    s = s.replace(/\s+/g, "").replace(/[^a-z0-9.]/g, "");
    return s || "variant";
  }

  function ensureUniqueVariantId(base, takenLower) {
    var candidate = base || "variant";
    if (takenLower.indexOf(candidate.toLowerCase()) === -1) {
      return candidate;
    }
    var n = 2;
    while (takenLower.indexOf((candidate + "-" + n).toLowerCase()) !== -1) {
      n++;
    }
    return candidate + "-" + n;
  }

  /* New product IDs follow the existing "mock-<slug>" convention so they
     sort and read like the current catalog until Django owns identity. */
  function productIdFromName(name, catalog) {
    var base = NEW_ID_PREFIX + (slugify(name) || "product");
    if (!catalog || !catalog[base]) {
      return base;
    }
    var n = 2;
    while (catalog[base + "-" + n]) {
      n++;
    }
    return base + "-" + n;
  }

  /* Sellers may type "2500", "2,500" or "₦2,500" — the formatted figure is
     display only; the payload always carries a plain number. */
  function parsePrice(raw) {
    var cleaned = String(raw == null ? "" : raw).replace(/[₦,\s]/g, "");
    if (!cleaned) {
      return { ok: false, value: 0, error: "empty" };
    }
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      return { ok: false, value: 0, error: "malformed" };
    }
    var value = Number(cleaned);
    if (!isFinite(value) || value <= 0) {
      return { ok: false, value: 0, error: "non-positive" };
    }
    if (value > MAX_PRICE) {
      return { ok: false, value: 0, error: "too-large" };
    }
    return { ok: true, value: value, error: "" };
  }

  function priceErrorText(code, label) {
    if (code === "empty") {
      return "Enter a price for “" + label + "”.";
    }
    if (code === "malformed") {
      return "Enter a valid amount for “" + label + "” (numbers only, e.g. 2500).";
    }
    if (code === "non-positive") {
      return "Enter a price above " + fmtNaira(0) + " for “" + label + "”.";
    }
    return "That price for “" + label + "” looks unusually large — check it and try again.";
  }

  /* Draft shape (form state, before payload):
       { name, category, desc, badge, imageSrc, imageAlt, status,
         imageHasFile, imageFileError, imageFileName,
         defaultKey, variants: [{ key, label, priceRaw, originalId }] }
     imageHasFile means a valid local file is selected and wins over the
     reference field (which is then ignored). imageFileError carries the
     picker validation code ("type"|"too-large"|"unreadable"|"empty").
     Returns an array of { target, message } where target is a DOM id
     (the UI focuses the first one and links the summary to each). */
  function validateProduct(draft, ctx) {
    var errors = [];
    var categories = (ctx && ctx.categories) || [];

    var name = trim(draft.name);
    if (!name) {
      errors.push({ target: "fd-ed-name", message: "Enter the product name." });
    } else if (name.length < 2 || name.length > 120) {
      errors.push({ target: "fd-ed-name", message: "Use between 2 and 120 characters for the product name." });
    }

    if (!trim(draft.category)) {
      errors.push({ target: "fd-ed-category", message: "Choose a category." });
    } else if (categories.indexOf(draft.category) === -1) {
      errors.push({ target: "fd-ed-category", message: "Choose a valid category from the list." });
    }

    var desc = trim(draft.desc);
    if (!desc) {
      errors.push({ target: "fd-ed-desc", message: "Enter the product description." });
    } else if (desc.length > 2000) {
      errors.push({ target: "fd-ed-desc", message: "Keep the description under 2000 characters." });
    }

    var badge = trim(draft.badge);
    if (badge && badge.length > 24) {
      errors.push({ target: "fd-ed-badge", message: "Keep the badge under 24 characters (or leave it empty)." });
    }

    var hasFile = !!draft.imageHasFile;
    if (draft.imageFileError) {
      errors.push({ target: "fd-ed-image-file", message: imageFileErrorText(draft.imageFileError, draft.imageFileName) });
    } else if (hasFile) {
      /* Local file wins: the secondary reference field is ignored, so it
         is neither required nor validated here. Alt text is still
         required below. */
    } else if (!trim(draft.imageSrc)) {
      errors.push({ target: "fd-ed-image-file", message: "Choose a product image above, or reuse an existing image below." });
    } else if (trim(draft.imageSrc).length > 500) {
      errors.push({ target: "fd-ed-image-src", message: "That image address is too long (500 characters max)." });
    }

    var alt = trim(draft.imageAlt);
    if (!alt) {
      errors.push({ target: "fd-ed-image-alt", message: "Describe the image for screen readers." });
    } else if (alt.length > 125) {
      errors.push({ target: "fd-ed-image-alt", message: "Keep the image description under 125 characters." });
    }

    if (draft.status !== "in" && draft.status !== "limited" && draft.status !== "out") {
      errors.push({ target: "fd-ed-status-in", message: "Choose availability: Available, Limited or Out of Stock." });
    }

    var variants = draft.variants || [];
    if (!variants.length) {
      errors.push({ target: "fd-ed-add-variant", message: "Add at least one variant with a price." });
    } else if (variants.length > MAX_VARIANTS) {
      errors.push({ target: "fd-ed-add-variant", message: "A product can have at most " + MAX_VARIANTS + " variants." });
    } else {
      var seenLabels = [];
      var seenIds = [];
      for (var i = 0; i < variants.length; i++) {
        (function (row, n) {
          var rowLabel = trim(row.label) || ("Variant " + n);
          var labelTarget = "fd-ed-var-label-" + row.domKey;
          var priceTarget = "fd-ed-var-price-" + row.domKey;
          var label = trim(row.label);
          if (!label) {
            errors.push({ target: labelTarget, message: "Enter a label for variant " + n + " (e.g. 1kg, bunch)." });
          } else if (label.length > 40) {
            errors.push({ target: labelTarget, message: "Keep the label for “" + label + "” under 40 characters." });
          } else {
            var labelLower = label.toLowerCase();
            if (seenLabels.indexOf(labelLower) !== -1) {
              errors.push({ target: labelTarget, message: "“" + label + "” appears twice. Each variant label must be unique within a product." });
            } else {
              seenLabels.push(labelLower);
            }
          }
          /* Identity preview uses the same rule as the payload so the
             duplicate check below can never disagree with saving. */
          var finalId = row.originalId || variantIdFromLabel(label || ("variant-" + n));
          var idLower = String(finalId).toLowerCase();
          if (seenIds.indexOf(idLower) !== -1) {
            errors.push({ target: labelTarget, message: "Two variants would share the ID “" + finalId + "”. Rename one label." });
          } else {
            seenIds.push(idLower);
          }
          var parsed = parsePrice(row.priceRaw);
          if (!parsed.ok) {
            errors.push({ target: priceTarget, message: priceErrorText(parsed.error, rowLabel) });
          }
        })(variants[i], i + 1);
      }
      var defaultFound = false;
      for (var k = 0; k < variants.length; k++) {
        if (variants[k].key === draft.defaultKey) {
          defaultFound = true;
        }
      }
      if (!defaultFound) {
        errors.push({ target: "fd-ed-variants", message: "Choose which variant price shows on product cards." });
      }
    }

    return errors;
  }

  /* Builds the canonical product entry. Callers must validate first;
     this function never invents business fields. Variant IDs of existing
     rows are preserved so cart lines keep resolving; new rows derive
     their ID from the label with numeric disambiguation.
     Image rule: a selected local file wins and its filename becomes the
     stored image reference (never a blob: URL — those die with the
     page). w/h are the measured local dimensions when available. A later
     media upload replaces the filename with the stored image address;
     without a file the existing-image field is used exactly as before. */
  function buildPayload(draft, ctx) {
    var isCreate = !!(ctx && ctx.isCreate);
    var catalog = (ctx && ctx.catalog) || {};
    var original = (ctx && ctx.original) || null;
    var knownImages = (ctx && ctx.knownImages) || [];

    var name = trim(draft.name);
    var id = isCreate
      ? productIdFromName(name, catalog)
      : original.id;

    var variants = [];
    var takenLower = [];
    var rows = draft.variants || [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].originalId) {
        takenLower.push(String(rows[i].originalId).toLowerCase());
      }
    }
    var defaultVariantId = "";
    for (i = 0; i < rows.length; i++) {
      var finalId = rows[i].originalId ||
        ensureUniqueVariantId(variantIdFromLabel(rows[i].label), takenLower);
      takenLower.push(String(finalId).toLowerCase());
      var parsed = parsePrice(rows[i].priceRaw);
      variants.push({
        id: finalId,
        label: trim(rows[i].label),
        price: parsed.ok ? parsed.value : 0
      });
      if (rows[i].key === draft.defaultKey) {
        defaultVariantId = finalId;
      }
    }
    if (!defaultVariantId && variants.length) {
      defaultVariantId = variants[0].id;
    }

    var src = "";
    var w = 0;
    var h = 0;
    var hasFile = !!draft.imageHasFile && !draft.imageFileError;
    if (hasFile) {
      src = String(draft.imageFileName || "local-image");
      w = Number(draft.imageWidth) > 0 ? Number(draft.imageWidth) : 0;
      h = Number(draft.imageHeight) > 0 ? Number(draft.imageHeight) : 0;
    } else {
      src = trim(draft.imageSrc);
      for (i = 0; i < knownImages.length; i++) {
        if (knownImages[i].src === src) {
          w = knownImages[i].w || 0;
          h = knownImages[i].h || 0;
        }
      }
      /* Unchanged edit images keep their recorded dimensions; anything
         genuinely new leaves w/h at 0, which the later media pipeline
         replaces with real dimensions on upload. 0 therefore means
         "unknown", never a measured size. */
      if (!(w > 0 && h > 0) && !isCreate && original && original.images && original.images[0] && original.images[0].src === src) {
        w = original.images[0].w || 0;
        h = original.images[0].h || 0;
      }
    }

    var payload = {
      id: id,
      name: name,
      category: draft.category,
      status: draft.status,
      defaultVariant: defaultVariantId,
      desc: trim(draft.desc),
      images: [{ src: src, alt: trim(draft.imageAlt), w: w, h: h }],
      variants: variants
    };
    /* badge is optional in the catalog (most entries omit it); an empty
       badge is omitted rather than stored as an empty string. It sits
       after status to mirror the FD_CATALOG key order. */
    var badge = trim(draft.badge);
    if (badge) {
      var withBadge = {
        id: payload.id,
        name: payload.name,
        category: payload.category,
        status: payload.status,
        badge: badge,
        defaultVariant: payload.defaultVariant,
        desc: payload.desc,
        images: payload.images,
        variants: payload.variants
      };
      return withBadge;
    }
    return payload;
  }

  /* ==========================================================================
     3. Persistence boundary — storage seam
     --------------------------------------------------------------------------
     savePayload() stores the validated product through
     window.FreshDirectAdminStore (kept in this browser today) and resolves
     { status: "saved", payload, pendingUpload }. When storage is
     unavailable it resolves { status: "dev-boundary", ... } so the UI can
     show the product for review instead of claiming it was saved. The
     future backend keeps this contract (resolving "saved" from its own
     response, rejecting on failure); every caller is reused untouched.
     Do NOT hardcode endpoint URLs here.
     ========================================================================== */
  var ProductStore = {
    savePayload: function (payload, options) {
      var opts = options || {};
      var pending = opts.pendingUpload || null;
      var saved = false;
      try {
        if (window.FreshDirectAdminStore && window.FreshDirectAdminStore.upsert) {
          saved = !!window.FreshDirectAdminStore.upsert(payload);
        }
      } catch (e) {
        saved = false;
      }
      return Promise.resolve({
        status: saved ? "saved" : "dev-boundary",
        payload: payload,
        pendingUpload: pending
      });
    }
  };

  /* ==========================================================================
     3b. Image upload boundary — media seam (frontend only)
     --------------------------------------------------------------------------
     validate/format/createPreviewURL/revokePreviewURL are real frontend
     behavior (selection gate + local preview). uploadPendingFile is the
     future seam: the backend stage implements it as a file upload that
     resolves with the stored { src, w, h } for the product payload.
     Today it always rejects with IMAGE_UPLOAD_NOT_CONFIGURED so no UI
     can claim an upload happened.
     ========================================================================== */
  function imageUploadNotConfigured() {
    var err = new Error("Image upload is not connected yet.");
    err.code = "IMAGE_UPLOAD_NOT_CONFIGURED";
    return err;
  }

  var ImageUpload = {
    acceptedTypes: IMAGE_ACCEPTED_TYPES.slice(),
    maxSize: IMAGE_MAX_SIZE,
    maxSizeLabel: IMAGE_MAX_LABEL,
    validate: validateImageFile,
    formatSize: formatFileSize,
    errorText: imageFileErrorText,
    createPreviewURL: function (file) {
      if (typeof URL !== "undefined" && URL.createObjectURL && file) {
        return URL.createObjectURL(file);
      }
      return "";
    },
    revokePreviewURL: function (url) {
      if (url && typeof URL !== "undefined" && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          /* Revoke is best-effort; a stale URL simply expires with the page. */
        }
      }
    },
    /* Future contract (later stage, no editor-UI rebuild needed):
         uploadPendingFile(file) -> Promise<{ src, w, h }>
       Uploads the File to media storage and resolves with the stored
       { src, w, h } for the product payload.
       Today: always rejects (nothing is sent, nothing is stored). */
    uploadPendingFile: function (file) {
      void file;
      return Promise.reject(imageUploadNotConfigured());
    }
  };

  /* ==========================================================================
     4. UI controller (admin-product-edit.html only)
     ========================================================================== */
  function readMode() {
    var params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {
      params = null;
    }
    var scenario = "normal";
    var id = "";
    var deliberateNew = false;
    if (params) {
      var mock = params.get("mock") || "normal";
      if (mock === "error") {
        scenario = "error";
      }
      id = trim(params.get("id") || "");
      deliberateNew = (params.get("mode") || "").toLowerCase() === "new";
    }
    if (deliberateNew || !id) {
      return { mode: "create", id: "", scenario: scenario };
    }
    return { mode: "edit", id: id, scenario: scenario };
  }

  function setFieldError(input, errorEl, message) {
    if (!input || !errorEl) {
      return;
    }
    if (message) {
      errorEl.textContent = message;
      errorEl.removeAttribute("hidden");
      input.setAttribute("aria-invalid", "true");
    } else {
      errorEl.textContent = "";
      errorEl.setAttribute("hidden", "");
      input.removeAttribute("aria-invalid");
    }
  }

  function domKeyFor(rowKey) {
    return String(rowKey).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function init() {
    if (!el("fd-ed-form")) {
      return;
    }
    var mode = readMode();

    var loadingBox = el("fd-ed-loading");
    var errorBox = el("fd-ed-error");
    var missingBox = el("fd-ed-missing");
    var content = el("fd-ed-content");
    var form = el("fd-ed-form");
    var heading = el("fd-ed-heading");
    var lead = el("fd-ed-lead");
    var topbarTitle = el("fd-ed-topbar-title");
    var submitLabel = el("fd-ed-submit-label");
    var identitySection = el("fd-ed-identity-section");
    var identityId = el("fd-ed-product-id");
    var summary = el("fd-ed-summary");
    var summaryList = el("fd-ed-summary-list");
    var variantsBox = el("fd-ed-variants");
    var variantsError = el("fd-ed-variants-error");
    var addVariantBtn = el("fd-ed-add-variant");
    var resultBox = el("fd-ed-result");
    var resultTitle = el("fd-ed-result-title");
    var resultNote = el("fd-ed-result-note");
    var resultView = el("fd-ed-result-view");
    var resultNew = el("fd-ed-result-new");
    var cancelLink = el("fd-ed-cancel");

    var nameInput = el("fd-ed-name");
    var categorySelect = el("fd-ed-category");
    var descInput = el("fd-ed-desc");
    var badgeInput = el("fd-ed-badge");
    var imageFileInput = el("fd-ed-image-file");
    var imageFileError = el("fd-ed-image-file-error");
    var imageStatus = el("fd-ed-image-status");
    var imageFileInfo = el("fd-ed-image-fileinfo");
    var imageRemoveBtn = el("fd-ed-image-remove");
    var imageSrcInput = el("fd-ed-image-src");
    var imageAltInput = el("fd-ed-image-alt");
    var imageOptions = el("fd-ed-image-options");
    var previewImg = el("fd-ed-preview-img");
    var previewCap = el("fd-ed-preview-cap");
    var submitBtn = el("fd-ed-submit");

    var catalog = null;
    var categories = [];
    var knownImages = [];
    var original = null;
    var isCreate = mode.mode === "create";
    var populating = true;
    var dirty = false;
    var submitted = false;
    var submitting = false;
    var newCounter = 0;
    /* Monotonic DOM suffix: rowCount() would be reused after a removal
       and could hand two rows the same input ids. */
    var domCounter = 0;

    /* ----- Local image state (never uploaded; preview only) ----- */
    var pendingFile = null;
    var pendingObjectURL = "";
    var pendingWidth = 0;
    var pendingHeight = 0;
    var pendingFileError = "";
    var pendingFileName = "";
    var probeToken = 0;

    function showOnly(state) {
      if (loadingBox) {
        if (state === "loading") {
          loadingBox.removeAttribute("hidden");
        } else {
          loadingBox.setAttribute("hidden", "");
        }
      }
      if (errorBox) {
        if (state === "error") {
          errorBox.removeAttribute("hidden");
        } else {
          errorBox.setAttribute("hidden", "");
        }
      }
      if (missingBox) {
        if (state === "missing") {
          missingBox.removeAttribute("hidden");
        } else {
          missingBox.setAttribute("hidden", "");
        }
      }
      if (content) {
        if (state === "ready") {
          content.removeAttribute("hidden");
        } else {
          content.setAttribute("hidden", "");
        }
      }
    }

    function markDirty() {
      if (!populating && !submitted) {
        dirty = true;
      }
    }

    /* ----- Mode headings: the seller always knows create vs edit ----- */
    function applyModeText(entry) {
      if (isCreate) {
        document.title = "Add Product | Harvest Castle Admin";
        if (heading) {
          heading.textContent = "Add Product";
        }
        if (topbarTitle) {
          topbarTitle.textContent = "Add Product";
        }
        if (lead) {
          lead.textContent = "Create a new Harvest Castle product with its pack sizes and prices.";
        }
        if (submitLabel) {
          submitLabel.textContent = "Create Product";
        }
        if (identitySection) {
          identitySection.setAttribute("hidden", "");
        }
      } else {
        document.title = "Edit " + entry.name + " | Harvest Castle Admin";
        if (heading) {
          heading.textContent = "Edit Product";
        }
        if (topbarTitle) {
          topbarTitle.textContent = "Edit Product";
        }
        if (lead) {
          lead.textContent = "Editing “" + entry.name + "” — the same product customers see on the storefront.";
        }
        if (submitLabel) {
          submitLabel.textContent = "Save Changes";
        }
        if (identitySection) {
          identitySection.removeAttribute("hidden");
        }
        if (identityId) {
          identityId.textContent = entry.id;
        }
      }
    }

    /* ----- Variant rows ----- */
    function rowCount() {
      return variantsBox ? variantsBox.querySelectorAll(".fd-edit-variant").length : 0;
    }

    function renumberRows() {
      if (!variantsBox) {
        return;
      }
      var rows = variantsBox.querySelectorAll(".fd-edit-variant");
      for (var i = 0; i < rows.length; i++) {
        var num = rows[i].querySelector(".fd-edit-variant-num");
        if (num) {
          num.textContent = "Variant " + (i + 1);
        }
        var btn = rows[i].querySelector(".fd-edit-variant-remove");
        if (btn) {
          btn.setAttribute("aria-label", "Remove variant " + (i + 1));
        }
      }
    }

    function syncRemoveAvailability() {
      if (!variantsBox) {
        return;
      }
      var rows = variantsBox.querySelectorAll(".fd-edit-variant");
      for (var i = 0; i < rows.length; i++) {
        var btn = rows[i].querySelector(".fd-edit-variant-remove");
        if (!btn) {
          continue;
        }
        if (rows.length < 2) {
          btn.setAttribute("hidden", "");
        } else {
          btn.removeAttribute("hidden");
        }
      }
    }

    function addVariantRow(opts) {
      var options = opts || {};
      var rowKey = options.key || ("new-" + (++newCounter));
      var suffix = domKeyFor(rowKey) + "-" + (domCounter++);
      var li = document.createElement("li");
      li.className = "fd-edit-variant";
      li.setAttribute("data-row-key", rowKey);
      if (options.originalId) {
        li.setAttribute("data-original-id", options.originalId);
      }

      var top = document.createElement("div");
      top.className = "fd-edit-variant-top";
      var num = document.createElement("span");
      num.className = "fd-edit-variant-num";
      num.textContent = "Variant";
      top.appendChild(num);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "fd-edit-variant-remove";
      remove.setAttribute("aria-label", "Remove this variant");
      remove.innerHTML = '<i class="far fa-trash-alt" aria-hidden="true"></i><span>Remove</span>';
      remove.addEventListener("click", function () {
        var wasDefault = li.querySelector('input[type="radio"]');
        var hadDefault = wasDefault && wasDefault.checked;
        if (li.parentNode) {
          li.parentNode.removeChild(li);
        }
        if (hadDefault) {
          var first = variantsBox.querySelector('input[type="radio"]');
          if (first) {
            first.checked = true;
          }
        }
        renumberRows();
        syncRemoveAvailability();
        hideVariantsError();
        markDirty();
      });
      top.appendChild(remove);
      li.appendChild(top);

      var fields = document.createElement("div");
      fields.className = "fd-edit-variant-fields";

      var labelWrap = document.createElement("div");
      labelWrap.className = "fd-field";
      var labelEl = document.createElement("label");
      var labelId = "fd-ed-var-label-" + suffix;
      labelEl.setAttribute("for", labelId);
      labelEl.textContent = "Variant label";
      var labelInput = document.createElement("input");
      labelInput.className = "form-control fd-edit-variant-label-input";
      labelInput.type = "text";
      labelInput.id = labelId;
      labelInput.maxLength = 40;
      labelInput.autocomplete = "off";
      labelInput.placeholder = "e.g. 1kg, bunch";
      labelInput.value = options.label || "";
      var labelErr = document.createElement("span");
      labelErr.className = "fd-field-error";
      labelErr.id = labelId + "-error";
      labelErr.setAttribute("hidden", "");
      labelInput.setAttribute("aria-describedby", labelErr.id);
      labelWrap.appendChild(labelEl);
      labelWrap.appendChild(labelInput);
      labelWrap.appendChild(labelErr);
      fields.appendChild(labelWrap);

      var priceWrap = document.createElement("div");
      priceWrap.className = "fd-field";
      var priceEl = document.createElement("label");
      var priceId = "fd-ed-var-price-" + suffix;
      priceEl.setAttribute("for", priceId);
      priceEl.textContent = "Price (\u20A6)";
      var priceInput = document.createElement("input");
      priceInput.className = "form-control";
      priceInput.type = "text";
      priceInput.id = priceId;
      priceInput.inputMode = "decimal";
      priceInput.autocomplete = "off";
      priceInput.placeholder = "e.g. 2500";
      priceInput.value = options.priceRaw != null ? String(options.priceRaw) : "";
      var priceErr = document.createElement("span");
      priceErr.className = "fd-field-error";
      priceErr.id = priceId + "-error";
      priceErr.setAttribute("hidden", "");
      priceInput.setAttribute("aria-describedby", priceErr.id);
      priceWrap.appendChild(priceEl);
      priceWrap.appendChild(priceInput);
      priceWrap.appendChild(priceErr);
      fields.appendChild(priceWrap);
      li.appendChild(fields);

      var defLabel = document.createElement("label");
      defLabel.className = "fd-edit-default";
      var defRadio = document.createElement("input");
      defRadio.type = "radio";
      defRadio.name = "fd-ed-default";
      defRadio.value = rowKey;
      defRadio.checked = !!options.isDefault;
      var defText = document.createElement("span");
      defText.textContent = "Default variant — show this price on product cards";
      defLabel.appendChild(defRadio);
      defLabel.appendChild(defText);
      li.appendChild(defLabel);

      /* Variant IDs live in the data model only (li dataset + _fd state).
         Sellers never see them: existing IDs are preserved so cart lines
         keep resolving, new IDs derive from the label at save time. */

      labelInput.addEventListener("input", function () {
        setFieldError(labelInput, labelErr, "");
        hideSummary();
        markDirty();
      });
      priceInput.addEventListener("input", function () {
        setFieldError(priceInput, priceErr, "");
        hideSummary();
        markDirty();
      });
      defRadio.addEventListener("change", function () {
        hideVariantsError();
        hideSummary();
        markDirty();
      });

      li._fd = {
        key: rowKey,
        domSuffix: suffix,
        labelInput: labelInput,
        labelErr: labelErr,
        priceInput: priceInput,
        priceErr: priceErr,
        defRadio: defRadio,
        originalId: options.originalId || ""
      };

      variantsBox.appendChild(li);
      renumberRows();
      syncRemoveAvailability();
      return li;
    }

    function readDraft() {
      var rows = [];
      var items = variantsBox.querySelectorAll(".fd-edit-variant");
      var defaultKey = "";
      for (var i = 0; i < items.length; i++) {
        var state = items[i]._fd;
        if (!state) {
          continue;
        }
        /* domKey is suffixed per row so duplicate variant ids can never
           collide as DOM ids; validation targets use these DOM ids. */
        rows.push({
          key: state.key,
          domKey: state.domSuffix,
          label: state.labelInput.value,
          priceRaw: state.priceInput.value,
          originalId: state.originalId
        });
        if (state.defRadio.checked) {
          defaultKey = state.key;
        }
      }
      var statusChecked = form.querySelector('input[name="status"]:checked');
      var fileOk = !!pendingFile && !pendingFileError;
      return {
        name: nameInput.value,
        category: categorySelect.value,
        desc: descInput.value,
        badge: badgeInput.value,
        imageSrc: imageSrcInput.value,
        imageAlt: imageAltInput.value,
        imageHasFile: fileOk,
        imageFileError: pendingFileError || "",
        imageFileName: pendingFileName || (pendingFile ? pendingFile.name : ""),
        imageFileSize: pendingFile ? pendingFile.size : 0,
        imageFileType: pendingFile ? (pendingFile.type || "") : "",
        imageWidth: pendingWidth,
        imageHeight: pendingHeight,
        status: statusChecked ? statusChecked.value : "",
        defaultKey: defaultKey,
        variants: rows
      };
    }

    function pendingUploadMeta() {
      if (!pendingFile || pendingFileError) {
        return null;
      }
      return {
        filename: pendingFile.name,
        size: pendingFile.size,
        type: pendingFile.type || "",
        width: pendingWidth,
        height: pendingHeight,
        status: "not-uploaded"
      };
    }

    /* ----- Validation display ----- */
    function hideSummary() {
      if (summary) {
        summary.setAttribute("hidden", "");
      }
    }

    function hideVariantsError() {
      if (variantsError) {
        variantsError.setAttribute("hidden", "");
        variantsError.textContent = "";
      }
    }

    function setFileError(message) {
      if (!imageFileInput || !imageFileError) {
        return;
      }
      if (message) {
        imageFileError.textContent = message;
        imageFileError.removeAttribute("hidden");
        imageFileInput.setAttribute("aria-invalid", "true");
      } else {
        imageFileError.textContent = "";
        imageFileError.setAttribute("hidden", "");
        imageFileInput.removeAttribute("aria-invalid");
      }
    }

    function clearAllErrors() {
      hideSummary();
      hideVariantsError();
      setFieldError(nameInput, el("fd-ed-name-error"), "");
      setFieldError(categorySelect, el("fd-ed-category-error"), "");
      setFieldError(descInput, el("fd-ed-desc-error"), "");
      setFieldError(badgeInput, el("fd-ed-badge-error"), "");
      setFieldError(imageSrcInput, el("fd-ed-image-src-error"), "");
      setFieldError(imageAltInput, el("fd-ed-image-alt-error"), "");
      setFileError("");
      var statusErr = el("fd-ed-status-error");
      if (statusErr) {
        statusErr.textContent = "";
        statusErr.setAttribute("hidden", "");
      }
      var items = variantsBox.querySelectorAll(".fd-edit-variant");
      for (var i = 0; i < items.length; i++) {
        if (items[i]._fd) {
          setFieldError(items[i]._fd.labelInput, items[i]._fd.labelErr, "");
          setFieldError(items[i]._fd.priceInput, items[i]._fd.priceErr, "");
        }
      }
    }

    function showErrors(errors, draft) {
      void draft;
      clearAllErrors();
      if (!errors.length) {
        return;
      }
      summaryList.innerHTML = "";
      var variantLevel = [];
      for (var i = 0; i < errors.length; i++) {
        (function (err) {
          var item = document.createElement("li");
          var link = document.createElement("a");
          link.setAttribute("href", "#" + err.target);
          link.textContent = err.message;
          item.appendChild(link);
          summaryList.appendChild(item);
          var target = document.getElementById(err.target);
          if (target && target.classList && target.classList.contains("form-control")) {
            var row = target.closest ? target.closest(".fd-edit-variant") : null;
            var errEl = row && row._fd
              ? (target === row._fd.labelInput ? row._fd.labelErr : row._fd.priceErr)
              : document.getElementById(err.target + "-error");
            setFieldError(target, errEl, err.message);
            if (err.target === "fd-ed-image-file") {
              setFileError(err.message);
            }
          } else if (err.target === "fd-ed-image-file") {
            setFileError(err.message);
          } else if (err.target === "fd-ed-variants" || err.target === "fd-ed-add-variant") {
            variantLevel.push(err.message);
          } else if (err.target === "fd-ed-status-in") {
            var statusErr = el("fd-ed-status-error");
            if (statusErr) {
              statusErr.textContent = err.message;
              statusErr.removeAttribute("hidden");
            }
          } else if (err.target === "fd-ed-category") {
            setFieldError(categorySelect, el("fd-ed-category-error"), err.message);
          }
          /* The existing-image field lives inside a collapsed disclosure;
             open it so an error there is never hidden from the seller. */
          if (err.target === "fd-ed-image-src" && imageSrcInput) {
            var refGroup = imageSrcInput.closest
              ? imageSrcInput.closest("details")
              : null;
            if (refGroup) {
              refGroup.open = true;
            }
          }
        })(errors[i]);
      }
      if (variantLevel.length && variantsError) {
        variantsError.textContent = variantLevel.join(" ");
        variantsError.removeAttribute("hidden");
      }
      summary.removeAttribute("hidden");
      summary.focus();
      summary.scrollIntoView({ block: "start" });
    }

    /* ----- Image state: file (primary) vs reference (secondary) ----- */
    function hasLocalFile() {
      return !!pendingFile && !pendingFileError && !!pendingObjectURL;
    }

    function revokePendingURL() {
      if (pendingObjectURL) {
        ImageUpload.revokePreviewURL(pendingObjectURL);
        pendingObjectURL = "";
      }
    }

    function clearPendingFile() {
      revokePendingURL();
      pendingFile = null;
      pendingFileName = "";
      pendingWidth = 0;
      pendingHeight = 0;
      pendingFileError = "";
      if (imageFileInput) {
        /* Reset so choosing the same file again still fires change. */
        try {
          imageFileInput.value = "";
        } catch (e) {
          /* Value reset is best-effort. */
        }
      }
      setFileError("");
      updateImageStatus();
      syncPreview();
    }

    function updateImageStatus() {
      if (!imageStatus) {
        return;
      }
      if (pendingFileError) {
        imageStatus.textContent = "The selected image needs attention — see the error above.";
      } else if (hasLocalFile()) {
        var bits = "Selected “" + pendingFile.name + "” (" + formatFileSize(pendingFile.size) + ")";
        if (pendingWidth > 0 && pendingHeight > 0) {
          bits += " · " + pendingWidth + " × " + pendingHeight + " px";
        }
        bits += " — previewed on this device.";
        var ref = trim(imageSrcInput ? imageSrcInput.value : "");
        if (ref) {
          bits += " The existing image below is ignored while a file is selected.";
        }
        imageStatus.textContent = bits;
      } else {
        var current = trim(imageSrcInput ? imageSrcInput.value : "");
        if (current) {
          imageStatus.textContent = isCreate
            ? "Using the image below for preview."
            : "Using the current product image. Choose a file above to replace it.";
        } else {
          imageStatus.textContent = "No image selected yet.";
        }
      }
      if (imageFileInfo) {
        if (hasLocalFile()) {
          var detail = pendingFile.name + " · " + formatFileSize(pendingFile.size);
          if (pendingWidth > 0 && pendingHeight > 0) {
            detail += " · " + pendingWidth + " × " + pendingHeight + " px";
          }
          imageFileInfo.textContent = detail;
          imageFileInfo.removeAttribute("hidden");
        } else {
          imageFileInfo.textContent = "";
          imageFileInfo.setAttribute("hidden", "");
        }
      }
      if (imageRemoveBtn) {
        if (hasLocalFile()) {
          imageRemoveBtn.removeAttribute("hidden");
        } else {
          imageRemoveBtn.setAttribute("hidden", "");
        }
      }
    }

    function handleFileSelect() {
      if (!imageFileInput) {
        return;
      }
      var files = imageFileInput.files;
      var file = files && files.length ? files[0] : null;
      if (!file) {
        /* Dialog cancelled: keep whatever was selected before. */
        return;
      }
      hideSummary();
      var checked = validateImageFile(file);
      if (!checked.ok) {
        revokePendingURL();
        pendingFile = file;
        pendingFileName = file.name || "";
        pendingWidth = 0;
        pendingHeight = 0;
        pendingFileError = checked.error;
        pendingObjectURL = "";
        setFileError(imageFileErrorText(checked.error, file.name));
        updateImageStatus();
        syncPreview();
        if (imageFileInput) {
          imageFileInput.focus();
        }
        return;
      }
      /* Valid selection replaces any previous file. */
      revokePendingURL();
      pendingFile = file;
      pendingFileName = file.name || "";
      pendingWidth = 0;
      pendingHeight = 0;
      pendingFileError = "";
      setFileError("");
      var url = ImageUpload.createPreviewURL(file);
      if (!url) {
        pendingFileError = "unreadable";
        setFileError(imageFileErrorText("unreadable", file.name));
        updateImageStatus();
        syncPreview();
        return;
      }
      pendingObjectURL = url;
      var token = ++probeToken;
      imageStatus.textContent = "Checking “" + file.name + "”…";
      /* Measure real dimensions + prove the file decodes as an image
         before it can reach the payload. */
      var probe = new Image();
      probe.onload = function () {
        if (token !== probeToken) {
          return;
        }
        pendingWidth = probe.naturalWidth || 0;
        pendingHeight = probe.naturalHeight || 0;
        updateImageStatus();
        syncPreview();
        markDirty();
      };
      probe.onerror = function () {
        if (token !== probeToken) {
          return;
        }
        revokePendingURL();
        pendingFileError = "unreadable";
        setFileError(imageFileErrorText("unreadable", file.name));
        updateImageStatus();
        syncPreview();
      };
      probe.src = url;
      updateImageStatus();
      syncPreview();
    }

    /* ----- Image preview (file or existing image, never a fake) --------
       A selected file always wins and previews immediately. Otherwise the
       existing-image field drives the preview. blob: URLs never reach
       the saved product (see buildPayload). */
    var previewTimer = null;
    function syncPreview() {
      var alt = trim(imageAltInput.value);
      if (hasLocalFile()) {
        window.clearTimeout(previewTimer);
        previewImg.onload = function () {
          previewImg.removeAttribute("hidden");
          previewCap.textContent = alt || pendingFileName || "Selected image";
        };
        previewImg.onerror = function () {
          previewImg.setAttribute("hidden", "");
          previewImg.removeAttribute("src");
          previewCap.textContent = "Preview could not be loaded. Try another file.";
        };
        previewImg.setAttribute("alt", alt || pendingFileName || "Selected product image preview");
        if (previewImg.getAttribute("src") !== pendingObjectURL) {
          previewImg.setAttribute("src", pendingObjectURL);
        } else {
          previewImg.removeAttribute("hidden");
          previewCap.textContent = alt || pendingFileName || "Selected image";
        }
        return;
      }
      var src = trim(imageSrcInput.value);
      if (pendingFileError) {
        /* Invalid file: fall back to whatever the existing image shows, so
           the seller keeps context while fixing the file. */
      }
      if (!src) {
        window.clearTimeout(previewTimer);
        previewImg.setAttribute("hidden", "");
        previewImg.removeAttribute("src");
        previewCap.textContent = pendingFileError
          ? "Fix the image file above to see its preview."
          : "Image preview appears here.";
        return;
      }
      previewCap.textContent = "Loading preview…";
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(function () {
        previewImg.onload = function () {
          previewImg.removeAttribute("hidden");
          previewCap.textContent = alt || "Preview loaded.";
        };
        previewImg.onerror = function () {
          previewImg.setAttribute("hidden", "");
          previewImg.removeAttribute("src");
          previewCap.textContent = "Preview could not be loaded. Check the image and try again.";
        };
        previewImg.setAttribute("alt", alt || "Product image preview");
        previewImg.setAttribute("src", src);
      }, 250);
    }

    /* ----- Static selects ----- */
    function populateCategories(selected) {
      categorySelect.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choose a category…";
      categorySelect.appendChild(placeholder);
      for (var i = 0; i < categories.length; i++) {
        var opt = document.createElement("option");
        opt.value = categories[i];
        opt.textContent = categories[i];
        categorySelect.appendChild(opt);
      }
      categorySelect.value = selected || "";
    }

    function populateImageOptions() {
      if (imageOptions) {
        imageOptions.innerHTML = "";
        for (var i = 0; i < knownImages.length; i++) {
          var opt = document.createElement("option");
          opt.value = knownImages[i].src;
          opt.label = knownImages[i].alt || knownImages[i].src;
          imageOptions.appendChild(opt);
        }
      }
      /* Visible dropdown right after the reuse text, so the seller can see
         what exists without guessing paths. The text field stays as the
         source of truth for pasting custom addresses. */
      var pick = el("fd-ed-image-pick");
      if (pick) {
        pick.innerHTML = "";
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose an existing image…";
        pick.appendChild(placeholder);
        for (var k = 0; k < knownImages.length; k++) {
          var choice = document.createElement("option");
          choice.value = knownImages[k].src;
          choice.textContent = knownImages[k].alt || knownImages[k].src;
          pick.appendChild(choice);
        }
      }
      syncImagePick();
    }

    /* Keeps the visible dropdown in step with the text field: exact match
       selects it, anything custom resets to the placeholder. */
    function syncImagePick() {
      var pick = el("fd-ed-image-pick");
      if (!pick || !imageSrcInput) {
        return;
      }
      var current = trim(imageSrcInput.value);
      var found = false;
      for (var i = 0; i < pick.options.length; i++) {
        if (pick.options[i].value && pick.options[i].value === current) {
          found = true;
        }
      }
      pick.value = found ? current : "";
    }

    /* ----- Submit (validates, normalizes, builds payload, honest boundary) ----- */
    function setSubmitting(on) {
      submitting = on;
      if (submitBtn) {
        submitBtn.disabled = on;
        if (on) {
          submitBtn.setAttribute("aria-busy", "true");
        } else {
          submitBtn.removeAttribute("aria-busy");
        }
      }
      if (submitLabel) {
        if (on) {
          submitLabel.textContent = "Saving…";
        } else {
          submitLabel.textContent = isCreate ? "Create Product" : "Save Changes";
        }
      }
    }

    function showSubmitFailure(message) {
      summaryList.innerHTML = "";
      var item = document.createElement("li");
      item.textContent = message;
      summaryList.appendChild(item);
      var title = el("fd-ed-summary-title");
      if (title) {
        title.textContent = "The product could not be saved.";
      }
      summary.removeAttribute("hidden");
      summary.focus();
      summary.scrollIntoView({ block: "start" });
    }

    function onSubmit(ev) {
      ev.preventDefault();
      if (submitting || submitted) {
        return;
      }
      if (resultBox && !resultBox.hasAttribute("hidden")) {
        resultBox.setAttribute("hidden", "");
      }
      var draft = readDraft();
      var errors = validateProduct(draft, { categories: categories });
      if (errors.length) {
        showErrors(errors, draft);
        var first = errors[0] && document.getElementById(errors[0].target);
        if (first && first.focus) {
          try {
            first.focus({ preventScroll: true });
          } catch (e) {
            first.focus();
          }
        }
        return;
      }
      clearAllErrors();
      var payload = buildPayload(draft, {
        isCreate: isCreate,
        catalog: catalog,
        original: original,
        knownImages: knownImages
      });
      var pending = pendingUploadMeta();
      setSubmitting(true);
      ProductStore.savePayload(payload, { mode: isCreate ? "create" : "edit", pendingUpload: pending }).then(function (result) {
        setSubmitting(false);
        submitted = true;
        showResult(result.payload, result.pendingUpload || pending, result.status);
      }, function () {
        setSubmitting(false);
        showSubmitFailure("Something went wrong. Nothing was saved — check your entries and try again.");
      });
    }

    function availabilityLabel(status) {
      if (status === "out") {
        return "Out of Stock";
      }
      if (status === "limited") {
        return "Limited";
      }
      return "Available";
    }

    /* Seller-facing confirmation: a readable product summary. The future
       backend keeps driving this same state ("saved" from its response);
       only the wording for the not-stored fallback differs. */
    function showResult(payload, pendingUpload, status) {
      var saved = status === "saved";
      if (resultTitle) {
        if (!saved) {
          resultTitle.textContent = "Product ready for review";
        } else if (isCreate) {
          resultTitle.textContent = "Product created";
        } else {
          resultTitle.textContent = "Changes saved";
        }
      }
      resultNote.innerHTML = "";
      resultNote.className = "fd-admin-notice" + (saved ? " is-success" : "");
      var strong = document.createElement("strong");
      if (!saved) {
        strong.textContent = "Review your product.";
        resultNote.appendChild(strong);
        resultNote.appendChild(document.createTextNode(
          "“" + payload.name + "” passed all checks but could not be stored in this browser. It is shown below for review — nothing was added to your products."
        ));
      } else if (isCreate) {
        strong.textContent = "Product created.";
        resultNote.appendChild(strong);
        resultNote.appendChild(document.createTextNode(
          "“" + payload.name + "” was added to your products."
        ));
      } else {
        strong.textContent = "Changes saved.";
        resultNote.appendChild(strong);
        resultNote.appendChild(document.createTextNode(
          "“" + payload.name + "” was updated in your products."
        ));
      }
      if (saved && pendingUpload) {
        resultNote.appendChild(document.createTextNode(
          " The photo you chose is previewed on this device only and is not stored yet."
        ));
      }
      renderResultSummary(payload);
      if (isCreate) {
        if (resultView) {
          resultView.setAttribute("hidden", "");
        }
        if (resultNew) {
          resultNew.removeAttribute("hidden");
        }
      } else {
        if (resultView) {
          resultView.removeAttribute("hidden");
          resultView.setAttribute("href", "product-details.html?id=" + encodeURIComponent(payload.id));
          resultView.setAttribute("title", "Opens the customer product page.");
        }
        if (resultNew) {
          resultNew.setAttribute("hidden", "");
        }
      }
      form.setAttribute("hidden", "");
      resultBox.removeAttribute("hidden");
      resultTitle.focus();
      resultBox.scrollIntoView({ block: "start" });
    }

    function renderResultSummary(payload) {
      var host = el("fd-ed-result-summary");
      if (!host) {
        return;
      }
      host.innerHTML = "";
      var card = document.createElement("div");
      card.className = "fd-edit-result-card";

      var image = (payload.images && payload.images[0]) || { src: "", alt: "" };
      if (image.src) {
        var thumb = document.createElement("span");
        thumb.className = "fd-edit-result-thumb";
        thumb.setAttribute("aria-hidden", "true");
        var thumbImg = document.createElement("img");
        thumbImg.setAttribute("src", image.src);
        thumbImg.setAttribute("alt", "");
        thumbImg.setAttribute("loading", "lazy");
        thumbImg.setAttribute("decoding", "async");
        thumbImg.onerror = function () {
          thumbImg.style.display = "none";
        };
        thumb.appendChild(thumbImg);
        card.appendChild(thumb);
      }

      var body = document.createElement("div");
      body.className = "fd-edit-result-body";
      var name = document.createElement("strong");
      name.className = "fd-edit-result-name";
      name.textContent = payload.name;
      body.appendChild(name);
      var meta = document.createElement("span");
      meta.className = "fd-edit-result-meta";
      meta.textContent = payload.category + " · " + availabilityLabel(payload.status);
      body.appendChild(meta);

      var variants = payload.variants || [];
      if (variants.length) {
        var list = document.createElement("ul");
        list.className = "fd-edit-result-variants";
        for (var i = 0; i < variants.length; i++) {
          var line = document.createElement("li");
          line.textContent = variants[i].label + " — " + fmtNaira(variants[i].price) +
            (variants[i].id === payload.defaultVariant ? " (default)" : "");
          list.appendChild(line);
        }
        body.appendChild(list);
      }

      if (payload.desc) {
        var desc = document.createElement("p");
        desc.className = "fd-edit-result-desc";
        desc.textContent = payload.desc;
        body.appendChild(desc);
      }
      card.appendChild(body);
      host.appendChild(card);
    }

    /* ----- Boot ----- */
    function boot() {
      showOnly("loading");
      populating = true;
      var data;
      try {
        if (mode.scenario === "error") {
          throw getCatalogError();
        }
        data = getCatalog();
      } catch (e) {
        populating = false;
        showOnly("error");
        return;
      }
      catalog = data;
      categories = listCategories(catalog);
      knownImages = listKnownImages(catalog);

      if (!isCreate) {
        original = catalog[mode.id] || null;
        if (!original) {
          populating = false;
          var missingText = el("fd-ed-missing-text");
          if (missingText) {
            missingText.textContent = "No product with ID “" + mode.id + "” exists. Nothing was created or changed — check the Products list for the correct item.";
          }
          showOnly("missing");
          document.title = "Product not found | Harvest Castle Admin";
          return;
        }
      }

      applyModeText(original || { name: "" });
      populateCategories(isCreate ? "" : original.category);
      populateImageOptions();

      if (isCreate) {
        nameInput.value = "";
        descInput.value = "";
        badgeInput.value = "";
        imageSrcInput.value = "";
        imageAltInput.value = "";
        addVariantRow({ label: "", priceRaw: "", isDefault: true });
      } else {
        nameInput.value = original.name || "";
        descInput.value = original.desc || "";
        badgeInput.value = original.badge || "";
        var firstImage = (original.images && original.images[0]) || { src: "", alt: "" };
        imageSrcInput.value = firstImage.src || "";
        imageAltInput.value = firstImage.alt || "";
        var statusRadio = form.querySelector('input[name="status"][value="' + original.status + '"]');
        if (statusRadio) {
          statusRadio.checked = true;
        }
        var variants = original.variants || [];
        for (var i = 0; i < variants.length; i++) {
          addVariantRow({
            key: variants[i].id,
            originalId: variants[i].id,
            label: variants[i].label,
            priceRaw: variants[i].price,
            isDefault: variants[i].id === (original.defaultVariant || (variants[0] && variants[0].id))
          });
        }
        if (!variants.length) {
          addVariantRow({ label: "", priceRaw: "", isDefault: true });
        }
      }

      populating = false;
      showOnly("ready");
      syncImagePick();
      updateImageStatus();
      syncPreview();
    }

    function getCatalogError() {
      var err = new Error("Product data could not be loaded.");
      err.code = "PRODUCTS_LOAD_FAILED";
      return err;
    }

    /* ----- Wiring ----- */
    form.addEventListener("submit", onSubmit);

    var tracked = [nameInput, categorySelect, descInput, badgeInput, imageSrcInput, imageAltInput];
    for (var t = 0; t < tracked.length; t++) {
      (function (input) {
        if (!input) {
          return;
        }
        input.addEventListener("input", markDirty);
        input.addEventListener("change", function () {
          markDirty();
          var map = {
            "fd-ed-name": "fd-ed-name-error",
            "fd-ed-category": "fd-ed-category-error",
            "fd-ed-desc": "fd-ed-desc-error",
            "fd-ed-badge": "fd-ed-badge-error",
            "fd-ed-image-src": "fd-ed-image-src-error",
            "fd-ed-image-alt": "fd-ed-image-alt-error"
          };
          var errEl = el(map[input.id]);
          setFieldError(input, errEl, "");
          hideSummary();
        });
      })(tracked[t]);
    }
    form.addEventListener("change", function (ev) {
      if (ev.target && ev.target.name === "status") {
        var statusErr = el("fd-ed-status-error");
        if (statusErr) {
          statusErr.textContent = "";
          statusErr.setAttribute("hidden", "");
        }
        hideSummary();
        markDirty();
      }
    });
    imageSrcInput.addEventListener("input", function () {
      setFieldError(imageSrcInput, el("fd-ed-image-src-error"), "");
      hideSummary();
      syncImagePick();
      updateImageStatus();
      syncPreview();
    });
    imageAltInput.addEventListener("input", syncPreview);

    var imagePick = el("fd-ed-image-pick");
    if (imagePick) {
      imagePick.addEventListener("change", function () {
        imageSrcInput.value = imagePick.value;
        setFieldError(imageSrcInput, el("fd-ed-image-src-error"), "");
        hideSummary();
        markDirty();
        updateImageStatus();
        syncPreview();
      });
    }

    if (imageFileInput) {
      imageFileInput.addEventListener("change", handleFileSelect);
    }
    if (imageRemoveBtn) {
      imageRemoveBtn.addEventListener("click", function () {
        hideSummary();
        setFileError("");
        clearPendingFile();
        markDirty();
        if (imageFileInput) {
          imageFileInput.focus();
        }
      });
    }
    /* Free the object URL if the seller leaves; previews never persist. */
    window.addEventListener("pagehide", function () {
      revokePendingURL();
    });

    if (addVariantBtn) {
      addVariantBtn.addEventListener("click", function () {
        hideVariantsError();
        hideSummary();
        var li = addVariantRow({ label: "", priceRaw: "", isDefault: rowCount() === 0 });
        markDirty();
        var input = li.querySelector(".fd-edit-variant-label-input");
        if (input) {
          input.focus();
        }
      });
    }

    var retryBtn = el("fd-ed-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        window.location.reload();
      });
    }

    if (cancelLink) {
      cancelLink.addEventListener("click", function (ev) {
        if (dirty && !submitted) {
          var leave = window.confirm("Leave without saving? Your changes will be lost.");
          if (!leave) {
            ev.preventDefault();
          }
        }
      });
    }

    window.addEventListener("beforeunload", function (ev) {
      if (dirty && !submitted) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    });

    boot();
  }

  /* Testable seam: Django integration plus automated checks use these. */
  if (typeof window !== "undefined") {
    window.FreshDirectAdminProductEditor = {
      readMode: readMode,
      listCategories: listCategories,
      listKnownImages: listKnownImages,
      variantIdFromLabel: variantIdFromLabel,
      ensureUniqueVariantId: ensureUniqueVariantId,
      productIdFromName: productIdFromName,
      parsePrice: parsePrice,
      validateImageFile: validateImageFile,
      imageFileErrorText: imageFileErrorText,
      formatFileSize: formatFileSize,
      validate: validateProduct,
      buildPayload: buildPayload,
      maxVariants: MAX_VARIANTS,
      maxPrice: MAX_PRICE,
      imageMaxSize: IMAGE_MAX_SIZE,
      imageMaxLabel: IMAGE_MAX_LABEL,
      imageAcceptedTypes: IMAGE_ACCEPTED_TYPES.slice()
    };
    window.FreshDirectAdminProductStore = ProductStore;
    window.FreshDirectAdminImageUpload = ImageUpload;
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
