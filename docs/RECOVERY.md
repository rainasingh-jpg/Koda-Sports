# Recovery record

Recovered on October 12, 2026 from the current saved `ivaan_sports_prototype.html`, version 9, last modified September 22, 2026. The saved file's interface and title identify it as Koda’s Sports. The target repository was empty at inspection.

## Confidently recovered

- The original navy and blue responsive interface, dashboard, sports browsing, favorites page, and match detail page.
- Soccer, tennis, football, baseball, cricket, and basketball, plus their configured league choices.
- Existing ESPN scoreboard and summary integration, the original date-range request configuration, caching, and a 90-second refresh.
- Team, league, and game favorites stored locally, including the legacy `ivaanFavorites` team key.
- Soccer scorer detail rendering and explicit unavailable-data messages.

## Reconstruction changes

- Split the saved single-file app into HTML, CSS, and JavaScript without introducing a framework or dependencies.
- Removed a duplicate HTML class attribute.
- Corrected the Today filter: it now selects games on the browser's current local date, including upcoming games, instead of displaying all completed/live games in the request window.
- Added setup instructions, ignore rules, and offline smoke checks.

## Limitations and input needed

1. **Latest version:** This is the latest saved source recovered here, not proof of an exact match to an active deployed website. If a newer version exists, provide its source or the website URL for comparison.
2. **Hosting:** Earlier project context discussed GitHub plus Vercel, but no Koda deployment URL or configuration was recovered. Provide an existing Koda Vercel project/URL, or choose to create a new deployment.
3. **Live data:** Earlier reports said live data was not working. The saved source calls ESPN directly; initial recovery did not verify live connectivity; subsequent repair confirmed that date-range requests fail while single-day requests succeed. Choose the must-have leagues before expanding or replacing the provider.
4. **League coverage:** Configured league labels are not guarantees of working feeds. Tennis tournament choices reuse ATP/WTA feeds with name filtering; cricket and other less common feeds may be incomplete. Tennis tournament event structures may require a dedicated parser.
5. **Favorites:** Saved game IDs lack league metadata, so favorite games may not reappear after reload until their league is loaded. Favorite team schedules depend on loaded feeds.
6. **Error display:** Browse shows request failures. Dashboard empty states now note unavailable feeds; Browse displays the specific error.
7. **Refresh:** Scores on an open detail page are not automatically refreshed by the existing interval.
8. **Accessibility:** The original clickable match cards still need keyboard navigation improvements.

No production deployment, paid service, credential, backend, or license choice was introduced.


## October 12 live-data repair

Provider checks confirmed HTTP 400 responses for date ranges on NFL, Premier League, NBA, and MLB, while a single-day NFL request returned HTTP 200. Requests now use individual dates from today through fourteen days ahead, with five requests per league at a time and a twelve-second timeout per request. Duplicate events are merged. Partial schedules remain visible with a warning. The invalid cricket feed is marked unavailable and removed from the default dashboard load. Other league coverage still varies.

## October 12 display and scorer update

Upcoming views now show only today and tomorrow in the browser’s local timezone, including dashboard and favorites. The request window retains two previous days for recent results and ends tomorrow. Games with unconfirmed teams are excluded. Soccer goal extraction reads scoreboard athletesInvolved and summary participants, filters non-goal events, deduplicates shared events, and displays names/minutes on cards and details. A real MLS summary was checked against the new parser.
