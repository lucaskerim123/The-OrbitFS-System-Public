<script lang="ts">
	import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui';
	import { Plug, Construction } from '@lucide/svelte';
</script>
<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div class="flex justify-between gap-3"><div><h1 class="flex items-center gap-2 text-xl font-semibold"><Plug class="size-5" />Connected clients</h1><p class="text-sm text-muted-foreground">Active panel, MCP and service connections.</p></div><Badge variant="secondary">WIP</Badge></div>
	<Card><CardHeader><CardTitle class="flex items-center gap-2"><Construction class="size-4" />Being rebuilt</CardTitle><CardDescription>This page is waiting for the replacement MCP client registry.</CardDescription></CardHeader><CardContent class="text-sm text-muted-foreground">No live client controls are active yet.</CardContent></Card>
</div>
