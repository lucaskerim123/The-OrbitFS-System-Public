<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { onMount } from 'svelte';
	import PathPicker from '$lib/components/path-picker.svelte';
	import { Button, Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { ListTree, LoaderCircle, Plus, Save, Trash2 } from '@lucide/svelte';

	const presetKeys = ['low','medium','high','custom1','custom2'] as const;
	type PresetKey = typeof presetKeys[number];
	type Workspace = { id: string; name: string; permission: string; management_permissions?: Record<string, boolean> };
	type Project = { id: string; name: string };
	type Item = { type: 'file' | 'folder'; path: string; recursive?: boolean; item_path?: string; item_type?: 'file' | 'folder' };
	type Preset = { projectId: string | null; items: Item[] };

	let workspaces = $state<Workspace[]>([]);
	let workspaceId = $state('');
	let projects = $state<Project[]>([]);
	let defaultItems = $state<Item[]>([]);
	let presets = $state<Record<PresetKey, Preset>>({
		low: { projectId: null, items: [] }, medium: { projectId: null, items: [] },
		high: { projectId: null, items: [] }, custom1: { projectId: null, items: [] },
		custom2: { projectId: null, items: [] }
	});
	let activePreset = $state<PresetKey>('medium');
	let defaultPicker = $state('');
	let presetPicker = $state('');
	let loading = $state(true);
	let accessLoaded = $state(false);
	let saving = $state(false);
	let error = $state('');
	const normalizeItems = (items: Item[] = []) => items.map((item) => ({
		type: item.item_type || item.type,
		path: item.item_path || item.path,
		recursive: Boolean(item.recursive || (item.item_type || item.type) === 'folder')
	}));
	async function loadWorkspace() {
		if (!workspaceId) return;
		loading = true; error = '';
		try {
			const [projectData, startupData, presetData] = await Promise.all([
				api.get<{ projects: Project[] }>(`/mcp/workspaces/${workspaceId}/projects`),
				api.get<{ startup: { defaultItems?: Item[] } }>(`/mcp/workspaces/${workspaceId}/startup`),
				api.get<{ presets: Record<PresetKey, Preset> }>(`/mcp/workspaces/${workspaceId}/presets`)
			]);
			projects = projectData.projects;
			defaultItems = normalizeItems(startupData.startup.defaultItems || []);
			presets = Object.fromEntries(presetKeys.map((key) => [key, {
				projectId: presetData.presets?.[key]?.projectId || null,
				items: normalizeItems(presetData.presets?.[key]?.items || [])
			}])) as Record<PresetKey, Preset>;
		} catch (err) { error = err instanceof ApiError ? err.message : 'Failed to load startup presets'; }
		finally { loading = false; }
	}
	async function load() {
		accessLoaded = false;
		try {
			const data = await api.get<{ workspaces: Workspace[]; canManageGlobal: boolean }>('/workspaces');
			workspaces = data.workspaces.filter((workspace) =>
				workspace.permission === 'owner' || !!workspace.management_permissions?.manage_mcp_startup
			);
			workspaceId = workspaces[0]?.id || '';
			await loadWorkspace();
		} finally {
			accessLoaded = true;
		}
	}
	function addDefault() {
		if (!defaultPicker || defaultItems.some((item) => item.path === defaultPicker)) return;
		defaultItems = [...defaultItems, { type: 'file', path: defaultPicker }];
		defaultPicker = '';
	}
	function addPresetItem() {
		if (!presetPicker || presets[activePreset].items.some((item) => item.path === presetPicker)) return;
		presets = { ...presets, [activePreset]: { ...presets[activePreset], items: [...presets[activePreset].items, { type: 'file', path: presetPicker }] } };
		presetPicker = '';
	}
	function removePresetItem(path: string) {
		presets = { ...presets, [activePreset]: { ...presets[activePreset], items: presets[activePreset].items.filter((item) => item.path !== path) } };
	}
	async function saveAll() {
		if (!workspaceId) return;
		saving = true; error = '';
		try {
			await api.put(`/mcp/workspaces/${workspaceId}/default-items`, { items: defaultItems });
			await api.put(`/mcp/workspaces/${workspaceId}/presets`, { presets });
			await loadWorkspace();
		} catch (err) { error = err instanceof ApiError ? err.message : 'Failed to save startup presets'; }
		finally { saving = false; }
	}
	onMount(() => { load().catch((err) => { error = err instanceof ApiError ? err.message : 'Failed to load workspaces'; loading = false; }); });
</script>
<div class="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
	<div><h1 class="flex items-center gap-2 text-xl font-semibold"><ListTree class="size-5" />OrbitFS Startup System (OSS)</h1><p class="text-sm text-muted-foreground">Always-loaded files plus separate Project and file selections for each strength.</p></div>
	{#if error}<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
	{#if !accessLoaded}
		<Card><CardContent class="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><LoaderCircle class="size-5 animate-spin" />Checking workspace access...</CardContent></Card>
	{:else if workspaces.length === 0}
		<Card><CardContent class="p-5 text-sm text-muted-foreground">You do not own, or have Manage MCP startup permission for, any workspace.</CardContent></Card>
	{:else}
		<Card><CardHeader><CardTitle>Workspace</CardTitle></CardHeader><CardContent><select class="w-full rounded-md border bg-background p-2" bind:value={workspaceId} onchange={loadWorkspace}>{#each workspaces as ws}<option value={ws.id}>{ws.name}</option>{/each}</select></CardContent></Card>
		{#if loading}<div class="flex justify-center py-12"><LoaderCircle class="size-5 animate-spin" /></div>{:else}
			<Card><CardHeader><CardTitle>Always loaded files and folders</CardTitle></CardHeader><CardContent class="space-y-3">
				<p class="text-sm text-muted-foreground">Loaded regardless of selected Project or preset. Folders include every readable file in all nested subfolders.</p>
				<div class="flex gap-2"><div class="min-w-0 flex-1"><PathPicker bind:value={defaultPicker} {workspaceId} /></div><Button type="button" variant="outline" onclick={addDefault}><Plus class="size-4" />Add</Button></div>
				{#if defaultItems.length === 0}<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nothing is always loaded.</p>{:else}<div class="space-y-2">{#each defaultItems as item}<div class="flex items-center justify-between rounded-md border p-3 text-sm"><span class="truncate">/{item.path}{item.type === 'folder' ? ' · recursive folder' : ''}</span><Button type="button" variant="ghost" size="icon" onclick={() => (defaultItems = defaultItems.filter((entry) => entry.path !== item.path))}><Trash2 class="size-4" /></Button></div>{/each}</div>{/if}
			</CardContent></Card>
			<Card><CardHeader><CardTitle>Preset configuration</CardTitle></CardHeader><CardContent class="space-y-4">
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-5">{#each presetKeys as key}<Button variant={activePreset === key ? 'default' : 'outline'} onclick={() => { activePreset = key; presetPicker = ''; }}>{key === 'custom1' ? 'Custom 1' : key === 'custom2' ? 'Custom 2' : key[0].toUpperCase() + key.slice(1)}</Button>{/each}</div>
				<label class="space-y-1 text-sm"><span>Project</span><select class="w-full rounded-md border bg-background p-2" value={presets[activePreset].projectId || ''} onchange={(event) => presets = { ...presets, [activePreset]: { ...presets[activePreset], projectId: event.currentTarget.value || null } }}><option value="">N/A</option>{#each projects as project}<option value={project.id}>{project.name}</option>{/each}</select></label>
				<div class="space-y-2"><p class="text-sm font-medium">Files and folders for this preset</p><div class="flex gap-2"><div class="min-w-0 flex-1"><PathPicker bind:value={presetPicker} {workspaceId} /></div><Button type="button" variant="outline" onclick={addPresetItem}><Plus class="size-4" />Add</Button></div></div>
				{#if presets[activePreset].items.length === 0}<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No files or folders selected for this preset.</p>{:else}<div class="space-y-2">{#each presets[activePreset].items as item}<div class="flex items-center justify-between rounded-md border p-3 text-sm"><span class="truncate">/{item.path}{item.type === 'folder' ? ' · recursive folder' : ''}</span><Button type="button" variant="ghost" size="icon" onclick={() => removePresetItem(item.path)}><Trash2 class="size-4" /></Button></div>{/each}</div>{/if}
			</CardContent></Card>
			<Button onclick={saveAll} disabled={saving}>{#if saving}<LoaderCircle class="size-4 animate-spin" />{:else}<Save class="size-4" />{/if}Save OSS configuration</Button>
		{/if}
	{/if}
</div>
