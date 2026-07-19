<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Globe, HardDrive, LoaderCircle, Play, RefreshCw, RotateCw, Server, Sparkles, Square } from '@lucide/svelte';

	type ServiceStatus = { status?: string; running?: boolean; reachable?: boolean; service?: string | null };
	type SystemStatus = { panel?: ServiceStatus; hive?: ServiceStatus; tunnel?: ServiceStatus; sorter?: ServiceStatus };

	const services: {
		key: keyof SystemStatus;
		label: string;
		icon: typeof HardDrive;
		restartOnly?: boolean;
	}[] = [
		{ key: 'panel', label: 'Panel', icon: HardDrive },
		{ key: 'hive', label: 'MCP server', icon: Server },
		{ key: 'tunnel', label: 'Cloudflare tunnel', icon: Globe, restartOnly: true },
		{ key: 'sorter', label: 'Sorter', icon: Sparkles }
	];

	let status = $state<SystemStatus | null>(null);
	let loading = $state(true);
	let error = $state('');
	let busy = $state<string | null>(null);
	let controlErrors = $state<Record<string, string>>({});

	function displayStatus(service?: ServiceStatus) {
		const text = service?.status ?? (service?.running ? 'Running' : service ? 'Stopped' : 'Unknown');
		const lower = text.toLowerCase();
		const variant = lower.includes('running')
			? 'success'
			: lower.includes('block')
				? 'destructive'
				: lower.includes('not') || lower.includes('stop')
					? 'warning'
					: 'secondary';
		return { text, variant } as const;
	}

	async function load() {
		loading = true;
		error = '';
		try {
			status = await api.get<SystemStatus>('/system/status');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Failed to load service status';
		} finally {
			loading = false;
		}
	}

	load();

	async function control(target: string, action: 'start' | 'stop' | 'restart') {
		const key = `${target}:${action}`;
		busy = key;
		controlErrors = { ...controlErrors, [target]: '' };
		try {
			await api.post('/system/control', { target, action });
			if (target !== 'panel' || action === 'start') await load();
		} catch (err) {
			controlErrors = {
				...controlErrors,
				[target]: err instanceof ApiError ? err.message : 'Action failed'
			};
		} finally {
			busy = null;
		}
	}
</script>

<div class="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
	<div class="flex items-center justify-between gap-3">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Service status</h1>
			<p class="text-sm text-muted-foreground">Current service health and controls.</p>
		</div>
		<Button variant="outline" size="sm" onclick={load} disabled={loading}>
			{#if loading}<LoaderCircle class="size-4 animate-spin" />{:else}<RefreshCw class="size-4" />{/if}
			Refresh
		</Button>
	</div>

	{#if error}
		<div class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading && !status}
		<div class="flex items-center justify-center gap-2 py-16 text-muted-foreground">
			<LoaderCircle class="size-5 animate-spin" />
			Loading&hellip;
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2">
			{#each services as service (service.key)}
				{@const current = displayStatus(status?.[service.key])}
				<Card>
					<CardHeader>
						<div class="flex items-center justify-between gap-3">
							<CardTitle class="flex min-w-0 items-center gap-2">
								<service.icon class="size-4 shrink-0 text-muted-foreground" />
								<span class="truncate">{service.label}</span>
							</CardTitle>
							<Badge variant={current.variant}>{current.text}</Badge>
						</div>
					</CardHeader>
					<CardContent class="space-y-2">
						{#if controlErrors[service.key]}
							<p class="text-sm text-destructive">{controlErrors[service.key]}</p>
						{/if}
						<div class="flex flex-wrap gap-1.5">
							{#if !service.restartOnly}
								<Button size="sm" variant="outline" disabled={busy !== null} onclick={() => control(service.key, 'start')}>
									{#if busy === `${service.key}:start`}<LoaderCircle class="size-4 animate-spin" />{:else}<Play class="size-4" />{/if}
									Start
								</Button>
								<Button size="sm" variant="outline" disabled={busy !== null} onclick={() => control(service.key, 'stop')}>
									{#if busy === `${service.key}:stop`}<LoaderCircle class="size-4 animate-spin" />{:else}<Square class="size-4" />{/if}
									Stop
								</Button>
							{/if}
							<Button size="sm" variant="outline" disabled={busy !== null} onclick={() => control(service.key, 'restart')}>
								{#if busy === `${service.key}:restart`}<LoaderCircle class="size-4 animate-spin" />{:else}<RotateCw class="size-4" />{/if}
								Restart
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
