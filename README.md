# Koda’s Sports

A recovered sports dashboard with live scores, upcoming games, game details, and favorite teams, leagues, and games.

## Run locally

No install or build step is required. With Python 3 installed, run from this folder:

```sh
python3 -m http.server 8000
```

On Windows, use `py -m http.server 8000`. Open http://localhost:8000. Use a web server rather than opening the HTML file directly.

## Project files

- `index.html`: app layout
- `assets/styles.css`: responsive styling
- `assets/app.js`: league configuration, provider requests, views, and favorites
- `docs/RECOVERY.md`: recovered evidence, limitations, and decisions needed
- `scripts/check.cjs`: offline smoke checks

## Data and favorites

The app requests ESPN's publicly reachable **unofficial** scoreboard and summary endpoints directly from the browser. Coverage, availability, and browser access can change. No API key or backend is included. Missing data must not be interpreted as no games being played, and no sample scores are substituted.

Scoreboards load individual dates for recent results, today, and tomorrow because several feeds reject date ranges. Requests time out after twelve seconds, and partially available schedules show a warning. Cricket currently requires a supported replacement feed. The app reloads its current view every 90 seconds. Favorites live in this browser's localStorage, with the original storage keys retained. Favorites do not sync between devices or automatically transfer to another website address.

## Check the recovered starter

With Node.js installed:

```sh
node --check assets/app.js
node scripts/check.cjs
```

These checks use stubbed responses. They do not verify live provider availability.

## Hosting

This is a static site. For a Vercel import, select this repository, use the Other preset, leave the build command empty, and serve the repository root. No deployment has been created or connected by this recovery.

Before treating this as the current production source, compare it with any newer saved code or deployed Koda website. See [recovery notes](docs/RECOVERY.md).


Upcoming games are limited to today and tomorrow in the viewer’s local timezone. Unconfirmed opponents (TBC/TBD) are hidden. Soccer cards and detail pages display goal scorers and minutes when supplied by the provider.
