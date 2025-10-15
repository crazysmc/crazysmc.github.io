'use strict';

const opt = new URLSearchParams (location.search);
const conf = {};

addEventListener ('load', init);
addEventListener ('popstate', checkParam);

function init ()
{
  conf.template = document.getElementById ('list');
  document.forms.tlog.reset ();
  document.forms.tlog.addEventListener ('submit', query);
  document.forms.tlog.save.addEventListener ('click', save);
  document.getElementById ('follow')
    .addEventListener ('click', followers);
  document.forms.tlog.followerOrder.addEventListener ('change', selectOrder);
  document.forms.tlog.followOrder.addEventListener ('change', selectOrder);
  checkParam ();
}

function checkParam (event)
{
  if (event?.state)
  {
    opt.set ('q', event.state.id);
    document.title = event.state.login +
      ' – tLog – User viewer for Twitch';
  }
  const q = opt.get ('q');
  document.forms.tlog.channel.value = q ?? '';
  query ();
}

async function query (event)
{
  event?.preventDefault?.();
  document.getElementById ('follow-extra')
    .classList.add ('hidden');
  const text = document.forms.tlog.channel.value.trim ();
  const variables = parse (text);
  const info = variables ? await getUserInfo (variables) ?? {} : {};
  displayError (info);
  const user = info.data?.user ?? {};
  conf.user = user;
  if (user.id && !opt.has ('q', user.id))
  {
    const url = new URL (location);
    url.searchParams.set ('q', user.id);
    history.pushState ({ id: user.id, login: user.login }, '', url);
  }
  if (user.login)
    document.title = user.login + ' – tLog – User viewer for Twitch';
  else
    document.title = 'tLog – User viewer for Twitch';

  const profileImage = document.getElementById ('profileImage');
  profileImage.firstChild.src = user.small_profileImageURL ?? '';
  if (user.large_profileImageURL)
    profileImage.href = user.large_profileImageURL;
  else
    profileImage.removeAttribute ('href');

  const login = document.getElementById ('login');
  if (user.profileURL)
    login.href = user.profileURL;
  else
    login.removeAttribute ('href');

  for (const key of [ 'id', 'login', 'displayName', 'description' ])
    document.getElementById (key)
      .textContent = user[key] ?? '—';

  for (const key of [ 'created', 'updated', 'deleted' ])
  {
    const value = user[key + 'At'];
    const time = document.getElementById (key);
    time.textContent = value?.replace (/T.*/, '') ?? '—';
    time.dateTime = value ?? 'P0D';
  }

  document.getElementById ('follow')
    .textContent = user.followers?.totalCount ?? '—';

  const primaryColor = document.getElementById ('primaryColor');
  primaryColor.textContent = user.primaryColorHex ?? '—';
  if (user.primaryColorHex)
    primaryColor.style.backgroundColor = '#' + user.primaryColorHex;
  else
    primaryColor.style.removeProperty ('background-color');

  for (const key of [ 'bannerImage', 'offlineImage' ])
  {
    const value = user[key + 'URL'];
    const image = document.getElementById (key);
    image.textContent = value?.replace (/.*\./, '') ?? '—';
    if (value)
      image.href = value;
    else
      image.removeAttribute ('href');
  }

  document.getElementById ('rules')
    .textContent = user.chatSettings?.rules?.join (' | ') || '—';

  const roles = Object.entries (user.roles ?? {})
    .filter (([ k, v ]) => v)
    .map (([ k, v ]) => k.replace (/^is/, ''))
    .join (', ');
  document.getElementById ('roles')
    .textContent = roles || '—';

  const chatColor = document.getElementById ('chatColor');
  chatColor.textContent = user.chatColor ?? '—';
  if (user.chatColor)
    chatColor.style.backgroundColor = user.chatColor;
  else
    chatColor.style.removeProperty ('background-color');

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
        list.append (conf.template.content.lastElementChild.cloneNode (true));
    }
  }

  const team = document.getElementById ('team');
  const owner = document.getElementById ('owner');
  if (user.primaryTeam)
  {
    team.href = `https://www.twitch.tv/team/${user.primaryTeam.name}`;
    team.textContent = user.primaryTeam.displayName;
    const edge = { node: user.primaryTeam.owner };
    owner.replaceChildren (makeCard (edge));
  }
  else
  {
    team.removeAttribute ('href');
    team.textContent = '—';
    owner.textContent = '—';
  }

  const startedValue = user.lastBroadcast?.startedAt;
  const startedTime = document.getElementById ('started');
  startedTime.textContent = startedValue?.replace (/T.*/, '') ?? '—';
  startedTime.dateTime = startedValue ?? 'P0D';

  document.getElementById ('game')
    .textContent = user.lastBroadcast?.game?.displayName ?? '—';
  document.getElementById ('title')
    .textContent = user.lastBroadcast?.title ?? '—';

  const options = '&style=colon&bans&chatters';
  const tchat = document.getElementById ('tchat');
  if (user.login)
  {
    tchat.href = `../tchat/?join=${user.login}${options}&rm`;
    tchat.textContent = 'tChat recent messages';
  }
  else
  {
    tchat.removeAttribute ('href');
    tchat.textContent = '—';
  }
}

function displayError (info)
{
  const error = document.getElementById ('error');
  if (info.errors)
  {
    error.textContent = JSON.stringify (info.errors);
    error.classList.remove ('hidden');
  }
  else
    error.classList.add ('hidden');
}

function makeCard (edge)
{
  const card = conf.template.content.firstElementChild.cloneNode (true);
  card.children[1].textContent = edge.node?.displayName ?? '<deleted>';
  const when = edge.grantedAt ?? edge.followedAt;
  if (when)
  {
    card.children[2].dateTime = when;
    card.children[2].textContent = when.replace (/T.*/, '');
  }
  if (edge.node?.profileImageURL)
    card.children[0].src = edge.node.profileImageURL;
  else
    card.children[0].remove ();
  card.dataset.id = edge.node?.id ?? '-null-';
  card.addEventListener ('click', selectUser);
  card.addEventListener ('contextmenu', openUser);
  return card;
}

async function followers (event)
{
  event.preventDefault ();
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

  const followedGames = user.followedGames?.nodes?.map (x => x.displayName);
  document.getElementById ('followedGames')
    .textContent = followedGames?.join (' | ') || '—';
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
        list.append (conf.template.content.lastElementChild.cloneNode (true));
    }
  }
}

function selectOrder (event)
{
  for (const option of event.target.options)
  {
    const element = document.getElementById (option.value);
    if (option.selected)
      element.classList.remove ('hidden');
    else
      element.classList.add ('hidden');
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

function save (event)
{
  event.preventDefault ();
  if (!conf.user?.id)
    return;
  const json = JSON.stringify (conf.user);
  const blob = new Blob ([ json ], { type: 'application/json' });
  const a = document.createElement ('a');
  a.href = URL.createObjectURL (blob);
  a.download = `tlog-${conf.user.login}.json`;
  document.body.append (a);
  a.click ();
  a.remove ();
}
