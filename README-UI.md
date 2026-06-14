# Jobkit UI

Local dark-mode web UI over the jobkit slash commands. Each click spawns
`claude -p` in this folder, so the same /tailor, /prep, /log, /intake commands
work — just from a form instead of the terminal.

## Start
1. `npm install`
2. `npm start`
3. Open http://localhost:3000

## Notes
- Each command takes 30s–2min because a fresh agent loop runs per request.
- Uses your existing `claude auth login` session.
- Runs with `--dangerously-skip-permissions` so file edits don't prompt. Acceptable for
  this local single-user folder; do not run server.js from a shared directory.
- Keep `claude` available on PATH (the same binary your terminal uses).
