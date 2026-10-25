import { customSelect, escapeHtml, icon, initials, pageHead, statusPill } from "./shared.js";

function userDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function userSummaryCard({ label, value, note, iconName, tone, filter, selected, action }) {
  return `<button class="kpi-card user-summary-card is-clickable${selected ? " selected" : ""}" type="button" data-user-account-filter="${escapeHtml(filter)}" aria-pressed="${selected}" aria-label="${escapeHtml(action)}">
    <span class="kpi-top"><span class="kpi-label">${escapeHtml(label)}</span><span class="kpi-icon ${tone}">${icon(iconName)}</span></span>
    <span class="kpi-value"><strong>${value}</strong><span>${escapeHtml(note)}</span></span>
    <span class="kpi-action">${escapeHtml(action)} ${icon("chevronRight")}</span>
  </button>`;
}

export function renderUsersPage({ state }) {
  if (!state.currentUser?.isOwner) return `${pageHead("Users", "Owner access is required")}<div class="empty-state">${icon("shield")}You do not have permission to manage CAMS users.</div>`;
  const registeredUsers = state.managedUsers.filter(user => !user.deletedAt);
  const removedUsers = state.managedUsers.filter(user => user.deletedAt);
  const activeUsers = registeredUsers.filter(user => user.active).length;
  const disabledUsers = registeredUsers.length - activeUsers;
  const accountFilter = state.userAccountFilter === "active" ? "active" : "registered";
  const visibleUsers = accountFilter === "active" ? registeredUsers.filter(user => user.active) : registeredUsers;
  const rows = visibleUsers.map(user => `<tr>
    <td><div class="user-identity"><span class="avatar">${escapeHtml(initials(user.displayName))}</span><span><strong>${escapeHtml(user.displayName)}</strong><small>@${escapeHtml(user.username)}</small></span></div></td>
    <td>${escapeHtml(user.email)}</td><td><span class="role-tag">${escapeHtml(user.role)}</span></td><td>${user.deletedAt ? statusPill("Deleted") : statusPill(user.active ? "Online" : "Offline")}</td><td>${escapeHtml(userDate(user.lastLoginAt))}</td>
    <td><div class="table-actions">
      <button class="mini-action" data-edit-user="${escapeHtml(user.id)}" ${user.deletedAt || user.role === "owner" ? "disabled" : ""}>Edit</button>
      <button class="mini-action" data-user-status="${escapeHtml(user.id)}" data-next-active="${user.active ? "false" : "true"}" ${user.id === state.currentUser.id || user.deletedAt ? "disabled" : ""}>${user.active ? "Disable" : "Enable"}</button>
      ${user.deletedAt ? `<button class="mini-action" data-restore-user="${escapeHtml(user.id)}">Restore</button>` : `<button class="mini-action" data-delete-user="${escapeHtml(user.id)}" ${user.id === state.currentUser.id ? "disabled" : ""}>Delete</button>`}
    </div></td>
  </tr>`).join("");
  const tableBody = state.usersLoading ? '<tr><td colspan="6"><div class="empty-state"><span class="loading-spinner dark"></span>Loading registered users…</div></td></tr>' : rows || `<tr><td colspan="6"><div class="empty-state">${icon("user")}${accountFilter === "active" ? "No active accounts are available." : "No user accounts are registered."}</div></td></tr>`;
  const modalUser = state.userModal?.user;
  const editRoleOptions = [
    ...(modalUser?.role === "owner" ? [["owner", "Owner"]] : []),
    ["viewer", "Viewer"],
    ["operator", "Operator"]
  ];
  const createRoleOptions = [["viewer", "Viewer"], ["operator", "Operator"]];
  const modal = modalUser ? `<div class="machine-modal-backdrop" id="user-modal-backdrop"><section class="machine-modal user-edit-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
    <header><div><span class="machine-modal-kicker">Account administration</span><h2 id="user-modal-title">Edit user</h2><p>Passwords are never displayed. Leave the new password blank to keep it unchanged.</p></div><button class="machine-modal-close" id="user-modal-close" type="button" aria-label="Close">×</button></header>
    ${state.usersError ? `<div class="inline-error user-edit-error">${escapeHtml(state.usersError)}</div>` : ""}
    <form id="edit-user-form" class="machine-form user-edit-form">
      <label><span>Display Name</span><input name="displayName" required maxlength="80" value="${escapeHtml(modalUser.displayName)}"></label>
      <label><span>User Name</span><input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9._-]+" value="${escapeHtml(modalUser.username)}"></label>
      <label><span>Email</span><input name="email" required type="email" value="${escapeHtml(modalUser.email)}"></label>
      <label><span>Role</span>${customSelect("edit-user-role", editRoleOptions, modalUser.role, { className: "user-edit-select", label: "Role", nativeData: 'name="role"' })}</label>
      <button type="button" id="change-password-toggle" class="change-password-btn" ${modalUser.role === "owner" ? "hidden disabled" : ""}>${icon("lock")} Change password</button>
      <div id="change-password-fields" class="password-fields" hidden>
        <label><span>Old Password</span><div class="password-input-wrap"><input id="edit-current-password" name="currentPassword" type="password" autocomplete="current-password" placeholder="Enter current password"><button type="button" class="password-toggle" data-password-toggle="edit-current-password" aria-label="Show password">${icon("eye")}</button></div></label>
        <label><span>New Password</span><div class="password-input-wrap"><input id="edit-new-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="Enter new password"><button type="button" class="password-toggle" data-password-toggle="edit-new-password" aria-label="Show password">${icon("eye")}</button></div></label>
      </div>
    </form>
    <footer><button class="secondary-btn" id="user-modal-cancel" type="button">Cancel</button><button class="primary-btn" type="submit" form="edit-user-form">Save changes</button></footer>
  </section></div>` : "";
  const removedModal = state.usersRemovedOpen ? `<div class="machine-modal-backdrop" id="removed-users-backdrop"><section class="machine-modal" role="dialog" aria-modal="true" aria-labelledby="removed-users-title">
    <header><div><span class="machine-modal-kicker">Account recovery</span><h2 id="removed-users-title">Removed users</h2><p>Deleted accounts remain here until restored.</p></div><button class="machine-modal-close" id="removed-users-close" type="button" aria-label="Close">×</button></header>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>User</th><th>Email</th><th>Deleted</th><th>Action</th></tr></thead><tbody>${removedUsers.map(user => `<tr><td>${escapeHtml(user.displayName)}<br><small>@${escapeHtml(user.username)}</small></td><td>${escapeHtml(user.email)}</td><td>${escapeHtml(userDate(user.deletedAt))}</td><td><button class="mini-action" data-restore-user="${escapeHtml(user.id)}">Restore</button></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty-state">${icon("user")}No removed users.</div></td></tr>`}</tbody></table></div>
    <footer><button class="secondary-btn" id="removed-users-cancel" type="button">Close</button></footer>
  </section></div>` : "";
  return `${pageHead("Users", "Create accounts and control access to CAMS", `<button class="secondary-btn" id="removed-users">${icon("user")} Removed users (${removedUsers.length})</button>`)}
    <section class="user-summary-grid" aria-label="Account overview">
      ${userSummaryCard({ label: "Registered accounts", value: registeredUsers.length, note: `${activeUsers} active · ${disabledUsers} disabled`, iconName: "user", tone: "teal", filter: "registered", selected: accountFilter === "registered", action: "View all accounts" })}
      ${userSummaryCard({ label: "Active accounts", value: activeUsers, note: "Allowed to sign in", iconName: "shield", tone: "green", filter: "active", selected: accountFilter === "active", action: "View active accounts" })}
    </section>
    ${state.usersError ? `<div class="inline-error">${escapeHtml(state.usersError)}</div>` : ""}
    <section class="panel user-create-panel"><header class="panel-head"><div class="panel-title"><h2>Add a CAMS user</h2><p>The temporary password is hashed immediately and is never shown in the user list.</p></div></header>
      <form id="create-user-form" class="user-create-form">
        <label><span>Display name</span><input name="displayName" required maxlength="80" autocomplete="name" placeholder="e.g. Plant Operator"></label>
        <label><span>Username</span><input name="username" required minlength="3" maxlength="32" pattern="[a-z0-9._-]+" autocomplete="off" placeholder="plant.operator"></label>
        <label><span>Email</span><input name="email" required type="email" autocomplete="email" placeholder="operator@example.com"></label>
        <label><span>Role</span>${customSelect("create-user-role", createRoleOptions, "viewer", { className: "user-create-select", label: "Role", nativeData: 'name="role"' })}</label>
        <label><span>Temporary password</span><input name="password" required type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="At least 12 characters"></label>
        <button class="primary-btn" type="submit">${icon("user")} Create user</button>
      </form>
    </section>
    <section class="panel"><header class="panel-head"><div class="panel-title"><h2>${accountFilter === "active" ? "Active accounts" : "Registered accounts"}</h2><p>${accountFilter === "active" ? `${activeUsers} accounts allowed to sign in · ${disabledUsers} disabled hidden` : `${activeUsers} active · ${disabledUsers} disabled`}</p></div><div class="panel-actions">${accountFilter === "active" ? `<button class="secondary-btn user-filter-clear" data-user-account-filter="registered">${icon("x")} Clear filter</button>` : ""}<button class="secondary-btn" id="refresh-users">${icon("refresh")} Refresh</button></div></header><div class="table-wrap"><table class="data-table user-table"><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Action</th></tr></thead><tbody>${tableBody}</tbody></table></div></section>${modal}${removedModal}`;
}
