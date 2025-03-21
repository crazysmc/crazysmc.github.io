'use strict';

addEventListener ('load', init);

function init ()
{
  const form = document.forms.tchat;
  form.addEventListener ('input', input);
  form.addEventListener ('submit', clip);
  input ();
}

async function clip (event)
{
  event.preventDefault ();
  await navigator.clipboard.writeText (this.elements.url.textContent);
}

function input ()
{
  const form = document.forms.tchat;
  const joins = form.elements.join.value.trim ();

  let p = '';
  for (const j of joins.split (/\s+/))
    p += '&join=' + encodeURIComponent (j);
  if (form.elements.time.value > 0)
    p += '&time=' + form.elements.time.value;
  if (form.elements.scale.value > 1)
    p += '&scale=' + form.elements.scale.value;
  if (form.elements.static.checked)
    p += '&static';

  const test = document.getElementById ('test');
  for (const opt of [
    'colon',
    'first',
  ])
    if (form.elements[opt].checked)
    {
      p += `&style=${opt}`;
      test.classList.add (opt);
    }
    else
      test.classList.remove (opt);
  if (form.elements.bots.checked)
  {
    p += `&no=bots`;
    test.classList.add ('bots');
  }
  else
    test.classList.remove ('bots');


  if (form.elements.bans.checked)
    p += '&bans';
  if (form.elements.chatters.checked)
    p += '&chatters';

  if (form.elements.noPronouns.checked)
    p += '&no=pronouns';
  if (form.elements.noBttv.checked)
    p += '&no=bttv';
  if (form.elements.noFfz.checked)
    p += '&no=ffz';
  if (form.elements.no7tv.checked)
    p += '&no=7tv';

  if (!joins)
    return;
  const url = new URL ('tchat/?' + p.slice (1), location);
  const a = document.createElement ('a');
  a.href = url;
  a.textContent = url;
  form.elements.url.replaceChildren (a);
}
