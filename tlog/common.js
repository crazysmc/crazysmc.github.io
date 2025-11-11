'use strict';

function setHref (a, href, text)
{
  if (arguments.length == 3 ? text != undefined : href)
    a.href = href;
  else
    a.removeAttribute ('href');
  if (arguments.length == 3)
    a.textContent = text ?? '—';
}

function displayError (info)
{
  if (!info.errors)
    return;
  const error = conf.cards.content.querySelector ('.error')
    .cloneNode (true);
  error.querySelector ('span')
    .textContent = JSON.stringify (info.errors);
  showDialog (error);
}

function showDialog (dialog)
{
  document.getElementById ('dialogs')
    .append (dialog);
  dialog.querySelector ('input')
    .addEventListener ('click', () => { dialog.remove (); });
}

function makeCard (edge)
{
  const card = conf.cards.content.firstElementChild.cloneNode (true);
  card.children[1].textContent = edge.node?.displayName ?? '<deleted>';
  const when = edge.grantedAt ?? edge.followedAt;
  if (when)
  {
    card.children[2].dateTime = when;
    card.children[2].textContent = when.replace (/T.*/, '');
    card.title = when + '\n' + card.title;
  }
  if (edge.node?.profileImageURL)
    card.children[0].src = edge.node.profileImageURL;
  else
    card.children[0].remove ();
  card.dataset.id = edge.node?.id ?? '-null-';
  changed (edge.node?.id, edge.node?.login);
  card.addEventListener ('click', selectUser);
  card.addEventListener ('contextmenu', openUser);
  return card;
}

function changed (id, login)
{
  if (!id || !login)
    return;
  const prevLogin = localStorage[id];
  if (prevLogin && prevLogin != login)
  {
    const rename = conf.cards.content.querySelector ('.rename')
      .cloneNode (true);
    const codes = rename.querySelectorAll ('code');
    codes[0].textContent = id;
    codes[1].textContent = prevLogin;
    codes[2].textContent = login;
    showDialog (rename);
  }
  try
  {
    localStorage[id] = login;
  }
  catch (e)
  {
    console.error (e);
  }
}

function save (obj, name)
{
  const json = JSON.stringify (obj);
  const blob = new Blob ([ json ], { type: 'application/json' });
  const a = document.createElement ('a');
  a.href = URL.createObjectURL (blob);
  a.download = name;
  document.body.append (a);
  a.click ();
  a.remove ();
}
