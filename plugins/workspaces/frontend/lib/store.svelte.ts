import { api, ApiError } from '$lib/api';
import { fileContext } from '$lib/context.svelte';
import { addons } from '$lib/addons.svelte';

export type Workspace = {
	id: string;
	name: string;
	slug: string;
	is_main: boolean;
	permission: 'owner' | 'editor' | 'contributor' | 'viewer';
	status: string;
	drive_state?: string;
};

const STORAGE_KEY = 'orbitfs.workspace';

class WorkspaceStore {
	workspaces = $state<Workspace[]>([]);
	currentId = $state<string | null>(null);
	loaded = $state(false);

	async load() {
		if (!addons.available('workspaces')) {
			this.workspaces = [];
			this.currentId = null;
			fileContext.clear();
			this.loaded = true;
			return;
		}
		try {
			const res = await api.get<{ workspaces: Workspace[] }>('/workspaces');
			this.workspaces = res.workspaces;
			const stored = localStorage.getItem(STORAGE_KEY);
			const main = res.workspaces.find((w) => w.is_main);
			this.currentId =
				(stored && res.workspaces.some((w) => w.id === stored) ? stored : null) ??
				main?.id ??
				res.workspaces[0]?.id ??
				null;
			const chosen = res.workspaces.find((w) => w.id === this.currentId);
			fileContext.set(this.currentId, chosen?.name ?? 'Main workspace');
		} catch (err) {
			// A 401 means the whole session is about to be torn down elsewhere (auth.clear()
			// already ran) — leave state alone rather than fighting that. Anything else (addon
			// detached mid-session, licence lapsed, workspace router unmounted) means workspaces
			// are no longer usable: reset fully so nothing downstream references a dead id.
			if (!(err instanceof ApiError && err.status === 401)) {
				this.workspaces = [];
				this.currentId = null;
				fileContext.clear();
			}
		} finally {
			this.loaded = true;
		}
	}

	select(id: string) {
		this.currentId = id;
		localStorage.setItem(STORAGE_KEY, id);
		const chosen = this.workspaces.find((w) => w.id === id);
		fileContext.set(id, chosen?.name ?? 'Workspace');
	}

	get current() {
		return this.workspaces.find((w) => w.id === this.currentId) ?? null;
	}

	get enabled() {
		return addons.available('workspaces') && this.workspaces.length > 0;
	}
}

export const workspace = new WorkspaceStore();

// Self-bootstrapping: whenever anything (core or addon) imports this module, it starts
// watching addon status on its own and (re)loads whenever that status changes — attach,
// detach, licence lapsing, a resync picking up a change from another session. This is
// what lets consumers (the Files page, the selector) just read `workspace.*` without
// any of them having to remember to call `.load()` or orchestrate addon lifecycle.
$effect.root(() => {
	$effect(() => {
		if (addons.loaded) workspace.load();
	});
});
