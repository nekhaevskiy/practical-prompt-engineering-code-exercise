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

## Import / Export

- Export generates a JSON file with schema versioning, a timestamp, statistics, and all local data.
- Import supports merge or replace, detects duplicate IDs, and lets you choose how to resolve duplicates.
- Import performs a backup of your current data and will roll back on failure, with a detailed message.

### JSON Schema (v1.0.0)

```
{
	"version": "1.0.0",
	"exportedAt": "2025-12-27T12:34:56.789Z",
	"stats": {
		"totalPrompts": 3,
		"averageRating": 4.2,          // null if no ratings
		"mostUsedModel": "MyModel-1"  // null if none
	},
	"data": {
		"prompts": [
			{
				"id": "1703700000000-abc123",
				"title": "Summarize meeting notes",
				"content": "...",
				"ratings": { "average": 4.5, "count": 2 },
				"metadata": {
					"model": "MyModel-1",
					"createdAt": "2025-12-27T10:00:00.000Z",
					"updatedAt": "2025-12-27T10:15:00.000Z",
					"tokenEstimate": { "min": 120, "max": 200, "confidence": "high" }
				}
			}
		],
		"userRatings": { "1703700000000-abc123": 5 },
		"notes": { "1703700000000-abc123": [{ "id": "...", "promptId": "...", "content": "...", "createdAt": 1703700000000, "updatedAt": 1703700000000 }] }
	}
}
```

### How to Use

- Click Export to download `prompt-library-export-YYYYMMDD-HHMMSS.json`.
- Click Import and select a JSON export file.
- When prompted:
	- Confirm Merge to combine with existing data, or Cancel to Replace.
	- If duplicates exist, choose one: `skip` (keep existing), `overwrite` (use imported), or `reassign` (give new IDs to imported duplicates).

Troubleshooting:
- If import validation fails (wrong version, malformed JSON), the app restores your previous data and shows an error message at the top.