-- Create referral_codes table
create table if not exists public.referral_codes (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percent')),
  discount_amount numeric not null,
  max_uses int,
  current_uses int default 0,
  expires_at timestamptz,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Create referral_usages table
create table if not exists public.referral_usages (
  id uuid default gen_random_uuid() primary key,
  referral_code_id uuid references public.referral_codes(id),
  user_id uuid references auth.users(id),
  transaction_id text,
  used_at timestamptz default now()
);

-- Add columns to payment_transactions
alter table public.payment_transactions 
add column if not exists referral_code text,
add column if not exists discount_amount numeric default 0;

-- Enable RLS
alter table public.referral_codes enable row level security;
alter table public.referral_usages enable row level security;

create policy "Enable read access for all users" on public.referral_codes for select using (true);
create policy "Enable read access for all users" on public.referral_usages for select using (true);

-- RPC Function to verify code
create or replace function public.verify_referral_code(code_input text)
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

  if ref_code.max_uses is not null and ref_code.current_uses >= ref_code.max_uses then
    return json_build_object('valid', false, 'message', 'Kode sudah mencapai batas penggunaan');
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
