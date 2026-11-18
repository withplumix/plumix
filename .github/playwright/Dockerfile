# Not built. The Smoke and e2e jobs in ci.yml run in this image, and Dependabot reads image
# references only from a Dockerfile, so this copy is what it bumps. Copy a bump into ci.yml;
# .github/scripts/check-playwright-image.mjs fails while the two or the lockfile disagree.
FROM mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f
