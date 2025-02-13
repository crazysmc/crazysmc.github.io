'use strict';

const pronouns = { def: {}, user: {} };

addEventListener ('load', initPronouns);

function initPronouns ()
{
  if (conf.noPronouns)
    return;
  fetch ('https://api.pronouns.alejo.io/v1/pronouns')
    .then (response => response.json ())
    .then (json => { pronouns.def = json; })
    .catch (console.error);
  setInterval (reducePronouns, 300000);
}

function reducePronouns ()
{
  const oldest = Date.now () - 900000;
  for (const name of Object.keys (pronouns.user))
    if (pronouns.user[name].since < oldest)
      delete pronouns.user[name];
}

async function getPronouns (name)
{
  const cached = pronouns.user[name];
  if (cached)
  {
    if (cached.text)
      return cached.text;
    throw new Error ();
  }
  pronouns.user[name] = { since: Date.now () };
  const response = await
    fetch (`https://api.pronouns.alejo.io/v1/users/${name}`);
  const json = await response.json ();
  const main = pronouns.def[json.pronoun_id];
  const alt = pronouns.def[json.alt_pronoun_id];
  const text = alt ? `${main.subject}/${alt.subject}`
                   : main.singular ? main.subject
                                   : `${main.subject}/${main.object}`;
  pronouns.user[name].text = text;
  return text;
}
