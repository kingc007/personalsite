# Persona — Kingsley Chow

A Persona 5–themed personal website: an interactive, animated pause-menu (Persona,
Favorites, Education, Socials, Guests) built with **vanilla HTML, CSS, and
JavaScript** — no framework, no build step.

## Run locally

The site is fully static. Any static file server works, but the included
`server.js` adds HTTP **Range** support so the videos stream/seek smoothly:

```bash
node server.js
# then open http://localhost:4173
```

(You can also use any other static server, e.g. `npx serve`.)

## Project structure

```
index.html      # markup + SVG filters (chroma key, etc.)
style.css       # all styling and animations
script.js       # all behavior (menu, transitions, guestbook, easter eggs)
server.js       # tiny static server with Range support (local preview only)
faststart.py    # dev tool: remux .mov → web-ready .mp4 (not needed at runtime)
assets/         # videos, images, audio actually used by the site
```

## Deploy (static hosting)

No build is required — publish the repo root as-is.

- **Netlify / Cloudflare Pages / Vercel:** "Add site → import from Git", build
  command **none**, publish directory **`/`** (repo root). Or drag-and-drop the
  folder onto <https://app.netlify.com/drop>.
- `server.js` is **not** needed in production — these hosts serve Range requests
  automatically.
- Add a custom domain in the host's dashboard; HTTPS is automatic.

> Tip: the site is video-heavy. **Cloudflare Pages** has the most generous free
> bandwidth for media.

## Notes

- **Guestbook:** comments are stored in each visitor's own browser
  (`localStorage`) — they are private per-visitor, not shared. A basic profanity
  filter, a 20-comment cap, and per-browser ownership (you can only delete your
  own comments) are enforced client-side. A truly shared guestbook would need a
  backend.
- **Source files:** the original green-screen `.mov` clips and pre-keyed images
  used to generate the keyed assets are kept **outside** the repo to keep it
  lean (and are ignored via `.gitignore`). Only the files the site loads are
  committed.
- Best viewed on a widescreen display.
