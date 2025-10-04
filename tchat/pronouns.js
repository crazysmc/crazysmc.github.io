'use strict';

const pronouns = { def: {}, user: { __proto__: null } };

addEventListener ('load', initPronouns);

function initPronouns ()
{
  if (conf.no.pronouns)
    return;
  fetch ('https://api.pronouns.alejo.io/v1/pronouns')
    .then (response => response.json ())
    .then (json => { pronouns.def = json; })
    .catch (e => displayError ('Failed to load pronoun definitions', e));
  setInterval (reducePronouns, 300000);
}

function reducePronouns ()
{
  const oldest = Date.now () - 900000;
  for (const name in pronouns.user)
    if (pronouns.user[name].since < oldest)
      delete pronouns.user[name];
}

function reloadPronouns ()
{
  pronouns.user = { __proto__: null };
}

if (!conf.no.pronouns)
{
  conf.reloadCmds.pronouns = reloadPronouns;
  conf.reloadCmds.pronouns.silent = true;
}

async function getPronouns (name, pro, badges)
{
  try
  {
    const cached = pronouns.user[name];
    if (cached)
    {
      if (cached.text)
        setPronounsText (cached.text, pro, badges);
      else
        cached.sync.push ({ pro, badges });
      return;
    }

    pronouns.user[name] = { since: Date.now (), sync: [] };
    const response = await
      fetch (`https://api.pronouns.alejo.io/v1/users/${name}`);
    if (!response.ok)
      return;
    const json = await response.json ();
    const main = pronouns.def[json.pronoun_id];
    if (!main)
      return;
    const alt = pronouns.def[json.alt_pronoun_id];
    const text = alt ? `${main.subject}/${alt.subject}`
                     : main.singular ? main.subject
                                     : `${main.subject}/${main.object}`;
    pronouns.user[name].text = text;
    setPronounsText (text, pro, badges);
    for (const { pro, badges } of pronouns.user[name].sync)
      setPronounsText (text, pro, badges);
    delete pronouns.user[name].sync;
  }
  catch (e)
  {
    displayError ('Failed to load chatter pronouns', e);
  }
}

function setPronounsText (text, pro, badges)
{
  pro.textContent = text;
  pro.classList.remove ('hidden');
  badges.classList.remove ('hidden');
}
