import { escapeHtml, icon, initials, kpi, pageHead, statusPill } from "./shared.js";

function userDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function renderUsersPage({ state }) {
  if (!state.currentUser?.isOwner) return `${pageHead("Users", "Owner access is required")}<div class="empty-state">${icon("shield")}You do not have permission to manage CAMS users.</div>`;
  const activeUsers = state.managedUsers.filter(user => user.active).length;
  const rows = state.managedUsers.map(user => `<tr>
    <td><div class="user-identity"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></span></div></td>
    <td>${escapeHtml(user.email)}</td><td><span class="role-tag">${escapeHtml(user.role)}</span></td><td>${statusPill(user.active ? "Online" : "Offline")}</td><td>${escapeHtml(userDate(user.lastLoginAt))}</td>
    <td><button class="mini-action" data-user-status="${escapeHtml(user.id)}" data-next-active="${user.active ? "false" : "true"}" ${user.id === state.currentUser.id ? "disabled" : ""}>${user.active ? "Disable" : "Enable"}</button></td>
  </tr>`).join("");
  const tableBody = state.usersLoading ? '<tr><td colspan="6"><div class="empty-state"><span class="loading-spinner dark"></span>Loading registered users…</div></td></tr>' : rows || `<tr><td colspan="6"><div class="empty-state">${icon("user")}No user accounts are registered.</div></td></tr>`;
  return `${pageHead("Users", "Create accounts and control access to CAMS")}
    <section class="user-summary-grid">${kpi("Registered users", state.managedUsers.length, "All accounts", "user", "teal")}${kpi("Active accounts", activeUsers, "Allowed to sign in", "shield", "green")}</section>
    ${state.usersError ? `<div class="inline-error">${escapeHtml(state.usersError)}</div>` : ""}
    <section class="panel user-create-panel"><header class="panel-head"><div class="panel-title"><h2>Add a CAMS user</h2><p>The temporary password is hashed immediately and is never shown in the user list.</p></div></header>
      <form id="create-user-form" class="user-create-form">
        <label><span>Display name</span><input name="displayName" required maxlength="80" autocomplete="name" placeholder="e.g. Plant Operator"></label>
        <label><span>Username</span><input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9._-]+" autocomplete="off" placeholder="plant.operator"></label>
        <label><span>Email</span><input name="email" required type="email" autocomplete="email" placeholder="operator@example.com"></label>
        <label><span>Role</span><select name="role"><option value="viewer">Viewer</option><option value="operator">Operator</option></select></label>
        <label><span>Temporary password</span><input name="password" required type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="At least 12 characters"></label>
        <button class="primary-btn" type="submit">${icon("user")} Create user</button>
      </form>
    </section>
    <section class="panel"><header class="panel-head"><div class="panel-title"><h2>Registered accounts</h2><p>${activeUsers} active · ${state.managedUsers.length - activeUsers} disabled</p></div><button class="secondary-btn" id="refresh-users">${icon("refresh")} Refresh</button></header><div class="table-wrap"><table class="data-table user-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Action</th></tr></thead><tbody>${tableBody}</tbody></table></div></section>`;
}
