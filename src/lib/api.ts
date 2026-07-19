import { env } from '$env/dynamic/public';
import { untrack } from 'svelte';
import { auth } from './auth.svelte';

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

type HeaderProvider = () => Record<string, string>;
const headerProviders = new Set<HeaderProvider>();
const API_BASE = (env.PUBLIC_API_BASE || 'http://127.0.0.1:4174/api').replace(/\/$/, '');

export function registerHeaderProvider(provider: HeaderProvider) {
	headerProviders.add(provider);
	return () => headerProviders.delete(provider);
}

function apiUrl(path: string) {
	return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function authHeaders(): HeadersInit {
	return untrack(() => {
		const headers: Record<string, string> = {};
		if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
		for (const provider of headerProviders) Object.assign(headers, provider());
		return headers;
	});
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	for (const [key, value] of Object.entries(authHeaders())) headers.set(key, value);
	if (init.body && !(init.body instanceof ArrayBuffer) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	const res = await fetch(apiUrl(path), { ...init, headers });
	if (res.status === 401) { auth.clear(); throw new ApiError('Session expired', 401); }
	const isJson = res.headers.get('content-type')?.includes('application/json');
	const body = isJson ? await res.json().catch(() => ({})) : null;
	if (!res.ok) throw new ApiError(body?.error || res.statusText || 'Request failed', res.status);
	return body as T;
}

export const api = {
	get: <T>(path: string, headers?: HeadersInit) => request<T>(path, { headers }),
	post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
	patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: data !== undefined ? JSON.stringify(data) : undefined }),
	put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
	upload: (path: string, file: File, onProgress?: (pct: number) => void) => new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest(); xhr.open('POST', apiUrl(path));
		for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
		xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
		xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new ApiError(xhr.responseText || 'Upload failed', xhr.status)); };
		xhr.onerror = () => reject(new ApiError('Upload failed', 0)); xhr.send(file);
	}),
	download: async (path: string, filename: string) => {
		const res = await fetch(apiUrl(`/download?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Download failed', res.status);
		const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
		a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
	},
	previewBlob: async (path: string) => {
		const res = await fetch(apiUrl(`/preview?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Preview failed', res.status);
		return res.blob();
	},
	previewBlobUrl: async (path: string) => {
		const res = await fetch(apiUrl(`/preview?path=${encodeURIComponent(path)}`), { headers: authHeaders() });
		if (!res.ok) throw new ApiError('Preview failed', res.status);
		const blob = await res.blob(); return URL.createObjectURL(blob);
	}
};
