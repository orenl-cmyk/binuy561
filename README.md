# Binuy 561 GitHub UI

Static UI extracted from the Node-RED flow.

## Node-RED backend

Default backend:

```text
https://binuyp.origami.ms/nodered-app
```

The GitHub page calls Node-RED for protected data so Origami credentials stay in Node-RED.

Required endpoints:

- `GET /api/sites` - returns the initial sites array as JSON.
- `POST /sites/getMore` - existing details endpoint from the current flow.
- `GET /assets` - existing asset metadata endpoint.
- `GET /assets/file/:id` - existing private file proxy endpoint, if private Origami files are still used.

The page can also be pointed at another backend:

```text
index.html?api=https%3A%2F%2Fbinuyp.origami.ms%2Fnodered-app
```

## Node-RED migration

Keep the Origami/API nodes and JSONata transformation nodes. Move the heavy HTML/SVG template nodes to GitHub.

Replace `GET /siteP` with a redirect to this GitHub Pages URL, and add a small `GET /api/sites` endpoint that returns the transformed `msg.sites` JSON.
