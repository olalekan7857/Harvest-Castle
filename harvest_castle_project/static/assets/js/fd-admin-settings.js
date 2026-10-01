/* ==========================================================================
   Harvest Castle Admin — Settings renderer (Stage 5)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. Admin-scoped: never touches
   the customer cart store or fresh-direct.js.

   Boundary:
     window.FreshDirectAdminSettings (fd-admin-settings-data.js) is the
     ONLY place this UI meets settings data. Forms render from
     getSettings(), save through updateSettings(), and report only
     genuine results. Django stage: the service internals become API
     calls with the same signatures; every function below is reused
     untouched.

   Honesty rules enforced here:
     - Success is shown only after the service verifies the stored
       record (read-back inside updateSettings()).
     - Validation failures show per-field messages; storage failures
       show a truthful form-level error. Nothing is ever faked.
     - The Account section never fabricates security: password changes
       stay with the store owner (same pattern as the login page), and
       Log out mirrors the shell session boundary exactly.
   ========================================================================== */
(function () {
  "use strict";

  function svc() {
    return window.FreshDirectAdminSettings || null;
  }

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

  /* ---------- Page states ---------- */
  function showLoading(on) {
    var loading = document.getElementById("fd-set-loading");
    var content = document.getElementById("fd-set-content");
    var error = document.getElementById("fd-set-error");
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
    var loading = document.getElementById("fd-set-loading");
    var content = document.getElementById("fd-set-content");
    var error = document.getElementById("fd-set-error");
    if (loading) {
      loading.setAttribute("hidden", "");
    }
    if (content) {
      content.setAttribute("hidden", "");
    }
    if (error) {
      error.removeAttribute("hidden");
      var retry = document.getElementById("fd-set-retry");
      if (retry) {
        retry.focus();
      }
    }
  }

  /* ---------- Field helpers (checkout convention) ---------- */
  function setFieldError(input, message) {
    if (!input) {
      return;
    }
    var err = document.getElementById(input.id + "-error");
    if (message) {
      input.setAttribute("aria-invalid", "true");
      if (err) {
        err.textContent = message;
        err.removeAttribute("hidden");
        input.setAttribute("aria-describedby", err.id);
      }
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      if (err) {
        err.textContent = "";
        err.setAttribute("hidden", "");
      }
    }
  }

  function setNote(id, message, isError) {
    var note = document.getElementById(id);
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

  /* ---------- Editable section controller ----------
     One controller per form: snapshot on fill, dirty tracking on input,
     validated save through the service, discard restores the snapshot.
     cfg: { form, fields: [ids], save, discard, dirty, note,
            pick(values)->payload, labels } */
  function sectionController(cfg) {
    var s = svc();
    var form = document.getElementById(cfg.form);
    if (!form || !s) {
      return null;
    }
    var inputs = [];
    for (var i = 0; i < cfg.fields.length; i++) {
      var el = document.getElementById(cfg.fields[i]);
      if (el) {
        inputs.push(el);
      }
    }
    var saveBtn = document.getElementById(cfg.save);
    var discardBtn = document.getElementById(cfg.discard);
    var dirtyHint = document.getElementById(cfg.dirty);
    var snapshot = {};

    function readForm() {
      var values = {};
      for (var i = 0; i < inputs.length; i++) {
        values[inputs[i].id] = inputs[i].value;
      }
      return values;
    }

    function isDirty() {
      var current = readForm();
      for (var i = 0; i < inputs.length; i++) {
        var id = inputs[i].id;
        if ((current[id] || "") !== (snapshot[id] || "")) {
          return true;
        }
      }
      return false;
    }

    function paintDirty() {
      var dirty = isDirty();
      if (saveBtn) {
        saveBtn.disabled = !dirty;
      }
      if (discardBtn) {
        discardBtn.disabled = !dirty;
      }
      if (dirtyHint) {
        if (dirty) {
          dirtyHint.removeAttribute("hidden");
        } else {
          dirtyHint.setAttribute("hidden", "");
        }
      }
      if (!dirty) {
        setNote(cfg.note, "", false);
      }
    }

    function fill(settingsValues) {
      /* Controllers map the canonical settings record onto their own
         field ids (see cfg.unpick); snapshots stay id-keyed so dirty
         tracking compares like with like. */
      var values = cfg.unpick ? cfg.unpick(settingsValues || {}) : (settingsValues || {});
      snapshot = {};
      for (var i = 0; i < inputs.length; i++) {
        var id = inputs[i].id;
        inputs[i].value = values[id] != null ? values[id] : "";
        snapshot[id] = inputs[i].value;
        setFieldError(inputs[i], "");
      }
      setNote(cfg.note, "", false);
      paintDirty();
      if (cfg.afterFill) {
        cfg.afterFill(settingsValues);
      }
    }

    function clearErrors() {
      for (var i = 0; i < inputs.length; i++) {
        setFieldError(inputs[i], "");
      }
    }

    function setBusy(on) {
      if (saveBtn) {
        saveBtn.disabled = on || !isDirty();
        saveBtn.setAttribute("aria-busy", on ? "true" : "false");
      }
      if (discardBtn) {
        discardBtn.disabled = on || !isDirty();
      }
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].disabled = !!on;
      }
    }

    for (var j = 0; j < inputs.length; j++) {
      inputs[j].addEventListener("input", function () {
        setFieldError(this, "");
        paintDirty();
      });
    }

    if (discardBtn) {
      discardBtn.addEventListener("click", function () {
        var s2 = svc();
        if (!s2) {
          setNote(cfg.note, "Settings are unavailable. Please try again.", true);
          return;
        }
        fill(s2.getSettings());
        setNote(cfg.note, "Unsaved changes discarded.", false);
        var heading = document.getElementById(cfg.heading);
        if (heading) {
          heading.setAttribute("tabindex", "-1");
          heading.focus({ preventScroll: false });
        }
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var s3 = svc();
      if (!s3) {
        setNote(cfg.note, "Settings are unavailable. Please try again.", true);
        return;
      }
      if (!isDirty()) {
        return;
      }
      clearErrors();
      setBusy(true);
      setNote(cfg.note, "", false);
      var result = s3.updateSettings(cfg.pick(readForm()));
      setBusy(false);
      if (result.ok && result.settings) {
        fill(result.settings);
        setNote(cfg.note, cfg.success, false);
      } else {
        var errors = (result && result.errors) || {};
        var firstBad = null;
        for (var k = 0; k < inputs.length; k++) {
          var key = cfg.keyFor ? cfg.keyFor(inputs[k].id) : inputs[k].id;
          if (errors[key]) {
            setFieldError(inputs[k], errors[key]);
            if (!firstBad) {
              firstBad = inputs[k];
            }
          }
        }
        if (errors._form) {
          setNote(cfg.note, errors._form, true);
        } else if (firstBad) {
          setNote(cfg.note, "Check the highlighted fields.", true);
          try {
            firstBad.focus();
          } catch (e) {
            /* focus is best-effort */
          }
        } else {
          setNote(cfg.note, "Your changes could not be saved. Please try again.", true);
        }
        paintDirty();
      }
    });

    return { fill: fill, paint: paintDirty, form: form };
  }

  /* ---------- Display sections (delivery info, account) ---------- */
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

  function renderDelivery() {
    var s = svc();
    if (!s) {
      return;
    }
    var info = s.getDeliveryInfo();
    var onHost = document.getElementById("fd-set-delivery-on");
    var offHost = document.getElementById("fd-set-delivery-off");
    var outHost = document.getElementById("fd-set-delivery-outlet");
    if (onHost) {
      onHost.innerHTML = "";
      onHost.appendChild(factRow("Availability", "Offered at checkout"));
      onHost.appendChild(factRow("Covers", info.onCampus.detail));
    }
    if (offHost) {
      offHost.innerHTML = "";
      offHost.appendChild(factRow("Availability", "Offered at checkout"));
      offHost.appendChild(factRow("Covers", info.offCampus.detail));
    }
    if (outHost) {
      outHost.innerHTML = "";
      outHost.appendChild(factRow("Outlet", info.outlet));
      outHost.appendChild(factRow("Hours", info.hours));
    }
  }

  function renderWhatsAppPreview(settings) {
    var link = document.getElementById("fd-set-wa-test");
    var shown = document.getElementById("fd-set-wa-shown");
    if (!link) {
      return;
    }
    var digits = "";
    try {
      var s = svc();
      digits = s ? s.normalizePhone((settings && settings.whatsapp) || "") : "";
      if (!digits && s) {
        digits = s.getWhatsAppNumber();
      }
    } catch (e) {
      digits = "";
    }
    if (!digits) {
      link.setAttribute("hidden", "");
    } else {
      link.removeAttribute("hidden");
      link.setAttribute("href", "https://wa.me/" + digits + "?text=" + encodeURIComponent("Hello Harvest Castle!"));
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");
    }
    if (shown) {
      shown.textContent = digits || "Not set";
    }
  }

  function wireLogout() {
    var btn = document.getElementById("fd-set-logout");
    var note = document.getElementById("fd-set-account-note");
    if (!btn) {
      return;
    }
    btn.addEventListener("click", function () {
      /* Mirrors the shell session boundary exactly: disabled until a
         real seller session exists; never fabricates a sign-out. */
      if (btn.getAttribute("aria-disabled") === "true") {
        return;
      }
      if (window.FreshDirectAdminAuth && window.FreshDirectAdminAuth.signOut) {
        window.FreshDirectAdminAuth.signOut().catch(function () {
          if (note) {
            note.textContent = "You are not signed in. Contact the store owner for seller access.";
            note.removeAttribute("hidden");
          }
        });
      }
    });
  }

  /* ---------- Load ---------- */
  var businessCtl = null;
  var whatsappCtl = null;

  function load() {
    var s = svc();
    if (!s) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(true);
    var settings;
    try {
      settings = s.getSettings();
    } catch (e) {
      showLoading(false);
      showError();
      return;
    }
    showLoading(false);
    var content = document.getElementById("fd-set-content");
    if (content) {
      content.removeAttribute("hidden");
    }

    businessCtl = sectionController({
      form: "fd-set-business-form",
      heading: "fd-set-business-title",
      fields: ["fd-set-name", "fd-set-phone", "fd-set-address", "fd-set-desc"],
      save: "fd-set-business-save",
      discard: "fd-set-business-discard",
      dirty: "fd-set-business-dirty",
      note: "fd-set-business-note",
      success: "Business information saved.",
      keyFor: function (id) {
        return {
          "fd-set-name": "businessName",
          "fd-set-phone": "contactPhone",
          "fd-set-address": "address",
          "fd-set-desc": "description"
        }[id] || id;
      },
      pick: function (v) {
        return {
          businessName: v["fd-set-name"],
          contactPhone: v["fd-set-phone"],
          address: v["fd-set-address"],
          description: v["fd-set-desc"]
        };
      },
      unpick: function (s) {
        return {
          "fd-set-name": s.businessName,
          "fd-set-phone": s.contactPhone,
          "fd-set-address": s.address,
          "fd-set-desc": s.description
        };
      }
    });

    whatsappCtl = sectionController({
      form: "fd-set-whatsapp-form",
      heading: "fd-set-whatsapp-title",
      fields: ["fd-set-whatsapp"],
      save: "fd-set-whatsapp-save",
      discard: "fd-set-whatsapp-discard",
      dirty: "fd-set-whatsapp-dirty",
      note: "fd-set-whatsapp-note",
      success: "WhatsApp number saved.",
      keyFor: function () {
        return "whatsapp";
      },
      pick: function (v) {
        return { whatsapp: v["fd-set-whatsapp"] };
      },
      unpick: function (s) {
        return { "fd-set-whatsapp": s.whatsapp };
      },
      afterFill: renderWhatsAppPreview
    });

    var phoneEmpty = document.getElementById("fd-set-phone-empty");
    if (businessCtl) {
      businessCtl.fill(settings);
      /* The contact phone starts empty until the seller genuinely adds
         one — surface that honestly next to the field. */
      if (phoneEmpty) {
        if (!settings.contactPhone) {
          phoneEmpty.removeAttribute("hidden");
        } else {
          phoneEmpty.setAttribute("hidden", "");
        }
      }
      var phoneInput = document.getElementById("fd-set-phone");
      if (phoneInput) {
        phoneInput.addEventListener("input", function () {
          if (phoneEmpty) {
            if (!phoneInput.value.trim()) {
              phoneEmpty.removeAttribute("hidden");
            } else {
              phoneEmpty.setAttribute("hidden", "");
            }
          }
        });
      }
    }
    if (whatsappCtl) {
      whatsappCtl.fill(settings);
    }
    renderDelivery();
    renderWhatsAppPreview(settings);
    wireLogout();
  }

  function wireRetry() {
    var retry = document.getElementById("fd-set-retry");
    if (!retry) {
      return;
    }
    retry.addEventListener("click", function () {
      var error = document.getElementById("fd-set-error");
      var content = document.getElementById("fd-set-content");
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
    if (!document.getElementById("fd-set-content")) {
      return;
    }
    wireRetry();
    load();
  }

  /* Testable seam: automated checks use these. */
  window.FreshDirectAdminSettingsUI = {
    load: load,
    esc: esc
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
