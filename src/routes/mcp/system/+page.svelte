<script lang="ts">
  import { api, ApiError } from '$lib/api';
  import { fileContext } from '$lib/context.svelte';
  import { onMount } from 'svelte';

  const files = [
  "_system/Startup/00_MASTER_STARTUP.md",
  "_system/Rules/load_order.md",
  "_system/Rules/source_rules.md",
  "_system/Rules/response_rules.md",
  "_system/Rules/saving_rules.md",
  "_system/Rules/project_rules.md",
  "_system/settings/workspace_profile.md",
  "_system/settings/terminology.md",
  "_system/settings/chatgpt_mcp_instructions.md",
  "_system/Config/system.json",
  "_system/Config/folder_roles.json",
  "_system/Index/file_index.json",
  "_system/Index/folder_index.json"
];


  type Workspace = { id:string; name:string; permission:string; management_permissions?:Record<string,boolean> };
  let workspaces = $state<Workspace[]>([]);
  let workspaceId = $state('');
  let selected = $state(files[0]);
  let content = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let error = $state('');
  let status = $state('');
  let helpOpen = $state(false);
  const helpByFile: Record<string, { purpose: string; configure: string }> = {
    '_system/Startup/00_MASTER_STARTUP.md': { purpose: 'Sets the first instructions and startup checks for this workspace.', configure: 'Add only the files or folders that must always be understood before other work begins.' },
    '_system/Rules/load_order.md': { purpose: 'Controls instruction and source priority.', configure: 'List required files from highest to lowest priority. Keep _system before optional context.' },
    '_system/Rules/source_rules.md': { purpose: 'Explains which information is trusted and how conflicts are handled.', configure: 'Describe approved, draft, historical, and unreliable source areas.' },
    '_system/Rules/response_rules.md': { purpose: 'Controls response style and output rules.', configure: 'Add preferred tone, formatting, terminology, date style, and prohibited wording.' },
    '_system/Rules/saving_rules.md': { purpose: 'Controls where files may be created or changed.', configure: 'Name output folders, revision rules, and files that must never be overwritten.' },
    '_system/Rules/project_rules.md': { purpose: 'Controls optional project and preset context.', configure: 'Explain what optional context may add. It must never replace _system.' },
    '_system/settings/workspace_profile.md': { purpose: 'Describes the workspace and its main areas.', configure: 'Describe its purpose, owner or team, source-of-truth area, working area, and archive.' },
    '_system/settings/terminology.md': { purpose: 'Defines names and terms that must be used consistently.', configure: 'Add abbreviations, relationships, statuses, and terms that must not be merged.' },
    '_system/settings/chatgpt_mcp_instructions.md': { purpose: 'Controls how ChatGPT reads and reports OrbitFS context.', configure: 'Add workspace-specific reading, confirmation, privacy, and file-action behaviour.' },
    '_system/Config/system.json': { purpose: 'Stores machine-readable system switches.', configure: 'Usually keep the defaults. Edit only valid JSON values supported by OrbitFS.' },
    '_system/Config/folder_roles.json': { purpose: 'Maps folders to their meaning and default loading behaviour.', configure: 'Replace the example folder names with actual workspace paths and roles.' },
    '_system/Index/file_index.json': { purpose: 'Optional generated file index.', configure: 'Normally leave this to OrbitFS. Do not use it as a substitute for reading files.' },
    '_system/Index/folder_index.json': { purpose: 'Optional generated folder index.', configure: 'Normally leave this to OrbitFS. Do not use it as a substitute for reading folders.' }
  };
  async function copyHelpPrompt() {
    const prompt = `Help me configure this OrbitFS _system file: ${selected}. Explain each section in plain English, ask only for missing workspace details, then return a complete replacement file. Do not invent private details.\n\nCurrent file:\n${content}`;
    await navigator.clipboard.writeText(prompt);
    status = 'Help prompt copied. Paste it into ChatGPT.';
  }
  const activeWorkspace = $derived(workspaces.find((item) => item.id === workspaceId));

  async function loadFile(path = selected) {
    selected = path;
    loading = true;
    error = '';
    status = '';
    try {
      if (!workspaceId) return;
      const result = await api.get<{ content: string }>(`/mcp/workspaces/${workspaceId}/system-file?path=${encodeURIComponent(path)}`);
      content = result.content ?? '';
      status = `Loaded ${path}`;
    } catch (e) {
      content = '';
      error = e instanceof Error ? e.message : 'Unable to load file';
    } finally {
      loading = false;
    }
  }
  async function validateSystem() {
    if (!workspaceId) return;
    loading = true; error = ''; status = '';
    try {
      const result = await api.get<{ ok:boolean; errors:Array<{message:string;path?:string}>; warnings:Array<{message:string;path?:string}> }>(`/mcp/workspaces/${workspaceId}/validate-system`);
      if (result.ok && result.warnings.length === 0) status = 'Workspace AI System validation passed.';
      else if (!result.ok) error = result.errors.map((item) => `${item.path || 'System'}: ${item.message}`).join(String.fromCharCode(10));
      else status = `Validation passed with ${result.warnings.length} warning(s): ${result.warnings.map((item) => item.path || item.message).join(', ')}`;
    } catch (e) { error = e instanceof Error ? e.message : 'Validation failed'; }
    finally { loading = false; }
  }
  async function resetDefaults() {
    if (!confirm('Replace this workspace’s _system files with OrbitFS defaults? A backup should be kept before resetting.')) return;
    saving = true; error = ''; status = '';
    try {
      const result = await api.post<{ backupPath: string }>(`/mcp/workspaces/${workspaceId}/reset-system`);
      await loadFile(selected);
      status = `Workspace AI System reset. Backup: ${result.backupPath}`;
    } catch (e) { error = e instanceof Error ? e.message : 'Reset failed'; }
    finally { saving = false; }
  }

  async function saveFile() {
    saving = true;
    error = '';
    status = '';
    try {
      if (selected.endsWith('.json')) JSON.parse(content);
      await api.put(`/mcp/workspaces/${workspaceId}/system-file?path=${encodeURIComponent(selected)}`, { content });
      status = `Saved ${selected}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unable to save file';
    } finally {
      saving = false;
    }
  }
  async function changeWorkspace() {
    const ws = workspaces.find((item) => item.id === workspaceId);
    if (ws) fileContext.set(ws.id, ws.name);
    await loadFile(selected);
  }
  onMount(async () => {
    try {
      const data = await api.get<{ workspaces: Workspace[] }>('/workspaces');
      workspaces = data.workspaces.filter((ws) => ws.permission === 'owner' || !!ws.management_permissions?.manage_mcp_startup);
      workspaceId = fileContext.currentId && workspaces.some((ws) => ws.id === fileContext.currentId) ? fileContext.currentId : (workspaces[0]?.id || '');
      if (workspaceId) await changeWorkspace(); else loading = false;
    } catch (e) { error = e instanceof ApiError ? e.message : 'Failed to load workspaces'; loading = false; }
  });

</script>

<svelte:head><title>Workspace AI System · OrbitFS</title></svelte:head>

<div class="space-y-4 p-4 md:p-6">
  <div>
    <h1 class="text-xl font-semibold">Workspace AI System</h1>
    <p class="text-sm text-muted-foreground">Edit the selected workspace’s protected _system files. These load before presets, projects, and manual files.</p>
    <p class="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">You may replace the actual files directly, but invalid names, paths, JSON, or structure can stop this panel editor from loading them correctly.</p>
    <button type="button" class="mt-2 rounded-md border px-3 py-2 text-sm" onclick={() => (helpOpen = !helpOpen)}>{helpOpen ? 'Hide configuration help' : 'Configuration help'}</button>
  </div>


  {#if helpOpen}
    <div class="rounded-lg border bg-card p-4 text-sm">
      <h2 class="font-semibold">Help for {selected.replace('_system/', '')}</h2>
      <p class="mt-2"><strong>What it controls:</strong> {helpByFile[selected]?.purpose}</p>
      <p class="mt-2"><strong>What to configure:</strong> {helpByFile[selected]?.configure}</p>
      <p class="mt-2 text-muted-foreground">Leave the defaults in place when unsure. Make one small change, save, reload, and test before changing more.</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="rounded-md bg-primary px-3 py-2 text-primary-foreground" onclick={copyHelpPrompt}>Copy “help me configure this” prompt</button>
        <a class="rounded-md border px-3 py-2" href="https://help.openai.com/en/articles/10169521-projects-in-chatgpt" target="_blank" rel="noreferrer">OpenAI: Projects and instructions</a>
        <a class="rounded-md border px-3 py-2" href="https://platform.openai.com/docs/guides/prompt-engineering" target="_blank" rel="noreferrer">OpenAI: Prompting guide</a>
      </div>
    </div>
  {/if}

  <div class="rounded-lg border bg-card p-4"><label class="space-y-1 text-sm"><span class="font-medium">Workspace</span><select class="w-full rounded-md border bg-background p-2" bind:value={workspaceId} onchange={changeWorkspace}>{#each workspaces as ws}<option value={ws.id}>{ws.name}</option>{/each}</select></label><p class="mt-2 text-xs text-muted-foreground">Uses the top-bar workspace when available. Changing this also updates the active workspace context.</p></div>

  <div class="grid gap-4 lg:grid-cols-[280px_1fr]">
    <aside class="rounded-lg border bg-card p-2">
      {#each files as file}
        <button type="button" class="mb-1 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent {selected === file ? 'bg-accent font-medium' : ''}" onclick={() => loadFile(file)}>
          {file.replace('_system/', '')}
        </button>
      {/each}
    </aside>
    <section class="rounded-lg border bg-card p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-medium">{selected}</p>
          <p class="text-xs text-muted-foreground">{activeWorkspace?.name ?? 'No workspace selected'} · Panel-only editor.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="rounded-md border border-sky-500/40 px-3 py-2 text-sm" onclick={validateSystem} disabled={loading || saving}>Validate system</button>
          <button type="button" class="rounded-md border border-amber-500/40 px-3 py-2 text-sm" onclick={resetDefaults} disabled={loading || saving}>Reset defaults</button>
          <button type="button" class="rounded-md border px-3 py-2 text-sm" onclick={() => loadFile()} disabled={loading || saving}>Reload</button>
          <button type="button" class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onclick={saveFile} disabled={loading || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {#if error}<div class="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>{/if}
      {#if status}<div class="mb-3 rounded-md border p-3 text-sm">{status}</div>{/if}

      <textarea bind:value={content} class="min-h-[60vh] w-full resize-y rounded-md border bg-background p-3 font-mono text-sm" spellcheck="false" disabled={loading}></textarea>
    </section>
  </div>
</div>
