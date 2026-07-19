<script lang="ts">
	import { addons } from '$lib/addons.svelte';
	const modules = import.meta.glob('/plugins/*/frontend/routes/workspaces/+page.svelte', { eager: true });
	const entry = Object.values(modules)[0] as any;
	const PluginPage: any = entry?.default ?? null;
</script>

{#if addons.available('workspaces') && PluginPage}
	<PluginPage />
{:else}
	<div class="mx-auto max-w-xl p-6">
		<div class="rounded-lg border border-border bg-card p-6">
			<h1 class="text-xl font-semibold">Workspaces detached</h1>
			<p class="mt-2 text-sm text-muted-foreground">The Main Workspace remains available. Install or attach the Workspaces plugin to use branched workspaces.</p>
		</div>
	</div>
{/if}
