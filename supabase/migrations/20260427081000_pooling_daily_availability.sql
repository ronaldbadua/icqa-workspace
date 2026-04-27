-- Pooling update: replace band-based flags with day-specific availability flags.
-- Keeps existing data by mapping prior band defaults to day columns before removing old fields.

alter table public.pooling_rules
  add column if not exists allow_sunday boolean not null default false,
  add column if not exists allow_monday boolean not null default false,
  add column if not exists allow_tuesday boolean not null default false,
  add column if not exists allow_wednesday boolean not null default false,
  add column if not exists allow_thursday boolean not null default false,
  add column if not exists allow_friday boolean not null default false,
  add column if not exists allow_saturday boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'pooling_rules'
      and c.column_name = 'allow_sun_wed_band'
  ) then
    update public.pooling_rules
    set
      allow_sunday    = coalesce(allow_sunday, false)    or coalesce(allow_sun_wed_band, false) or coalesce(allow_weekend_part_time, false),
      allow_monday    = coalesce(allow_monday, false)    or coalesce(allow_sun_wed_band, false),
      allow_tuesday   = coalesce(allow_tuesday, false)   or coalesce(allow_sun_wed_band, false),
      allow_wednesday = coalesce(allow_wednesday, false) or coalesce(allow_sun_wed_band, false) or coalesce(allow_wed_sat_band, false),
      allow_thursday  = coalesce(allow_thursday, false)  or coalesce(allow_wed_sat_band, false),
      allow_friday    = coalesce(allow_friday, false)    or coalesce(allow_wed_sat_band, false),
      allow_saturday  = coalesce(allow_saturday, false)  or coalesce(allow_wed_sat_band, false) or coalesce(allow_weekend_part_time, false);
  end if;
end $$;

alter table public.pooling_rules
  drop column if exists allow_sun_wed_band,
  drop column if exists allow_wed_sat_band,
  drop column if exists allow_weekend_part_time,
  drop column if exists is_ineligible;
