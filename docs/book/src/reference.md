# Source configuration

`web/legacy/config.mjs` owns the immutable reader contract and disabled activation. A deployment supplies its exact graph, source/curator/row binding, creation receipt and registered query definitions. No URL or local-storage switch enables a reader. `web/knowledge/config.mjs` and `web/offline/config.mjs` remain disabled independently.

Production endpoints, graph registration, read-cost acceptance, snapshot provenance and signing enrollment must be provided by the deployment owner. The public demo is not their acceptance proof. Do not distribute operator data with this repository.
