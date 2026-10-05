#!/usr/bin/env bash
# Downloads the logs of an EAS build into eas-build.log (git-ignored) so the
# failing step can be read. Usage: bash scripts/verify/eas-log.command <build-id>
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
id="${1:?build id}"
(cd apps/mobile && npx -y eas-cli@latest build:view "$id" --json 2>/dev/null) > /tmp/eas-build.json
node -e '
const b = JSON.parse(require("fs").readFileSync("/tmp/eas-build.json", "utf8"));
for (const u of b.logFiles || []) console.log(u);
' > /tmp/eas-log-urls.txt
: > eas-build.log
while read -r u; do curl -sL --compressed "$u" >> eas-build.log; done < /tmp/eas-log-urls.txt
echo "saved $(wc -l < eas-build.log) lines to eas-build.log"
