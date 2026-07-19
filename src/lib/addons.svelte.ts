import { api, ApiError } from './api';

export type AddonStatus = {
	id: string;
	name: string;
	description: string;
	installed: boolean;
	attached: boolean;
	parked: boolean;
	status: 'uninstalled' | 'unlicensed' | 'detached' | 'attached';
	licensed: boolean;
	licenseState?: string;
	licenseReason?: string;
	online?: boolean;
	available?: boolean;
};

class AddonsStore {
	addons = $state<AddonStatus[]>([]);
	loaded = $state(false);
	loading = $state(false);

	async load() {
		this.loading = true;
		try {
			const res = await api.get<{ addons: AddonStatus[] }>('/addons/status');
			this.addons = res.addons;
		} catch (err) {
			if (!(err instanceof ApiError && err.status === 401)) this.addons = [];
		} finally {
			this.loaded = true;
			this.loading = false;
		}
	}

	get(id: string) {
		return this.addons.find((a) => a.id === id) ?? null;
	}

	available(id: string) {
		return this.get(id)?.available ?? false;
	}
}

export const addons = new AddonsStore();
