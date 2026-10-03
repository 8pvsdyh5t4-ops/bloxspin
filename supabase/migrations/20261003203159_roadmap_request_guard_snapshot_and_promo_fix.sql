-- Additive migration. API request records are private and never client writable.
create table if not exists public.api_requests (
  actor_id bigint not null,
  request_id uuid not null,
  fingerprint text not null,
  state text not null default 'pending' check(state in ('pending','done')),
  response jsonb,
  created_at timestamptz not null default now(),
  primary key(actor_id, request_id)
);
alter table public.api_requests enable row level security;
revoke all on public.api_requests from public,anon,authenticated;
grant all on public.api_requests to service_role;
create unique index if not exists api_requests_one_pending on public.api_requests(actor_id) where state='pending';
create index if not exists api_requests_actor_time on public.api_requests(actor_id,created_at desc);

create or replace function public.begin_api_request(p_actor bigint,p_request uuid,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare prior public.api_requests%rowtype;
begin
  perform pg_advisory_xact_lock(p_actor);
  if exists(select 1 from players where telegram_id=p_actor and blocked) then raise exception 'Account is blocked'; end if;
  select * into prior from api_requests where actor_id=p_actor and request_id=p_request;
  if found then
    if prior.fingerprint<>p_fingerprint then raise exception 'Request ID reused with different payload'; end if;
    return jsonb_build_object('state',prior.state,'response',prior.response);
  end if;
  if exists(select 1 from api_requests where actor_id=p_actor and state='pending') then
    return jsonb_build_object('state','busy');
  end if;
  if (select count(*) from api_requests where actor_id=p_actor and created_at>now()-interval '10 seconds')>=30 then
    return jsonb_build_object('state','rate_limited');
  end if;
  insert into api_requests(actor_id,request_id,fingerprint) values(p_actor,p_request,p_fingerprint);
  return jsonb_build_object('state','new');
end $$;
create or replace function public.finish_api_request(p_actor bigint,p_request uuid,p_response jsonb) returns void
language sql security definer set search_path=public as $$
  update api_requests set state='done',response=p_response where actor_id=p_actor and request_id=p_request and state='pending';
$$;
revoke all on function public.begin_api_request(bigint,uuid,text),public.finish_api_request(bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_api_request(bigint,uuid,text),public.finish_api_request(bigint,uuid,jsonb) to service_role;

-- Keep existing combat's active item and persisted equipment synchronized.
create or replace function public.sync_active_equipment() returns trigger
language plpgsql security definer set search_path=public as $$
declare slot_name text;
begin
  delete from player_equipment where player_id=new.telegram_id and item_id=old.equipped_id;
  slot_name:=case new.equipped_id when 'block' then 'armor' when 'sword' then 'weapon' when 'eclipse_blade' then 'weapon' when 'pet' then 'pet' when 'nova_pet' then 'pet' when 'crystal' then 'aura' when 'void_relic' then 'aura' when 'crown' then 'crown' when 'secret' then 'skin' end;
  if slot_name is not null and exists(select 1 from inventory where player_id=new.telegram_id and item_id=new.equipped_id and count>0) then
    insert into player_equipment(player_id,slot,item_id) values(new.telegram_id,slot_name,new.equipped_id)
    on conflict(player_id,slot) do update set item_id=excluded.item_id,equipped_at=now();
  end if;
  return new;
end $$;
revoke all on function public.sync_active_equipment() from public,anon,authenticated;
drop trigger if exists players_active_equipment on public.players;
create trigger players_active_equipment after update of equipped_id on public.players for each row execute function public.sync_active_equipment();
CREATE OR REPLACE FUNCTION public.player_snapshot(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  select jsonb_build_object(
    'player', to_jsonb(p),
    'inventory', coalesce((select jsonb_object_agg(i.item_id, i.count) from inventory i where i.player_id=p_id and i.count>0), '{}'::jsonb),
    'discovered', coalesce((select jsonb_object_agg(i.item_id, i.discovered) from inventory i where i.player_id=p_id and i.discovered), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(x order by x.created_at desc) from (select symbols,bet,win,created_at from spin_history where player_id=p_id order by created_at desc limit 10) x), '[]'::jsonb),
    'daily', coalesce((select to_jsonb(d) from daily_progress d where d.player_id=p_id and d.day=current_date), jsonb_build_object('spins',0,'wins',0,'items',0)),
    'weekly', coalesce((select to_jsonb(w) from weekly_progress w where w.player_id=p_id and w.week_key=current_week_key()), jsonb_build_object('spins',0,'wins',0,'items',0,'week_key',current_week_key())),
    'season', coalesce((select to_jsonb(s) from season_progress s where s.player_id=p_id and s.season_key=current_season_key()), jsonb_build_object('points',0,'claimed','{}'::jsonb,'season_key',current_season_key())),
    'claims', jsonb_build_object(
      'daily', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period=current_date::text),'[]'::jsonb),
      'weekly', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period=current_week_key()),'[]'::jsonb),
      'once', coalesce((select jsonb_agg(mission_id) from mission_claims where player_id=p_id and period='once'),'[]'::jsonb)
    ),
    'leaderboard', coalesce((select jsonb_agg(to_jsonb(l)) from (select telegram_id,display_name,username,balance,level from players where not blocked order by balance desc limit 50) l), '[]'::jsonb),
    'globalRankings', public.global_rankings(50),
    'equipment', coalesce((select jsonb_object_agg(e.slot,e.item_id) from public.player_equipment e join public.inventory i on i.player_id=e.player_id and i.item_id=e.item_id and i.count>0 where e.player_id=p_id),'{}'::jsonb),
    'tournament', (select jsonb_build_object('id',t.id,'name',t.name,'ends_at',t.ends_at,'reward_pool',t.reward_pool,'joined',exists(select 1 from tournament_entries e where e.tournament_id=t.id and e.player_id=p_id),'leaders',coalesce((select jsonb_agg(to_jsonb(q)) from (select p.display_name,e.score from tournament_entries e join players p on p.telegram_id=e.player_id where e.tournament_id=t.id order by e.score desc limit 20) q),'[]'::jsonb)) from tournaments t where t.active and now() between t.starts_at and t.ends_at order by t.ends_at limit 1),
    'referral', jsonb_build_object('code',(select referral_code from players where telegram_id=p_id),'count',(select count(*) from referrals where inviter_id=p_id)),
    'server_time', now()
  ) into result from players p where p.telegram_id=p_id;
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.apply_promo_bonus_rewards()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pc public.promo_codes%rowtype;
  p_level integer;
  up jsonb;
  owned jsonb;
