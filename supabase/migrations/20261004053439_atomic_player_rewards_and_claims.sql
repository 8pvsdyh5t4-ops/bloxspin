create or replace function public.commit_player_reward(
 p_id bigint,p_expected jsonb,p_changes jsonb,p_event jsonb,
 p_item text default null,p_item_count integer default 0,
 p_progress text default null,p_claim text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare current_player players%rowtype; result jsonb;
begin
 select * into current_player from players where telegram_id=p_id for update;
 if not found or current_player.blocked then raise exception 'Player unavailable';end if;
 if exists(select 1 from jsonb_each(p_expected) e where (to_jsonb(current_player)->e.key) is distinct from e.value) then raise exception 'Profile changed, refresh and try again';end if;
 if p_claim is not null then
   insert into mission_claims(player_id,period,mission_id) values(p_id,'once',p_claim);
 end if;
 update players set
   balance=coalesce((p_changes->>'balance')::bigint,balance),
   crystals=coalesce((p_changes->>'crystals')::integer,crystals),
   xp=coalesce((p_changes->>'xp')::integer,xp),
   upgrades=coalesce(p_changes->'upgrades',upgrades)
 where telegram_id=p_id;
 if p_item is not null and p_item_count>0 then
   insert into inventory(player_id,item_id,count,discovered) values(p_id,p_item,p_item_count,true)
   on conflict(player_id,item_id) do update set count=inventory.count+excluded.count,discovered=true;
 end if;
 if p_progress is not null then perform increment_daily_progress(p_id,p_progress,1);end if;
 perform apply_player_levels(p_id);
 result:=player_snapshot(p_id);
 return result||jsonb_build_object('event',p_event);
end $$;
revoke all on function public.commit_player_reward(bigint,jsonb,jsonb,jsonb,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.commit_player_reward(bigint,jsonb,jsonb,jsonb,text,integer,text,text) to service_role;
