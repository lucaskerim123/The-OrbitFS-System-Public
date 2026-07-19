export type FileKind = 'text' | 'markdown' | 'document' | 'spreadsheet' | 'presentation' | 'image' | 'video' | 'audio' | 'pdf' | 'other';

const MARKDOWN_EXT = new Set(['md', 'markdown']);
const TEXT_EXT = new Set([
	'txt', 'json', 'jsonl', 'csv', 'log', 'xml', 'html', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx',
	'yml', 'yaml', 'py', 'sh', 'toml', 'ini', 'env', 'svelte', 'vue', 'sql', 'graphql'
]);
const DOCUMENT_EXT = new Set(['docx']);
const SPREADSHEET_EXT = new Set(['xlsx']);
const PRESENTATION_EXT = new Set(['ppt', 'pptx', 'odp']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv', '3gp', 'wmv', 'flv', 'vob', 'mts', 'm2ts']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'wma', 'aif', 'aiff', 'amr', 'mid', 'midi']);

export function extOf(name: string) {
	return name.split('.').pop()?.toLowerCase() ?? '';
}

export function kindOf(name: string): FileKind {
	const ext = extOf(name);
	if (MARKDOWN_EXT.has(ext)) return 'markdown';
	if (ext === 'pdf') return 'pdf';
	if (DOCUMENT_EXT.has(ext)) return 'document';
	if (SPREADSHEET_EXT.has(ext)) return 'spreadsheet';
	if (PRESENTATION_EXT.has(ext)) return 'presentation';
	if (IMAGE_EXT.has(ext)) return 'image';
	if (VIDEO_EXT.has(ext)) return 'video';
	if (AUDIO_EXT.has(ext)) return 'audio';
	if (TEXT_EXT.has(ext)) return 'text';
	return 'other';
}

const HLJS_LANG: Record<string, string> = {
	js: 'javascript', mjs: 'javascript', jsx: 'javascript',
	ts: 'typescript', tsx: 'typescript',
	py: 'python', sh: 'bash', yml: 'yaml'
};

export function highlightLangOf(name: string) {
	const ext = extOf(name);
	return HLJS_LANG[ext] ?? ext;
}