begin
  select * into pc from public.promo_codes where code = new.code;
  if not found then
    raise exception 'Promo code is invalid';
  end if;

  select level, upgrades into p_level, up
  from public.players
  where telegram_id = new.player_id
  for update;

  if not found then
    raise exception 'Player not found';
  end if;

  if p_level < pc.min_level then
    raise exception 'Promo code requires level %', pc.min_level;
  end if;

  if pc.starts_at is not null and pc.starts_at > now() then
    raise exception 'Promo code is not active yet';
  end if;

  if pc.reward_crystals > 0 then
    update public.players
    set crystals = crystals + pc.reward_crystals
    where telegram_id = new.player_id;
  end if;

  if pc.reward_item is not null and btrim(pc.reward_item) <> '' and pc.reward_item_count > 0 then
    insert into public.inventory(player_id,item_id,count,discovered)
    values(new.player_id,pc.reward_item,pc.reward_item_count,true)
    on conflict(player_id,item_id)
    do update set count = public.inventory.count + excluded.count, discovered = true;
  end if;

  if pc.reward_cosmetic is not null and btrim(pc.reward_cosmetic) <> '' then
    up := coalesce(up,'{}'::jsonb);
    owned := coalesce(up #> '{cosmetics,owned}','{}'::jsonb);
    owned := owned || jsonb_build_object(pc.reward_cosmetic,true);
    up := jsonb_set(up,'{cosmetics}',coalesce(up->'cosmetics','{}'::jsonb)||jsonb_build_object('owned',owned),true);
    update public.players set upgrades = up where telegram_id = new.player_id;
  end if;

  return new;
end;
$function$;




