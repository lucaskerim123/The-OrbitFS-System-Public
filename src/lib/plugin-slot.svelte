<script lang="ts">
	let { slot } = $props<{ slot: string }>();
	const modules = import.meta.glob('/plugins/*/frontend/lib/*.svelte', { eager: true });
	const match = Object.entries(modules).find(([path]) => path.endsWith(`/frontend/lib/${slot}.svelte`));
	const Component: any = match ? (match[1] as any).default : null;
</script>

{#if Component}
	<Component />
{/if}
