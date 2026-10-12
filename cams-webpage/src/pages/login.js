import { escapeHtml, icon } from "./shared.js";

function authShell(brand, content) {
  return `<main class="login-shell">
    <section class="login-form-side">
      ${brand()}
      <div class="login-content">${content}</div>
      <footer class="login-footer"><span>© 2026 CAMS</span><span>System version 1.0 · Secure access</span></footer>
    </section>
    <aside class="login-visual" aria-label="CAMS overview">
      <div class="powered-by"><span>Powered by</span><span class="owner-mark">E7</span></div>
      <div class="visual-copy"><h2>Clarity for every compressor.</h2><p>One operational view of pressure, flow and suction across your complete compressed air network.</p></div>
      <div class="system-route"><span>Sensors</span><i class="route-dot"></i><span>PLC</span><i class="route-dot"></i><span>ESP32-S3</span><i class="route-dot"></i><span>MQTT</span><i class="route-dot"></i><b>CAMS</b></div>
    </aside>
  </main>`;
}

export function renderLoginPage(brand) {
  return authShell(brand, `
        <p class="login-kicker">Secure plant access</p>
        <h1>Welcome back.</h1>
        <p class="login-intro">Sign in to monitor compressor health, live parameters, trends and plant alarms.</p>
        <form id="login-form" novalidate>
          <div class="form-field">
            <label for="username">Username or email</label>
            <div class="input-wrap" id="username-wrap">${icon("user", "field-icon")}<input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Enter username"></div>
            <p class="field-error" id="username-error"></p>
          </div>
          <div class="form-field">
            <label for="password">Password</label>
            <div class="input-wrap" id="password-wrap">${icon("lock", "field-icon")}<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter password"><button class="password-toggle" id="password-toggle" type="button" aria-label="Show password">${icon("eye")}</button></div>
            <p class="field-error" id="password-error"></p>
          </div>
          <div class="form-options">
            <label class="checkbox"><input id="remember-me" type="checkbox" checked> Remember me</label>
            <button class="text-link" id="forgot-password" type="button">Forgot password?</button>
          </div>
          <button class="primary-btn wide" id="login-button" type="submit"><span>Sign in to CAMS</span>${icon("chevronRight")}</button>
          <div class="login-note">${icon("shield")} Protected industrial monitoring access</div>
        </form>
      `);
}

export function renderPasswordRequestPage(brand, state) {
  const result = state.passwordResetSent ? `<div class="auth-result success">${icon("check")}<div><strong>Check your reset instructions</strong><p>For security, the same confirmation is shown for every account.</p>${state.passwordResetUrl ? `<a class="reset-development-link" href="${escapeHtml(state.passwordResetUrl)}">Open local reset link</a><small>Development only · production delivery requires an email provider.</small>` : ""}</div></div>` : "";
  return authShell(brand, `
    <button class="auth-back" id="back-to-login" type="button">${icon("arrowLeft")} Back to sign in</button>
    <p class="login-kicker">Account recovery</p>
    <h1>Reset your password.</h1>
    <p class="login-intro">Enter the username or email registered for your CAMS account.</p>
    ${state.passwordResetError ? `<div class="auth-result error">${escapeHtml(state.passwordResetError)}</div>` : ""}${result}
    <form id="forgot-password-form" novalidate>
      <div class="form-field"><label for="reset-identity">Username or email</label><div class="input-wrap" id="reset-identity-wrap">${icon("user", "field-icon")}<input id="reset-identity" name="identity" autocomplete="username" value="${escapeHtml(state.passwordResetIdentity)}" placeholder="Enter username or email"></div><p class="field-error" id="reset-identity-error"></p></div>
      <button class="primary-btn wide" id="reset-request-button" type="submit"><span>Send reset instructions</span>${icon("chevronRight")}</button>
      <div class="login-note">${icon("shield")} Reset links expire after 30 minutes and work once</div>
    </form>`);
}

export function renderPasswordResetPage(brand, state) {
  return authShell(brand, `
    <button class="auth-back" id="back-to-login" type="button">${icon("arrowLeft")} Back to sign in</button>
    <p class="login-kicker">Secure password update</p>
    <h1>Create a new password.</h1>
    <p class="login-intro">Use at least 12 characters. Completing this reset signs out all existing sessions.</p>
    ${state.passwordResetError ? `<div class="auth-result error">${escapeHtml(state.passwordResetError)}</div>` : ""}
    <form id="reset-password-form" novalidate>
      <div class="form-field"><label for="new-password">New password</label><div class="input-wrap" id="new-password-wrap">${icon("lock", "field-icon")}<input id="new-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="At least 12 characters"><button class="password-toggle" data-password-toggle="new-password" type="button" aria-label="Show password">${icon("eye")}</button></div><p class="field-error" id="new-password-error"></p></div>
      <div class="form-field"><label for="confirm-password">Confirm new password</label><div class="input-wrap" id="confirm-password-wrap">${icon("lock", "field-icon")}<input id="confirm-password" name="confirmation" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="Repeat new password"><button class="password-toggle" data-password-toggle="confirm-password" type="button" aria-label="Show password">${icon("eye")}</button></div><p class="field-error" id="confirm-password-error"></p></div>
      <ul class="password-rules" aria-label="Password requirements"><li>12–128 characters</li><li>Both entries must match</li><li>All existing sessions will be revoked</li></ul>
      <button class="primary-btn wide" id="reset-password-button" type="submit"><span>Update password</span>${icon("chevronRight")}</button>
    </form>`);
}
