#!/usr/bin/env bash
# Second pass: peak 250 VUs / spike 500 VUs (below the local Kong 512-connection cap). Results: audit/raw/load-<name>-*.
cd "$(dirname "$0")"
run() { name=$1; shift; env "$@" ./run.sh ${SC} > /dev/null 2>&1; for e in summary.json log docker.txt pgss.txt console.txt; do [ -f ../../raw/load-$SC-$e ] && mv ../../raw/load-$SC-$e ../../raw/load-$name-$e; done; }
SC=mixed run mixed-p250 PEAK=250 SCALE=1
SC=mixed run mixed-p250-nosearch PEAK=250 SCALE=1 EXCLUDE=search,quad
SC=offer run offer-p250-hot PEAK=250 SCALE=0.5 HOT=1
SC=listing run listing-p250 PEAK=250 SCALE=0.5
SC=chat run chat-p150 PEAK=150 SCALE=0.5
touch ../../raw/load-P250DONE
