# SheetJS release provenance

The grade importer uses the official SheetJS CE 0.20.3 tarball rather than the stale npm-registry release.

- Publisher documentation: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Download: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
- SHA-256: 8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8
- Install: npm install --save-exact ./vendor/xlsx-0.20.3.tgz
- Tests cover Turkish XLSX, XLS and CSV imports.

Commit the archive and lockfile together. Future upgrades must verify provenance and rerun the import tests.
