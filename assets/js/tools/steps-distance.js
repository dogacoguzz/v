// steps-distance.js: wires the steps-to-distance calculator on its guide page.
// Messages come from the container's data-msg-* attributes, so each locale page carries its own.

import { calculate, describe } from './steps-distance-core.js?v=69ef4d26';

const INPUT_FOR_FIELD = {
  steps: () => 'steps',
  stepLength: (units) => (units === 'imperial' ? 'stepLengthIn' : 'stepLengthCm'),
  height: () => 'heightCm',
  heightFt: () => 'heightFt',
  heightIn: () => 'heightIn',
};

function readMessages(root) {
  const messages = {};
  for (const [key, value] of Object.entries(root.dataset)) {
    if (key.length > 3 && key.startsWith('msg')) messages[key[3].toLowerCase() + key.slice(4)] = value;
  }
  return messages;
}

function init(root) {
  const form = root.querySelector('form');
  const output = root.querySelector('output');
  if (!form || !output) return;
  const messages = readMessages(root);
  const locale = document.documentElement.lang || 'en';
  const input = (name) => form.querySelector(`input[name="${name}"]`);
  const value = (name) => input(name)?.value ?? '';
  const choice = (name, fallback) => form.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback;

  const update = () => {
    const mode = choice('mode', 'stepLength');
    const units = choice('units', 'metric');
    root.querySelectorAll('[data-show-mode]').forEach((el) => { el.hidden = el.dataset.showMode !== mode; });
    root.querySelectorAll('[data-show-units]').forEach((el) => { el.hidden = el.dataset.showUnits !== units; });

    const result = calculate({
      mode,
      units,
      steps: value('steps'),
      stepLength: value(INPUT_FOR_FIELD.stepLength(units)),
      height: value('heightCm'),
      heightFt: value('heightFt'),
      heightIn: value('heightIn'),
    });
    form.querySelectorAll('input[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (!result.ok) input(INPUT_FOR_FIELD[result.field]?.(units))?.setAttribute('aria-invalid', 'true');
    output.textContent = describe(result, locale, messages);
    output.dataset.state = result.ok ? 'result' : 'message';
  };

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (event) => event.preventDefault());
  form.hidden = false;
  update();
}

document.querySelectorAll('[data-steps-distance]').forEach(init);
