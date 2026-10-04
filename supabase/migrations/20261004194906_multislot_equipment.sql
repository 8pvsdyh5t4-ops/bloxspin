-- Six independent equipment slots; legacy equipped_id remains the Spin focus.
create or replace function public.equipment_slot(p_item text)
returns text language sql immutable set search_path = public as $$
  select case p_item when 'sword' then 'weapon' when 'eclipse_blade' then 'weapon'
    when 'block' then 'armor' when 'crown' then 'crown' when 'pet' then 'pet'
    when 'nova_pet' then 'pet' when 'crystal' then 'aura' when 'void_relic' then 'aura'
    when 'secret' then 'skin' end
$$;

-- Old clients can still select or remove one item without wiping other slots.
create or replace function public.sync_active_equipment()
returns trigger language plpgsql security invoker set search_path = public as $$
declare target_slot text;
begin
  if new.equipped_id = '' then
    delete from public.player_equipment where player_id=new.telegram_id and item_id=old.equipped_id;
  else
    target_slot := public.equipment_slot(new.equipped_id);
    if target_slot is not null and exists(select 1 from public.inventory where player_id=new.telegram_id and item_id=new.equipped_id and count>0) then
      insert into public.player_equipment(player_id,slot,item_id) values(new.telegram_id,target_slot,new.equipped_id)
      on conflict(player_id,slot) do update set item_id=excluded.item_id,equipped_at=now();
    end if;
  end if;
  return new;
end $$;

delete from public.player_equipment e where public.equipment_slot(e.item_id) is distinct from e.slot
  or not exists(select 1 from public.inventory i where i.player_id=e.player_id and i.item_id=e.item_id and i.count>0);
insert into public.player_equipment(player_id,slot,item_id)
select p.telegram_id, public.equipment_slot(p.equipped_id), p.equipped_id from public.players p
join public.inventory i on i.player_id=p.telegram_id and i.item_id=p.equipped_id and i.count>0
where public.equipment_slot(p.equipped_id) is not null
on conflict(player_id,slot) do nothing;

alter table public.player_equipment add constraint equipment_item_matches_slot
check(public.equipment_slot(item_id) is not null and slot=public.equipment_slot(item_id));

create or replace function public.set_equipment_slot(p_id bigint,p_slot text,p_item text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.players where telegram_id=p_id and not blocked for update;
  if not found then raise exception 'Player not found or blocked'; end if;
  if p_slot is distinct from public.equipment_slot(p_item) or public.equipment_slot(p_item) is null then
    raise exception 'Item does not match equipment slot';
  end if;
  perform 1 from public.inventory where player_id=p_id and item_id=p_item and count>0 for update;
  if not found then raise exception 'Item not owned'; end if;
  insert into public.player_equipment(player_id,slot,item_id) values(p_id,p_slot,p_item)
  on conflict(player_id,slot) do update set item_id=excluded.item_id,equipped_at=now();
  update public.players set equipped_id=p_item where telegram_id=p_id;
end $$;

create or replace function public.toggle_equipment_item(p_id bigint,p_item text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare target_slot text := public.equipment_slot(p_item);
begin
  perform 1 from public.players where telegram_id=p_id and not blocked for update;
  if not found then raise exception 'Player not found or blocked'; end if;
  if target_slot is null then raise exception 'Invalid equipment item'; end if;
  perform 1 from public.inventory where player_id=p_id and item_id=p_item and count>0 for update;
  if not found then raise exception 'Item not owned'; end if;
  if exists(select 1 from public.player_equipment where player_id=p_id and slot=target_slot and item_id=p_item) then
    delete from public.player_equipment where player_id=p_id and slot=target_slot;
    update public.players set equipped_id='' where telegram_id=p_id and equipped_id=p_item;
  else
    perform public.set_equipment_slot(p_id,target_slot,p_item);
  end if;
  return public.player_snapshot(p_id);
end $$;

-- Selling/transferring the last copy cannot leave an invisible or stale bonus.
create or replace function public.prune_empty_equipment()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op='DELETE' or new.count<=0 then
    delete from public.player_equipment where player_id=old.player_id and item_id=old.item_id;
    update public.players set equipped_id='' where telegram_id=old.player_id and equipped_id=old.item_id;
  end if;
  return null;
end $$;
create trigger inventory_equipment_cleanup after update of count or delete on public.inventory
for each row execute function public.prune_empty_equipment();

revoke all on function public.set_equipment_slot(bigint,text,text) from public,anon,authenticated;
revoke all on function public.toggle_equipment_item(bigint,text) from public,anon,authenticated;
grant execute on function public.set_equipment_slot(bigint,text,text), public.toggle_equipment_item(bigint,text) to service_role;
revoke all on function public.sync_active_equipment(), public.prune_empty_equipment() from public,anon,authenticated;
notify pgrst, 'reload schema';
