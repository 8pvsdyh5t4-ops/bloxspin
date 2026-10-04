CREATE OR REPLACE FUNCTION public.admin_action(p_admin jsonb, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target bigint;
  item text;
  amount bigint;
  tournament_id uuid;
begin
  insert into public.admin_audit(admin_id,action,payload)
  values((p_admin->>'id')::bigint,p_action,p_payload);

  if p_action='overview' then
    return jsonb_build_object(
      'players',(
        select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
        from (
          select telegram_id,username,display_name,balance,crystals,level,spins,wins,blocked,is_owner,last_seen,
                 public.calculate_player_power_sql(telegram_id) as power,
                 coalesce(nullif(upgrades#>>'{pvp,rating}','')::int,1000) as pvp_rating,
                 coalesce(nullif(upgrades#>>'{tower,best}','')::int,0) as tower_best,
                 coalesce(nullif(upgrades#>>'{survivor,bestWave}','')::int,0) as survivor_best
          from public.players
          where coalesce(p_payload->>'search','')='' or telegram_id::text=trim(p_payload->>'search') or display_name ilike '%'||(p_payload->>'search')||'%' or username ilike '%'||(p_payload->>'search')||'%'
          order by last_seen desc
          limit 200
        ) x
      ),
      'totals',(
        select jsonb_build_object(
          'players',count(*),
          'coins',coalesce(sum(balance),0),
          'crystals',coalesce(sum(crystals),0),
          'spins',coalesce(sum(spins),0),
          'blocked',count(*) filter(where blocked),
          'active24h',count(*) filter(where last_seen >= now()-interval '24 hours'),
          'inventoryItems',(select coalesce(sum(count),0) from public.inventory),
          'clans',(select count(*) from public.clans),
          'marketListings',(select count(*) from public.market_listings where status='active')
        ) from public.players
      ),
      'promos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from public.promo_codes p),
      'tournaments',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from public.tournaments t),
      'config',(select config from public.game_config where id=true),
      'economy',jsonb_build_object(
        'ledgerEntries',(select count(*) from public.economy_ledger),
        'coinsIssued',(select coalesce(sum(e.amount),0) from public.economy_ledger e where e.currency='coins' and e.amount>0),
        'coinsRemoved',(select coalesce(abs(sum(e.amount)),0) from public.economy_ledger e where e.currency='coins' and e.amount<0)
      ),
      'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from (select id,admin_id,action,payload,created_at from public.admin_audit order by created_at desc limit 50) a),
      'rankings',public.global_rankings(20)
    );
  end if;

  target := nullif(p_payload->>'telegram_id','')::bigint;

  if p_action='grant_coins' then
    amount := (p_payload->>'amount')::bigint;
    update public.players set balance=greatest(0,balance+amount) where telegram_id=target;
  elsif p_action='grant_crystals' then
    amount := (p_payload->>'amount')::bigint;
    if amount<1 or amount>1000000 then raise exception 'Invalid amount'; end if;
    update public.players set crystals=crystals+amount where telegram_id=target;
    if not found then raise exception 'Player not found';end if;
  elsif p_action='set_promo_active' then
    update public.promo_codes set active=(p_payload->>'active')::boolean where code=upper(trim(p_payload->>'code'));
    if not found then raise exception 'Promo not found';end if;
  elsif p_action='set_tournament_active' then
    update public.tournaments set active=(p_payload->>'active')::boolean where id=(p_payload->>'id')::uuid;
    if not found then raise exception 'Tournament not found';end if;
  elsif p_action='grant_item' then
    item := p_payload->>'item_id';
    amount := greatest(1,coalesce((p_payload->>'count')::int,1));
    insert into public.inventory(player_id,item_id,count,discovered)
    values(target,item,amount,true)
    on conflict(player_id,item_id) do update set count=public.inventory.count+excluded.count,discovered=true;
  elsif p_action='set_blocked' then
    update public.players set blocked=coalesce((p_payload->>'blocked')::boolean,false) where telegram_id=target;
  elsif p_action='delete_player' then
    delete from public.players where telegram_id=target;
  elsif p_action='delete_promo' then
    delete from public.promo_codes where code=upper(trim(p_payload->>'code'));
  elsif p_action='create_promo' then
    perform public.admin_create_promo_v2(
      (p_admin->>'id')::bigint,
      p_payload->>'code',
      coalesce(nullif(p_payload->>'reward','')::bigint,0),
      coalesce(nullif(p_payload->>'reward_crystals','')::int,0),
      nullif(p_payload->>'reward_item',''),
      coalesce(nullif(p_payload->>'reward_item_count','')::int,0),
      nullif(p_payload->>'reward_cosmetic',''),
      coalesce(nullif(p_payload->>'max_uses','')::int,100),
      coalesce(nullif(p_payload->>'min_level','')::int,1),
      nullif(p_payload->>'starts_at','')::timestamptz,
      nullif(p_payload->>'expires_at','')::timestamptz
    );
  elsif p_action='set_config' then
    update public.game_config set config=config||p_payload,updated_at=now() where id=true;
  elsif p_action='create_tournament' then
    insert into public.tournaments(name,starts_at,ends_at,reward_pool)
    values(p_payload->>'name',coalesce((p_payload->>'starts_at')::timestamptz,now()),(p_payload->>'ends_at')::timestamptz,coalesce((p_payload->>'reward_pool')::bigint,10000))
    returning id into tournament_id;
  else
    raise exception 'Unsupported admin action';
  end if;

  return public.admin_action(p_admin,'overview','{}'::jsonb);
end;
$function$;
