/* ==========================================================================
   Harvest Castle Admin — Stage 1 (admin shell + login controller)
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies, no framework. This file NEVER touches the
   customer cart (no dependency on fresh-direct.js cart store) so customer
   state cannot leak into the admin.

   Sections:
     1. Year                    - footer year without template edits.
     2. Shell                   - mobile drawer + active nav + logout slot.
     3. Auth boundary           - window.FreshDirectAdminAuth. THE seam where
                                  Django authentication connects later.
     4. Login form              - validation + UI only. No real auth here.

   DJANGO INTEGRATION (later stage, no frontend redesign needed):
     - Implement signIn() to POST credentials (with CSRF) to the Django
       session/token endpoint and resolve with the seller profile.
     - Implement signOut() to invalidate the server session, then redirect.
     - Implement requestPasswordReset() against the Django reset endpoint.
     - Gate admin pages server-side; this file only mirrors that state.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 1. Footer year ---------- */
  function wireYear() {
    var nodes = document.querySelectorAll("[data-fd-year]");
    var year = String(new Date().getFullYear());
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = year;
    }
  }

  /* ---------- 2. Admin shell: drawer navigation ---------- */
  function wireShell() {
    var shell = document.querySelector(".fd-admin-shell");
    if (!shell) {
      return;
    }
    var toggle = document.getElementById("fd-admin-menu-btn");
    var scrim = document.getElementById("fd-admin-scrim");
    var sidebar = document.getElementById("fd-admin-sidebar");
    if (!toggle || !scrim || !sidebar) {
      return;
    }
    var lastFocus = null;

    function isOpen() {
      return shell.classList.contains("nav-open");
    }

    function open() {
      lastFocus = document.activeElement;
      shell.classList.add("nav-open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Close admin menu");
      document.body.style.overflow = "hidden";
      var first = sidebar.querySelector("a, button:not([aria-disabled='true'])");
      if (first) {
        first.focus();
      }
    }

    function close(returnFocus) {
      if (!isOpen()) {
        return;
      }
      shell.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open admin menu");
      document.body.style.overflow = "";
      if (returnFocus && lastFocus && document.contains(lastFocus)) {
        lastFocus.focus();
      } else {
        toggle.focus();
      }
    }

    toggle.addEventListener("click", function () {
      if (isOpen()) {
        close(false);
      } else {
        open();
      }
    });

    scrim.addEventListener("click", function () {
      close(true);
    });

    document.addEventListener("keydown", function (ev) {
      if ((ev.key === "Escape" || ev.key === "Esc") && isOpen()) {
        close(true);
      }
    });

    // Choosing an enabled destination closes the drawer (future stages).
    sidebar.addEventListener("click", function (ev) {
      var link = ev.target.closest("a.fd-admin-nav-link");
      if (link) {
        close(false);
      }
    });
  }

  /* ---------- 3. Authentication boundary ----------
     Django owns real authentication. These functions are the ONLY place the
     login UI talks to "auth", so connecting the backend means editing this
     section — never the form markup or validation above it.

     Current behavior is deliberately non-functional: every method rejects
     with code "AUTH_NOT_CONFIGURED". The UI surfaces that as a neutral,
     clearly development-only notice. There are no hardcoded credentials,
     no fake sessions, and no fabricated success state anywhere. */
  var AUTH_NOT_CONFIGURED = "AUTH_NOT_CONFIGURED";

  function notConfigured(op) {
    var err = new Error(
      "Harvest Castle admin authentication is not connected yet (" + op + ")."
    );
    err.code = AUTH_NOT_CONFIGURED;
    return err;
  }

  window.FreshDirectAdminAuth = {
    /**
     * Attempt seller sign-in. Django stage: POST {email, password, remember}
     * to the backend login endpoint and resolve with the seller profile.
     * Today: always rejects with AUTH_NOT_CONFIGURED (no session created).
     */
    signIn: function (credentials) {
      void credentials;
      return Promise.reject(notConfigured("signIn"));
    },
    /**
     * Start a password reset. Django stage: POST {email} to the reset
     * endpoint (backend sends the email + token, never the frontend).
     * Today: always rejects with AUTH_NOT_CONFIGURED (nothing is sent).
     */
    requestPasswordReset: function (email) {
      void email;
      return Promise.reject(notConfigured("requestPasswordReset"));
    },
    /**
     * End the admin session. Django stage: invalidate the server session
     * (POST logout / clear token) and resolve when done.
     * Today: always rejects with AUTH_NOT_CONFIGURED.
     */
    signOut: function () {
      return Promise.reject(notConfigured("signOut"));
    },
  };

  /* ---------- 4. Login form: validation + boundary wiring ---------- */
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

  function wirePasswordToggle() {
    var toggle = document.getElementById("fd-admin-pass-toggle");
    var input = document.getElementById("fd-admin-password");
    if (!toggle || !input) {
      return;
    }
    toggle.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", show ? "true" : "false");
      toggle.setAttribute(
        "aria-label",
        show ? "Hide password" : "Show password"
      );
      var icon = toggle.querySelector("i");
      if (icon) {
        icon.className = show ? "far fa-eye-slash" : "far fa-eye";
      }
      input.focus();
    });
  }

  function wireForgotPanel() {
    var toggle = document.getElementById("fd-admin-forgot");
    var panel = document.getElementById("fd-admin-forgot-panel");
    var resetBtn = document.getElementById("fd-admin-reset-btn");
    var resetMsg = document.getElementById("fd-admin-reset-msg");
    if (!toggle || !panel) {
      return;
    }
    toggle.addEventListener("click", function () {
      var open = panel.hasAttribute("hidden");
      if (open) {
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
      } else {
        panel.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    // Help point: the store owner manages seller credentials, so this page
    // never pretends to send email.
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        var email = document.getElementById("fd-admin-email");
        var value = email ? email.value.trim() : "";
        if (resetMsg) {
          resetMsg.removeAttribute("hidden");
          resetMsg.textContent = value
            ? "No reset email was sent to " +
              value +
              ". Please contact the store owner to reset your password."
            : "Enter your work email above first, then contact the store owner to reset your password.";
        }
        window.FreshDirectAdminAuth.requestPasswordReset(value).catch(
          function () {
            /* Boundary is not connected yet; notice above already says so. */
          }
        );
      });
    }
  }

  function wireLoginForm() {
    var form = document.getElementById("fd-admin-login-form");
    if (!form) {
      return;
    }
    var email = document.getElementById("fd-admin-email");
    var password = document.getElementById("fd-admin-password");
    var remember = document.getElementById("fd-admin-remember");
    var emailError = document.getElementById("fd-admin-email-error");
    var passwordError = document.getElementById("fd-admin-password-error");
    var status = document.getElementById("fd-admin-status");
    var submit = document.getElementById("fd-admin-submit");

    function showStatus(kind, title, text) {
      if (!status) {
        return;
      }
      status.className = "fd-admin-notice" + (kind ? " " + kind : "");
      status.innerHTML = "";
      var strong = document.createElement("strong");
      strong.textContent = title;
      status.appendChild(strong);
      status.appendChild(document.createTextNode(text));
      status.removeAttribute("hidden");
    }

    function hideStatus() {
      if (status) {
        status.setAttribute("hidden", "");
      }
    }

    function validEmail(value) {
      // Format check only (UI-level). Existence is never probed: failures
      // stay generic so the UI cannot reveal whether an account exists.
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      hideStatus();
      var emailValue = email ? email.value.trim() : "";
      var passwordValue = password ? password.value : "";
      var ok = true;

      if (!emailValue) {
        setFieldError(email, emailError, "Enter your work email address.");
        ok = false;
      } else if (!validEmail(emailValue)) {
        setFieldError(email, emailError, "Enter a valid email address.");
        ok = false;
      } else {
        setFieldError(email, emailError, "");
      }

      if (!passwordValue) {
        setFieldError(password, passwordError, "Enter your password.");
        ok = false;
      } else {
        setFieldError(password, passwordError, "");
      }

      if (!ok) {
        showStatus(
          "is-error",
          "Check the highlighted fields.",
          "Fix the errors above and try again."
        );
        var firstInvalid = form.querySelector("[aria-invalid='true']");
        if (firstInvalid) {
          firstInvalid.focus();
        }
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.setAttribute("aria-busy", "true");
      }

      window.FreshDirectAdminAuth.signIn({
        email: emailValue,
        password: passwordValue,
        remember: !!(remember && remember.checked),
      }).then(
        function () {
          // Unreachable until Django connects the boundary. Kept so the
          // success path has exactly one place to land in a later stage.
          if (submit) {
            submit.disabled = false;
            submit.removeAttribute("aria-busy");
          }
        },
        function (err) {
          if (submit) {
            submit.disabled = false;
            submit.removeAttribute("aria-busy");
          }
          if (err && err.code === AUTH_NOT_CONFIGURED) {
            // Neutral wording: no account-existence signal, no fake success.
            showStatus(
              "is-error",
              "We could not sign you in.",
              "Seller accounts are managed by the store owner — please " +
                "contact them for access."
            );
          } else {
            showStatus(
              "is-error",
              "Could not sign in.",
              "Something went wrong. Please try again."
            );
          }
        }
      );
    });

    // Clear a field's error as soon as the seller corrects it.
    if (email) {
      email.addEventListener("input", function () {
        setFieldError(email, emailError, "");
      });
    }
    if (password) {
      password.addEventListener("input", function () {
        setFieldError(password, passwordError, "");
      });
    }
  }

  function wireLogout() {
    var btn = document.getElementById("fd-admin-logout");
    if (!btn) {
      return;
    }
    btn.addEventListener("click", function () {
      // Disabled until a real session exists; the backend stage enables it.
      if (btn.getAttribute("aria-disabled") === "true") {
        return;
      }
      window.FreshDirectAdminAuth.signOut().catch(function () {
        /* Surfaced by the owning page once sessions exist. */
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    wireYear();
    wireShell();
    wirePasswordToggle();
    wireForgotPanel();
    wireLoginForm();
    wireLogout();
  });
})();
