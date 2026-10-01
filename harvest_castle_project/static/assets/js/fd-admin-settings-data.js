/* ==========================================================================
   Harvest Castle Admin — Settings source boundary (Stage 5: Admin Settings)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store and never loads fresh-direct.js, so customer
   state cannot leak into the seller area.

   CANONICAL SETTINGS SHAPE (the seller's operational record for V1):
     { businessName, contactPhone, whatsapp, address, description }
   Every default below is an established Harvest Castle truth, taken from
   the live storefront — never invented:
     - businessName "Harvest Castle" (site identity everywhere).
     - whatsapp "2349011058873" (FRESH_DIRECT.whatsappNumber, the single
       centralized ordering/contact number).
     - address: the outlet line used across the storefront footers.
     - description: the storefront footer summary.
     - contactPhone starts EMPTY: no seller call number is established
       anywhere in the project, so none is invented. It stays "Not set"
       until the seller genuinely adds one.
   Delivery information (on-campus / off-campus modes, outlet hours) is
   architecture, not seller input: the Settings page displays the modes
   exactly as checkout offers them. No toggles are invented that the
   storefront cannot yet honour, and no payment, tax, rider, inventory
   or multi-seller settings exist in V1.

   CURRENT SOURCE (frontend-only phase):
     Seller edits are validated here and kept in this browser
     (localStorage "freshdirect_admin_settings_v1") through this same
     service. updateSettings() reports the genuine result: success means
     "saved in this browser" — never a database claim — and failures
     (invalid values, unavailable storage) are reported truthfully with
     per-field messages. The admin order follow-up link reads
     getWhatsAppNumber(), so a saved WhatsApp change genuinely takes
     effect in the admin while the storefront keeps its own centralized
     configuration until the backend owns it.

   DJANGO INTEGRATION (later stage, no settings-UI rebuild needed):
     - Replace the bodies of getSettings()/updateSettings() with API
       calls (GET settings, PATCH/PUT settings payload) that resolve the
       SAME canonical shape and the SAME result shape
       { ok, settings?, errors? }.
     - Validation errors from the backend merge into `errors` by field
       name; every renderer below is reused untouched.
     - Keep this file's public signatures so fd-admin-settings.js and
       fd-admin-orders-data.js are reused untouched.
     - Do NOT hardcode endpoint URLs here.
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "freshdirect_admin_settings_v1";

  /* Central store number (digits only). Mirrors
     FRESH_DIRECT.whatsappNumber (assets/js/fresh-direct.js), which
     mirrors the future Django setting WHATSAPP_NUMBER. Never add a
     second number: overrides live in the settings record above. */
  var CENTRAL_WHATSAPP = "2349011058873";

  /* Established storefront truths (see header). Displayed where the
     seller needs context; edited only through the validated record. */
  var DELIVERY_INFO = {
    onCampus: {
      label: "On Campus",
      detail: "Hostel, faculty or office inside FUNAAB."
    },
    offCampus: {
      label: "Off Campus",
      detail: "Home or hostel around Camp and Abeokuta."
    },
    outlet: "No. 89, behind Foursquare Church, FUNAAB Alabata Road, Camp, Abeokuta.",
    hours: "Mon - Sat: 09.00 to 06.00"
  };

  var DEFAULTS = {
    businessName: "Harvest Castle",
    contactPhone: "",
    whatsapp: CENTRAL_WHATSAPP,
    address: "No. 89, behind Foursquare Church, FUNAAB Alabata Road, Camp, Abeokuta.",
    description: "Farm produce sold directly to you. Shop online on the website, or order through WhatsApp \u2014 serving the FUNAAB and Abeokuta community."
  };

  var FIELDS = ["businessName", "contactPhone", "whatsapp", "address", "description"];

  function asText(value) {
    return typeof value === "string" ? value : "";
  }

  /* ---------- Storage ---------- */
  function localStore() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage;
      }
    } catch (e) {
      /* private mode — callers treat this as unavailable */
    }
    return null;
  }

  function readStored() {
    var store = localStore();
    if (!store) {
      return {};
    }
    try {
      var raw = store.getItem(STORE_KEY);
      if (!raw) {
        return {};
      }
      var data = JSON.parse(raw);
      var saved = (data && data.settings) || {};
      var out = {};
      for (var i = 0; i < FIELDS.length; i++) {
        if (typeof saved[FIELDS[i]] === "string") {
          out[FIELDS[i]] = saved[FIELDS[i]];
        }
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function writeStored(settings) {
    var store = localStore();
    if (!store) {
      return false;
    }
    try {
      store.setItem(STORE_KEY, JSON.stringify({ v: 1, settings: settings }));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Normalization ---------- */
  /* WhatsApp / phone input tolerance: spaces, dashes and brackets are
     ignored; a leading 0 becomes the 234 country code; a leading +
     is dropped. Stored canonically as digits for wa.me links. */
  function normalizePhone(value) {
    var digits = asText(value).replace(/[^\d+]/g, "");
    if (digits.charAt(0) === "+") {
      digits = digits.slice(1);
    }
    digits = digits.replace(/\D/g, "");
    if (/^0\d+/.test(digits)) {
      digits = "234" + digits.slice(1);
    }
    return digits;
  }

  function isNigerianMobile(digits) {
    return /^234[789][01]\d{8}$/.test(digits);
  }

  /* ---------- Validation (client-side only; Django re-validates) ---------- */
  function validate(settings) {
    var errors = {};
    var name = asText(settings.businessName).trim();
    if (!name) {
      errors.businessName = "Enter your business name.";
    } else if (name.length < 2) {
      errors.businessName = "Business name must be at least 2 characters.";
    } else if (name.length > 80) {
      errors.businessName = "Business name must be 80 characters or fewer.";
    }
    var phone = asText(settings.contactPhone).trim();
    if (phone && !isNigerianMobile(normalizePhone(phone))) {
      errors.contactPhone = "Enter a valid Nigerian phone number, or leave it empty.";
    }
    var wa = asText(settings.whatsapp).trim();
    if (!wa) {
      errors.whatsapp = "Enter the WhatsApp number customers should reach.";
    } else if (!isNigerianMobile(normalizePhone(wa))) {
      errors.whatsapp = "Enter a valid Nigerian WhatsApp number.";
    }
    var address = asText(settings.address).trim();
    if (!address) {
      errors.address = "Enter your business address.";
    } else if (address.length < 5) {
      errors.address = "Business address looks too short.";
    } else if (address.length > 300) {
      errors.address = "Business address must be 300 characters or fewer.";
    }
    var desc = asText(settings.description).trim();
    if (desc.length > 500) {
      errors.description = "Description must be 500 characters or fewer.";
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  function canonicalize(settings) {
    return {
      businessName: asText(settings.businessName).trim(),
      contactPhone: asText(settings.contactPhone).trim(),
      whatsapp: normalizePhone(asText(settings.whatsapp)),
      address: asText(settings.address).trim(),
      description: asText(settings.description).trim()
    };
  }

  /* ---------- Public boundary ---------- */

  /* Current settings: established defaults overlaid with anything the
     seller genuinely saved in this browser. Always returns a fresh
     object in the canonical shape. */
  function getSettings() {
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      out[FIELDS[i]] = DEFAULTS[FIELDS[i]];
    }
    var stored = readStored();
    var keys = Object.keys(stored);
    for (var j = 0; j < keys.length; j++) {
      if (FIELDS.indexOf(keys[j]) !== -1) {
        out[keys[j]] = stored[keys[j]];
      }
    }
    return canonicalizeLight(out);
  }

  /* Defaults are already canonical except stored overrides, which are
     re-validated on read so a hand-edited record can never inject a
     malformed WhatsApp number into admin links. */
  function canonicalizeLight(settings) {
    var out = {};
    for (var i = 0; i < FIELDS.length; i++) {
      out[FIELDS[i]] = asText(settings[FIELDS[i]]);
    }
    if (out.whatsapp && !isNigerianMobile(out.whatsapp)) {
      var fixed = normalizePhone(out.whatsapp);
      out.whatsapp = isNigerianMobile(fixed) ? fixed : CENTRAL_WHATSAPP;
    }
    if (!out.whatsapp) {
      out.whatsapp = CENTRAL_WHATSAPP;
    }
    return out;
  }

  /* Validate -> persist through the settings service.
     Django stage: PATCH the payload and resolve the same result shape
     { ok, settings?, errors? }. */
  function updateSettings(patch) {
    var next = getSettings();
    var incoming = patch && typeof patch === "object" ? patch : {};
    for (var i = 0; i < FIELDS.length; i++) {
      if (typeof incoming[FIELDS[i]] === "string") {
        next[FIELDS[i]] = incoming[FIELDS[i]];
      }
    }
    var checked = validate(next);
    if (!checked.ok) {
      return { ok: false, settings: null, errors: checked.errors };
    }
    var canonical = canonicalize(next);
    if (!writeStored(canonical)) {
      return {
        ok: false,
        settings: null,
        errors: {
          _form: "Your changes could not be saved in this browser. Please try again."
        }
      };
    }
    /* Read back so success is only reported for a genuinely stored change. */
    var verify = getSettings();
    for (var j = 0; j < FIELDS.length; j++) {
      if (verify[FIELDS[j]] !== canonical[FIELDS[j]]) {
        return {
          ok: false,
          settings: null,
          errors: {
            _form: "Your changes could not be saved in this browser. Please try again."
          }
        };
      }
    }
    return { ok: true, settings: verify, errors: {} };
  }

  /* The single WhatsApp source for admin surfaces (order follow-ups).
     Falls back to the centralized digits when nothing valid is stored. */
  function getWhatsAppNumber() {
    try {
      var current = getSettings();
      if (current.whatsapp && isNigerianMobile(current.whatsapp)) {
        return current.whatsapp;
      }
    } catch (e) {
      /* fall through to the centralized digits */
    }
    return CENTRAL_WHATSAPP;
  }

  function getDeliveryInfo() {
    return {
      onCampus: { label: DELIVERY_INFO.onCampus.label, detail: DELIVERY_INFO.onCampus.detail },
      offCampus: { label: DELIVERY_INFO.offCampus.label, detail: DELIVERY_INFO.offCampus.detail },
      outlet: DELIVERY_INFO.outlet,
      hours: DELIVERY_INFO.hours
    };
  }

  if (typeof window !== "undefined") {
    window.FreshDirectAdminSettings = {
      source: "local-record",
      sourceNote:
        "Seller record kept in this browser. Replace internals with Django settings endpoints.",
      storeKey: STORE_KEY,
      fields: FIELDS.slice(),
      centralWhatsApp: CENTRAL_WHATSAPP,
      getSettings: getSettings,
      updateSettings: updateSettings,
      validate: validate,
      normalizePhone: normalizePhone,
      getWhatsAppNumber: getWhatsAppNumber,
      getDeliveryInfo: getDeliveryInfo
    };
  }
})();
