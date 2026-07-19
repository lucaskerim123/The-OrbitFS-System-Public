<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { auth } from '$lib/auth.svelte';
	import { Card, CardContent, Badge, Button, Input } from '$lib/components/ui';
	import { Users, Plus, Trash2, Pencil, LoaderCircle, X } from '@lucide/svelte';

	type UserPermissions = { create_workspaces: boolean; access_public_workspace: boolean; invite_workspace_members: boolean; share_files: boolean };
	type PanelUser = { username: string; role: 'owner' | 'admin' | 'user'; status: 'active' | 'inactive' | 'banned'; email: string | null; protected?: boolean; banReason?: string; permissions: UserPermissions };
	const permissionLabels: Record<keyof UserPermissions, string> = { create_workspaces: 'Create workspaces', access_public_workspace: 'Access public workspace', invite_workspace_members: 'Invite workspace members', share_files: 'Share files' };

	let list = $state<PanelUser[]>([]);
	const bannedUsers = $derived(list.filter((user) => user.status === 'banned'));
	let loading = $state(true);
	let error = $state('');

	let formOpen = $state(false);
	let editingUsername = $state<string | null>(null);
	let formUsername = $state('');
	let formPin = $state('');
	let formRole = $state<'owner' | 'admin' | 'user'>('user');
	let formEmail = $state('');
	let formStatus = $state<'active' | 'inactive' | 'banned'>('active');
	let formBanReason = $state('');
	let formPermissions = $state<UserPermissions>({ create_workspaces: true, access_public_workspace: true, invite_workspace_members: true, share_files: true });
	let formError = $state('');
	let saving = $state(false);

	let deleteBusy = $state<string | null>(null);
	let confirmingDelete = $state<string | null>(null);

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await api.get<{ users: PanelUser[] }>('/users');
			list = res.users;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load users';
		} finally {
			loading = false;
		}
	}

	load();

	function openCreate() {
		editingUsername = null;
		formUsername = '';
		formPin = '';
		formRole = 'user';
		formEmail = '';
		formStatus = 'active';
		formBanReason = '';
		formPermissions = { create_workspaces: true, access_public_workspace: true, invite_workspace_members: true, share_files: true };
		formError = '';
		formOpen = true;
	}

	function openEdit(u: PanelUser) {
		editingUsername = u.username;
		formUsername = u.username;
		formPin = '';
		formRole = u.role === 'owner' ? 'admin' : u.role;
		formEmail = u.email ?? '';
		formStatus = u.status;
		formBanReason = u.banReason ?? '';
		formPermissions = { ...u.permissions };
		formError = '';
		formOpen = true;
	}

	async function submit(e: Event) {
		e.preventDefault();
		formError = '';
		if (!formUsername.trim()) {
			formError = 'Username is required';
			return;
		}
		if (!editingUsername && !/^\d{4,10}$/.test(formPin)) { formError = 'PIN must be 4-10 digits'; return; }
		if (editingUsername && formPin && !/^\d{4,10}$/.test(formPin)) { formError = 'New PIN must be 4-10 digits'; return; }
		saving = true;
		try {
			await api.post('/users', {
				username: formUsername.trim(),
				pin: formPin,
				role: formRole,
				email: formEmail.trim() || null,
				status: formStatus,
				banReason: formBanReason.trim(),
				permissions: formPermissions
			});
			formOpen = false;
			await load();
		} catch (err) {
			formError = err instanceof ApiError ? err.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function remove(username: string) {
		deleteBusy = username;
		confirmingDelete = null;
		try {
			await api.delete(`/users/${encodeURIComponent(username)}`);
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Delete failed';
		} finally {
			deleteBusy = null;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<Users class="size-5 text-muted-foreground" />
				Users
			</h1>
			<p class="text-sm text-muted-foreground">Panel accounts and roles.</p>
		</div>
		<Button size="sm" onclick={openCreate}><Plus />New user</Button>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if formOpen}
		<Card>
			<CardContent class="space-y-3 pt-4">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold">{editingUsername ? `Edit ${editingUsername}` : 'New user'}</h2>
					<button class="text-muted-foreground hover:text-foreground" onclick={() => (formOpen = false)} aria-label="Close">
						<X class="size-4" />
					</button>
				</div>
				<form class="space-y-3" onsubmit={submit}>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1.5">
							<label for="u-username" class="text-sm font-medium">Username</label>
							<Input id="u-username" bind:value={formUsername} disabled={!!editingUsername} />
						</div>
						<div class="space-y-1.5">
							<label for="u-pin" class="text-sm font-medium">
								{editingUsername ? 'New PIN' : 'PIN'}
							</label>
							<Input id="u-pin" type="password" bind:value={formPin} placeholder={editingUsername ? "Leave blank to keep current PIN" : "4-10 digits"} />
						</div>
						<div class="space-y-1.5">
							<label for="u-email" class="text-sm font-medium">Email</label>
							<Input id="u-email" type="email" bind:value={formEmail} />
						</div>
						<div class="space-y-1.5">
							<label for="u-role" class="text-sm font-medium">Role</label>
							<select
								id="u-role"
								bind:value={formRole}
								class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								<option value="user">User</option>
								<option value="admin">Admin</option>
							</select>
						</div>
						<div class="space-y-1.5">
							<label for="u-status" class="text-sm font-medium">Status</label>
							<select id="u-status" bind:value={formStatus} class="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" disabled={editingUsername === auth.user?.username}>
								<option value="active">Active</option>
								<option value="inactive">Inactive</option>
								<option value="banned">Banned</option>
							</select>
						</div>
						{#if formStatus === 'banned'}
							<div class="space-y-1.5">
								<label for="u-ban-reason" class="text-sm font-medium">Ban reason</label>
								<Input id="u-ban-reason" bind:value={formBanReason} placeholder="Reason shown at login" />
							</div>
						{/if}
					</div>
					<fieldset class="space-y-2 rounded-md border p-3" disabled={formRole === 'admin'}>
						<legend class="px-1 text-sm font-medium">Per-user permissions</legend>
						<div class="grid gap-2 sm:grid-cols-2">
							{#each Object.entries(permissionLabels) as [key, label]}
								<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={formPermissions[key as keyof UserPermissions]} />{label}</label>
							{/each}
						</div>
						{#if formRole === 'admin'}<p class="text-xs text-muted-foreground">Admins have every panel permission.</p>{/if}
					</fieldset>
					{#if formError}
						<p class="text-sm text-destructive">{formError}</p>
					{/if}
					<div class="flex gap-2">
						<Button type="submit" size="sm" disabled={saving}>
							{#if saving}<LoaderCircle class="size-4 animate-spin" />{/if}
							Save
						</Button>
						<Button type="button" variant="outline" size="sm" onclick={() => (formOpen = false)}>Cancel</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		{#if loading}
			<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
				<LoaderCircle class="size-5 animate-spin" />
				Loading&hellip;
			</div>
		{:else}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-muted-foreground">
						<th class="px-4 py-2 font-medium">Username</th>
						<th class="hidden px-4 py-2 font-medium sm:table-cell">Email</th>
						<th class="px-4 py-2 font-medium">Role</th>
						<th class="px-4 py-2 font-medium">Status</th>
						<th class="px-4 py-2 font-medium"></th>
					</tr>
				</thead>
				<tbody>
					{#each list as u (u.username)}
						<tr class="group border-b border-border last:border-0 hover:bg-accent/40">
							<td class="px-4 py-2 font-medium">{u.username}</td>
							<td class="hidden px-4 py-2 text-muted-foreground sm:table-cell">{u.email ?? '—'}</td>
							<td class="px-4 py-2">
								<Badge variant={u.role === 'owner' ? 'success' : u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
							</td>
							<td class="px-4 py-2"><Badge variant={u.status === 'active' ? 'success' : u.status === 'banned' ? 'destructive' : 'secondary'}>{u.status}</Badge></td>
							<td class="px-4 py-2">
								<div class="flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
									<button
										class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label="Edit"
										onclick={() => openEdit(u)}
										disabled={u.protected}
									>
										<Pencil class="size-4" />
									</button>
									{#if u.username !== auth.user?.username}
										{#if confirmingDelete === u.username}
											<button
												class="flex h-7 items-center gap-1 rounded-md bg-destructive/15 px-2 text-xs font-medium text-destructive"
												onclick={() => remove(u.username)}
												disabled={deleteBusy === u.username}
											>
												{#if deleteBusy === u.username}<LoaderCircle class="size-3.5 animate-spin" />{:else}Confirm{/if}
											</button>
											<button
												class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
												onclick={() => (confirmingDelete = null)}
												aria-label="Cancel"
											>
												<X class="size-4" />
											</button>
										{:else}
											<button
												class="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
												aria-label="Delete"
												onclick={() => (confirmingDelete = u.username)}
											>
												<Trash2 class="size-4" />
											</button>
										{/if}
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<Card>
		<CardContent class="space-y-3 pt-4">
			<div><h2 class="text-sm font-semibold">Ban panel</h2><p class="text-xs text-muted-foreground">Banned accounts cannot log in and all existing sessions are revoked.</p></div>
			{#if bannedUsers.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No banned users.</p>
			{:else}
				{#each bannedUsers as user (user.username)}
					<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 p-3">
						<div><strong>{user.username}</strong><p class="text-xs text-muted-foreground">{user.banReason || 'No reason recorded'}</p></div>
						<Button size="sm" variant="outline" onclick={() => openEdit(user)}>Review / unban</Button>
					</div>
				{/each}
			{/if}
		</CardContent>
	</Card>
</div>
