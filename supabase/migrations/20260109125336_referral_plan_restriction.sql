-- Add valid_plan column
alter table public.referral_codes 
add column if not exists valid_plan text check (valid_plan in ('basic', 'pro') or valid_plan is null);

-- Update TEST123 to be PRO only (case insensitive update just in case, but value should be 'pro')
update public.referral_codes
set valid_plan = 'pro'
where code = 'TEST123';

-- Update RPC Function to verify plan
create or replace function public.verify_referral_code(code_input text, plan_input text default null)
returns json
language plpgsql
security definer
as $$
declare
  ref_code record;
begin
  select * into ref_code
  from public.referral_codes
  where code = code_input
    and is_active = true
    and (expires_at is null or expires_at > now());

  if ref_code is null then
    return json_build_object('valid', false, 'message', 'Kode tidak ditemukan atau sudah kadaluarsa');
  end if;

  -- Check Max Uses
  if ref_code.max_uses is not null and ref_code.current_uses >= ref_code.max_uses then
    return json_build_object('valid', false, 'message', 'Kode sudah mencapai batas penggunaan');
  end if;

  -- Check Valid Plan
  if ref_code.valid_plan is not null and (plan_input is null or ref_code.valid_plan != plan_input) then
     return json_build_object('valid', false, 'message', 'Kode ini hanya berlaku untuk paket ' || ref_code.valid_plan);
  end if;

  return json_build_object(
    'valid', true,
    'id', ref_code.id,
    'code', ref_code.code,
    'discount_type', ref_code.discount_type,
    'discount_amount', ref_code.discount_amount
  );
end;
$$;
