create or replace function public.begin_api_request(p_actor bigint,p_request uuid,p_fingerprint text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare prior public.api_requests%rowtype;
begin
  perform pg_advisory_xact_lock(p_actor);
  -- Vercel functions are capped at 60 seconds. Never re-run an expired ID.
  update api_requests set state='done',response=jsonb_build_object('status',409,'body',jsonb_build_object('ok',false,'code','uncertain','error','Результат запроса не подтверждён. Проверь профиль перед новым действием.')) where actor_id=p_actor and state='pending' and created_at<now()-interval '2 minutes';
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
