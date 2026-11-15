import { customSelect, escapeHtml as esc } from "./shared.js";

function locationSelectField(id, name, label, options, selected, placeholder) {
  const selectOptions = [["", placeholder], ...options.map(option => [String(option.id), option.name])];
  const select = customSelect(id, selectOptions, String(selected), {
    className: "location-select",
    label,
    ariaLabel: label,
    nativeData: `name="${name}" required`
  });
  return `<label><span>${label}</span>${select}</label>`;
}

export function locationSelects(state, device = {}) {
  const clusters = state.locations || [];
  const selected = device.clusterId || clusters.find(c => c.name === device.cluster)?.id || "";
  const cluster = clusters.find(c => c.id === selected);
  const areaId = device.areaId || cluster?.areas.find(a => a.name === device.zone)?.id || "";
  const suffix = device.id || "assignment";
  return `${locationSelectField(`location-cluster-${suffix}`, "clusterId", "Cluster", clusters, selected, "Select cluster")}
    ${locationSelectField(`location-area-${suffix}`, "areaId", "Area", cluster?.areas || [], areaId, "Select area")}`;
}

export function renderLocationManager(state, devices) {
  if (!state.locationManager) return "";
  const clusters = state.locations || [];
  const locationRows = clusters.map(c => `<article class="location-management-row"><form data-location-rename="clusters" data-id="${esc(c.id)}"><strong>Cluster</strong><input name="name" value="${esc(c.name)}" required maxlength="80" aria-label="Cluster name"><button class="secondary-btn">Rename</button><button class="row-action danger" type="button" data-location-delete="clusters" data-id="${esc(c.id)}">Delete</button></form>
    ${c.areas.map(a => `<form class="location-area-row" data-location-rename="areas" data-id="${esc(a.id)}"><span>Area</span><input name="name" value="${esc(a.name)}" required maxlength="80" aria-label="Area name"><button class="secondary-btn">Rename</button><button class="row-action danger" type="button" data-location-delete="areas" data-id="${esc(a.id)}">Delete</button></form>`).join("")}
    <form class="location-area-row" data-location-create="areas" data-cluster="${esc(c.id)}"><span>New area</span><input name="name" placeholder="Area name" required maxlength="80" aria-label="New area name"><button class="secondary-btn">+ Add area</button></form></article>`).join("");
  return `<div class="machine-modal-backdrop" id="location-backdrop"><section class="machine-modal location-manager" role="dialog" aria-modal="true" aria-labelledby="location-title"><header><div><h2 id="location-title">Manage clusters & areas</h2><p>Create locations, rename them, and assign devices.</p></div><button class="machine-modal-close" id="location-close" aria-label="Close">×</button></header>
    <div class="location-manager-body">${state.locationError ? `<p class="inline-error" role="alert">${esc(state.locationError)}</p>` : ""}
    <form class="location-create" data-location-create="clusters"><label>New cluster<input name="name" placeholder="Cluster 05" required maxlength="80"></label><button class="primary-btn">+ Add cluster</button></form>
    <div class="location-management-list">${locationRows || "<p>Create a cluster, then add its areas.</p>"}</div>
    <h3>Assign devices</h3><form id="location-assign"><div class="location-targets">${locationSelects(state)}</div><fieldset class="location-device-options"><legend>Select devices</legend>${devices.filter(d => d.siteId === (state.settings?.siteId || "plant-01")).map(d => `<label><input type="checkbox" name="deviceIds" value="${esc(d.id)}"><span><strong>${esc(d.id)}</strong><small>${esc(d.cluster || "Unassigned")} · ${esc(d.zone || "Unassigned")}</small></span></label>`).join("")}</fieldset><button class="primary-btn" ${devices.length ? "" : "disabled"}>Assign selected devices</button></form></div>
    <footer><button class="secondary-btn" id="location-done">Done</button></footer></section></div>`;
}

export function bindLocations({ state, api, devices, render, refresh, toast }) {
  const siteId = state.settings?.siteId || "plant-01";
  const reload = async () => {
    const data = await api.request(`/api/locations?siteId=${encodeURIComponent(siteId)}`);
    state.locations = data.clusters;
  };
  document.querySelector("#manage-locations")?.addEventListener("click", async () => {
    try { await reload(); state.locationManager = true; state.locationError = ""; render(); }
    catch (error) { toast(error.message); }
  });
  const close = () => { state.locationManager = false; state.locationError = ""; render(); };
  document.querySelector("#location-close")?.addEventListener("click", close);
  document.querySelector("#location-done")?.addEventListener("click", close);
  document.querySelector("#location-backdrop")?.addEventListener("click", e => { if (e.target === e.currentTarget) close(); });
  document.querySelectorAll('select[name="clusterId"]').forEach(select => select.addEventListener("change", () => {
    const area = select.closest("form").querySelector('select[name="areaId"]');
    const cluster = (state.locations || []).find(c => c.id === select.value);
    area.closest("label").outerHTML = locationSelectField(area.id, "areaId", "Area", cluster?.areas || [], "", "Select area");
  }));
  const mutate = async (path, method, body) => {
    state.locationError = "";
    try {
      await api.request(`/api/locations/${path}?siteId=${encodeURIComponent(siteId)}`, { method, ...(body ? { body: JSON.stringify({ ...body, siteId }) } : {}) });
      await reload(); await refresh({ render: false }); render(); toast("Location changes saved.");
    } catch (error) { state.locationError = error.message; render(); }
  };
  document.querySelectorAll("[data-location-create]").forEach(form => form.addEventListener("submit", e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(form));
    if (form.dataset.cluster) data.clusterId = form.dataset.cluster;
    form.querySelector("button").disabled = true;
    mutate(form.dataset.locationCreate, "POST", data);
  }));
  document.querySelectorAll("[data-location-rename]").forEach(form => form.addEventListener("submit", e => {
    e.preventDefault(); form.querySelector("button").disabled = true;
    mutate(`${form.dataset.locationRename}/${encodeURIComponent(form.dataset.id)}`, "PATCH", Object.fromEntries(new FormData(form)));
  }));
  document.querySelectorAll("[data-location-delete]").forEach(button => button.addEventListener("click", () => {
    if (!window.confirm("Delete this location? Only empty locations can be deleted.")) return;
    button.disabled = true;
    mutate(`${button.dataset.locationDelete}/${encodeURIComponent(button.dataset.id)}`, "DELETE");
  }));
  document.querySelector("#location-assign")?.addEventListener("submit", e => {
    e.preventDefault(); const form = e.currentTarget; const data = new FormData(form);
    const deviceIds = data.getAll("deviceIds");
    if (!deviceIds.length) return toast("Select at least one device.");
    form.querySelector('button[type="submit"], button.primary-btn').disabled = true;
    mutate("assign", "POST", { clusterId: data.get("clusterId"), areaId: data.get("areaId"), deviceIds });
  });
}
