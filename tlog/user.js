'use strict';

const opt = new URLSearchParams (location.search);
const conf = {};

addEventListener ('load', init);
addEventListener ('popstate', checkParam);

function init ()
{
  conf.cards = document.getElementById ('cards');
  conf.preds = document.getElementById ('preds');
  document.forms.tlog.reset ();
  document.forms.tlog.addEventListener ('submit', query);
  document.forms.tlog.saveUser.addEventListener ('click', saveUser);
  document.forms.tlog.saveFollow.addEventListener ('click', saveFollow);
  document.forms.tlog.savePred.addEventListener ('click', savePred);
  document.getElementById ('follow')
    .addEventListener ('click', followers);
  document.getElementById ('pred')
    .addEventListener ('click', predictions);
  document.forms.tlog.followerOrder.addEventListener ('change', selectOrder);
  document.forms.tlog.followOrder.addEventListener ('change', selectOrder);
  document.getElementById ('dialogs')
    .replaceChildren ();
  checkParam ();
}

async function checkParam (event)
{
  if (event?.state)
  {
    opt.set ('q', event.state.id);
    document.title = event.state.login +
      ' – tLog – User viewer for Twitch';
  }
  document.forms.tlog.channel.value = opt.get ('q') ?? '';
  await query ();
  if (opt.has ('extra', 'follow'))
    followers ();
  if (opt.has ('extra', 'pred'))
    predictions ();
}

async function query (event)
{
  event?.preventDefault?.();
  for (const key of [ 'follow-extra', 'pred-extra' ])
    document.getElementById (key)
      .classList.add ('hidden');
  const text = document.forms.tlog.channel.value.trim ();
  const variables = parse (text);
  const info = variables ? await getUserInfo (variables) ?? {} : {};
  displayError (info);
  const user = info.data?.user ?? {};
  conf.user = user;
  delete conf.follow;
  delete conf.channel;

  if (user.id && !opt.has ('q', user.id))
  {
    const url = new URL (location);
    url.searchParams.set ('q', user.id);
    url.searchParams.delete ('extra');
    history.pushState ({ id: user.id, login: user.login }, '', url);
  }
  if (user.login)
    document.title = user.login + ' – tLog – User viewer for Twitch';
  else
    document.title = 'tLog – User viewer for Twitch';

  const profileImage = document.getElementById ('profileImage');
  profileImage.firstChild.src = user.small_profileImageURL ?? 'data:,';
  setHref (profileImage, user.large_profileImageURL);

  for (const key of [ 'id', 'login', 'displayName', 'description' ])
    document.getElementById (key)
      .textContent = user[key] ?? '—';
  setHref (document.getElementById ('login'), user.profileURL);
  changed (user.id, user.login);

  for (const key of [ 'created', 'updated', 'deleted' ])
  {
    const value = user[key + 'At'];
    const time = document.getElementById (key);
    time.textContent = value?.replace (/T.*/, '') ?? '—';
    time.dateTime = value ?? 'P0D';
  }
  setHref (document.getElementById ('follow'), '#follow-extra',
           user.followers?.totalCount);

  setColor (document.getElementById ('primaryColor'), user.primaryColorHex);
  for (const key of [ 'bannerImage', 'offlineImage' ])
  {
    const value = user[key + 'URL'];
    const image = document.getElementById (key);
    image.textContent = value?.replace (/.*\./, '') ?? '—';
    setHref (image, value);
  }

  document.getElementById ('rules')
    .textContent = user.chatSettings?.rules?.join (' | ') || '—';

  const roles = Object.entries (user.roles ?? {})
    .filter (([ k, v ]) => v)
    .map (([ k, v ]) => k.replace (/^is/, ''))
    .join (', ');
  document.getElementById ('roles')
    .textContent = roles || '—';
  setColor (document.getElementById ('chatColor'), user.chatColor);

  const badges = document.getElementById ('badges');
  badges.textContent = '—';
  if (user.displayBadges?.length)
  {
    badges.replaceChildren ();
    for (const badge of user.displayBadges)
    {
      const img = document.createElement ('img');
      img.alt = img.title = badge.title;
      img.src = badge.imageURL;
      badges.append (img);
    }
  }

  for (const key of [ 'mods', 'vips' ])
  {
    const list = document.getElementById (key);
    list.textContent = '—';
    if (user[key]?.edges?.length)
    {
      list.replaceChildren ();
      for (const edge of user[key].edges)
        list.append (makeCard (edge));
      if (user[key].pageInfo?.hasNextPage)
        list.append (conf.cards.content.lastElementChild.cloneNode (true));
    }
  }

  setHref (document.getElementById ('team'),
           `team.html?q=${user.primaryTeam?.name}`,
           user.primaryTeam?.displayName);
  const owner = document.getElementById ('owner');
  if (user.primaryTeam)
    owner.replaceChildren (makeCard ({ node: user.primaryTeam.owner }));
  else
    owner.textContent = '—';

  const startedValue = user.lastBroadcast?.startedAt;
  const startedTime = document.getElementById ('started');
  startedTime.textContent = startedValue?.replace (/T.*/, '') ?? '—';
  startedTime.dateTime = startedValue ?? 'P0D';

  const game = user.lastBroadcast?.game;
  setHref (document.getElementById ('game'),
           `https://www.twitch.tv/directory/category/${game?.slug}`,
           game?.displayName);
  document.getElementById ('title')
    .textContent = user.lastBroadcast?.title ?? '—';

  const count =
    (user.channel?.activePredictionEvents?.length ?? 0) +
    (user.channel?.lockedPredictionEvents?.length ?? 0) +
    (user.channel?.resolvedPredictionEvents?.edges?.length ?? 0);
  const plus = user.channel?.resolvedPredictionEvents?.pageInfo?.hasNextPage;
  setHref (document.getElementById ('pred'), '#pred-extra',
           count ? `load… (${count}${plus ? '+' : ''})` : null);

  const liveInfo = user.broadcastSettings?.liveUpNotificationInfo;
  const notif = document.getElementById ('notif');
  notif.textContent = liveInfo?.liveUpNotification ?? '—';
  notif.classList.toggle ('default', liveInfo?.isDefault);

  const options = '&style=colon&bans&chatters';
  setHref (document.getElementById ('tchat'),
           `../tchat/?join=${user.login}${options}&rm`,
           user.login ? 'tChat recent messages' : null);
}

