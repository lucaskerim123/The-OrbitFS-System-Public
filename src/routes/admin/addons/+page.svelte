<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { addons as addonsStore } from '$lib/addons.svelte';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from '$lib/components/ui';
	import { Building2, Sparkles, Puzzle, LoaderCircle, CircleCheck, CircleOff, TriangleAlert } from '@lucide/svelte';

	type AdminAddon = {
		id: string;
		name: string;
		description: string;
		installed: boolean;
		attached: boolean;
		parked: boolean;
		status: 'uninstalled' | 'unlicensed' | 'detached' | 'attached';
		licensed: boolean;
		activatable?: boolean;
		licenseState?: string;
		licenseReason?: string;
		online?: boolean;
		available?: boolean;
	};

	const ICONS: Record<string, typeof Building2> = { workspaces: Building2, sorter: Sparkles };

	let list = $state<AdminAddon[]>([]);
	let loading = $state(true);
	let error = $state('');
	let busyId = $state<string | null>(null);
	let confirmingDetach = $state<string | null>(null);
	let actionError = $state<Record<string, string>>({});

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await api.get<{ addons: AdminAddon[] }>('/addons');
			list = res.addons;
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load addons';
		} finally {
			loading = false;
		}
	}

	load();

	async function attach(id: string) {
		busyId = id;
		actionError = { ...actionError, [id]: '' };
		try {
			await api.post(`/addons/${id}/attach`);
			await load();
			// Reloading addonsStore is enough — each addon's own store (if that addon's code
			// is even loaded in this session) watches addons.available() reactively and
			// resyncs itself. This page doesn't need to know Workspaces/Sorter exist.
			await addonsStore.load();
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : 'Attach failed' };
		} finally {
			busyId = null;
		}
	}

	async function detach(id: string) {
		busyId = id;
		confirmingDetach = null;
		actionError = { ...actionError, [id]: '' };
		try {
			await api.post(`/addons/${id}/detach`);
			await load();
			await addonsStore.load();
		} catch (err) {
			actionError = { ...actionError, [id]: err instanceof ApiError ? err.message : 'Detach failed' };
		} finally {
			busyId = null;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div>
		<h1 class="flex items-center gap-2 text-xl font-semibold tracking-tight">
			<Puzzle class="size-5 text-muted-foreground" />
			Addons
		</h1>
		<p class="text-sm text-muted-foreground">
			Attach or detach OrbitFS components. Detaching hides the feature panel-wide until re-attached.
		</p>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
			<LoaderCircle class="size-5 animate-spin" />
			Loading&hellip;
		</div>
	{:else}
		<div class="space-y-4">
			{#each list as addon (addon.id)}
				{@const Icon = ICONS[addon.id] ?? Puzzle}
				<Card>
					<CardHeader>
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-start gap-3">
								<div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
									<Icon class="size-4" />
								</div>
								<div>
									<CardTitle>{addon.name}</CardTitle>
									<CardDescription class="mt-1">{addon.description}</CardDescription>
								</div>
							</div>
						</div>
					</CardHeader>
					<CardContent class="space-y-3">
						<div class="flex flex-wrap gap-1.5">
							{#if !addon.installed}
								<Badge variant="warning"><TriangleAlert class="size-3" />Not installed</Badge>
							{:else if addon.activatable}
								<Badge variant="warning"><TriangleAlert class="size-3" />Activation required</Badge>
							{:else if !addon.licensed}
								<Badge variant="destructive"><TriangleAlert class="size-3" />Blocked by licence</Badge>
							{:else if addon.attached}
								<Badge variant="success"><CircleCheck class="size-3" />Attached</Badge>
							{:else}
								<Badge variant="secondary"><CircleOff class="size-3" />Detached</Badge>
							{/if}

							{#if addon.installed && addon.licensed}
								<Badge variant="success">Licensed</Badge>
							{/if}

							{#if addon.id === 'sorter' && addon.attached}
								<Badge variant={addon.online ? 'success' : 'secondary'}>
									{addon.online ? 'Service online' : 'Service offline'}
								</Badge>
							{/if}
						</div>

						{#if !addon.licensed && addon.licenseReason}
							<p class="text-sm" class:text-destructive={!addon.activatable} class:text-muted-foreground={addon.activatable}>{addon.licenseReason}</p>
						{/if}
						{#if actionError[addon.id]}
							<p class="text-sm text-destructive">{actionError[addon.id]}</p>
						{/if}

						<div class="flex items-center gap-2">
							{#if !addon.installed}
								<Button size="sm" variant="outline" disabled>Move into plugins folder to enable</Button>
							{:else if addon.activatable}
								<Button size="sm" onclick={() => attach(addon.id)} disabled={busyId === addon.id}>
									{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
									Activate &amp; attach
								</Button>
							{:else if !addon.licensed}
								<Button size="sm" variant="outline" disabled>Not included in licence</Button>
							{:else if addon.attached}
								{#if confirmingDetach === addon.id}
									<Button size="sm" variant="destructive" onclick={() => detach(addon.id)} disabled={busyId === addon.id}>
										{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
										Confirm detach
									</Button>
									<Button size="sm" variant="ghost" onclick={() => (confirmingDetach = null)}>Cancel</Button>
								{:else}
									<Button size="sm" variant="outline" onclick={() => (confirmingDetach = addon.id)}>
										Detach
									</Button>
								{/if}
							{:else}
								<Button size="sm" onclick={() => attach(addon.id)} disabled={busyId === addon.id}>
									{#if busyId === addon.id}<LoaderCircle class="size-4 animate-spin" />{/if}
									Attach
								</Button>
							{/if}
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
