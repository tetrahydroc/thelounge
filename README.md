<h1 align="center">
	<img
		width="300"
		alt="The Lounge"
		src="https://raw.githubusercontent.com/thelounge/thelounge/master/client/img/logo-vertical-transparent-bg.svg?sanitize=true">
</h1>

<h3 align="center">
	fHori/thelounge — a standalone performance/search-focused fork of The Lounge
</h3>

<p align="center">
	<strong>
		<a href="https://thelounge.chat/">Upstream website</a>
		•
		<a href="https://thelounge.chat/docs">Upstream docs</a>
		•
		<a href="./MIGRATION.md">Migration guide</a>
		•
		<a href="./DEPLOYMENT.md">Deployment guide</a>
		•
		<a href="./CHANGELOG.md">Changelog</a>
	</strong>
</p>
<p align="center">
	<a href="https://github.com/fHori/thelounge/actions"><img
		alt="Build Status"
		src="https://github.com/fHori/thelounge/workflows/Build/badge.svg"></a>
</p>

<p align="center">
	<img src="https://raw.githubusercontent.com/thelounge/thelounge.github.io/master/img/thelounge-screenshot.png" width="550">
</p>

## About this fork

This is a standalone fork of [The Lounge](https://github.com/thelounge/thelounge), diverged from [tetrahydroc/thelounge](https://github.com/tetrahydroc/thelounge). It is **not** submitted upstream and will not be merged back — it exists to move faster on performance and search than upstream's release cadence allows, while staying fully compatible with tetrahydroc/thelounge's own message database: this fork's own additions (FTS5 search) live in a disposable sidecar file next to your data, never inside it, so your main database always stays exactly what tetrahydroc/thelounge would produce (this is specifically verified against tetra, not upstream `thelounge/thelounge`, which has continued its own independent schema changes since the fork point). See [`MIGRATION.md`](./MIGRATION.md) for what's changed and what that means if you're switching from another instance, and [`CHANGELOG.md`](./CHANGELOG.md) for the running list of changes.

Issues and pull requests for this fork belong at [github.com/fHori/thelounge](https://github.com/fHori/thelounge), not upstream.

## Overview

- **Modern features brought to IRC.** Push notifications, link previews, new message markers, and more bring IRC to the 21st century.
- **Always connected.** Remains connected to IRC servers while you are offline.
- **Cross platform.** It doesn't matter what OS you use, it just works wherever Node.js runs.
- **Responsive interface.** The client works smoothly on every desktop, smartphone and tablet.
- **Synchronized experience.** Always resume where you left off no matter what device.
- **Fast, indexed search** and a message list that stays smooth even on channels with hundreds of thousands of messages — see [`CHANGELOG.md`](./CHANGELOG.md) for what this fork adds on top of the above.

To learn more about the general configuration, usage and features The Lounge itself provides, take a look at [the upstream website](https://thelounge.chat) — most of it applies here unchanged; this fork only diverges in the specific areas covered by `MIGRATION.md`/`CHANGELOG.md`.

The Lounge is the official and community-managed fork of [Shout](https://github.com/erming/shout), by [Mattias Erming](https://github.com/erming).

## Installation and usage

This fork requires the same [Node.js](https://nodejs.org/) v24.11.1+ and [Yarn](https://yarnpkg.com/) v4.11.0+ as upstream. If you want to install with npm, `--unsafe-perm` is required for a correct install.

### Docker

Images are built and published directly from this repo (`ghcr.io/fhori/thelounge:latest`, multi-arch). See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for a ready-to-use [`docker-compose.yml`](./docker-compose.yml), the full parameters list, and specifically how to move an existing bare-Linux or other-Docker-image install over to this one.

### Running from source

```sh
git clone https://github.com/fHori/thelounge.git
cd thelounge
yarn install
NODE_ENV=production yarn build
yarn start
```

When installed like this, `thelounge` executable is not created. Use `node index <command>` to run commands.

⚠️ While it is the most recent codebase, this is not production-ready! Run at
your own risk. It is also not recommended to run this as root.

## Development setup

Simply follow the instructions to run The Lounge from source above, on your own
fork.

Before submitting any change, make sure to:

- Read the [Contributing instructions](./.github/CONTRIBUTING.md) (inherited from upstream — still broadly applicable to this fork)
- Run `yarn test` to execute linters and the test suite
  - Run `yarn format:prettier` if linting fails
- Run `yarn build:client` if you change or add anything in `client/js` or `client/components`
  - The built files will be output to `public/` by webpack
- Run `yarn build:server` if you change anything in `server/`
  - The built files will be output to `dist/` by tsc
- `yarn dev` can be used to start The Lounge with hot module reloading

To ensure that you don't commit files that fail the linting, you can install a pre-commit git hook.
Execute `yarn githooks-install` to do so.
