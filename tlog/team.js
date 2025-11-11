'use strict';

const opt = new URLSearchParams (location.search);
const conf = {};

addEventListener ('load', init);
addEventListener ('popstate', checkParam);

function init ()
{
  conf.cards = document.getElementById ('cards');
  document.forms.tlog.addEventListener ('submit', query);
  document.forms.tlog.saveTeam.addEventListener ('click', saveTeam);
  document.getElementById ('dialogs')
    .replaceChildren ();
  document.forms.tlog.team.value = opt.get ('q') ?? '';
  checkParam ();
}

function checkParam (event)
{
  if (event?.state)
  {
    opt.set ('q', event.state);
    document.title =
      `Team ${event.state} – tLog – User viewer for Twitch`;
  }
  document.forms.tlog.team.value = opt.get ('q') ?? '';
  query ();
}

async function query (event)
{
  event?.preventDefault?.();
  const text = document.forms.tlog.team.value.trim ();
  const variables = parse (text);
  const info = variables ? await getTeamInfo (variables) ?? {} : {};
  displayError (info);
  const team = info.data?.team ?? {};
  conf.team = team;

  if (team.name && !opt.has ('q', team.name))
  {
    const url = new URL (location);
    url.searchParams.set ('q', team.name);
    history.pushState (team.name, '', url);
  }
  if (team.name)
    document.title = `Team ${team.name} – tLog – User viewer for Twitch`;
  else
    document.title = 'tLog/team – User viewer for Twitch';

  for (const key of [ 'id', 'displayName', 'description' ])
    document.getElementById (key)
      .textContent = team[key] ?? '—';
  setHref (document.getElementById ('name'),
           `https://www.twitch.tv/team/${team.name}`, team.name);

  for (const key of [ 'backgroundImage', 'banner', 'logo' ])
  {
    const value = team[key + 'URL'];
    const image = document.getElementById (key);
    image.textContent = value?.replace (/.*\./, '') ?? '—';
    setHref (image, value);
  }

  const owner = document.getElementById ('owner');
  if (team.owner)
    owner.replaceChildren (makeCard ({ node: team.owner }));
  else
    owner.textContent = '—';

  const list = document.getElementById ('members');
  list.textContent = '—';
  if (team.members?.totalCount)
    list.textContent = team.members.totalCount + ' ';
  if (team.members?.edges?.length)
  {
    let cursor;
    for (const edge of team.members.edges)
    {
      list.append (makeCard (edge));
      cursor = edge.cursor;
    }
    if (team.members.pageInfo?.hasNextPage)
    {
      const more = conf.cards.content.lastElementChild.cloneNode (true);
      more.dataset.cursor = cursor;
      more.addEventListener ('click', moreMembers);
      list.append (more);
    }
  }
}

function moreMembers (event)
{
  event.preventDefault ();
  if (!conf.team?.name)
    return;
  moreMembersLoad (event.currentTarget, event.shiftKey);
}

async function moreMembersLoad (more, repeat)
{
  more.disabled = true;
  do
  {
    const variables = {
      name: conf.team.name,
      cursor: more.dataset.cursor,
    };
    const info = await getTeamMore (variables) ?? {};
    displayError (info);
    const team = info.data?.team ?? {};
    conf.team.members.pageInfo = team.members?.pageInfo;
    const edges = team.members?.edges ?? [];
    conf.team.members.edges.push (...edges);

    let cursor;
    for (const edge of edges)
    {
      more.before (makeCard (edge));
      cursor = edge.cursor;
    }
    if (team.members?.pageInfo?.hasNextPage)
      more.dataset.cursor = cursor;
    else
    {
      more.remove ();
      return;
    }
    await new Promise (resolve => { setTimeout (resolve, 200); });
  }
  while (repeat);
  more.disabled = false;
}

function selectUser (event)
{
  event.preventDefault ();
  open ('index.html?q=' + event.currentTarget.dataset.id, '_self');
}

function openUser (event)
{
  event.preventDefault ();
  open ('index.html?q=' + event.currentTarget.dataset.id, '_blank');
}

function parse (text)
{
  text = text.replace (/^.*\//, '');
  if (/^\w+$/.test (text))
    return { name: text };
}

function saveTeam (event)
{
  event.preventDefault ();
  if (!conf.team?.id)
    return;
  save (conf.team, `tlog-${conf.team.name}-team.json`);
}
