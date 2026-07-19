import {
	Folder,
	File,
	FileText,
	FileImage,
	FileVideoCamera,
	FileMusic,
	FileArchive,
	FileCode,
	FileSpreadsheet
} from '@lucide/svelte';

const EXT_ICON: Record<string, typeof File> = {
	// text/docs
	md: FileText, markdown: FileText, txt: FileText, doc: FileText, docx: FileText, pdf: FileText,
	// code
	js: FileCode, mjs: FileCode, ts: FileCode, tsx: FileCode, jsx: FileCode, json: FileCode,
	html: FileCode, css: FileCode, py: FileCode, sh: FileCode, yml: FileCode, yaml: FileCode,
	// images
	png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage, webp: FileImage,
	// video
	mp4: FileVideoCamera, mov: FileVideoCamera, mkv: FileVideoCamera, webm: FileVideoCamera,
	// audio
	mp3: FileMusic, wav: FileMusic, flac: FileMusic,
	// archives
	zip: FileArchive, rar: FileArchive, tar: FileArchive, gz: FileArchive, '7z': FileArchive,
	// spreadsheets
	xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet
};

export function iconFor(name: string, type: 'dir' | 'file') {
	if (type === 'dir') return Folder;
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	return EXT_ICON[ext] ?? File;
}
