# Node-RED Migration

## Keep in Node-RED

- Origami credentials and Origami/API request nodes.
- Existing `POST /sites/getMore` endpoint.
- Existing `GET /assets` endpoint.
- Existing `GET /assets/file/:id` endpoint, if private Origami files are still needed.

## Add `GET /api/sites`

Create a JSON endpoint that runs the same first part of the current `/siteP` flow:

```text
http in GET /api/sites
  -> Origami "אתרים"
  -> existing JSONata site transform node
  -> change: msg.payload = { sites: msg.sites }
  -> change headers:
       Content-Type: application/json; charset=utf-8
       Access-Control-Allow-Origin: https://orenl-cmyk.github.io
       Access-Control-Allow-Methods: GET,POST,OPTIONS
       Access-Control-Allow-Headers: Content-Type
  -> http response
```

Important: do not stringify the sites for this JSON endpoint. Return real JSON.

## Replace `GET /siteP`

After GitHub Pages is enabled, replace the heavy template response with a redirect:

```js
msg.statusCode = 302;
msg.headers = {
  Location: "https://orenl-cmyk.github.io/binuy561/"
};
return msg;
```

If you want to preserve query parameters such as `siteId`, redirect with them:

```js
const qs = new URLSearchParams(msg.req.query || {});
qs.set("api", "https://binuyp.origami.ms/nodered-app");
msg.statusCode = 302;
msg.headers = {
  Location: "https://orenl-cmyk.github.io/binuy561/?" + qs.toString()
};
return msg;
```

## Disable/Delete These Heavy Nodes

After testing the GitHub page:

- Main `/siteP` HTML template node.
- `GET /sites/structure` HTML template node.
- `GET /assets/buildings/:type` SVG template node.

The equivalent files now live in GitHub:

- `index.html`
- `structure.html`
- `assets/css/app.css`
- `assets/js/app.js`
- `assets/css/structure.css`
- `assets/js/structure.js`
- `assets/images/buildings/*.svg`

## CORS

Every Node-RED endpoint called from GitHub Pages must return:

```text
Access-Control-Allow-Origin: https://orenl-cmyk.github.io
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Headers: Content-Type
```

If Origami/Node-RED receives browser `OPTIONS` preflight requests, add simple `OPTIONS` routes for:

- `/api/sites`
- `/sites/getMore`
- `/assets`
- `/assets/file/:id`

Each `OPTIONS` route can respond with status `204` and the same CORS headers.

## Security

The pasted flow included an Origami API secret. Rotate that secret in Origami/Node-RED after the migration.
