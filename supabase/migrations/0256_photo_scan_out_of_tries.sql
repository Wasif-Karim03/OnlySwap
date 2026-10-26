-- DEC 152 follow-up (2026-10-25 staging test): a photo whose third try came
-- back 'retry' stayed 'pending' with attempts = 3 forever. scan_photos only
-- called the function while some row had attempts < 3, and claim_photo_scans
-- (the only place that marked rows 'failed') never ran. Now the minute job
-- hands out-of-tries photos to moderators itself.
create or replace function private.scan_photos()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.photo_scans s set status = 'failed'
   where s.status = 'pending' and s.attempts >= 3;
  if exists (select 1 from private.photo_scans where status = 'pending' and attempts < 3) then
    return private.call_function('scan-photos');
  end if;
  return null;
end;
$$;
