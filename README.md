# Workshop Quadrant Board

A minimal static workshop app for assessing team capability across AAP, YAML, Git, and Windows automation.

## Features
- Drag-and-drop topic cards
- Collapsible topic groups
- Overlapping quadrant board
- Dark mode toggle
- Local persistence in the browser
- JSON export
- Reset board

## Local run
Run a simple static server from the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

On Windows, you can also use:

```bash
py -3 -m http.server 8000
```

## Notes
- Keep `_data/quadrants.yml` and `_data/topics.yml` in place.
- The site can stay in a private repo during development but will be made public later for GitHub Pages.