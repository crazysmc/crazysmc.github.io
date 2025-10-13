'use strict';

const opt = new URLSearchParams (location.search);

addEventListener ('load', init);

async function init ()
{
  conf.chat = document.getElementById ('chat-container');
  const template = document.getElementById ('chat-template');
  conf.template.chatLine = template.content.querySelector ('.chat-line');
  conf.template.reply = template.content.querySelector ('.reply');
  document.documentElement.classList.add (...opt.getAll ('style'));
  document.documentElement.dataset.join = conf.joins.length;
  document.documentElement.dataset.scale = conf.emoteScale;

  await getInitialAssets ();
  conf.ws.addEventListener ('open', login);
  conf.ws.addEventListener ('message', receive);
  conf.ws.open ();
  addEventListener ('beforeunload', () => { conf.ws.close (); });

  if (opt.has ('rm'))
  {
    conf.chat.style.overflowY = 'scroll';
    const save = document.getElementById ('save');
    save.addEventListener ('click', saveLog);
    save.classList.remove ('hidden');
  }
  else
    setInterval (reduceChat, 200);
  setInterval (reduceColors, 300000);
}

async function handleCmd (rid, msg)
{
  if (msg.tags.historical ||
      !/(^|,)(broadcaster|moderator)\/1/.exec (msg.tags.badges) ||
      !msg.params[1].startsWith (conf.cmdPrefix))
    return;
  const line = msg.params[1].slice (conf.cmdPrefix.length);
  const args = line.split (' ');
  switch (args[0])
  {
    case 'reload':
      const set = new Set (args.slice (1));
      for (const service of set.values ())
        reloadService (rid, msg, service);
      break;

    case 'refresh-page':
      setTimeout (() => { location.reload (true) }, 1000);
      break;
  }
}

function reloadService (rid, msg, service)
{
  const cmd = conf.reloadCmds[service];
  if (!cmd)
    return;
  if (!cmd.silent)
  {
    const notice = `Reloading ${service.toUpperCase ()} channel emotes`;
    displayChat ({ tags: { reload: service },
                   source: msg.source,
                   command: 'reload-notice',
                   params: [ msg.params[0], notice ] });
  }
  cmd (rid);
}

async function saveLog (event)
{
  const html = document.documentElement.cloneNode ();
  const header = `<!doctype html>
${html.outerHTML.replace (/<\/.*/, '')}
<meta charset=utf-8>
<meta name=viewport content="width=device-width">
<link rel=stylesheet href=https://crazysmc.github.io/tchat/style.css>
<title>tLog ${conf.joins.join (' ')}</title>
`;
  const blob = new Blob ([ header, conf.chat.outerHTML ],
                         { type: 'text/html', endings: 'native' });
  const a = document.createElement ('a');
  a.href = URL.createObjectURL (blob);
  a.download = `tchat-${conf.joins.join ('-')}-${Date.now ()}.html`;
  document.body.append (a);
  a.click ();
  a.remove ();
}

function formatDuration (info)
{
  if (!conf.duration)
    return `${info.seconds}s`;
  let balanced;
  if (window.Temporal?.Duration)
  {
    const duration = Temporal.Duration.from (info);
    balanced = duration.round ({ largestUnit: 'days' });
  }
  else
  {
    balanced = info;
    balanced.days = Math.floor (balanced.seconds / 86400);
    balanced.seconds -= 86400 * balanced.days;
    balanced.hours = Math.floor (balanced.seconds / 3600);
    balanced.seconds -= 3600 * balanced.hours;
    balanced.minutes = Math.floor (balanced.seconds / 60);
    balanced.seconds -= 60 * balanced.minutes;
  }
  return conf.duration.format (balanced);
}

function readableColor (color)
{
  const match = color?.match (/^#(..)(..)(..)$/);
  if (!match)
    return color;
  const [ r, g, b ] = [ 1, 2, 3 ].map (i => parseInt (match[i], 16));
  const [ h, s, l ] = rgb2hsl (r, g, b);
  return l >= 50 ? color : `hsl(${h} ${s}% 50%)`;
}

function rgb2hsl (r, g, b)
{
  r /= 255; g /= 255; b /= 255;
  let h, s, l;
  const cmin = Math.min (r, g, b);
  const cmax = Math.max (r, g, b);
  const delta = cmax - cmin;
  if (delta == 0)
    h = 0;
  else if (cmax == r)
    h = ((g - b) / delta) % 6;
  else if (cmax == g)
    h = (b - r) / delta + 2;
  else
    h = (r - g) / delta + 4;
  h = Math.round (h * 60);
  if (h < 0)
    h += 360;
  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs (2 * l - 1));
  s = +(s * 100).toFixed (1);
  l = +(l * 100).toFixed (1);
  return [ h, s, l ];
}

function parse (msg)
{
  const obj = { tags: {}, source: null, command: null, params: [] };
  const space = / +(.*)/;
  if (msg[0] == '@')
  {
    msg = msg.slice (1);
    let tags;
    [ tags, msg ] = msg.split (space, 2);
    for (const tag of tags.split (';'))
    {
      const [ key, val ] = tag.split (/=(.*)/, 2);
      obj.tags[key] = val.replaceAll (/\\(.?)/g, tagValue);
    }
  }
  if (msg[0] == ':')
  {
    msg = msg.slice (1);
    [ obj.source, msg ] = msg.split (space, 2);
  }
  [ obj.command, msg ] = msg.split (space, 2);
  while (msg)
  {
    if (msg[0] == ':')
    {
      obj.params.push (msg.slice (1));
      break;
    }
    let param;
    [ param, msg ] = msg.split (space, 2);
    obj.params.push (param);
  }
  return obj;
}

function tagValue (match, c)
{
  return { ':': ';', s: ' ', r: '\r', n: '\n' }[c] || c;
}
