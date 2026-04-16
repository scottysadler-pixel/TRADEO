# Run Trade1 without Cursor

You do **not** need Cursor to refresh data or open the dashboard. Everything runs on your PC with Node.js and Python.

## Double-click (easiest)

In your Trade1 folder (same place as `package.json`):

| File | What it does |
|------|----------------|
| **`Refresh Trade1 Data.cmd`** | Runs the full pipeline: real data fetch → merge CSVs → Python strategy → trial dashboard → opens `output/trial_dashboard.html`. |
| **`Refresh Trade1 Data (first-time or update Python).cmd`** | Same, but runs `pip install` first (use after cloning or when `aud_strategy/requirements.txt` changes). |
| **`Open Trade1 App.cmd`** | Opens the static **`standalone/`** bundle (good for a saved copy or iPad sync). Run a refresh first so files are up to date. |

Requirements:

- **Node.js** (includes `npm`) — [nodejs.org](https://nodejs.org)
- **Python 3** on your PATH
- Optional: **`.env`** in the Trade1 folder with `FRED_API_KEY=...` for real Fed data (see `aud_strategy/README.md`)

If a window flashes and closes, open **Command Prompt**, `cd` to your Trade1 folder, run `Refresh Trade1 Data.cmd` from there, or drag the `.cmd` file into the prompt and press Enter — you will see the full log.

## Schedule automatic refresh (Windows Task Scheduler)

1. Open **Task Scheduler** → **Create Task** (not “Create Basic Task” if you want full control).
2. **General:** Name e.g. `Trade1 refresh data`; choose “Run whether user is logged on or not” only if you accept storing your password.
3. **Triggers:** e.g. **Daily** at 07:00, or **Weekly**.
4. **Actions:** **Start a program**
   - **Program/script:** `cmd.exe`
   - **Add arguments:** `/c "cd /d C:\Path\To\Trade1 && call npm run refresh:data"` (replace `C:\Path\To\Trade1` with your Trade1 folder)
5. **Conditions:** Uncheck “Start only on AC power” if you want it on battery.
6. **Settings:** Allow task to be run on demand; optionally “Run task as soon as possible after a scheduled start is missed”.

`FRED_API_KEY` for scheduled runs: either set a **system/user environment variable** in Windows (Settings → System → About → Advanced system settings → Environment variables) or ensure `.env` exists in the project folder (the fetch script loads it when the current directory is the repo root — Task Scheduler must `cd` there first, as above).

## Command line (same as the .cmd files)

```bat
cd C:\Path\To\Trade1
npm run refresh:data
```

## Why the in-browser app cannot “click to refresh”

The **standalone** site is static HTML (no server). Browsers cannot safely run `npm` or Python on your PC from a web page. Use the **`.cmd`** shortcuts or Task Scheduler instead.
