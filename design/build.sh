#!/usr/bin/env bash
# Rebuilds "OS_FInal Design.html" from source-parts (order matters)
cd "$(dirname "$0")/source-parts"
cat p1.html p2.html p2b.html p2c.html p3.html p4.html p5.html p6.html p7.html p9q.html p10.html p11.html p8a.html p12.html p14.html p15.html p16.html p17.html p18.html p19.html p20.html p21.html p22.html p23.html p24.html p25.html p26.html p27.html p28.html p8r.html p13.html > "../OS_FInal Design.html"
echo "Built design/OS_FInal Design.html"
