import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
const ENGINE_ROOT = process.env.ORBITFS_ENGINE_ROOT || "C:\\New Setup\\OrbitFS-Engine";
const BRANCHED_WORKSPACES_ROOT = path.join(ENGINE_ROOT, "Branched Workspaces");

const STATE_PATH = path.join(BRANCHED_WORKSPACES_ROOT, ".workspaces.json");
const DEFAULT_STATE = { attached: true, workspaces: [], invitations: [], storageRequests: [], messages: [], notifications: [] };
const ROLES = new Set(["owner", "admin", "editor", "contributor", "viewer"]);

function now() { return new Date().toISOString(); }
function cleanName(value) {
  const name = String(value || "").trim().replace(/[<>:"/\\|?*]/g, "");
  if (!name) throw new Error("Workspace name required");
  return name.slice(0, 80);
}
function user(value) { return String(value || "").trim().toLowerCase(); }
function role(value) { const v = String(value || "viewer").toLowerCase(); if (!ROLES.has(v)) throw new Error("Invalid workspace role"); return v; }
function folderName(record) { return `${record.id}@${record.owner} ${record.name}`; }

async function readState() {
  try { return { ...DEFAULT_STATE, ...JSON.parse(await fs.readFile(STATE_PATH, "utf8")) }; }
  catch { return structuredClone(DEFAULT_STATE); }
}
async function saveState(state) {
  await fs.mkdir(BRANCHED_WORKSPACES_ROOT, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}
async function dirSize(root) {
  let total = 0;
  for (const item of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(root, item.name);
    if (item.isDirectory()) total += await dirSize(full); else total += (await fs.stat(full)).size;
  }
  return total;
}
function canManage(record, username, panelRole) {
  if (panelRole === "admin") return true;
  const u = user(username);
  return record.owner === u || record.members?.some((m) => m.username === u && ["owner", "admin"].includes(m.role));
}
function canSee(record, username, panelRole) {
  if (panelRole === "admin") return true;
  const u = user(username);
  if (record.visibility === "public") return true;
  return record.owner === u || record.members?.some((m) => m.username === u);
}

const ROLE_DEFAULTS = {
  owner: { read:true, upload:true, edit:true, download:true, move:true, delete:true, invite:true, manageMembers:true, storageRequests:true, messaging:true, mcp:true, sorter:true },
  admin: { read:true, upload:true, edit:true, download:true, move:true, delete:true, invite:true, manageMembers:true, storageRequests:true, messaging:true, mcp:true, sorter:true },
  editor: { read:true, upload:true, edit:true, download:true, move:true, delete:true, invite:false, manageMembers:false, storageRequests:false, messaging:true, mcp:false, sorter:true },
  contributor: { read:true, upload:true, edit:true, download:true, move:false, delete:false, invite:false, manageMembers:false, storageRequests:false, messaging:false, mcp:false, sorter:false },
  viewer: { read:true, upload:false, edit:false, download:true, move:false, delete:false, invite:false, manageMembers:false, storageRequests:false, messaging:false, mcp:false, sorter:false }
};

export async function workspacePermissions(folder, username, panelRole) {
  const state = await readState();
  if (state.attached === false) throw new Error("Workspaces add-on is detached");
  const w = state.workspaces.find((x) => x.folder === folder);
  if (!w || w.status !== "active" || w.online === false) throw new Error("Workspace unavailable");
  if (panelRole === "admin") return { ...ROLE_DEFAULTS.owner, workspaceRole: "owner" };
  const current = user(username);
  const assigned = w.owner === current ? "owner" : (w.members || []).find((m) => m.username === current)?.role;
  if (!assigned && w.visibility !== "public") throw new Error("Workspace access denied");
  const workspaceRole = assigned || "viewer";
  const overrides = w.permissionOverrides?.roles?.[workspaceRole] || {};
  return { ...ROLE_DEFAULTS[workspaceRole], ...overrides, workspaceRole };
}

export async function getWorkspaceAddon() {
  const state = await readState();
  return { installed: true, attached: state.attached !== false };
}
export async function setWorkspaceAttached(attached) {
  const state = await readState(); state.attached = Boolean(attached); await saveState(state); return getWorkspaceAddon();
}

async function importFolders(state) {
  const entries = await fs.readdir(BRANCHED_WORKSPACES_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter((x) => x.isDirectory() && !x.name.startsWith("EX. ID@"))) {
    if (state.workspaces.some((x) => x.folder === entry.name)) continue;
    const at = entry.name.indexOf("@"); const after = at >= 0 ? entry.name.slice(at + 1) : entry.name;
    const split = after.indexOf(" ");
    state.workspaces.push({ id: at > 0 ? entry.name.slice(0, at) : crypto.randomUUID(), name: split >= 0 ? after.slice(split + 1) : after,
      owner: user(split >= 0 ? after.slice(0, split) : "unassigned"), members: [], quotaGB: null, status: "active", online: true,
      visibility: "private", mcpEnabled: false, mcpGrants: [], permissionOverrides: {}, trashRetentionDays: 30,
      folder: entry.name, createdAt: now(), updatedAt: now() });
  }
}

export async function listManagedWorkspaces(username, panelRole) {
  const state = await readState(); await importFolders(state); await saveState(state);
  const list = state.workspaces.filter((w) => canSee(w, username, panelRole));
  const result = [];
  for (const w of list) {
    const usageBytes = await dirSize(path.join(BRANCHED_WORKSPACES_ROOT, w.folder));
    result.push({ ...w, usageBytes, usageGB: Number((usageBytes / 1073741824).toFixed(3)), canManage: canManage(w, username, panelRole) });
  }
  return { attached: state.attached !== false, isPanelAdmin: panelRole === "admin", workspaces: result, invitations: state.invitations.filter((i) => panelRole === "admin" || i.email === user(username)),
    storageRequests: state.storageRequests.filter((r) => panelRole === "admin" || r.requestedBy === user(username)),
    notifications: state.notifications.filter((n) => panelRole === "admin" || n.user === user(username)).slice(-100) };
}

export async function createManagedWorkspace(input, createdBy) {
  const state = await readState(); if (state.attached === false) throw new Error("Workspaces add-on is detached");
  const record = { id: crypto.randomUUID(), name: cleanName(input.name), owner: user(input.owner || createdBy), members: [],
    quotaGB: input.quotaGB == null || input.quotaGB === "" ? null : Math.max(1, Number(input.quotaGB)), status: "active", online: input.online !== false,
    visibility: input.visibility === "public" ? "public" : "private", mcpEnabled: false, mcpGrants: [], permissionOverrides: {},
    trashRetentionDays: 30, createdAt: now(), updatedAt: now() };
  record.folder = folderName(record);
  await fs.mkdir(path.join(BRANCHED_WORKSPACES_ROOT, record.folder, "_trash"), { recursive: true });
  await fs.mkdir(path.join(BRANCHED_WORKSPACES_ROOT, record.folder, "_sorter"), { recursive: true });
  state.workspaces.push(record); await saveState(state); return record;
}

export async function updateManagedWorkspace(id, input, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  const oldFolder = w.folder;
  if (input.name != null) w.name = cleanName(input.name);
  if (input.quotaGB !== undefined) w.quotaGB = input.quotaGB == null || input.quotaGB === "" ? null : Math.max(1, Number(input.quotaGB));
  if (input.visibility != null) w.visibility = input.visibility === "public" ? "public" : "private";
  if (input.online != null) w.online = Boolean(input.online);
  if (input.mcpEnabled != null) w.mcpEnabled = Boolean(input.mcpEnabled);
  if (input.trashRetentionDays != null) w.trashRetentionDays = Math.max(1, Math.min(3650, Number(input.trashRetentionDays)));
  if (input.permissionOverrides && typeof input.permissionOverrides === "object") w.permissionOverrides = input.permissionOverrides;
  w.folder = folderName(w); w.updatedAt = now();
  if (oldFolder !== w.folder) await fs.rename(path.join(BRANCHED_WORKSPACES_ROOT, oldFolder), path.join(BRANCHED_WORKSPACES_ROOT, w.folder));
  await saveState(state); return w;
}

export async function setWorkspaceStatus(id, status, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  if (!["active", "archived", "deleted"].includes(status)) throw new Error("Invalid status");
  w.status = status; w.online = status === "active" && w.online !== false; w.updatedAt = now(); await saveState(state); return w;
}

export async function permanentlyDeleteWorkspace(id, actor, panelRole) {
  const state = await readState(); const i = state.workspaces.findIndex((x) => x.id === id); if (i < 0) throw new Error("Workspace not found");
  const w = state.workspaces[i]; if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  if (w.status !== "deleted") throw new Error("Move workspace to deleted state first");
  await fs.rm(path.join(BRANCHED_WORKSPACES_ROOT, w.folder), { recursive: true, force: true }); state.workspaces.splice(i, 1); await saveState(state); return { ok: true };
}

export async function setMember(id, input, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  const username = user(input.username); const memberRole = role(input.role); if (!username) throw new Error("Username required");
  w.members = (w.members || []).filter((m) => m.username !== username); w.members.push({ username, role: memberRole, addedAt: now() });
  await saveState(state); return w;
}
export async function removeMember(id, username, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  w.members = (w.members || []).filter((m) => m.username !== user(username)); w.mcpGrants = (w.mcpGrants || []).filter((x) => x !== user(username)); await saveState(state); return w;
}
export async function transferOwnership(id, newOwner, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  const oldFolder = w.folder; const previous = w.owner; w.owner = user(newOwner); if (!w.owner) throw new Error("New owner required");
  w.members = (w.members || []).filter((m) => m.username !== w.owner); if (previous && previous !== w.owner) w.members.push({ username: previous, role: "admin", addedAt: now() });
  w.folder = folderName(w); await fs.rename(path.join(BRANCHED_WORKSPACES_ROOT, oldFolder), path.join(BRANCHED_WORKSPACES_ROOT, w.folder)); await saveState(state); return w;
}

export async function createInvitation(id, input, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required");
  const invite = { id: crypto.randomUUID(), workspaceId: id, email: user(input.email), role: role(input.role), status: "pending", token: crypto.randomBytes(24).toString("hex"), createdAt: now(), expiresAt: new Date(Date.now() + 7*86400000).toISOString() };
  if (!invite.email) throw new Error("Invite email or username required"); state.invitations.push(invite); await saveState(state); return invite;
}
export async function respondInvitation(token, accepted, username) {
  const state = await readState(); const invite = state.invitations.find((x) => x.token === token); if (!invite) throw new Error("Invitation not found");
  if (new Date(invite.expiresAt) < new Date()) throw new Error("Invitation expired"); invite.status = accepted ? "accepted" : "declined"; invite.respondedAt = now();
  if (accepted) { const w = state.workspaces.find((x) => x.id === invite.workspaceId); if (w) { w.members = (w.members || []).filter((m) => m.username !== user(username)); w.members.push({ username: user(username), role: invite.role, addedAt: now() }); } }
  await saveState(state); return invite;
}

export async function setMcpGrant(id, username, enabled, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  if (!canManage(w, actor, panelRole)) throw new Error("Workspace admin access required"); const u = user(username);
  w.mcpGrants = (w.mcpGrants || []).filter((x) => x !== u); if (enabled) w.mcpGrants.push(u); await saveState(state); return w;
}

export async function createStorageRequest(id, input, requestedBy, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  const permissions = await workspacePermissions(w.folder, requestedBy, panelRole);
  if (!permissions.storageRequests) throw new Error("Storage request permission required");
  const request = { id: crypto.randomUUID(), workspaceId: id, requestedBy: user(requestedBy), requestedGB: Math.max(1, Number(input.requestedGB)), message: String(input.message || "").slice(0,500), status: "pending", createdAt: now() };
  state.storageRequests.push(request); state.notifications.push({ id: crypto.randomUUID(), user: "admin", workspaceId: id, type: "storage_request", message: `${request.requestedBy} requested ${request.requestedGB} GB`, createdAt: now(), read: false }); await saveState(state); return request;
}
export async function decideStorageRequest(requestId, input, actor, panelRole) {
  if (panelRole !== "admin") throw new Error("Panel admin required"); const state = await readState(); const r = state.storageRequests.find((x) => x.id === requestId); if (!r) throw new Error("Request not found");
  r.status = input.approved ? "approved" : "denied"; r.response = String(input.message || "").slice(0,500); r.decidedBy = user(actor); r.decidedAt = now();
  const w = state.workspaces.find((x) => x.id === r.workspaceId); if (input.approved && w) w.quotaGB = r.requestedGB;
  state.notifications.push({ id: crypto.randomUUID(), user: r.requestedBy, workspaceId: r.workspaceId, type: "storage_request_update", message: r.response || `Storage request ${r.status}`, createdAt: now(), read: false }); await saveState(state); return r;
}

export async function postWorkspaceMessage(id, input, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  const author = user(actor);
  const permissions = await workspacePermissions(w.folder, actor, panelRole);
  if (!permissions.messaging) throw new Error("Workspace messaging permission required");
  const types = new Set(["message","notice","warning","alert","critical"]); const priorities = new Set(["normal","high","urgent"]);
  const type = types.has(String(input.type)) ? String(input.type) : "message";
  const priority = priorities.has(String(input.priority)) ? String(input.priority) : "normal";
  const title = String(input.title || "").trim().slice(0,120); const text = String(input.text || "").trim().slice(0,2000);
  if (!title || !text) throw new Error("Message title and body required");
  const audience = ["all","role","user"].includes(String(input.audience)) ? String(input.audience) : "all";
  const target = user(input.target); const allUsers = [...new Set([w.owner, ...(w.members || []).map((m) => m.username)])];
  let recipients = allUsers;
  if (audience === "user") recipients = allUsers.filter((u) => u === target);
  if (audience === "role") recipients = (w.members || []).filter((m) => m.role === target).map((m) => m.username);
  if (!recipients.length) throw new Error("No matching recipients");
  const message = { id: crypto.randomUUID(), workspaceId:id, author, type, priority, title, text, audience, target: target || null,
    requiresAcknowledgement:Boolean(input.requiresAcknowledgement), acknowledgedBy:[], expiresAt:input.expiresAt || null, recipients, createdAt:now() };
  state.messages.push(message);
  for (const recipient of recipients) if (recipient !== author) state.notifications.push({ id:crypto.randomUUID(), user:recipient, workspaceId:id,
    type:`workspace_${type}`, priority, title, message:text.slice(0,240), requiresAcknowledgement:message.requiresAcknowledgement,
    sourceMessageId:message.id, expiresAt:message.expiresAt, createdAt:now(), read:false });
  await saveState(state); return message;
}
export async function listWorkspaceMessages(id, actor, panelRole) {
  const state = await readState(); const w = state.workspaces.find((x) => x.id === id); if (!w) throw new Error("Workspace not found");
  await workspacePermissions(w.folder, actor, panelRole);
  const current = user(actor);
  return state.messages.filter((x) => x.workspaceId === id && (panelRole === "admin" || x.author === current || x.recipients?.includes(current))).slice(-200);
}
export async function markWorkspaceNotificationRead(id, actor, panelRole) {
  const state = await readState(); const n = state.notifications.find((x) => x.id === id); if (!n) return { found:false };
  if (panelRole !== "admin" && n.user !== user(actor)) throw new Error("Notification access denied");
  n.read = true; n.readAt = now(); await saveState(state); return { found:true, ok:true };
}
