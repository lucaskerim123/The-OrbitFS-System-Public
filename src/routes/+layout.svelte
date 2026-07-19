<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import {
		Folder,
		Sparkles,
		Building2,
		Bell,
		Settings,
		Shield,
		KeyRound,
		Server,
		HardDrive,
		Menu,
		Search,
		LogOut,
		LoaderCircle,
		Puzzle,
		CircleUser,
		FileLock,
		Plug,
		ListTree,
		ScrollText
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '$lib/auth.svelte';
	import { api } from '$lib/api';
	import { addons } from '$lib/addons.svelte';
	import { search } from '$lib/search.svelte';
	import PluginSlot from '$lib/plugin-slot.svelte';

	let { children } = $props();

	const primaryNav = $derived(
		[
			{ label: 'Files', href: '/', icon: Folder },
			addons.available('workspaces') && {
				label: 'Workspace Manager',
				href: '/workspaces',
				icon: Building2
			},
			addons.available('sorter') && { label: 'Sorter', href: '/sorter', icon: Sparkles }
		].filter((item) => item !== false) as { label: string; href: string; icon: typeof Folder }[]
	);

	const adminGroups = [
		{
			label: 'Systems',
			items: [
				{ label: 'Service status', href: '/admin/system/service-status', icon: Server },
				{ label: 'Licensing system', href: '/admin/license', icon: KeyRound },
				{ label: 'Message system', href: '/admin/messages', icon: Bell },
				{ label: 'Logs · WIP', href: '/admin/system/logs', icon: ScrollText }
			]
		},
		{
			label: 'Configuration',
			items: [
				{ label: 'Runtime & services', href: '/admin/config/runtime', icon: Settings },
				{ label: 'Drive config', href: '/admin/config/drive', icon: HardDrive },
				{ label: 'Add-on management', href: '/admin/addons', icon: Puzzle },
				{ label: 'File permissions', href: '/admin/file-permissions', icon: FileLock },
				{ label: 'Startup preset · WIP', href: '/admin/startup-presets', icon: ListTree },
				{ label: 'Trash settings', href: '/admin/config/trash-settings', icon: Folder }
			]
		},
		{
			label: 'Administration',
			items: [
				{ label: 'User management', href: '/admin/users', icon: Shield },
				{ label: 'Usergroup management', href: '/admin/usergroups', icon: Shield },
				{ label: 'Connected clients · WIP', href: '/admin/connected-clients', icon: Plug },
				{ label: 'OAuth management', href: '/admin/oauth', icon: KeyRound },
				{ label: 'Sessions · WIP', href: '/admin/sessions', icon: CircleUser },
				{ label: 'Audit logs', href: '/admin/audit-log', icon: ScrollText }
			]
		}
	];

	let mobileNavOpen = $state(false);
	let unreadNotifications = $state(0);

	async function loadNotificationCount() {
		try {
			unreadNotifications = (await api.get<{ unread: number }>('/notifications')).unread;
		} catch {
			unreadNotifications = 0;
		}
	}

	function isActive(href: string) {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}

	const isLoginRoute = $derived(page.url.pathname === '/login');
	const isFilesRoute = $derived(page.url.pathname === '/');

	// Search is Files-scoped, but the box lives in the shared header — reset it whenever
	// the user navigates away so it doesn't silently keep filtering a page it can't affect.
	$effect(() => {
		if (!isFilesRoute) search.query = '';
	});

	$effect(() => {
		if (!auth.ready) return;
		if (!auth.isAuthenticated && !isLoginRoute) {
			goto('/login');
		} else if (auth.isAuthenticated && isLoginRoute) {
			goto('/');
		}
	});

	onMount(() => {
		auth.init();
	});

	$effect(() => {
		if (auth.isAuthenticated) {
			api.get<{ user?: { username: string; role: 'owner' | 'owner' | 'admin' | 'user'; email?: string }; username?: string; role?: 'owner' | 'owner' | 'admin' | 'user'; email?: string }>('/me')
				.then((res) => auth.setUser(res.user ?? { username: res.username!, role: res.role!, email: res.email }))
				.catch(() => {});
			// This is the only addon-related thing core code does: refresh the generic
			// installed/attached/licensed registry. Each addon's own store (if loaded) watches
			// this reactively and resyncs itself — core never calls into addon-specific code.
			addons.load();
			loadNotificationCount();
		}
	});

	// Addon/licence state can change out from under this tab — another admin session
	// detaching Workspaces, or a licence lapsing server-side — with nothing pushing us an
	// update. Re-check when the tab regains focus (fast path for "I just changed it
	// elsewhere") and on a slow interval as a backstop. addons.load() is safe to call from
	// here: this isn't inside an $effect, so there's no risk of the reactive feedback loop
	// that hit the Files page fetch earlier.
	onMount(() => {
		function resync() {
			if (auth.isAuthenticated) {
				addons.load();
				loadNotificationCount();
			}
		}
		function onVisible() {
			if (document.visibilityState === 'visible') resync();
		}
		const interval = setInterval(resync, 120_000);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(interval);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	const initials = $derived((auth.user?.username ?? '?').slice(0, 2).toUpperCase());

	async function logout() {
		try {
			await api.post('/logout');
		} catch {
			// ignore — clearing local state regardless
		}
		auth.clear();
		goto('/login');
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if !auth.ready}
	<div class="flex h-dvh items-center justify-center bg-background text-muted-foreground">
		<LoaderCircle class="size-6 animate-spin" />
	</div>
{:else if isLoginRoute || !auth.isAuthenticated}
	{@render children()}
{:else}
	<div class="flex h-dvh w-dvw overflow-hidden bg-background text-foreground">
		<!-- Desktop sidebar -->
		<aside
			class="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
		>
			<div class="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
				<div class="flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
					<HardDrive class="size-4" />
				</div>
				<span class="font-semibold tracking-tight">OrbitFS</span>
			</div>

			<nav class="flex-1 space-y-6 overflow-y-auto p-3">
				<div class="space-y-0.5">
					{#each primaryNav as item (item.href)}
						<a
							href={item.href}
							class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(
								item.href
							)
								? 'bg-sidebar-accent text-sidebar-accent-foreground'
								: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}"
						>
							<item.icon class="size-4" />
							{item.label}
						</a>
					{/each}
				</div>

				{#if auth.isAdmin}
					{#each adminGroups as group (group.label)}
						<div class="space-y-0.5">
							<p class="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
								{group.label}
							</p>
							{#each group.items as item (item.href)}
								<a
									href={item.href}
									class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(
										item.href
									)
										? 'bg-sidebar-accent text-sidebar-accent-foreground'
										: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}"
								>
									<item.icon class="size-4" />
									{item.label}
								</a>
							{/each}
						</div>
					{/each}
				{/if}
			</nav>

			<div class="space-y-0.5 border-t border-sidebar-border p-3">
				<a
					href="/account"
					class="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(
						'/account'
					)
						? 'bg-sidebar-accent text-sidebar-accent-foreground'
						: 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}"
				>
					<CircleUser class="size-4" />
					User control panel
				</a>
				<button
					class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
					onclick={logout}
				>
					<LogOut class="size-4" />
					Sign out
				</button>
			</div>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			<!-- Top bar -->
			<header
				class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/40 px-3 md:px-5"
			>
				<button
					class="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent md:hidden"
					onclick={() => (mobileNavOpen = !mobileNavOpen)}
					aria-label="Toggle menu"
				>
					<Menu class="size-5" />
				</button>

				{#if addons.available('workspaces')}
					<PluginSlot slot="workspace-selector" />
				{/if}

				{#if isFilesRoute}
					<div class="relative hidden max-w-sm flex-1 md:block">
						<Search class="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="search"
							placeholder="Search files..."
							bind:value={search.query}
							class="h-9 w-full rounded-md border border-input bg-transparent py-1 pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
						/>
					</div>
				{/if}

				<div class="ml-auto flex items-center gap-1.5">
					<a
						href="/notifications"
						class="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
						aria-label="Notifications"
					>
						<Bell class="size-4.5" />
						{#if unreadNotifications > 0}
							<span class="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground">
								{unreadNotifications > 99 ? '99+' : unreadNotifications}
							</span>
						{/if}
					</a>
					<div
						class="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
						title={auth.user?.username}
					>
						{initials}
					</div>
				</div>
			</header>

			<main class="flex-1 overflow-y-auto pb-16 md:pb-0">
				{@render children()}
			</main>
		</div>
	</div>

	<!-- Mobile bottom nav -->
	<nav
		class="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-sidebar-border bg-sidebar md:hidden"
	>
		{#each primaryNav as item (item.href)}
			<a
				href={item.href}
				class="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium {isActive(
					item.href
				)
					? 'text-primary'
					: 'text-muted-foreground'}"
			>
				<item.icon class="size-5" />
				{item.label}
			</a>
		{/each}
		<a
			href={auth.isAdmin ? '/admin/users' : '/account'}
			class="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium {page.url.pathname.startsWith(
				'/admin'
			) || page.url.pathname === '/account'
				? 'text-primary'
				: 'text-muted-foreground'}"
		>
			<Menu class="size-5" />
			More
		</a>
	</nav>
{/if}
