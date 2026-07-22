<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.svelte';
	import { api, ApiError } from '$lib/api';
	import { Button, Input, Card, CardContent } from '$lib/components/ui';
	import { HardDrive, Eye, EyeOff, LoaderCircle } from '@lucide/svelte';

	let username = $state('');
	let pin = $state('');
	let showPin = $state(false);
	let error = $state('');
	let submitting = $state(false);
	let forcedToken = $state('');
	let newPin = $state('');
	let confirmPin = $state('');

	async function submit(e: Event) {
		e.preventDefault();
		if (!username || !pin) return;
		error = '';
		submitting = true;
		try {
			const result = await api.post<{ token: string; username: string; role: 'owner' | 'admin' | 'user'; mustChangePin: boolean }>(
				'/login',
				{ username, pin }
			);
			if (result.mustChangePin) {
				forcedToken = result.token;
				pin = '';
				return;
			}
			auth.set(result.token, { username: result.username, role: result.role });
			await goto('/');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong';
		} finally {
			submitting = false;
		}
	}

	async function changeTemporaryPin(e: Event) {
		e.preventDefault();
		error = '';
		if (!/^\d{4,10}$/.test(newPin) || newPin === '0000') {
			error = 'Choose a new 4-10 digit PIN';
			return;
		}
		if (newPin !== confirmPin) {
			error = "PINs don't match";
			return;
		}
		submitting = true;
		try {
			const result = await api.post<{ token: string; username: string; role: 'owner' | 'admin' | 'user' }>(
				'/login/change-pin',
				{ token: forcedToken, pin: newPin }
			);
			auth.set(result.token, { username: result.username, role: result.role });
			await goto('/');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Could not change PIN';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4">
	<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_32%)]"></div>
	<div class="relative w-full max-w-sm space-y-5">
		<div class="rounded-2xl border border-border/70 bg-card/70 p-5 text-center shadow-2xl shadow-black/30 backdrop-blur">
			<div class="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary shadow-[0_0_35px_rgba(59,130,246,0.25)]">
				<HardDrive class="size-7" />
			</div>
			<h1 class="text-xl font-semibold tracking-tight">OrbitFS Panel</h1>
			<p class="text-sm text-muted-foreground">Secure workspace, files, and service control.</p>
			<div class="mt-4 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
				<span class="rounded-full border border-border/70 bg-background/60 px-2 py-1">Panel</span>
				<span class="rounded-full border border-border/70 bg-background/60 px-2 py-1">MCP</span>
				<span class="rounded-full border border-border/70 bg-background/60 px-2 py-1">Storage</span>
			</div>
		</div>

		<Card class="border-border/80 bg-card/90 shadow-xl shadow-black/25 backdrop-blur">
			<CardContent class="pt-5">
				{#if forcedToken}
					<form class="space-y-4" onsubmit={changeTemporaryPin}>
						<div class="space-y-1">
							<p class="text-sm font-medium">Change temporary PIN</p>
							<p class="text-sm text-muted-foreground">
								PIN 0000 is temporary. Choose a different 4-10 digit PIN before continuing.
							</p>
						</div>
						<div class="space-y-1.5">
							<label for="new-pin" class="text-sm font-medium">New PIN</label>
							<Input
								id="new-pin"
								type="password"
								inputmode="numeric"
								autocomplete="new-password"
								bind:value={newPin}
								placeholder="New PIN"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="confirm-pin" class="text-sm font-medium">Confirm PIN</label>
							<Input
								id="confirm-pin"
								type="password"
								inputmode="numeric"
								autocomplete="new-password"
								bind:value={confirmPin}
								placeholder="Confirm PIN"
							/>
						</div>
						{#if error}
							<p class="text-sm text-destructive">{error}</p>
						{/if}
						<Button type="submit" class="w-full" disabled={submitting}>
							{#if submitting}<LoaderCircle class="size-4 animate-spin" />{/if}
							Set new PIN
						</Button>
					</form>
				{:else}
				<form class="space-y-4" onsubmit={submit}>
					<div class="space-y-1.5">
						<label for="username" class="text-sm font-medium">Username</label>
						<Input id="username" bind:value={username} autocomplete="username" placeholder="Username" />
					</div>

					<div class="space-y-1.5">
						<label for="pin" class="text-sm font-medium">PIN</label>
						<div class="relative">
							<Input
								id="pin"
								type={showPin ? 'text' : 'password'}
								bind:value={pin}
								autocomplete="current-password"
								placeholder="PIN"
								class="pr-9"
							/>
							<button
								type="button"
								class="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								onclick={() => (showPin = !showPin)}
								aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
							>
								{#if showPin}<EyeOff class="size-4" />{:else}<Eye class="size-4" />{/if}
							</button>
						</div>
					</div>

					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}

					<Button type="submit" class="w-full" disabled={submitting}>
						{#if submitting}<LoaderCircle class="size-4 animate-spin" />{/if}
						Enter
					</Button>
				</form>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>
