# practical-prompt-engineering-code-exercise

This repo serves to hold the code generated from the Frontend Masters workshop Practical Prompt Engineering.

## Run Locally (VS Code Live Server)

1. Install the "Live Server" extension (publisher: Ritwick Dey).
2. Open the workspace folder in VS Code.
3. Open `index.html` and click "Go Live" in the status bar.
4. Your browser will open at a local URL (typically `http://127.0.0.1:5500/`).

Notes:
- The app uses `localStorage` to persist prompts, per‑prompt notes, and your per‑prompt star ratings.
- Ratings are stored per device/browser; aggregate averages are saved with each prompt in localStorage.
- Notes are stored per prompt under a separate localStorage key and support add, edit, save, and delete.

## Metadata Tracking

- Each saved prompt captures a metadata object with the following shape:

	{
		model: string,
		createdAt: string (ISO 8601),
		updatedAt: string (ISO 8601),
		tokenEstimate: { min: number, max: number, confidence: 'high' | 'medium' | 'low' }
	}

- Enter a model name (required, max 100 chars) in the form.
- Timestamps use ISO 8601 (UTC) via `toISOString()`; `updatedAt` refreshes on interactions like rating or notes changes.
- Token estimates are computed client‑side based on content length and a simple code heuristic; confidence is color‑coded in each card.