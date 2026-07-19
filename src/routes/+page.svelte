<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api, ApiError } from '$lib/api';
	import { formatBytes, formatDate } from '$lib/format';
	import { iconFor } from '$lib/file-icon';
	import { fileContext } from '$lib/context.svelte';
	import { addons } from '$lib/addons.svelte';
	import { search } from '$lib/search.svelte';
	import { Button } from '$lib/components/ui';
	import FileViewer from '$lib/components/file-viewer.svelte';
	import FolderPicker from '$lib/components/folder-picker.svelte';
	import ShareModal from '$lib/components/share-modal.svelte';
	import PermissionsModal from '$lib/components/permissions-modal.svelte';
	import {
		ChevronRight,
		FolderPlus,
		Upload,
		RefreshCw,
		Download,
		Trash2,
		Pencil,
		Move,
		Link,
		X,
		LoaderCircle,
		HardDrive,
		ShieldCheck
	} from '@lucide/svelte';

	type Entry = { name: string; type: 'dir' | 'file'; size?: number; mtime?: string; system?: boolean; protected?: boolean; hidden?: boolean };
	type FolderPermissions = { read: boolean; write: boolean; download: boolean; move: boolean; delete: boolean; create: boolean; share: boolean };

	const currentPath = $derived(page.url.searchParams.get('path') ?? '');
	const breadcrumbs = $derived(
		currentPath
			? currentPath.split('/').filter(Boolean).map((seg, i, arr) => ({
					label: seg,
					path: arr.slice(0, i + 1).join('/')
				}))
			: []
	);

	let entries = $state<Entry[]>([]);
	let folderPermissions = $state<FolderPermissions>({ read: true, write: false, download: false, move: false, delete: false, create: false, share: false });
	const filteredEntries = $derived(
		search.query.trim()
			? entries.filter((e) => e.name.toLowerCase().includes(search.query.trim().toLowerCase()))
			: entries
	);
	let loading = $state(true);
	let error = $state('');
	let creatingFolder = $state(false);
	let newFolderName = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploads = $state<{ name: string; pct: number; error?: string }[]>([]);
	let busyPath = $state<string | null>(null);
	let viewerPath = $state<string | null>(null);
	let sharePath = $state<{ path: string; name: string } | null>(null);
	let renamingPath = $state<string | null>(null);
	let renameValue = $state('');
	let movePaths = $state<string[] | null>(null);
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let canManagePermissions = $state(false);
	let permissionTarget = $state<{ path: string; kind: 'file' | 'folder' } | null>(null);

	function joinPath(dir: string, name: string) {
		return dir ? `${dir}/${name}` : name;
	}

	function basename(p: string) {
		return p.split('/').pop() ?? p;
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await api.get<{ entries: Entry[]; folderPermissions: FolderPermissions; canManagePermissions: boolean }>(
				`/files?subpath=${encodeURIComponent(currentPath)}`
			);
			folderPermissions = res.folderPermissions;
			canManagePermissions = Boolean(res.canManagePermissions);
			entries = [...res.entries].sort((a, b) =>
				a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
			);
			selected = new Set();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load files';
			entries = [];
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		currentPath;
		fileContext.currentId;
		load();
	});

	function openFolder(path: string) {
		goto(path ? `/?path=${encodeURIComponent(path)}` : '/');
	}

	async function submitNewFolder() {
		const name = newFolderName.trim();
		if (!name) {
			creatingFolder = false;
			return;
		}
		try {
			await api.post('/mkdir', { path: joinPath(currentPath, name) });
			newFolderName = '';
			creatingFolder = false;
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not create folder';
		}
	}

	async function trash(entry: Entry) {
		const path = joinPath(currentPath, entry.name);
		busyPath = path;
		try {
			await api.post('/trash', { path });
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not delete';
		} finally {
			busyPath = null;
		}
	}

	async function download(entry: Entry) {
		const path = joinPath(currentPath, entry.name);
		try {
			await api.download(path, entry.name);
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Download failed';
		}
	}

	async function handleFiles(fileList: FileList | null) {
		if (!fileList || fileList.length === 0) return;
		for (const file of Array.from(fileList)) {
			const entry = { name: file.name, pct: 0 } as { name: string; pct: number; error?: string };
			uploads = [...uploads, entry];
			try {
				await api.upload(
					`/upload?path=${encodeURIComponent(joinPath(currentPath, file.name))}`,
					file,
					(pct) => (entry.pct = pct)
				);
				entry.pct = 100;
			} catch (err) {
				entry.error = err instanceof ApiError ? err.message : 'Upload failed';
			}
		}
		uploads = [...uploads];
		await load();
		setTimeout(() => {
			uploads = uploads.filter((u) => u.error);
		}, 2000);
	}

	function startRename(entry: Entry) {
		startRenamePath(joinPath(currentPath, entry.name));
	}

	function startRenamePath(path: string) {
		viewerPath = null;
		renamingPath = path;
		renameValue = basename(path);
	}

	async function trashPath(path: string) {
		if (!confirm(`Move "${basename(path)}" to trash?`)) return;
		viewerPath = null;
		busyPath = path;
		try {
			await api.post('/trash', { path });
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not delete';
		} finally {
			busyPath = null;
		}
	}

	async function submitRename() {
		if (!renamingPath) return;
		const from = renamingPath;
		const name = renameValue.trim();
		renamingPath = null;
		if (!name || name === basename(from)) return;
		try {
			await api.post('/move', { from, to: joinPath(currentPath, name) });
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Rename failed';
		}
	}

	function toggleSelect(path: string) {
		const next = new Set(selected);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		selected = next;
	}

	function toggleSelectAll() {
		selected =
			selected.size === filteredEntries.length
				? new Set()
				: new Set(filteredEntries.filter((entry) => !entry.protected).map((e) => joinPath(currentPath, e.name)));
	}

	async function confirmMove(destination: string) {
		const paths = movePaths;
		movePaths = null;
		if (!paths) return;
		bulkBusy = true;
		error = '';
		try {
			if (paths.length === 1) {
				await api.post('/move', { from: paths[0], to: joinPath(destination, basename(paths[0])) });
			} else {
				await api.post('/bulk-move', { paths, destination });
			}
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Move failed';
		} finally {
			bulkBusy = false;
		}
	}

	async function bulkTrash() {
		const paths = [...selected];
		if (!confirm(`Move ${paths.length} selected item${paths.length === 1 ? '' : 's'} to trash?`)) return;
		bulkBusy = true;
		error = '';
		try {
			for (const path of paths) await api.post('/trash', { path });
			await load();
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Delete failed';
		} finally {
			bulkBusy = false;
		}
	}

	async function bulkDownload() {
		const paths = [...selected];
		bulkBusy = true;
		error = '';
		try {
			await api.post('/bulk-download/validate', { paths });
			for (const p of paths) await api.download(p, basename(p));
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Download failed';
		} finally {
			bulkBusy = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-semibold tracking-tight">Files</h1>
			<nav class="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
				<button class="hover:text-foreground" onclick={() => openFolder('')}>{fileContext.label}</button>
				{#each breadcrumbs as crumb (crumb.path)}
					<ChevronRight class="size-3.5 shrink-0" />
					<button class="truncate hover:text-foreground" onclick={() => openFolder(crumb.path)}>
						{crumb.label}
					</button>
				{/each}
			</nav>
		</div>
		<div class="flex w-full gap-2 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
			<Button variant="outline" size="sm" onclick={() => load()} title="Refresh files">
				<RefreshCw class="size-4" />Refresh
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => (permissionTarget = { path: currentPath, kind: 'folder' })}
				disabled={!canManagePermissions}
				title="Adjust this folder's permissions"
			>
				<ShieldCheck class="size-4" />Permissions
			</Button>
			<Button variant="outline" size="sm" onclick={() => (creatingFolder = true)} disabled={!folderPermissions.create}>
				<FolderPlus />New folder
			</Button>
			<Button size="sm" onclick={() => fileInput?.click()} disabled={!folderPermissions.create}>
				<Upload />Upload
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				multiple
				class="hidden"
				onchange={(e) => handleFiles((e.currentTarget as HTMLInputElement).files)}
			/>
		</div>
	</div>

	{#if selected.size > 0}
		<div class="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
			<span class="font-medium">{selected.size} selected</span>
			<div class="ml-auto flex max-w-full gap-1.5 overflow-x-auto">
				<Button size="sm" variant="outline" disabled={bulkBusy || !folderPermissions.download} onclick={bulkDownload}>
					<Download class="size-4" />Download
				</Button>
				<Button size="sm" variant="outline" disabled={bulkBusy || !folderPermissions.move} onclick={() => (movePaths = [...selected])}>
					<Move class="size-4" />Move
				</Button>
				<Button size="sm" variant="outline" disabled={bulkBusy || !folderPermissions.delete} onclick={bulkTrash}>
					{#if bulkBusy}<LoaderCircle class="size-4 animate-spin" />{:else}<Trash2 class="size-4" />{/if}Trash
				</Button>
				<Button size="sm" variant="ghost" onclick={() => (selected = new Set())}>Clear</Button>
			</div>
		</div>
	{/if}

	{#if uploads.length > 0}
		<div class="space-y-1.5 rounded-md border border-border bg-card p-3">
			{#each uploads as u (u.name)}
				<div class="flex items-center gap-2 text-sm">
					<span class="w-40 shrink-0 truncate">{u.name}</span>
					<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full {u.error ? 'bg-destructive' : 'bg-primary'}"
							style="width: {u.pct}%"
						></div>
					</div>
					<span class="w-24 shrink-0 text-right text-xs text-muted-foreground">
						{u.error ?? `${u.pct}%`}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if error}
		<div class="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
			<button onclick={() => (error = '')} aria-label="Dismiss"><X class="size-4" /></button>
		</div>
	{/if}

	<div class="overflow-hidden rounded-lg border border-border bg-card">
		{#if loading}
			<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
				<LoaderCircle class="size-5 animate-spin" />
				Loading&hellip;
			</div>
		{:else if creatingFolder || filteredEntries.length > 0}
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-muted-foreground">
						<th class="w-9 px-4 py-2">
							<input
								type="checkbox"
								checked={filteredEntries.length > 0 && selected.size === filteredEntries.length}
								onchange={toggleSelectAll}
								aria-label="Select all"
							/>
						</th>
						<th class="px-4 py-2 font-medium">Name</th>
						<th class="hidden px-4 py-2 font-medium sm:table-cell">Modified</th>
						<th class="hidden px-4 py-2 font-medium sm:table-cell">Size</th>
						<th class="px-4 py-2 font-medium"></th>
					</tr>
				</thead>
				<tbody>
					{#if creatingFolder}
						<tr class="border-b border-border last:border-0">
							<td class="px-4 py-1.5" colspan="5">
								<form
									class="flex items-center gap-2"
									onsubmit={(e) => {
										e.preventDefault();
										submitNewFolder();
									}}
								>
									<FolderPlus class="size-4 text-muted-foreground" />
									<input
										autofocus
										bind:value={newFolderName}
										placeholder="Folder name"
										class="h-7 flex-1 rounded border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
										onblur={submitNewFolder}
									/>
								</form>
							</td>
						</tr>
					{/if}
					{#each filteredEntries as entry (entry.name)}
						{@const Icon = iconFor(entry.name, entry.type)}
						{@const fullPath = joinPath(currentPath, entry.name)}
						<tr class="group border-b border-border last:border-0 hover:bg-accent/40 {entry.system ? 'bg-muted/20 text-muted-foreground' : ''}">
							<td class="px-4 py-2">
								<input
									type="checkbox"
									checked={selected.has(fullPath)}
									disabled={entry.protected}
									onchange={() => toggleSelect(fullPath)}
									aria-label="Select {entry.name}"
								/>
							</td>
							<td class="px-4 py-2">
								{#if renamingPath === fullPath}
									<form
										class="flex items-center gap-2"
										onsubmit={(e) => {
											e.preventDefault();
											submitRename();
										}}
									>
										<Icon class="size-5 shrink-0 {entry.type === 'dir' ? 'text-amber-400' : 'text-sky-400'}" />
										<input
											autofocus
											bind:value={renameValue}
											class="h-7 flex-1 rounded border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
											onblur={submitRename}
										/>
									</form>
								{:else if entry.type === 'dir'}
									<button
										class="flex items-center gap-2.5 text-left font-medium hover:text-primary"
										onclick={() => openFolder(fullPath)}
									>
										<Icon class="size-5 shrink-0 {entry.type === 'dir' ? 'text-amber-400' : 'text-sky-400'}" />
										{entry.name}
									</button>
								{:else}
									<button
										class="flex items-center gap-2.5 text-left hover:text-primary"
										onclick={() => (viewerPath = fullPath)}
									>
										<Icon class="size-5 shrink-0 text-sky-400" />
										{entry.name}
									</button>
								{/if}
							</td>
							<td class="hidden px-4 py-2 text-muted-foreground sm:table-cell">
								{entry.mtime ? formatDate(entry.mtime) : '—'}
							</td>
							<td class="hidden px-4 py-2 text-muted-foreground sm:table-cell">
								{entry.type === 'file' && entry.size != null ? formatBytes(entry.size) : '—'}
							</td>
							<td class="px-4 py-2">
								<div class="flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
									{#if !entry.protected && canManagePermissions}
										<button
											class="flex size-8 items-center justify-center rounded-md text-violet-400 hover:bg-violet-500/15 hover:text-violet-300"
											aria-label="Permissions for {entry.name}"
											title="Permissions"
											onclick={() => (permissionTarget = { path: fullPath, kind: entry.type === 'dir' ? 'folder' : 'file' })}
										>
											<ShieldCheck class="size-4" />
										</button>
									{/if}
									{#if !entry.protected}
										<button
											class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
											aria-label="Share"
											title="Share"
											disabled={!folderPermissions.share}
											onclick={() => (sharePath = { path: fullPath, name: entry.name })}
										>
											<Link class="size-4" />
										</button>
										{#if entry.type === 'file'}
											<button
												class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
												aria-label="Download"
												title="Download"
												disabled={!folderPermissions.download}
												onclick={() => download(entry)}
											>
												<Download class="size-4" />
											</button>
										{/if}
									{/if}
									{#if entry.type === 'dir'}
										<button
											class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
											aria-label="Rename"
											title="Rename"
											disabled={entry.protected || !folderPermissions.move}
											onclick={() => startRename(entry)}
										>
											<Pencil class="size-4" />
										</button>
									{/if}
									<button
										class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label="Move"
											title="Move"
										disabled={entry.protected || !folderPermissions.move}
										onclick={() => (movePaths = [fullPath])}
									>
										<Move class="size-4" />
									</button>
									<button
										class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
										aria-label="Delete"
											title="Delete"
										disabled={entry.protected || !folderPermissions.delete || busyPath === fullPath}
										onclick={() => trash(entry)}
									>
										{#if busyPath === fullPath}
											<LoaderCircle class="size-4 animate-spin" />
										{:else}
											<Trash2 class="size-4" />
										{/if}
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div class="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
				<HardDrive class="size-8" />
				<p class="text-sm">
					{search.query.trim() ? `No files match "${search.query.trim()}".` : 'This folder is empty.'}
				</p>
			</div>
		{/if}
	</div>
</div>

{#if viewerPath}
	<FileViewer
		path={viewerPath}
		onClose={() => (viewerPath = null)}
		onSaved={load}
		exportAvailable={addons.available('mcp')}
		onAccess={canManagePermissions
			? (path) => {
					viewerPath = null;
					permissionTarget = { path, kind: 'file' };
				}
			: undefined}
		onRename={startRenamePath}
		onMove={(path) => {
			viewerPath = null;
			movePaths = [path];
		}}
		onShare={(path, name) => {
			viewerPath = null;
			sharePath = { path, name };
		}}
		onTrash={trashPath}
	/>
{/if}

{#if movePaths}
	<FolderPicker
		title={movePaths.length === 1 ? `Move "${basename(movePaths[0])}"` : `Move ${movePaths.length} items`}
		onPick={confirmMove}
		onCancel={() => (movePaths = null)}
	/>
{/if}

{#if sharePath}
	<ShareModal path={sharePath.path} filename={sharePath.name} onClose={() => (sharePath = null)} />
{/if}

{#if permissionTarget}
	<PermissionsModal
		path={permissionTarget.path}
		kind={permissionTarget.kind}
		onClose={() => (permissionTarget = null)}
		onSaved={load}
	/>
{/if}
