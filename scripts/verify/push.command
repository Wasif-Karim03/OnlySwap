#!/usr/bin/env bash
# Pushes build/s17-onward and tags. Output: push.log.
cd "$(dirname "$0")/../.." || exit 1
git push -u origin build/s17-onward --tags > push.log 2>&1
echo "exit $? $(date)" >> push.log
