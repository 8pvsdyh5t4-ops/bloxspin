create or replace function market_trade(p_player_id bigint, p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  listing market_listings%rowtype;
  item text := p_payload->>'item_id';
  asking bigint := coalesce((p_payload->>'price')::bigint,0);
  player players%rowtype;
  owned integer;
  active_count integer;
  commission bigint;
begin
  select * into player from players where telegram_id=p_player_id for update;
  if not found or player.blocked then raise exception 'Player unavailable'; end if;
  if p_action='sell' then
    if player.level<2 then raise exception 'Рынок открывается со 2 уровня'; end if;
    if item not in ('block','sword','pet','crystal','crown','secret') or asking not between 100 and 2000000 then raise exception 'Неверные параметры объявления'; end if;
    select count(*) into active_count from market_listings where seller_id=p_player_id and status='active';
    if active_count>=5 then raise exception 'Можно разместить не больше 5 предметов'; end if;
    select count into owned from inventory where player_id=p_player_id and item_id=item for update;
    if coalesce(owned,0)<1 then raise exception 'Предмета нет в инвентаре'; end if;
    if owned=1 and exists(
      select 1 from player_equipment where player_id=p_player_id and item_id=item
    ) then raise exception 'Сначала сними предмет'; end if;
    update inventory set count=count-1 where player_id=p_player_id and item_id=item;
    insert into market_listings(seller_id,item_id,price) values(p_player_id,item,asking) returning * into listing;
  elsif p_action='buy' then
    select * into listing from market_listings where id=(p_payload->>'listing_id')::uuid for update;
    if not found or listing.status<>'active' then raise exception 'Объявление уже недоступно'; end if;
    if listing.seller_id=p_player_id then raise exception 'Нельзя купить свой предмет'; end if;
    if player.balance<listing.price then raise exception 'Недостаточно Blox Coins'; end if;
    commission:=greatest(1,floor(listing.price*.10));
    update players set balance=balance-listing.price where telegram_id=p_player_id;
    update players set balance=balance+listing.price-commission where telegram_id=listing.seller_id;
    insert into inventory(player_id,item_id,count) values(p_player_id,listing.item_id,1)
      on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
    update market_listings set buyer_id=p_player_id,fee=commission,status='sold',sold_at=now() where id=listing.id returning * into listing;
  elsif p_action='cancel' then
    select * into listing from market_listings where id=(p_payload->>'listing_id')::uuid for update;
    if not found or listing.status<>'active' or listing.seller_id<>p_player_id then raise exception 'Объявление недоступно'; end if;
    update market_listings set status='cancelled' where id=listing.id returning * into listing;
    insert into inventory(player_id,item_id,count) values(p_player_id,listing.item_id,1)
      on conflict(player_id,item_id) do update set count=inventory.count+1,discovered=true;
  else raise exception 'Unknown market action'; end if;
  return to_jsonb(listing);
end $$;

revoke all on function market_trade(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function market_trade(bigint,text,jsonb) to service_role;
notify pgrst, 'reload schema';
