# Deploying fHori/thelounge

This covers running this fork via Docker, and specifically how to move an existing install over to it — from a bare/systemd Linux install, or from another thelounge Docker image. For what's different about this fork itself and whether your data is compatible, see [`MIGRATION.md`](./MIGRATION.md) first; this document is just about the deployment mechanics.

The image is built on [LinuxServer.io](https://linuxserver.io)'s Alpine base image (same lineage as [cmd430/docker-thelounge](https://github.com/cmd430/docker-thelounge) and [linuxserver/docker-thelounge](https://github.com/linuxserver/docker-thelounge)), so if you've run any LSIO-style container before, the conventions below (`PUID`/`PGID`/`TZ`, `/config` volume, port 9000) will already be familiar.

> **`ghcr.io/fhori/thelounge:latest` does not currently contain this branch's work.** The image-publish workflow only runs on pushes to `master`, and as of this writing `master` has been reset back to the tetra fork point for an eventual squash-merge - the workflow itself isn't even present there yet. Until that merge happens, `:latest` reflects whatever was last actually published, not what's described here. If you want to run this branch's code today, build the image yourself from this branch (`docker build .`) rather than pulling the tag.

> **The image defaults to a public (unauthenticated) instance on a fresh volume.** The Dockerfile forces `public: true` into `defaults/config.js` at build time. On a genuinely empty `/config` volume, first boot generates its `config.js` from those defaults - meaning an unmodified first `docker compose up` is an open IRC proxy anyone can connect through, not a private instance you log into. See "Application setup" below - **stop the container and set `public: false` in `config.js` before exposing the port to anything but yourself.**

## Quick start

```sh
docker compose up -d
```

using the [`docker-compose.yml`](./docker-compose.yml) in this repo, or equivalently:

```bash
docker run -d \
  --name=thelounge \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Etc/UTC \
  -p 9000:9000 \
  -v /path/to/thelounge/config:/config \
  --restart unless-stopped \
  ghcr.io/fhori/thelounge:latest
```

Images are multi-arch (`linux/amd64`, `linux/arm64`), built and published directly from this repo's `master` branch.

### Parameters

| Parameter       | Function                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `-p 9000:9000`  | Application WebUI                                                                                        |
| `-e PUID=1000`  | User ID the process runs as inside the container - see "User / group ownership" below                    |
| `-e PGID=1000`  | Group ID, same idea as `PUID`                                                                            |
| `-e TZ=Etc/UTC` | Timezone, see the [tz database list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones#List)  |
| `-v /config`    | Persistent config, logs, uploads, and per-user databases - this is `THELOUNGE_HOME` inside the container |

### User / group ownership

Volume permission mismatches between the host and container are avoided by setting `PUID`/`PGID` to match whatever user on the host owns the mapped `/config` directory. Find yours with:

```bash
id your_user
```

and match `PUID`/`PGID` to the `uid`/`gid` printed there.

## Application setup

1. Start the container once to let it populate `/config`.
2. **Stop the container.**
3. From the host, edit `config.js` in wherever you've mapped `/config`, and set:
   ```js
   public: false,
   ```
   (the image's Dockerfile bakes in `public: true` as the built-in default - see the warning above; a private, login-required instance needs this flipped explicitly, every time, on every fresh volume).
4. Start the container again.
5. For each user:
   ```bash
   docker exec -it thelounge s6-setuidgid abc thelounge add <user>
   ```
   You'll be prompted for a password (not echoed).
6. Browse to `http://<hostip>:9000` - you should be prompted to log in, not dropped straight into a public instance.

Leave `fileUpload` and `prefetch` off in `config.js` unless you specifically need them - both proxy attacker-influenced URLs server-side (inherited from upstream, not fork-specific), and are off by default for that reason.

## Migrating from a bare Linux install (npm/systemd, no Docker)

If you're currently running The Lounge directly on a server (installed via `npm`/`yarn`, started via `systemd` or similar - not Docker), here's how to move that same data over:

1. **Find your existing `THELOUNGE_HOME`.** Default is `~/.thelounge` for whatever user ran it, unless you set `THELOUNGE_HOME` explicitly (check your systemd unit's `Environment=` lines, or however you launched it, if unsure). It should contain `config.js`, a `users/` directory, and (if logging is enabled) `logs/`.
2. **Stop the existing service** (`systemctl stop thelounge` or equivalent) so nothing is writing to it during the copy.
3. **Copy the whole directory's contents** into wherever you'll map the container's `/config` volume:
   ```bash
   sudo cp -a /home/youruser/.thelounge/. /path/to/thelounge/config/
   ```
   (`-a` preserves structure/permissions during the copy; you'll fix ownership for the container in the next step regardless.)
4. **Set ownership to match the `PUID`/`PGID` you'll run the container as:**
   ```bash
   sudo chown -R 1000:1000 /path/to/thelounge/config
   ```
   (matching whatever `PUID`/`PGID` you put in your compose file/`docker run` command.)
5. **Start the container** (`docker compose up -d`). First startup does two things you should expect, not worry about:
   - The normal schema check/migration this fork already ran before (near-instant unless your install predates recent schema changes).
   - If your data was ever touched by an _earlier_ build of this fork (before search moved into a separate sidecar file), a one-time automatic repair - see `MIGRATION.md`'s "Is this reversible?" section for exactly what this does. On a large message history this can take real time (minutes); check `docker logs -f thelounge` if the container seems to be taking a while rather than assuming it's stuck.
6. **Verify:** browse to `http://<host>:9000`, confirm your users/networks/history are all there, then decommission the old systemd service once you're satisfied.

## Migrating from another thelounge Docker image

If you're already running an LSIO-family image (this fork's own predecessor `fHori/docker-thelounge`, [cmd430/docker-thelounge](https://github.com/cmd430/docker-thelounge), or [linuxserver/docker-thelounge](https://github.com/linuxserver/docker-thelounge)) — these all use the same `/config` convention this image does, so migrating is just swapping the image:

1. Stop the existing container.
2. Change the `image:` line in your compose file (or the image argument in your `docker run` command) to `ghcr.io/fhori/thelounge:latest` - keep the same volume mapping, same `PUID`/`PGID`/`TZ`, same port mapping.
3. Start the new container against the same volume. No file copying needed - it's the same path convention, same `/config` layout.

If you're coming from a **non-LSIO** image (e.g. the plain upstream `thelounge/thelounge` Docker Hub image, which uses a different internal home-directory convention), check that image's own docs for where it stores its `THELOUNGE_HOME` equivalent before mapping it - the copy approach in the bare-Linux section above (copy the contents into your new `/config` mapping, then fix ownership) works the same way regardless of where it's coming from.

## Updating

```sh
docker compose pull
docker compose up -d
```

Same repair/migration behavior as any other restart described above applies - nothing extra to do for a routine update.

## Read-only operation

This image can run with a read-only container filesystem, same as upstream LSIO images - see [their docs on it](https://docs.linuxserver.io/misc/read-only/) for the general mechanism (add `--read-only=true` plus the tmpfs mounts it describes).

## Where to look if something's wrong

- Data compatibility, reversibility, and what's actually different about this fork: [`MIGRATION.md`](./MIGRATION.md).
- Security issues specific to this fork: [`SECURITY.md`](./SECURITY.md).
- Everything else / bugs: [GitHub issues on fHori/thelounge](https://github.com/fHori/thelounge/issues).
