# Updating the Elasticsearch test matrix

Use this when asked to refresh the Elasticsearch versions that CI tests
against, or when a new Elasticsearch minor or major has been released.

## Goal

`.github/workflows/workflow.yml` runs the full test suite once per entry in
`matrix.es-version`. Each entry is an exact Docker image tag
(`major.minor.patch`) of `docker.elastic.co/elasticsearch/elasticsearch`.
Keep that list small (three entries, four at most) and make each entry earn
its place. Every entry costs a full CI job on every push.

## Which versions belong in the matrix

Pick the latest patch release of each of these minors:

1. **Current minor** — the newest generally available release. This is what
   new users install.
2. **Every other minor that Elastic still maintains within the supported
   major.** Normally this is just the previous minor. Elastic ends
   maintenance of a minor shortly after the next one ships, so there are
   usually only one or two.
3. **The floor** — the oldest server version this package claims to support.
   The claim comes from the `@elastic/elasticsearch` range in
   `peerDependencies` in `package.json` (`^9.0.0` means the floor is the 9.0
   minor), unless the README states a higher minimum. The floor stays in the
   matrix even after Elastic stops maintaining it, because the client in
   `devDependencies` is newer than the floor server and that pairing is the
   one most likely to break.

Do not add:

- Minors between the floor and the maintained ones. They are end-of-life and
  bracketed by versions already tested.
- Pre-releases, release candidates, snapshots, or `latest`-style floating
  tags. Pin exact patch versions so a CI failure can be traced to a code
  change rather than a silent image update.
- A different major than the installed client's major. A 9.x client sends
  `compatible-with=9` headers, which an 8.x server rejects, so an 8.x server
  cannot be tested with the 9.x client. Supporting another major means
  supporting another client major, which is a separate decision for the
  maintainer.

## How to research the versions

Do not rely on memory for version numbers or end-of-life dates. They change
every few weeks. Look them up each time.

### 1. Get the real image tags from Elastic's registry

This is the source of truth for which tags exist. It needs an anonymous pull
token:

```bash
TOKEN=$(curl -s 'https://docker-auth.elastic.co/auth?service=token-service&scope=repository:elasticsearch/elasticsearch:pull' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -H "Authorization: Bearer $TOKEN" \
  https://docker.elastic.co/v2/elasticsearch/elasticsearch/tags/list \
  | tr ',' '\n' | tr -d '"[]{}' | sed 's/^tags://' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -t. -k1,1n -k2,2n -k3,3n \
  | awk -F. '{k=$1"."$2; last[k]=$0} END{for(k in last) print last[k]}' \
  | sort -t. -k1,1n -k2,2n
```

The output is the latest patch of every minor. The `grep` keeps only plain
`x.y.z` tags, which filters out snapshots and platform-specific variants.

### 2. Find out which minors are still maintained

Check, in order of authority:

- Elastic's end-of-life page: <https://www.elastic.co/support/eol>
- Elastic's release list: <https://github.com/elastic/elasticsearch/releases>
- <https://endoflife.date/elasticsearch> as a quick cross-check

Third-party trackers sometimes disagree with each other on dates. When they
do, Elastic's own page wins. If Elastic's page cannot be read, say so in your
summary instead of presenting a tracker's date as confirmed.

### 3. Check the client and the floor

- Read `peerDependencies` and `devDependencies` in `package.json` for the
  `@elastic/elasticsearch` versions.
- Check the client's compatibility notes for anything that changes the
  floor: <https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/installation>
- If a new Elasticsearch major is out, stop and report it. Do not add it to
  the matrix. It needs a client upgrade first (see the `upgrade-dep` flow).

## How to update the workflow

Edit `.github/workflows/workflow.yml`:

1. Replace the `es-version` list with the chosen versions, oldest first.
   Keep each one quoted so YAML treats it as a string.
2. Update the `if:` on the "Upload to codecov" step so it names the newest
   entry in the list. If it names a version that is no longer in the matrix,
   coverage silently stops uploading.
3. Leave `fail-fast: false` in place. It lets every version finish so a
   failure can be attributed to specific versions.
4. Leave the service's health check in place. It keeps tests from starting
   before Elasticsearch accepts requests.

Then update anything else that names the tested versions, such as the CI
note in `AGENTS.md` and any supported-versions statement in `README.md`.

## Verifying

- If Docker is available locally, run the integration tests against each new
  version before pushing:

  ```bash
  docker run --rm -d --name es-matrix -p 9250:9200 \
    -e discovery.type=single-node -e xpack.security.enabled=false \
    -e ES_JAVA_OPTS="-Xms1g -Xmx1g" \
    docker.elastic.co/elasticsearch/elasticsearch:<version>
  # wait for http://localhost:9250/_cluster/health to respond, then:
  CI=true ES_ENDPOINT=http://localhost:9250 bun test
  docker stop es-matrix
  ```

  Port 9250 matches the workflow and leaves an Elasticsearch already on 9200
  alone. The integration tests only run when `CI` is set, and read
  `ES_ENDPOINT` (never `ELASTICSEARCH_NODE`) so they hit the container you
  just started.
- If you cannot run them locally, say so. The matrix is only confirmed once
  the CI run on GitHub passes for every entry.

## When a version fails

Do not remove a failing version just to make CI green.

- **Current or maintained minor fails:** this is a real bug or an upstream
  behavior change. Investigate and fix it, or report it.
- **Floor fails:** report what broke and ask the maintainer to choose
  between fixing it and raising the documented minimum. Raising the minimum
  means changing the matrix, the README, and possibly `peerDependencies`
  together.

## What to report when done

- The old list and the new list.
- For each entry, why it is there (current, maintained, or floor) and where
  the support status came from.
- Anything you could not confirm, and whether tests were run locally or are
  waiting on CI.
