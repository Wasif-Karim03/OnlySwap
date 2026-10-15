#!/bin/bash
# Re-runnable security scans for OnlySwap. READ-ONLY on app code; outputs to audit/raw/sec-*.
# LOCAL only. Run from repo root: bash audit/scripts/scan/run-security-scans.sh
set -u
cd "$(git rev-parse --show-toplevel)"
R=audit/raw
mkdir -p $R
echo "== tracked env/key files"; git ls-files | grep -iE '(^|/)\.env|\.pem$|\.p8$|\.p12$|\.jks$|\.keystore|service-account' | tee $R/sec-tracked-env.txt
echo "== gitleaks (git history, redacted)"; gitleaks git --redact -v --report-format json --report-path $R/sec-gitleaks-git.json . > $R/sec-gitleaks-git.log 2>&1; tail -n 5 $R/sec-gitleaks-git.log
echo "== gitleaks (working tree, redacted)"; gitleaks dir --redact --report-format json --report-path $R/sec-gitleaks-dir.json . > $R/sec-gitleaks-dir.log 2>&1; tail -n 3 $R/sec-gitleaks-dir.log
if command -v trufflehog >/dev/null; then echo "== trufflehog git (no verify = no network)"; trufflehog git file://. --no-verification --no-update --json > $R/sec-trufflehog.json 2> $R/sec-trufflehog.log; grep -c . $R/sec-trufflehog.json; fi
echo "== osv-scanner"; osv-scanner scan --lockfile pnpm-lock.yaml --format json > $R/sec-osv.json 2> $R/sec-osv.log; tail -n 3 $R/sec-osv.log
echo "== pnpm audit"; pnpm audit --json > $R/sec-pnpm-audit.json 2>$R/sec-pnpm-audit.err; head -c 0 /dev/null
if command -v semgrep >/dev/null; then echo "== semgrep"; semgrep scan --metrics=off --config p/react --config p/typescript --config p/secrets --config p/javascript --exclude node_modules --exclude dist --exclude .next --exclude audit --json -o $R/sec-semgrep.json apps workers supabase/functions > $R/sec-semgrep.log 2>&1; tail -n 5 $R/sec-semgrep.log; fi
echo "== EXPO_PUBLIC vars"; grep -rnoE 'EXPO_PUBLIC_[A-Z0-9_]+' apps/mobile --include=*.ts --include=*.tsx --include=*.json --include=*.js --include=.env.example --exclude-dir=node_modules --exclude-dir=dist | sed 's/^[^:]*:[0-9]*://' | sort | uniq -c | tee $R/sec-expo-public.txt
echo "== service-role / secret refs in client code"; grep -rnEi 'service_role|SERVICE_ROLE|R2_SECRET|SECRET_ACCESS|PRIVATE_KEY' apps/mobile/src apps/mobile/app apps/admin/src apps/site/src apps/mobile/app.config.* 2>/dev/null | cut -c1-200 | tee $R/sec-client-secret-refs.txt
