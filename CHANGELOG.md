# Changelog

## v0.10.1 - 20 Nov 2026

- HEAD endpoints (`indices.exists`, `exists`, `ping`, etc.) now resolve to
  `true` on 2xx and `false` on 404, like the official SDK, instead of `''` or
  throwing `ResponseError`

## v0.10.0 - 19 Nov 2026

- Honor body and querystring the way the official SDK client does

## v0.9.1 - 4 Nov 2026

- Updated Elasticsearch documentation links (./docs/*.md)

## v0.9.0 - 7 Oct 2026

- Initial Release
