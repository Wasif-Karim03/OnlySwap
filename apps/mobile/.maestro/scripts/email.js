// A unique e2e address for this run: e2e-<tag>-<time>@e2e.onlyswap.test
// (not e2e+: sign-up folds +tags into one account since 0221).
output.email = `e2e-${TAG}-${Date.now().toString(36)}@e2e.onlyswap.test`;
