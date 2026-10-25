import { pageHead, escapeHtml } from "./shared.js";

export function renderProfilePage({ state }) {
  const user = state.currentUser || {};
  const role = user.role || "User";
  return `${pageHead("User Profile", "Review your account details and manage account security")}
    ${state.profilePasswordError ? `<div class="inline-error">${escapeHtml(state.profilePasswordError)}</div>` : ""}
    <div class="settings-layout">
      <section class="panel settings-section">
        <div class="settings-section-head"><div><span class="settings-kicker">Account</span><h2>Profile details</h2><p>Your CAMS account information.</p></div></div>
        <div class="settings-fields three">
          <label class="settings-field"><span>Name</span><div class="settings-input-wrap"><input value="${escapeHtml(user.displayName || "")}" readonly></div></label>
          <label class="settings-field"><span>Username</span><div class="settings-input-wrap"><input value="${escapeHtml(user.username || "")}" readonly></div></label>
          <label class="settings-field"><span>Role</span><div class="settings-input-wrap"><input value="${escapeHtml(role)}" readonly></div></label>
          <label class="settings-field"><span>Email</span><div class="settings-input-wrap"><input value="${escapeHtml(user.email || "")}" readonly></div></label>
        </div>
      </section>
      <section class="panel settings-section">
        <div class="settings-section-head"><div><span class="settings-kicker">Account security</span><h2>Change password</h2><p>Use your current password to choose a new password for this account.</p></div></div>
        <form id="profile-password-form" class="settings-fields">
          <label class="settings-field"><span>Current password</span><div class="settings-input-wrap"><input name="currentPassword" type="password" required autocomplete="current-password"></div></label>
          <label class="settings-field"><span>New password</span><div class="settings-input-wrap"><input name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></div></label>
          <div class="page-actions"><button class="primary-btn" type="submit">Change password</button></div>
        </form>
      </section>
    </div>`;
}
