import { icon } from "./shared.js";

export function renderLoginPage(brand) {
  return `<main class="login-shell">
    <section class="login-form-side">
      ${brand()}
      <div class="login-content">
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
      </div>
      <footer class="login-footer"><span>© 2026 CAMS</span><span>System version 1.0 · UI review</span></footer>
    </section>
    <aside class="login-visual" aria-label="CAMS overview">
      <div class="powered-by"><span>Powered by</span><span class="owner-mark">E7</span></div>
      <div class="visual-copy">
        <h2>Clarity for every compressor.</h2>
        <p>One operational view of pressure, flow and suction across your complete compressed air network.</p>
      </div>
      <div class="system-route"><span>Sensors</span><i class="route-dot"></i><span>PLC</span><i class="route-dot"></i><span>ESP32-S3</span><i class="route-dot"></i><span>MQTT</span><i class="route-dot"></i><b>CAMS</b></div>
    </aside>
  </main>`;
}
