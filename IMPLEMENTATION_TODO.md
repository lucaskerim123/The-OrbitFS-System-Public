# OrbitFS implementation TODO

## Installer and first-run setup

- Collect the essential Runtime & Services values during installation and prefill sensible detected defaults.
- Write panel port, system drive, Hive/MCP URL, sorter URL, licence URL, Windows service names, and service folders into the installed environment configuration while keeping every value editable afterward from the admin panel.
- Detect installed services and folders where possible instead of asking for values already available on the host.
- Configure the selected database provider and connection during installation.
- Create and migrate the initial admin account, workspaces, memberships, permissions, notification settings, and MCP grants.
- Keep workspace roots, quotas, members, and per-workspace MCP connections in workspace setup rather than global runtime setup.
- Validate all endpoints and services before completing installation.
