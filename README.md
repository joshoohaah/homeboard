# homeboard

Self-hosted family wall calendar: a DAKboard-style screen for Google and iCal calendars, weather and photos.
Not affiliated with DAKboard.

- Rolling week grid with week numbers, full titles, a color and icon per calendar, and Google's event colors
- Several Google accounts, plus any iCal link
- Weather and air quality (Open-Meteo), word of the day, photos from a folder or picked from Google Photos
- Keeps the last good data when a source fails; display key and password-protected admin page

## Quick start

```bash
npm ci
npm run demo   # http://localhost:8080 with made-up events
```

To run your own, copy `config.example.json` to `data/config.json` and follow [docs/DEPLOY.md](docs/DEPLOY.md).

## Development

`bash scripts/verify.sh` runs all checks. See [CLAUDE.md](CLAUDE.md).
