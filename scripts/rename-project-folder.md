# Rename project folder: `tankpilot` → `fuelyn`

The code is fully renamed and the docker stack runs as `fuelyn-*`.
The remaining step — **renaming the folder on disk** — has to be
done from outside the project directory because Windows / processes
hold a write-lock on every file inside the folder while you're
working in it.

## Windows (PowerShell)

```powershell
# 1. Close VS Code, IntelliJ, Claude Code, terminals etc. that are
#    currently inside C:\projects\tankpilot.
# 2. Stop the docker stack (idempotent — does nothing if already down):
docker compose -p fuelyn down

# 3. Rename the folder
Move-Item C:\projects\tankpilot C:\projects\fuelyn

# 4. cd in
cd C:\projects\fuelyn

# 5. Re-install workspaces (path symlinks need to refresh)
Remove-Item -Recurse -Force node_modules,apps\web\node_modules,packages\core\node_modules -ErrorAction SilentlyContinue
npm install

# 6. Re-build + restart the stack
docker compose up -d --build
```

## Linux / macOS

```bash
docker compose -p fuelyn down
mv ~/projects/tankpilot ~/projects/fuelyn
cd ~/projects/fuelyn
rm -rf node_modules apps/web/node_modules packages/core/node_modules
npm install
docker compose up -d --build
```

## Git remote (optional)

If you want the GitHub repo to be `fuelyn` too:

```bash
# On GitHub: rename the repo via Settings → Repository name
git remote set-url origin https://github.com/<you>/fuelyn.git
```

## Old Docker volumes

Docker preserved the old `tankpilot_*` volumes for safety. They are
orphaned (no compose project owns them anymore). Delete them only
once you've confirmed the new stack works:

```bash
# Inspect them first — sizes, last-used etc.
docker volume ls --filter "name=tankpilot_"

# Delete when sure
docker volume rm tankpilot_pgdata tankpilot_caddy_data \
  tankpilot_caddy_config tankpilot_ollama_data
```

The new stack auto-created fresh `fuelyn_*` volumes — Postgres
re-initialised the empty `fuelyn` database and Flyway re-applied
all migrations on first boot. Browser localStorage data persists
under the new `fuelyn:*` prefix; the old `tankpilot:*` keys remain
in your browser's storage harmlessly until you clear site data.
