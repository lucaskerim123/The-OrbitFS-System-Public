<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Button } from '$lib/components/ui';
	import { ChevronRight, File, Folder, FolderOpen, FolderSearch, LoaderCircle, X } from '@lucide/svelte';

	type Entry = { name: string; type: 'dir' | 'file' };
	type Mode = 'any' | 'folder';

	let {
		value = $bindable(''),
		workspaceId,
		mode = 'any',
		disabled = false,
		placeholder = 'Choose a file or folder'
	}: {
		value?: string;
		workspaceId?: string | null;
		mode?: Mode;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let path = $state('');
	let entries = $state<Entry[]>([]);
	let loading = $state(false);
	let error = $state('');

	const breadcrumbs = $derived(
		path
			? path.split('/').filter(Boolean).map((part, index, all) => ({
					label: part,
					path: all.slice(0, index + 1).join('/')
				}))
			: []
	);

	function join(base: string, name: string) {
		return base ? `${base}/${name}` : name;
	}

	function showPicker() {
		if (value) {
			const parts = value.split('/').filter(Boolean);
			path = mode === 'folder' ? value : parts.slice(0, -1).join('/');
		} else {
			path = '';
		}
		error = '';
		open = true;
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const headers = workspaceId ? { 'X-Workspace-Id': workspaceId } : undefined;
			const result = await api.get<{ entries: Entry[] }>(
				`/files?subpath=${encodeURIComponent(path)}`,
				headers
			);
			entries = [...result.entries].sort((left, right) =>
				left.type === right.type
					? left.name.localeCompare(right.name)
					: left.type === 'dir' ? -1 : 1
			);
		} catch (err) {
			entries = [];
			error = err instanceof ApiError ? err.message : 'Could not load this folder';
		} finally {
			loading = false;
		}
	}

	function pick(selectedPath: string) {
		value = selectedPath;
		open = false;
	}

	$effect(() => {
		if (!open) return;
		path;
		workspaceId;
		load();
	});
</script>

<div class="flex min-w-0 gap-2">
	<Button
		type="button"
		variant="outline"
		class="min-w-0 flex-1 justify-start"
		disabled={disabled}
		onclick={showPicker}
	>
		<FolderSearch class="size-4 shrink-0" />
		<span class="truncate">{value ? `/${value}` : placeholder}</span>
	</Button>
	{#if value && !disabled}
		<Button type="button" variant="ghost" size="icon" aria-label="Clear selected path" onclick={() => (value = '')}>
			<X class="size-4" />
		</Button>
	{/if}
</div>

{#if open}
	<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
		<div class="flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-card shadow-xl">
			<header class="flex items-center justify-between border-b border-border p-3">
				<div>
					<h2 class="text-sm font-semibold">{mode === 'folder' ? 'Choose folder' : 'Choose file or folder'}</h2>
					<p class="text-xs text-muted-foreground">Workspace filesystem</p>
				</div>
				<Button type="button" variant="ghost" size="icon" aria-label="Close picker" onclick={() => (open = false)}>
					<X class="size-4" />
				</Button>
			</header>

			<nav class="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-xs">
				<button class="font-medium hover:text-primary" onclick={() => (path = '')}>Workspace root</button>
				{#each breadcrumbs as crumb (crumb.path)}
					<ChevronRight class="size-3 text-muted-foreground" />
					<button class="max-w-36 truncate hover:text-primary" onclick={() => (path = crumb.path)}>{crumb.label}</button>
				{/each}
			</nav>

			<div class="min-h-52 flex-1 overflow-y-auto p-2">
				{#if loading}
					<div class="grid place-items-center py-16 text-muted-foreground"><LoaderCircle class="size-5 animate-spin" /></div>
				{:else if error}
					<div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
				{:else if entries.length === 0}
					<div class="grid place-items-center gap-2 py-16 text-sm text-muted-foreground">
						<FolderOpen class="size-7" />This folder is empty.
					</div>
				{:else}
					{#each entries as entry (entry.name)}
						{@const fullPath = join(path, entry.name)}
						<div class="group flex items-center gap-1 rounded-md hover:bg-accent">
							<button
								class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm"
								onclick={() => entry.type === 'dir' ? (path = fullPath) : pick(fullPath)}
								disabled={mode === 'folder' && entry.type === 'file'}
							>
								{#if entry.type === 'dir'}<Folder class="size-4 shrink-0 text-primary" />{:else}<File class="size-4 shrink-0 text-muted-foreground" />{/if}
								<span class="truncate">{entry.name}</span>
							</button>
							{#if entry.type === 'dir'}
								<Button type="button" variant="ghost" size="sm" class="mr-1" onclick={() => pick(fullPath)}>Select</Button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			<footer class="flex items-center justify-between gap-3 border-t border-border p-3">
				<span class="min-w-0 truncate text-xs text-muted-foreground">/{path}</span>
				<div class="flex gap-2">
					<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
					<Button type="button" onclick={() => pick(path)}>{path ? 'Select current folder' : 'Select workspace root'}</Button>
				</div>
			</footer>
		</div>
	</div>
{/if}