function setColor (span, color)
{
  color = color?.replace (/^#?/, '#');
  span.textContent = color ?? '—';
  if (color)
  {
    span.style.backgroundColor = color;
    let contrastColor = `contrast-color(${color})`;
    if (!CSS.supports ('color', contrastColor))
    {
      const [ r, g, b ] = color.match (/^#(..)(..)(..)$/)
        .slice (1)
        .map (x => parseInt (x, 16));
      contrastColor = r * 0.299 + g * 0.587 + b * 0.114 <= 150
        ? 'white' : 'black';
    }
    span.style.color = contrastColor;
  }
  else
  {
    span.style.removeProperty ('background-color');
    span.style.removeProperty ('color');
  }
}

async function followers (event)
{
  event?.preventDefault?.();
  if (!conf.user?.id)
    return;
  const section = document.getElementById ('follow-extra');
  section.classList.remove ('hidden');
  section.scrollIntoView (true);

  const variables = { id: conf.user.id };
  const info = await getFollowInfo (variables) ?? {};
  displayError (info);
  const user = info.data?.user ?? {};
  conf.follow = user;

  const copy = document.getElementById ('follow')
    .textContent;
  document.getElementById ('follow2')
    .textContent = copy;

  const followedGames = document.getElementById ('followedGames');
  followedGames.textContent = '—';
  if (user.followedGames?.nodes?.length)
  {
    followedGames.replaceChildren ();
    for (const game of user.followedGames.nodes)
    {
      const a = document.createElement ('a');
      a.href = `https://www.twitch.tv/directory/category/${game.slug}`;
      a.textContent = game.displayName;
      followedGames.append (a, ' | ');
    }
    followedGames.lastChild.remove ();
  }

  document.getElementById ('following')
    .textContent = user.follows?.totalCount ?? '—';

  for (const key of [ 'asc_followers', 'desc_followers',
                      'asc_follows', 'desc_follows' ])
  {
    const list = document.getElementById (key);
    list.textContent = '—';
    if (user[key]?.edges?.length)
    {
      list.replaceChildren ();
      for (const edge of user[key].edges)
        list.append (makeCard (edge));
      if (user[key].pageInfo?.hasNextPage)
        list.append (conf.cards.content.lastElementChild.cloneNode (true));
    }
  }
}

async function predictions (event)
{
  event?.preventDefault?.();
  if (!conf.user?.id)
    return;
  const section = document.getElementById ('pred-extra');
  section.classList.remove ('hidden');
  section.scrollIntoView (true);

  const variables = { id: conf.user.id };
  const info = await getPredInfo (variables) ?? {};
  displayError (info);
  const channel = info.data?.channel ?? {};
  conf.channel = channel;

  const list = document.getElementById ('pred-list');
  list.replaceChildren ();
  for (const pred of channel.activePredictionEvents ?? [])
    list.append (makePred (pred));
  for (const pred of channel.lockedPredictionEvents ?? [])
    list.append (makePred (pred));
  let cursor;
  for (const edge of channel.resolvedPredictionEvents?.edges ?? [])
  {
    list.append (makePred (edge.node));
    cursor = edge.cursor;
  }
  if (channel.resolvedPredictionEvents?.pageInfo?.hasNextPage)
  {
    const more = conf.preds.content.lastElementChild.cloneNode (true);
    more.firstChild.dataset.cursor = cursor;
    more.firstChild.addEventListener ('click', morePredictions);
    list.append (more);
  }
  if (!list.children.length)
  {
    const li = document.createElement ('li');
    li.textContent = '—';
    list.append (li);
  }
}

function makePred (pred)
{
  const li = conf.preds.content.firstElementChild.cloneNode (true);
  li.querySelector ('.status')
    .textContent = pred.status;
  for (const key of [ 'created', 'locked', 'ended' ])
  {
    const actor = pred[key + 'By'];
    const when = pred[key + 'At'];
    let card;
    switch (actor.__typename)
    {
      case 'ExtensionClient': // TODO find a channel where this exists
        console.log (actor);
        card = document.createElement ('a');
        card.textContent = `${actor.name} (${when.replace (/T.*/, '')})`;
        card.title = when + '\n' + actor.organization?.name;
        if (actor.organization?.url)
          card.href = actor.organization.url;
        break;

      case 'User':
        card = makeCard ({ node: actor, grantedAt: when });
        break;

      default:
        if (key != 'locked' || !pred.predictionWindowSeconds)
          break;
        card = pred.predictionWindowSeconds + 's'; /* normal timeout */
    }
    if (card)
      li.querySelector ('.' + key)
        .replaceChildren (card);
  }
  li.querySelector ('.title')
    .textContent = pred.title;
  const list = li.querySelector ('.outcomes');
  for (const outcome of pred.outcomes)
  {
    const choice = conf.preds.content.children[1].cloneNode (true);
    choice.id = outcome.id;
    choice.firstChild.alt = choice.firstChild.title = outcome.badge.title;
    choice.firstChild.src = outcome.badge.imageURL;
    for (const key of [ 'title', 'totalPoints', 'totalUsers' ])
      choice.querySelector ('.' + key)
        .textContent = outcome[key];
    const predictors = choice.querySelector ('.topPredictors');
    for (const bet of outcome.topPredictors)
    {
      const card = makeCard ({ node: bet.user, grantedAt: bet.predictedAt });
      const spent = document.createElement ('small');
      spent.textContent = '−' + bet.points;
      const won = document.createElement ('small');
      won.textContent = bet.pointsWon == undefined
        ? '—' : '+' + bet.pointsWon;
      card.append (spent, won);
      predictors.append (card);
    }
    list.append (choice);
  }
  list.querySelector ('#' + CSS.escape (pred.winningOutcome?.id))
    ?.classList.add ('winning');
  return li;
}

function morePredictions (event)
{
  event.preventDefault ();
  if (!conf.user?.id)
    return;
  morePredLoad (event.currentTarget, event.shiftKey);
}

async function morePredLoad (more, repeat)
{
  more.disabled = true;
  do
  {
    const variables = {
      id: conf.user.id,
      cursor: more.dataset.cursor,
    };
    const info = await getPredMore (variables) ?? {};
    displayError (info);
    const channel = info.data?.channel ?? {};
    conf.channel.resolvedPredictionEvents.pageInfo =
      channel.resolvedPredictionEvents?.pageInfo;
    const edges = channel.resolvedPredictionEvents?.edges ?? [];
    conf.channel.resolvedPredictionEvents.edges.push (...edges);

    let cursor;
    for (const edge of edges)
    {
      more.parentElement.before (makePred (edge.node));
      cursor = edge.cursor;
    }
    if (channel.resolvedPredictionEvents?.pageInfo?.hasNextPage)
      more.dataset.cursor = cursor;
    else
    {
      more.parentElement.remove ();
      return;
    }
    await new Promise (resolve => { setTimeout (resolve, 200); });
  }
  while (repeat);
  more.disabled = false;
}

async function checkUserError () // console only, not used in the GUI
{
  if (!conf.user?.id)
    return;
  const variables = { id: conf.user.id };
  console.log (await getUserError (variables));
}

function selectOrder (event)
{
  for (const option of event.target.options)
  {
    const element = document.getElementById (option.value);
    element.classList.toggle ('hidden', !option.selected);
  }
}

function selectUser (event)
{
  event.preventDefault ();
  document.forms.tlog.channel.value = event.currentTarget.dataset.id;
  query ();
}

function openUser (event)
{
  event.preventDefault ();
  open ('?q=' + event.currentTarget.dataset.id, '_blank');
}

function parse (text)
{
  const id = /^\d+$/.exec (text);
  if (id)
    return { id: id[0] };
  const channelRe = /^(?:(?:https?:\/\/)?(?:www\.)?twitch\.tv)?\/(\w+)$/;
  const channel = channelRe.exec (text);
  if (channel)
    return { login: channel[1] };
  if (/^\w+$/.test (text))
    return { login: text };
}

function saveUser (event)
{
  event.preventDefault ();
  if (!conf.user?.id)
    return;
  save (conf.user, `tlog-${conf.user.login}.json`);
}

function saveFollow (event)
{
  event.preventDefault ();
  if (!conf.follow?.follows)
    return;
  save (conf.follow, `tlog-${conf.user.login}-follow.json`);
}

function savePred (event)
{
  event.preventDefault ();
  if (!conf.channel?.resolvedPredictionEvents)
    return;
  save (conf.channel, `tlog-${conf.user.login}-pred.json`);
}
