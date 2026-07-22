<script lang="ts">
	import { addons } from '$lib/addons.svelte';
	const modules = import.meta.glob('/plugins/*/frontend/routes/workspaces/+page.svelte', { eager: true });
	const entry = Object.values(modules)[0] as any;
	const PluginPage: any = entry?.default ?? null;
</script>

{#if addons.configurable('workspaces') && PluginPage}
	<PluginPage />
{:else}
	<div class="mx-auto max-w-2xl p-4 md:p-6">
		<div class="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl shadow-black/20">
			<div class="border-b border-border/70 bg-muted/20 px-5 py-4">
				<p class="text-xs font-semibold uppercase tracking-wide text-primary">Workspace manager</p>
				<h1 class="text-xl font-semibold">Workspaces detached</h1>
			</div>
			<div class="space-y-4 p-5 text-sm text-muted-foreground">
				<p>The Public Workspace remains available.</p>
				<div class="grid gap-2 sm:grid-cols-3">
					<div class="rounded-lg border bg-background/60 p-3"><span class="font-medium text-foreground">Main</span><br />Available</div>
					<div class="rounded-lg border bg-background/60 p-3"><span class="font-medium text-foreground">Branches</span><br />Detached</div>
					<div class="rounded-lg border bg-background/60 p-3"><span class="font-medium text-foreground">MCP</span><br />Config still editable</div>
				</div>
				<p>Install or attach the Workspaces add-on to manage branched workspaces.</p>
			</div>
		</div>
	</div>
{/if}
