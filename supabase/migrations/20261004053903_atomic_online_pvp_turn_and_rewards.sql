create or replace function public.commit_online_pvp_turn(p_match uuid,p_version integer,p_actor bigint,p_state jsonb,p_finished boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m pvp_matches%rowtype; p players%rowtype; old jsonb; next_pvp jsonb; won boolean; rating integer; streak integer; league text; reward bigint;
begin
 select * into m from pvp_matches where id=p_match for update;
 if not found or m.status<>'active' or m.version<>p_version then raise exception 'Match changed, refresh';end if;
 if p_actor not in(m.player_one,m.player_two) or (m.state->>'turn')::bigint<>p_actor then raise exception 'Not your turn';end if;
 if p_finished then
   for p in select * from players where telegram_id in(m.player_one,m.player_two) order by telegram_id for update loop
     won:=p.telegram_id=p_actor;old:=coalesce(p.upgrades->'pvp','{}');
     rating:=greatest(0,coalesce((old->>'rating')::integer,1000)+case when won then 30 else -20 end);
     streak:=case when won then coalesce((old->>'streak')::integer,0)+1 else 0 end;
     league:=case when rating>=2100 then 'Legend' when rating>=1750 then 'Master' when rating>=1500 then 'Diamond' when rating>=1300 then 'Gold' when rating>=1100 then 'Silver' else 'Bronze' end;
     next_pvp:=old||jsonb_build_object('matches',coalesce((old->>'matches')::integer,0)+1,'wins',coalesce((old->>'wins')::integer,0)+case when won then 1 else 0 end,'losses',coalesce((old->>'losses')::integer,0)+case when won then 0 else 1 end,'streak',streak,'bestStreak',greatest(coalesce((old->>'bestStreak')::integer,0),streak),'rating',rating,'league',league);
     reward:=case when won then 1200+coalesce((m.state#>>array['players',(case when p_actor=m.player_one then m.player_two else m.player_one end)::text,'bounty'])::bigint,0) else 0 end;
     update players set balance=balance+reward,xp=xp+case when won then 160 else 45 end,upgrades=jsonb_set(upgrades,'{pvp}',next_pvp,true) where telegram_id=p.telegram_id;
     perform apply_player_levels(p.telegram_id);
     if won then perform increment_daily_progress(p.telegram_id,'pvp_wins',1);end if;
   end loop;
 end if;
 update pvp_matches set state=p_state,status=case when p_finished then 'finished' else 'active' end,winner_id=case when p_finished then p_actor else null end,version=version+1,updated_at=now() where id=p_match returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.commit_online_pvp_turn(uuid,integer,bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.commit_online_pvp_turn(uuid,integer,bigint,jsonb,boolean) to service_role;
