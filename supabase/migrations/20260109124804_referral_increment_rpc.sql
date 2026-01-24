create or replace function public.increment_referral_usage(code_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.referral_codes
  set current_uses = current_uses + 1
  where id = code_id;
end;
$$;
