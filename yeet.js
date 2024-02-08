'use strict';

const form = document.forms.yeet;
form.elements.boat.value = '';
form.elements.target.value = '';

function input()
{
  const boat = extractCoords(form.elements.boat.value);
  form.elements.boatxz.value = boat ? `(${boat[0]}, ${boat[1]})` : '';
  const target = extractCoords(form.elements.target.value);
  form.elements.targetxz.value = target ? `(${target[0]}, ${target[1]})` : '';
  if (boat && target)
    calcRodCoords(...boat, ...target);
}

function extractCoords(line)
{
  /* /execute in <dim> run tp @s <x> <y> <z> ... */
  const arr = line.split(/\s+/);
  const xz = arr[1] == 'in' ? [+arr[6], +arr[8]] : [+arr[0], +arr[1]];
  return isNaN(xz[0]) || isNaN(xz[1]) ? false : xz;
}

function calcRodCoords(x1, z1, x2, z2)
{
  const dx = x2 - x1;
  const dz = z2 - z1;

  const cx = Math.floor(x1 / 16);
  const cz = Math.floor(z1 / 16);

  const signxdiff = dx < 0 ? -1 : 1;
  const signzdiff = dz < 0 ? -1 : 1;

  const cxmax = cx + Math.sign(dx) * 43;
  const czmax = cz + Math.sign(dz) * 43;

  const xmax = 16 * cxmax + (dx < 0 ? 0 : 15);
  const zmax = 16 * czmax + (dz < 0 ? 0 : 15);

  const angle = (Math.atan2(-dx, dz) * 180 / Math.PI).toFixed(1);
  form.elements.angle.value = `Travel at angle ${angle}`;

  const f = { normal: 0.6, slime: 0.8, water: 0.9, ice: 0.98, blue: 0.989 };
  for (const key in f)
  {
    const newx = Math.round(dx / f[key] + x1);
    const newz = Math.round(dz / f[key] + z1);

    const newcx = Math.floor(newx / 16);
    const newcz = Math.floor(newz / 16);

    const dcx = Math.abs(newcx - cx);
    const dcz = Math.abs(newcz - cz);

    if (dcx < 2 && dcz < 2)
      form.elements[key].value = 'Too close, needs to be at least 2 chunks';
    else if (dcx >= 44 || dcz >= 44)
    {
      const x = Math.round((xmax - x1) * f[key] + x1);
      const z = Math.round((zmax - z1) * f[key] + z1);
      form.elements[key].value = 'Yeet coords are more than 43 chunks away,';
      form.elements[key].value += ` target must be (${x}, ${z}) or closer`;
    }
    else
    {
      form.elements[key].value = `(${newx}, ${newz}) in chunk (${newcx}, ${newcz})`;
      form.elements[key].value += ` – chunk distances (${dcx}, ${dcz})`;
      const maxdc = Math.max(dcx, dcz);
      form.elements[key].value += ' – render distance can be between';
      form.elements[key].value += ` ${maxdc < 15 ? 2 : maxdc - 11} and ${Math.min(32, maxdc + 1)}`;
    }
  }
}

form.addEventListener('input', input);
