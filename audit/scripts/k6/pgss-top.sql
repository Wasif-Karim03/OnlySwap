select coalesce(substring(query from '"public"\."([a-z_0-9]+)"\('), left(regexp_replace(query, '\s+', ' ', 'g'), 60)) as statement,
       calls, round(total_exec_time::numeric / calls, 2) as mean_ms, round(total_exec_time::numeric) as total_ms, round(100 * total_exec_time / sum(total_exec_time) over ()) as pct
from pg_stat_statements
where dbid = (select oid from pg_database where datname = 'postgres')
order by total_exec_time desc limit 14;
