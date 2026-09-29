# officebit

An 8-bit town where your team lives, commutes and works. People wake up,
have breakfast, walk to the office, get coffee, interrupt each other, go home
to cook (or order takeaway), play with the dog and go to bed. It's all driven by
personalities, or by any data you feed in (Slack statuses, agent activity…).

```sh
npm install
npm run dev        # http://localhost:6060
npm test
```

**Controls:** drag to look around · scroll or pinch to zoom · click someone to
follow them (drag to let go) · click a building or door for a way in · arrows/WASD
pan · `+`/`-` zoom · `f` follow · `Esc` stop following · space pauses ·
Alt+← back.

Static site, no bundler, no framework: Node 24's type stripping turns the
TypeScript into native ES modules. UI is [modest-ui](https://modest-ui.com)
(`mdst-ui`). `npm run build` produces `dist/` for GitHub Pages.

**Docs:** start at [docs/README.md](docs/README.md). What's next: [ROADMAP.md](ROADMAP.md). For drive-people-with-data,
see [docs/FEEDS.md](docs/FEEDS.md).
