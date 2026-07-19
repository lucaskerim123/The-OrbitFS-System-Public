<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from '$lib/components/ui';
	import { ListTree, Construction } from '@lucide/svelte';
</script>

<div class="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
	<div class="flex items-start justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-semibold">
				<ListTree class="size-5" />Startup preset
			</h1>
			<p class="text-sm text-muted-foreground">Default AI context files and load strengths.</p>
		</div>
		<Badge variant="secondary">WIP</Badge>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2"><Construction class="size-4" />Being rebuilt</CardTitle>
			<CardDescription>This section is waiting for the replacement OrbitFS MCP structure.</CardDescription>
		</CardHeader>
		<CardContent class="space-y-2 text-sm text-muted-foreground">
			<p>The page remains visible so its planned location is not lost.</p>
			<p>No settings on this page currently change startup behaviour.</p>
		</CardContent>
	</Card>
</div>