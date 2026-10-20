default:
    @just --list

build:
    node scripts/build.mjs

test:
    node --test tests/*.test.mjs web/knowledge/*.test.mjs web/offline/*.test.mjs

ci: test build
    node scripts/check-readme.mjs

demo: build
    @node scripts/demo.mjs

book:
    mdbook build docs/book
