<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '$lib/components/ui';
	import { ScrollText, Construction } from '@lucide/svelte';
</script>

<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold">
				<ScrollText class="size-5" />Logs
			</h1>
			<p class="text-sm text-muted-foreground">Panel, MCP, tunnel and addon logs.</p>
		</div>
		<Badge variant="secondary">WIP</Badge>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2"><Construction class="size-4" />Log viewer pending</CardTitle>
			<CardDescription>This page will be rebuilt after the new MCP logging structure is defined.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-2 text-sm text-muted-foreground">
			<p>The existing backend log routes remain untouched for later reuse.</p>
			<p>No live log output is shown on this placeholder page.</p>
		</CardContent>
	</Card>
</div>