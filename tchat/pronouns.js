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

async function getPronouns (name)
{
  try
  {
    const cached = pronouns.user[name];
    if (cached)
      return cached.text ?? '';
    pronouns.user[name] = { since: Date.now () };
    const response = await
      fetch (`https://api.pronouns.alejo.io/v1/users/${name}`);
    if (!response.ok)
      return '';
    const json = await response.json ();
    const main = pronouns.def[json.pronoun_id];
    const alt = pronouns.def[json.alt_pronoun_id];
    const text = alt ? `${main.subject}/${alt.subject}`
                     : main.singular ? main.subject
                                     : `${main.subject}/${main.object}`;
    pronouns.user[name].text = text;
    return text;
  }
  catch (e)
  {
    displayError ('Failed to load chatter pronouns', e);
  }
}
