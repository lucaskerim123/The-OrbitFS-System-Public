<script lang="ts">
	import { api, ApiError } from '$lib/api';
	import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
	import { Bell, LoaderCircle } from '@lucide/svelte';

	type Notice = { id: string; title: string; message: string; severity: 'info' | 'warning' | 'critical' | 'system'; createdAt: string; createdBy: string; read: boolean };
	let notices = $state<Notice[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		try { notices = (await api.get<{ notifications: Notice[] }>('/notifications')).notifications; }
		catch (err) { error = err instanceof ApiError ? err.message : 'Failed to load notifications'; }
		finally { loading = false; }
	}

	async function markRead(notice: Notice) {
		if (notice.read) return;
		await api.post(`/notifications/${notice.id}/read`);
		notice.read = true;
		notices = [...notices];
	}
	load();
</script>

<div class="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
	<div><h1 class="flex items-center gap-2 text-xl font-semibold"><Bell class="size-5" />Notifications</h1><p class="text-sm text-muted-foreground">Global messages, alerts and notices.</p></div>
	{#if loading}<div class="flex justify-center py-16"><LoaderCircle class="animate-spin" /></div>
	{:else if error}<p class="text-sm text-destructive">{error}</p>
	{:else if notices.length === 0}<p class="py-16 text-center text-sm text-muted-foreground">No notifications.</p>
	{:else}{#each notices as notice (notice.id)}<Card class={notice.severity === 'system' ? 'border-destructive/60 bg-destructive/10' : !notice.read ? 'border-primary/40' : ''}>
		<CardHeader><div class="flex items-start justify-between gap-3"><div><p class="mb-1 text-xs font-semibold uppercase tracking-wide {notice.severity === 'system' ? 'text-destructive' : 'text-muted-foreground'}">{notice.severity === 'system' ? 'OrbitFS System' : notice.createdBy}</p><CardTitle class={notice.severity === 'system' ? 'text-destructive' : ''}>{notice.title}</CardTitle></div><Badge variant={notice.severity === 'critical' || notice.severity === 'system' ? 'destructive' : notice.severity === 'warning' ? 'warning' : 'secondary'}>{notice.severity === 'system' ? 'System message' : notice.severity}</Badge></div></CardHeader>
		<CardContent class="space-y-3"><p class="whitespace-pre-wrap text-sm">{notice.message}</p><div class="flex items-center justify-between text-xs text-muted-foreground"><span>{new Date(notice.createdAt).toLocaleString()}</span>{#if !notice.read}<Button size="sm" variant="outline" onclick={() => markRead(notice)}>Mark read</Button>{/if}</div></CardContent>
	</Card>{/each}{/if}
</div>