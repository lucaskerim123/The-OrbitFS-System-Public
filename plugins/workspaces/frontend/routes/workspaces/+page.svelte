<script lang="ts">
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { fileContext } from '$lib/context.svelte';
	import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { Building2, HardDrive, LoaderCircle, MessageSquare, Plus, RefreshCw, Shield, Trash2, Users } from '@lucide/svelte';
	import PathPicker from '$lib/components/path-picker.svelte';

	const GiB = 1024 ** 3;
	const MiB = 1024 ** 2;
	const roles = ['owner', 'editor', 'contributor', 'viewer'];
	const editableRoles = ['editor', 'contributor', 'viewer'];
	const fileActions = ['read', 'write', 'download', 'move', 'delete', 'create', 'share'];
	const managementActions = ['view_settings', 'edit_settings', 'manage_members', 'manage_permissions', 'manage_mcp_startup', 'send_messages', 'use_sorter', 'manage_sorter_settings', 'delete_workspace'];
	const managementLabels: Record<string, string> = {
		view_settings: 'View workspace settings', edit_settings: 'Edit workspace settings',
		manage_members: 'Manage members', manage_permissions: 'Manage permissions',
		manage_mcp_startup: 'Manage MCP startup',
		send_messages: 'Send workspace messages', use_sorter: 'Use Sorter',
		manage_sorter_settings: 'Access Sorter settings', delete_workspace: 'Delete workspace'
	};

	type Workspace = {
		id: string; name: string; description?: string; status: string; is_main: boolean; is_public?: boolean;
		permission: string; owner_username?: string; storage_quota_bytes?: number;
		storage_used_bytes?: number; trash_limit_bytes?: number; trash_used_bytes?: number;
		file_count?: number; folder_count?: number; drive_state?: string; filesystem_root?: string;
		suspension_reason?: string; mcp_ui_enabled?: boolean; management_permissions?: Record<string, boolean>;
	};
	type Member = { user_id: string; username: string; permission: string; system_role?: string; mcp_enabled?: boolean };
	type WorkspaceInvitation = { id: string; workspace_id: string; workspace_name: string; username: string; permission: string; status: string; requested_by_username: string; created_at: string };
	type StorageRequest = { id: string; workspace_id: string; workspace_name?: string; requester_username: string; current_quota_bytes: number; requested_quota_bytes: number; request_type: 'upgrade' | 'downgrade'; message?: string; status: string; created_at: string };
	type OwnershipRequest = { id: string; workspace_id: string; workspace_name: string; from_username: string; target_username: string; message?: string; status: string; created_at: string };
	type FileOverride = { path: string; role: string; permissions: Record<string, boolean> };
	type WorkspaceMessage = { id: string; title: string; message: string; severity: string; created_by: string; created_at: string };
	type GlobalSettings = {
		maxWorkspacesPerUser: number; inactiveBeforeOfflineDays: number; offlineWarningDays: number;
		deleteAfterOfflineDays: number; deletionWarningDays: number;
	};
	type TrashEntry = { name: string; type: 'file' | 'dir'; size?: number; mtime?: string };
	type ManagementResponse = { overrides: Record<string, Record<string, boolean>>; effective: Record<string, Record<string, boolean>> };

	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let busy = $state('');
	let canManageGlobal = $state(false);
	let userPermissions = $state({ create_workspaces: true, access_public_workspace: true, invite_workspace_members: true, share_files: true });
	let workspaces = $state<Workspace[]>([]);
	let selectedId = $state<string | null>(null);
	let tab = $state<'storage' | 'members' | 'settings' | 'permissions' | 'messages'>('storage');
	let permissionTab = $state<'files' | 'workspace'>('files');
	let members = $state<Member[]>([]);
	let invitations = $state<WorkspaceInvitation[]>([]);
	let storageRequests = $state<StorageRequest[]>([]);
	let ownershipRequests = $state<OwnershipRequest[]>([]);
	let trashEntries = $state<TrashEntry[]>([]);
	let showTrash = $state(false);
	let overrides = $state<FileOverride[]>([]);
	let management = $state<ManagementResponse>({ overrides: {}, effective: {} });
	let messages = $state<WorkspaceMessage[]>([]);
	let globalSettings = $state<GlobalSettings>({ maxWorkspacesPerUser: 1, inactiveBeforeOfflineDays: 30, offlineWarningDays: 7, deleteAfterOfflineDays: 30, deletionWarningDays: 7 });
	let showGlobal = $state(false);
	let showAllWorkspaces = $state(false);
	let createOpen = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let memberName = $state('');
	let memberRole = $state('viewer');
	let memberMcp = $state(false);
	let overridePath = $state('');
	let overrideRole = $state('viewer');
	let overridePerms = $state<Record<string, boolean>>({ read: true, write: false, download: false, move: false, delete: false, create: false, share: false });
	let managementRole = $state('editor');
	let managementDraft = $state<Record<string, boolean>>({});
	let messageTitle = $state('');
	let messageBody = $state('');
	let messageSeverity = $state('info');
	let settingsName = $state('');
	let settingsDescription = $state('');
	let settingsQuotaGb = $state(1);
	let settingsTrashMb = $state(200);
	let settingsOwner = $state('');
	let settingsStatus = $state('active');
	let suspensionReason = $state('');
	let requestedQuotaGb = $state(5);
	let quotaMessage = $state('');
	let transferTarget = $state('');
	let transferMessage = $state('');

	const selected = $derived(workspaces.find((item) => item.id === selectedId) ?? null);
	const displayedWorkspaces = $derived(canManageGlobal && !showAllWorkspaces ? workspaces.filter((item) => item.permission === 'owner' || item.is_main) : workspaces);
	const pendingInvitations = $derived(invitations.filter((item) => item.status === 'pending'));
	const pendingStorageRequests = $derived(storageRequests.filter((item) => item.status === 'pending'));
	const pendingOwnershipRequests = $derived(ownershipRequests.filter((item) => item.status === 'pending'));
	const transferCandidates = $derived(members.filter((member) => member.permission !== 'owner'));
	const allowed = (action: string) => selected?.permission === 'owner' || !!selected?.management_permissions?.[action];
	const canAccessWorkspace = (workspace: Workspace) => workspace.status !== 'suspended' || canManageGlobal;
	const formatBytes = (bytes = 0) => bytes >= GiB ? `${(bytes / GiB).toFixed(2)} GB` : bytes >= MiB ? `${(bytes / MiB).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
	const messageFor = (err: unknown, fallback: string) => err instanceof ApiError ? err.message : fallback;

	function syncSettings() {
		if (!selected) return;
		settingsName = selected.name;
		settingsDescription = selected.description ?? '';
		settingsQuotaGb = Number(((selected.storage_quota_bytes ?? GiB) / GiB).toFixed(2));
		settingsTrashMb = Math.round((selected.trash_limit_bytes ?? 200 * MiB) / MiB);
		settingsOwner = selected.owner_username ?? '';
		settingsStatus = selected.status;
		suspensionReason = selected.suspension_reason ?? '';
		requestedQuotaGb = Number(((selected.storage_quota_bytes ?? 5 * GiB) / GiB).toFixed(2));
	}
	function prepareManagement(role = managementRole) {
		managementRole = role;
		const source = management.overrides[role] ?? management.effective[role] ?? {};
		managementDraft = Object.fromEntries(managementActions.map((action) => [action, !!source[action]]));
	}
	async function loadDetails() {
		if (!selectedId) return;
		const workspace = workspaces.find((item) => item.id === selectedId);
		if (!workspace || !canAccessWorkspace(workspace)) { members = []; overrides = []; messages = []; return; }
		const id = selectedId;
		const [memberData, overrideData, managementData, messageData] = await Promise.all([
			api.get<{ members: Member[] }>(`/workspaces/${id}/members`),
			api.get<{ overrides: FileOverride[] }>(`/workspaces/${id}/permission-overrides`),
			api.get<ManagementResponse>(`/workspaces/${id}/management-permissions`),
			api.get<{ messages: WorkspaceMessage[] }>(`/workspaces/${id}/messages`)
		]);
		members = memberData.members; overrides = overrideData.overrides; management = managementData; messages = messageData.messages;
		prepareManagement(); syncSettings();
	}
	async function load() {
		loading = true; error = '';
		try {
			const data = await api.get<{ workspaces: Workspace[]; settings: GlobalSettings; canManageGlobal: boolean; userPermissions: typeof userPermissions }>('/workspaces');
			workspaces = data.workspaces; globalSettings = { ...globalSettings, ...data.settings }; canManageGlobal = data.canManageGlobal; userPermissions = data.userPermissions;
			invitations = data.canManageGlobal
				? (await api.get<{ invitations: WorkspaceInvitation[] }>('/workspace-invitations')).invitations
				: [];
			[storageRequests, ownershipRequests] = await Promise.all([
				api.get<{ requests: StorageRequest[] }>('/workspace-storage-requests').then((result) => result.requests),
				api.get<{ requests: OwnershipRequest[] }>('/workspace-ownership-requests').then((result) => result.requests)
			]);
			if (!selectedId || !workspaces.some((item) => item.id === selectedId && canAccessWorkspace(item))) selectedId = workspaces.find(canAccessWorkspace)?.id ?? null;
			await loadDetails();
		} catch (err) { error = messageFor(err, 'Failed to load workspaces'); }
		finally { loading = false; }
	}
	async function run(key: string, action: () => Promise<unknown>, reload = true) {
		busy = key; error = ''; notice = '';
		try { await action(); if (reload) await load(); notice = 'Changes saved.'; }
		catch (err) { error = messageFor(err, 'Action failed'); }
		finally { busy = ''; }
	}
	async function choose(id: string) { const workspace = workspaces.find((item) => item.id === id); if (!workspace || !canAccessWorkspace(workspace)) return; selectedId = id; error = ''; showTrash = false; await loadDetails(); }
	async function openSelected() { if (!selected || !canAccessWorkspace(selected)) return; fileContext.set(selected.id, selected.name); await goto('/'); }
	async function refreshStats() {
		if (!selected) return;
		await run('stats', async () => {
			const result = await api.get<{ workspace: Workspace }>(`/workspaces/${selected.id}/stats`);
			workspaces = workspaces.map((item) => item.id === result.workspace.id ? result.workspace : item);
		}, false);
	}
	async function createWorkspace() {
		await run('create', () => api.post('/workspaces', { name: newName, description: newDescription }));
		createOpen = false; newName = ''; newDescription = '';
	}
	async function viewTrash() {
		if (!selected) return;
		busy = 'trash-view'; error = '';
		try {
			const result = await api.get<{ entries: TrashEntry[] }>(`/workspaces/${selected.id}/trash`);
			trashEntries = result.entries;
			showTrash = true;
		} catch (err) { error = messageFor(err, 'Could not load trash'); }
		finally { busy = ''; }
	}
	async function emptyTrash() {
		if (!selected || !confirm(`Permanently empty trash for ${selected.name}?`)) return;
		await run('trash-empty', () => api.delete(`/workspaces/${selected.id}/trash`));
		trashEntries = [];
		showTrash = false;
	}
	async function saveGlobal() { await run('global', () => api.patch('/workspaces/settings', globalSettings)); }
	async function saveWorkspace() {
		if (!selected) return;
		const changes: Record<string, unknown> = { name: settingsName, description: settingsDescription };
		if (canManageGlobal) {
			changes.storageQuotaBytes = settingsQuotaGb * GiB;
			changes.trashLimitBytes = settingsTrashMb * MiB;
			changes.status = settingsStatus;
			changes.suspensionReason = suspensionReason;
		}
		await run('settings', () => api.patch(`/workspaces/${selected.id}`, changes));
	}
	async function setOffline() {
		if (!selected) return;
		const status = selected.status === 'offline' ? 'active' : 'offline';
		await run('offline', () => api.patch(`/workspaces/${selected.id}`, { status }));
	}
	async function toggleMcp() {
		if (!selected) return;
		await run('mcp', () => api.patch(`/workspaces/${selected.id}`, { mcpEnabled: !selected.mcp_ui_enabled }));
	}
	async function addMember() {
		if (!selected || !memberName.trim()) return;
		busy = 'member-add'; error = ''; notice = '';
		try {
			const result = await api.put<{ pendingApproval: boolean }>(
				`/workspaces/${selected.id}/members/${encodeURIComponent(memberName.trim())}`,
				{ permission: memberRole, mcpEnabled: memberMcp }
			);
			memberName = ''; memberRole = 'viewer'; memberMcp = false;
			await load();
			notice = result.pendingApproval
				? 'User does not exist. An Owner/Admin approval request was created; approval creates the account with temporary PIN 0000.'
				: 'Member added. Their user account remains independent of workspace membership.';
		} catch (err) {
			error = messageFor(err, 'Could not add member');
		} finally {
			busy = '';
		}
	}
	async function respondInvitation(invitationId: string, decision: 'approved' | 'denied') {
		await run(`invitation-${invitationId}`, () =>
			api.post(`/workspace-invitations/${invitationId}/respond`, { decision })
		);
	}
	async function requestQuota() {
		if (!selected) return;
		await run('quota-request', () => api.post(`/workspaces/${selected.id}/storage-request`, { requestedQuotaBytes: requestedQuotaGb * GiB, message: quotaMessage }));
		quotaMessage = '';
	}
	async function respondQuota(requestId: string, decision: 'approved' | 'denied') {
		await run(`quota-${requestId}`, () => api.post(`/workspace-storage-requests/${requestId}/respond`, { decision }));
	}
	async function requestTransfer() {
		if (!selected || !transferTarget) return;
		await run('ownership-request', () => api.post(`/workspaces/${selected.id}/ownership-request`, { targetUsername: transferTarget, message: transferMessage }));
		transferTarget = ''; transferMessage = '';
	}
	async function respondTransfer(requestId: string, decision: 'approved' | 'denied') {
		await run(`ownership-${requestId}`, () => api.post(`/workspace-ownership-requests/${requestId}/respond`, { decision }));
	}
	async function saveMember(member: Member) {
		if (!selected) return;
		await run(`member-${member.user_id}`, () => api.put(`/workspaces/${selected.id}/members/${encodeURIComponent(member.username)}`, { permission: member.permission, mcpEnabled: member.mcp_enabled }));
	}
	async function removeMember(member: Member) {
		if (!selected || !confirm(`Remove ${member.username} from this workspace?`)) return;
		await run(`remove-${member.user_id}`, () => api.delete(`/workspaces/${selected.id}/members/${member.user_id}`));
	}
	async function saveFileOverride() {
		if (!selected) return;
		await run('file-permission', () => api.put(`/workspaces/${selected.id}/permission-overrides`, { path: overridePath, role: overrideRole, permissions: overridePerms }));
	}
	async function removeFileOverride(item: FileOverride) {
		if (!selected) return;
		await run('file-permission-remove', () => api.delete(`/workspaces/${selected.id}/permission-overrides?path=${encodeURIComponent(item.path)}&role=${item.role}`));
	}
	async function saveManagement() {
		if (!selected) return;
		await run('management-permission', () => api.put(`/workspaces/${selected.id}/management-permissions`, { role: managementRole, permissions: managementDraft }));
	}
	async function resetManagement() {
		if (!selected) return;
		await run('management-reset', () => api.delete(`/workspaces/${selected.id}/management-permissions?role=${managementRole}`));
	}
	async function sendMessage() {
		if (!selected || !messageTitle.trim() || !messageBody.trim()) return;
		await run('message', () => api.post(`/workspaces/${selected.id}/messages`, { title: messageTitle, message: messageBody, severity: messageSeverity }));
		messageTitle = ''; messageBody = ''; messageSeverity = 'info';
	}
	async function deleteWorkspace() {
		if (!selected || !confirm(`Move ${selected.name} to recoverable system trash?`)) return;
		await run('delete', () => api.delete(`/workspaces/${selected.id}`));
	}
	load();
</script>

<div class="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div><p class="text-xs font-semibold uppercase tracking-wide text-primary">Workspace mode</p><h1 class="mt-1 flex items-center gap-2 text-2xl font-semibold"><Building2 class="size-6" />Workspaces</h1><p class="text-sm text-muted-foreground">Switch file systems and manage isolated access.</p></div>
		<div class="flex gap-2"><Button variant="outline" onclick={load} disabled={loading}><RefreshCw class="size-4" />Refresh</Button><Button onclick={() => createOpen = true} disabled={!userPermissions.create_workspaces}><Plus class="size-4" />New workspace</Button></div>
	</header>
	{#if error}<div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	{#if notice}<div class="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-500">{notice}</div>{/if}
	{#if canManageGlobal}
		<Card>
			<CardHeader class="flex-row items-start justify-between"><div><CardTitle>Workspace Manager</CardTitle><CardDescription>Global limits and lifecycle rules. Hidden from standard users.</CardDescription></div><Badge variant="secondary">System Owner / Admin</Badge></CardHeader>
			<CardContent>
				<Button variant="outline" onclick={() => showGlobal = !showGlobal}>{showGlobal ? 'Hide' : 'Edit'} global rules</Button>
				{#if showGlobal}<div class="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
					<label class="space-y-1 text-sm"><span>Max per user (0 unlimited)</span><Input type="number" min="0" bind:value={globalSettings.maxWorkspacesPerUser} /></label>
					<label class="space-y-1 text-sm"><span>Inactive before offline</span><Input type="number" min="0" bind:value={globalSettings.inactiveBeforeOfflineDays} /></label>
					<label class="space-y-1 text-sm"><span>Offline warning</span><Input type="number" min="0" bind:value={globalSettings.offlineWarningDays} /></label>
					<label class="space-y-1 text-sm"><span>Delete after offline</span><Input type="number" min="0" bind:value={globalSettings.deleteAfterOfflineDays} /></label>
					<label class="space-y-1 text-sm"><span>Deletion warning</span><Input type="number" min="0" bind:value={globalSettings.deletionWarningDays} /></label>
				</div><Button class="mt-4" onclick={saveGlobal} disabled={busy === 'global'}>Save lifecycle rules</Button>{/if}
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-3"><h3 class="text-sm font-semibold">New member approval queue</h3><p class="text-xs text-muted-foreground">Approval creates the user with temporary PIN 0000, adds the workspace membership, and sends an invitation.</p></div>
					{#if pendingInvitations.length === 0}
						<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No member requests waiting for approval.</p>
					{:else}
						<div class="space-y-2">{#each pendingInvitations as invitation (invitation.id)}
							<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
								<div><strong>{invitation.username}</strong><p class="text-xs text-muted-foreground">{invitation.workspace_name} · {invitation.permission} · requested by {invitation.requested_by_username}</p></div>
								<div class="flex gap-2"><Button size="sm" onclick={() => respondInvitation(invitation.id, 'approved')} disabled={busy === `invitation-${invitation.id}`}>Approve</Button><Button size="sm" variant="outline" onclick={() => respondInvitation(invitation.id, 'denied')} disabled={busy === `invitation-${invitation.id}`}>Deny</Button></div>
							</div>
						{/each}</div>
					{/if}
				</div>
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-3"><h3 class="text-sm font-semibold">Quota change requests</h3><p class="text-xs text-muted-foreground">Workspace-level owners request upgrades and downgrades here. Limits change only after approval.</p></div>
					{#if pendingStorageRequests.length === 0}<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No quota requests waiting for approval.</p>
					{:else}<div class="space-y-2">{#each pendingStorageRequests as request (request.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
							<div><strong>{request.workspace_name || 'Workspace'} · {request.request_type}</strong><p class="text-xs text-muted-foreground">{request.requester_username} · {formatBytes(request.current_quota_bytes)} to {formatBytes(request.requested_quota_bytes)}</p>{#if request.message}<p class="mt-1 text-sm">{request.message}</p>{/if}</div>
							<div class="flex gap-2"><Button size="sm" onclick={() => respondQuota(request.id, 'approved')} disabled={busy === `quota-${request.id}`}>Approve</Button><Button size="sm" variant="outline" onclick={() => respondQuota(request.id, 'denied')} disabled={busy === `quota-${request.id}`}>Deny</Button></div>
						</div>
					{/each}</div>{/if}
				</div>
				<div class="mt-5 border-t border-border pt-4">
					<div class="mb-3"><h3 class="text-sm font-semibold">Ownership transfer requests</h3><p class="text-xs text-muted-foreground">Transfers do not occur until a system Owner or Admin approves them.</p></div>
					{#if pendingOwnershipRequests.length === 0}<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No ownership transfers waiting for approval.</p>
					{:else}<div class="space-y-2">{#each pendingOwnershipRequests as request (request.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
							<div><strong>{request.workspace_name}</strong><p class="text-xs text-muted-foreground">{request.from_username} to {request.target_username}</p>{#if request.message}<p class="mt-1 text-sm">{request.message}</p>{/if}</div>
							<div class="flex gap-2"><Button size="sm" onclick={() => respondTransfer(request.id, 'approved')} disabled={busy === `ownership-${request.id}`}>Approve</Button><Button size="sm" variant="outline" onclick={() => respondTransfer(request.id, 'denied')} disabled={busy === `ownership-${request.id}`}>Deny</Button></div>
						</div>
					{/each}</div>{/if}
				</div>
			</CardContent>
		</Card>
	{/if}
	{#if loading}<div class="grid place-items-center py-20"><LoaderCircle class="size-7 animate-spin" /></div>
	{:else}<div class="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
		<Card class="h-fit"><CardHeader><div class="flex items-start justify-between gap-2"><div><CardTitle>Available workspaces</CardTitle><CardDescription>{displayedWorkspaces.length} shown · {workspaces.length} total</CardDescription></div>{#if canManageGlobal}<Button size="sm" variant="outline" onclick={() => showAllWorkspaces = !showAllWorkspaces}>{showAllWorkspaces ? 'My / main only' : 'Show all'}</Button>{/if}</div></CardHeader><CardContent class="space-y-2">
			{#each displayedWorkspaces as item}
				<button class="w-full rounded-md border p-3 text-left transition-colors {canAccessWorkspace(item) ? (selectedId === item.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/50') : 'cursor-not-allowed border-muted bg-muted/30 opacity-45 grayscale'}" onclick={() => choose(item.id)} disabled={!canAccessWorkspace(item)} aria-disabled={!canAccessWorkspace(item)}>
					<div class="flex items-center justify-between gap-2"><strong class="truncate">{item.name}</strong><Badge variant={item.status === 'active' ? 'success' : 'secondary'}>{item.status !== 'active' ? item.status : item.is_public ? 'public main' : item.is_main ? 'private main' : 'active'}</Badge></div>
					<div class="mt-1 flex justify-between text-xs text-muted-foreground"><span>{item.permission}</span><span>{formatBytes(item.storage_used_bytes)}</span></div>
				</button>
			{/each}
		</CardContent></Card>

		{#if selected}<div class="min-w-0 space-y-4">
			{#if selected.status !== 'active'}<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"><strong class="capitalize">Workspace {selected.status}</strong><p class="mt-1">{selected.suspension_reason || 'File access is unavailable until an administrator reactivates this workspace.'}</p></div>{/if}
			<Card><CardHeader><div class="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><CardDescription>{selected.description || 'No description'} · {selected.owner_username || 'System owned'}</CardDescription></div><Button variant="outline" onclick={openSelected} disabled={!canAccessWorkspace(selected)}>Open</Button></div></CardHeader>
				<CardContent><div class="grid gap-3 sm:grid-cols-3"><div><span class="text-xs uppercase text-muted-foreground">Your role</span><p class="font-medium capitalize">{selected.permission}</p></div><div><span class="text-xs uppercase text-muted-foreground">Storage</span><p class="font-medium">{formatBytes(selected.storage_used_bytes)} / {formatBytes(selected.storage_quota_bytes)}</p></div><div><span class="text-xs uppercase text-muted-foreground">Drive</span><p class="font-medium capitalize">{selected.drive_state || selected.status}</p></div></div>
				<div class="mt-4 h-2 overflow-hidden rounded bg-muted"><div class="h-full bg-primary" style:width={`${Math.min(100, ((selected.storage_used_bytes || 0) / Math.max(1, selected.storage_quota_bytes || 1)) * 100)}%`}></div></div>
				<div class="mt-4 flex flex-wrap gap-2">
					{#each [['storage','Storage'],['members','Members'],['settings','Settings'],['permissions','Permissions'],['messages','Message']] as item}
						<Button variant={tab === item[0] ? 'default' : 'outline'} onclick={() => tab = item[0] as typeof tab}>{item[1]}</Button>
					{/each}
					<Button variant="outline" onclick={setOffline} disabled={selected.permission !== 'owner' || selected.is_main || busy === 'offline'}>{selected.status === 'offline' ? 'Bring online' : 'Take offline'}</Button>
					<Button variant="outline" onclick={toggleMcp} disabled={!allowed('edit_settings')}>{selected.mcp_ui_enabled ? 'Disable MCP' : 'Enable MCP'}</Button>
				</div></CardContent>
			</Card>
			{#if tab === 'storage'}
				<Card><CardHeader><CardTitle><HardDrive class="mr-2 inline size-5" />Storage</CardTitle><CardDescription>Live values are scanned from the private engine filesystem.</CardDescription></CardHeader><CardContent>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each [['Used',formatBytes(selected.storage_used_bytes)],['Quota',formatBytes(selected.storage_quota_bytes)],['Free',formatBytes(Math.max(0,(selected.storage_quota_bytes || 0)-(selected.storage_used_bytes || 0)))],['Files',String(selected.file_count || 0)],['Folders',String(selected.folder_count || 0)],['Trash',formatBytes(selected.trash_used_bytes)]] as stat}
							<div class="rounded-md border p-4"><span class="text-xs uppercase text-muted-foreground">{stat[0]}</span><p class="mt-1 text-xl font-semibold">{stat[1]}</p></div>
						{/each}
					</div>
					<div class="mt-4 flex flex-wrap gap-2"><Button variant="outline" onclick={refreshStats} disabled={busy === 'stats'}><RefreshCw class="size-4" />Scan now</Button><Button variant="outline" onclick={viewTrash} disabled={busy === 'trash-view' || selected.status !== 'active'}>View trash</Button><Button variant="outline" onclick={emptyTrash} disabled={!allowed('edit_settings') || busy === 'trash-empty' || selected.status !== 'active'}>Empty trash</Button></div>
					{#if showTrash}<div class="mt-4 space-y-2 border-t pt-4"><div class="flex items-center justify-between"><h3 class="text-sm font-semibold">Workspace trash</h3><Button size="sm" variant="ghost" onclick={() => showTrash = false}>Hide</Button></div>{#if trashEntries.length === 0}<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Trash is empty.</p>{:else}{#each trashEntries as entry (entry.name)}<div class="flex items-center justify-between rounded-md border p-3"><span class="truncate">{entry.name}</span><span class="text-xs text-muted-foreground">{entry.type === 'dir' ? 'Folder' : formatBytes(entry.size)}</span></div>{/each}{/if}</div>{/if}
				</CardContent></Card>
			{:else if tab === 'members'}
				<Card><CardHeader><CardTitle><Users class="mr-2 inline size-5" />Members</CardTitle><CardDescription>Workspace roles stay separate from system Owner, Admin, and User groups.</CardDescription></CardHeader><CardContent class="space-y-3">
					{#each members as member}<div class="grid items-center gap-2 rounded-md border p-3 md:grid-cols-[1fr_170px_auto_auto]"><div><strong>{member.username}</strong><p class="text-xs text-muted-foreground">{member.system_role || 'user'} account</p></div><select class="h-10 rounded-md border bg-background px-3" bind:value={member.permission} disabled={!allowed('manage_members') || member.permission === 'owner'}>{#each roles as role}<option value={role}>{role}</option>{/each}</select><label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={member.mcp_enabled} disabled={!allowed('manage_members')} />MCP</label><div class="flex gap-1"><Button size="sm" onclick={() => saveMember(member)} disabled={!allowed('manage_members')}>Save</Button><Button size="sm" variant="ghost" onclick={() => removeMember(member)} disabled={!allowed('manage_members') || member.permission === 'owner'}><Trash2 class="size-4" /></Button></div></div>{/each}
					<div class="space-y-2 border-t pt-4"><div class="grid gap-2 md:grid-cols-[1fr_160px_auto_auto]"><Input bind:value={memberName} placeholder="Username" disabled={!allowed('manage_members')} /><select class="h-10 rounded-md border bg-background px-3" bind:value={memberRole} disabled={!allowed('manage_members')}>{#each editableRoles as role}<option value={role}>{role}</option>{/each}</select><label class="flex items-center gap-2 px-2 text-sm"><input type="checkbox" bind:checked={memberMcp} />MCP</label><Button onclick={addMember} disabled={!allowed('manage_members') || busy === 'member-add'}>Add member</Button></div><p class="text-xs text-muted-foreground">Existing users are added immediately. Unknown usernames create an admin request; approval creates the account with PIN 0000 and forces a new PIN at first login.</p></div>
				</CardContent></Card>
			{:else if tab === 'settings'}
				<Card><CardHeader><CardTitle>Workspace settings</CardTitle><CardDescription>Physical location: {selected.filesystem_root || 'Managed by private engine'}</CardDescription></CardHeader><CardContent class="grid gap-4 md:grid-cols-2">
					<label class="space-y-1 text-sm"><span>Name</span><Input bind:value={settingsName} disabled={!allowed('edit_settings')} /></label>
					<label class="space-y-1 text-sm md:col-span-2"><span>Description</span><textarea class="min-h-24 w-full rounded-md border bg-background p-3" bind:value={settingsDescription} disabled={!allowed('edit_settings')}></textarea></label>
					{#if canManageGlobal}
						<div class="rounded-md border bg-muted/20 p-3 text-sm"><span class="text-xs uppercase text-muted-foreground">Current owner</span><p class="mt-1 font-medium">{selected.owner_username || 'Unknown'}</p></div>
						<label class="space-y-1 text-sm"><span>Quota (GB)</span><Input type="number" min="1" bind:value={settingsQuotaGb} /></label>
						<label class="space-y-1 text-sm"><span>Trash limit (MB)</span><Input type="number" min="1" bind:value={settingsTrashMb} /></label>
						<label class="space-y-1 text-sm"><span>Status</span><select class="h-10 w-full rounded-md border bg-background px-3" bind:value={settingsStatus}>{#each ['active','offline','suspended','archived'] as status}<option value={status}>{status}</option>{/each}</select></label>
						<label class="space-y-1 text-sm md:col-span-2"><span>Suspension reason {settingsStatus === 'suspended' ? '(required)' : ''}</span><Input bind:value={suspensionReason} placeholder="Explain why file access is blocked" /></label>
					{:else if selected.permission === 'owner' && !selected.is_main}
						<div class="space-y-3 rounded-md border p-4 md:col-span-2">
							<div><h3 class="font-semibold">Request quota change</h3><p class="text-xs text-muted-foreground">Current quota: {formatBytes(selected.storage_quota_bytes)}. Upgrade and downgrade requests require admin approval.</p></div>
							<div class="grid gap-2 md:grid-cols-[180px_1fr_auto]"><label class="space-y-1 text-sm"><span>Requested quota (GB)</span><Input type="number" min="1" step="0.25" bind:value={requestedQuotaGb} /></label><label class="space-y-1 text-sm"><span>Reason</span><Input bind:value={quotaMessage} placeholder="Why this quota should change" /></label><Button class="self-end" onclick={requestQuota} disabled={busy === 'quota-request' || requestedQuotaGb * GiB === selected.storage_quota_bytes || pendingStorageRequests.some((item) => item.workspace_id === selected.id)}>Submit request</Button></div>
							{#if pendingStorageRequests.some((item) => item.workspace_id === selected.id)}<p class="text-sm text-amber-400">A quota request is waiting for Owner/Admin review.</p>{/if}
						</div>
						<div class="space-y-3 rounded-md border p-4 md:col-span-2">
							<div><h3 class="font-semibold">Request ownership transfer</h3><p class="text-xs text-muted-foreground">Choose an existing workspace member. Ownership changes only after Owner/Admin approval.</p></div>
							<label class="space-y-1 text-sm"><span>New owner</span><select class="h-10 w-full rounded-md border bg-background px-3" bind:value={transferTarget}><option value="">Select member</option>{#each transferCandidates as member}<option value={member.username}>{member.username} · {member.permission}</option>{/each}</select></label>
							<label class="space-y-1 text-sm"><span>Reason</span><Input bind:value={transferMessage} placeholder="Reason for transfer" /></label>
							<Button variant="outline" onclick={requestTransfer} disabled={!transferTarget || busy === 'ownership-request' || pendingOwnershipRequests.some((item) => item.workspace_id === selected.id)}>Request transfer</Button>
							{#if pendingOwnershipRequests.some((item) => item.workspace_id === selected.id)}<p class="text-sm text-amber-400">An ownership transfer is waiting for Owner/Admin review.</p>{/if}
						</div>
					{/if}
					<div class="flex gap-2 md:col-span-2"><Button onclick={saveWorkspace} disabled={!allowed('edit_settings') || busy === 'settings' || (canManageGlobal && settingsStatus === 'suspended' && !suspensionReason.trim())}>Save workspace</Button><Button variant="destructive" onclick={deleteWorkspace} disabled={selected.is_main || !allowed('delete_workspace')}>Move to trash</Button></div>
				</CardContent></Card>
			{:else if tab === 'permissions'}
				<Card><CardHeader><CardTitle><Shield class="mr-2 inline size-5" />Edit permissions</CardTitle><CardDescription>File access and workspace administration are enforced independently by the private API.</CardDescription></CardHeader><CardContent>
					<div class="mb-4 grid grid-cols-2 rounded-md border p-1"><Button variant={permissionTab === 'files' ? 'default' : 'ghost'} onclick={() => permissionTab = 'files'}>Files & folders</Button><Button variant={permissionTab === 'workspace' ? 'default' : 'ghost'} onclick={() => permissionTab = 'workspace'}>Workspace settings</Button></div>
					{#if permissionTab === 'files'}<div class="space-y-4">
						<div class="grid gap-2 md:grid-cols-[1fr_170px]"><label class="space-y-1 text-sm"><span>Workspace path</span><PathPicker bind:value={overridePath} workspaceId={selected.id} disabled={!allowed('manage_permissions')} placeholder="Choose a file or folder" /></label><label class="space-y-1 text-sm"><span>Role</span><select class="h-10 w-full rounded-md border bg-background px-3" bind:value={overrideRole} disabled={!allowed('manage_permissions')}>{#each editableRoles as role}<option value={role}>{role}</option>{/each}</select></label></div>
						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{#each fileActions as action}<label class="flex items-center gap-3 rounded-md border p-3 capitalize"><input type="checkbox" bind:checked={overridePerms[action]} disabled={!allowed('manage_permissions')} />{action}</label>{/each}</div>
						<Button onclick={saveFileOverride} disabled={!allowed('manage_permissions')}>Save file access</Button>
						{#each overrides as item}<div class="flex items-center justify-between rounded-md border p-3"><span><strong>/{item.path}</strong> · {item.role}</span><Button size="sm" variant="ghost" onclick={() => removeFileOverride(item)} disabled={!allowed('manage_permissions')}><Trash2 class="size-4" /></Button></div>{/each}
					</div>{:else}<div class="space-y-4">
						<label class="block max-w-xs space-y-1 text-sm"><span>Role</span><select class="h-10 w-full rounded-md border bg-background px-3" bind:value={managementRole} onchange={() => prepareManagement(managementRole)}>{#each editableRoles as role}<option value={role}>{role}</option>{/each}</select></label>
						<div class="grid gap-2 md:grid-cols-2">{#each managementActions as action}<label class="flex items-center justify-between rounded-md border p-3"><span>{managementLabels[action]}</span><input type="checkbox" bind:checked={managementDraft[action]} disabled={!allowed('manage_permissions')} /></label>{/each}</div>
						<div class="flex gap-2"><Button onclick={saveManagement} disabled={!allowed('manage_permissions')}>Save workspace access</Button><Button variant="outline" onclick={resetManagement} disabled={!allowed('manage_permissions')}>Use role defaults</Button></div>
					</div>{/if}
				</CardContent></Card>
			{:else}
				<Card><CardHeader><CardTitle><MessageSquare class="mr-2 inline size-5" />Workspace messages</CardTitle><CardDescription>Messages are stored against this workspace and visible to its members.</CardDescription></CardHeader><CardContent class="space-y-4">
					<div class="grid gap-2"><Input bind:value={messageTitle} placeholder="Title" disabled={!allowed('send_messages')} /><textarea class="min-h-28 rounded-md border bg-background p-3" bind:value={messageBody} placeholder="Message" disabled={!allowed('send_messages')}></textarea><div class="flex gap-2"><select class="h-10 rounded-md border bg-background px-3" bind:value={messageSeverity}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select><Button onclick={sendMessage} disabled={!allowed('send_messages')}>Send message</Button></div></div>
					{#each messages as message}<div class="rounded-md border p-3"><div class="flex items-center justify-between gap-2"><strong>{message.title}</strong><Badge variant="secondary">{message.severity}</Badge></div><p class="mt-2 whitespace-pre-wrap text-sm">{message.message}</p><p class="mt-2 text-xs text-muted-foreground">{message.created_by} · {new Date(message.created_at).toLocaleString()}</p></div>{/each}
				</CardContent></Card>
			{/if}
		</div>{/if}
	</div>{/if}

	{#if createOpen}<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"><Card class="w-full max-w-md"><CardHeader><CardTitle>Create workspace</CardTitle><CardDescription>A new isolated 5 GB branch in the private engine.</CardDescription></CardHeader><CardContent class="space-y-3"><Input bind:value={newName} placeholder="Workspace name" /><Input bind:value={newDescription} placeholder="Description" /><div class="flex justify-end gap-2"><Button variant="outline" onclick={() => createOpen = false}>Cancel</Button><Button onclick={createWorkspace} disabled={!newName.trim() || busy === 'create'}>Create</Button></div></CardContent></Card></div>{/if}
</div>
