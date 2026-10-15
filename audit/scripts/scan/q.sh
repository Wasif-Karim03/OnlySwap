#!/bin/bash
# run a SQL string against the LOCAL db, unaligned, pipe-separated
PGPASSWORD=postgres psql -h127.0.0.1 -p54322 -Upostgres -X -A -F ' | ' -c "$1"
