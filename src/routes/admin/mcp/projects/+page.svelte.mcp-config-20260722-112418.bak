<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '$lib/components/ui';
	import { Folder, LoaderCircle, Plus, Trash2 } from '@lucide/svelte';

	type Workspace = { id: string; name: string; permission: string; management_permissions?: Record<string, boolean> };
	type Project = { id: string; name: string; instructions: string; ai_behaviour: string };

	let workspaces = $state<Workspace[]>([]);
	let workspaceId = $state('');
	let projects = $state<Project[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');
	let form = $state({ name: '', instructions: '', aiBehaviour: '' });

	async function loadProjects() {
		if (!workspaceId) return;
		loading = true; error = '';
		try { projects = (await api.get<{ projects: Project[] }>(`/mcp/workspaces/${workspaceId}/projects`)).projects; }
		catch (err) { error = err instanceof ApiError ? err.message : 'Failed to load projects'; }
		finally { loading = false; }
	}
	async function load() {
		const data = await api.get<{ workspaces: Workspace[]; canManageGlobal: boolean }>('/workspaces');
		workspaces = data.workspaces.filter((workspace) =>
			workspace.permission === 'owner' || !!workspace.management_permissions?.manage_mcp_startup
		);
		workspaceId = workspaces[0]?.id || '';
		await loadProjects();
	}

	async function save() {
		if (!workspaceId || !form.name.trim()) return;
		saving = true; error = '';
		try {
			await api.post(`/mcp/workspaces/${workspaceId}/projects`, form);
			form = { name: '', instructions: '', aiBehaviour: '' };
			await loadProjects();
		} catch (err) { error = err instanceof ApiError ? err.message : 'Project save failed'; }
		finally { saving = false; }
	}

	async function remove(projectId: string) {
		await api.delete(`/mcp/workspaces/${workspaceId}/projects/${projectId}`);
		await loadProjects();
	}

	load().catch((err) => { error = err instanceof ApiError ? err.message : 'Failed to load MCP projects'; loading = false; });
</script>
<div class="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
	<div><h1 class="flex items-center gap-2 text-xl font-semibold"><Folder class="size-5" />MCP Projects</h1><p class="text-sm text-muted-foreground">Reusable AI behaviour and startup instructions for a workspace.</p></div>
	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	{#if workspaces.length === 0}
		<Card><CardContent class="p-5 text-sm text-muted-foreground">You do not own, or have Manage MCP startup permission for, any workspace.</CardContent></Card>
	{:else}
		<Card><CardHeader><CardTitle>Create project</CardTitle></CardHeader><CardContent class="space-y-4">
			<label class="space-y-1 text-sm"><span>Workspace</span><select class="w-full rounded-md border bg-background p-2" bind:value={workspaceId} onchange={loadProjects}>{#each workspaces as ws}<option value={ws.id}>{ws.name}</option>{/each}</select></label>
			<label class="space-y-1 text-sm"><span>Name</span><Input placeholder="Project name" bind:value={form.name} /></label>
			<div class="grid gap-3 md:grid-cols-2">
				<label class="space-y-1 text-sm"><span>AI behaviour</span><textarea class="min-h-32 w-full rounded-md border bg-background p-2" bind:value={form.aiBehaviour}></textarea></label>
				<label class="space-y-1 text-sm"><span>AI startup instructions</span><textarea class="min-h-32 w-full rounded-md border bg-background p-2" bind:value={form.instructions}></textarea></label>
			</div>
			<Button onclick={save} disabled={saving || !form.name.trim()}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Plus class="size-4" />{/if}Create project</Button>
		</CardContent></Card>
		<Card><CardHeader><CardTitle>Workspace projects</CardTitle></CardHeader><CardContent>
			{#if loading}<div class="flex justify-center py-10"><LoaderCircle class="size-5 animate-spin" /></div>
			{:else if projects.length === 0}<p class="text-sm text-muted-foreground">No projects in this workspace.</p>
			{:else}<div class="space-y-3">{#each projects as project}<div class="rounded-md border p-3"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><strong>{project.name}</strong><p class="mt-2 text-xs font-medium uppercase text-muted-foreground">AI behaviour</p><p class="whitespace-pre-wrap text-sm">{project.ai_behaviour || 'None'}</p><p class="mt-2 text-xs font-medium uppercase text-muted-foreground">Startup instructions</p><p class="whitespace-pre-wrap text-sm">{project.instructions || 'None'}</p></div><Button variant="ghost" size="icon" onclick={() => remove(project.id)}><Trash2 class="size-4" /></Button></div></div>{/each}</div>{/if}
		</CardContent></Card>
	{/if}
</div>
