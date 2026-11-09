(() => {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const newChoice = () => ({ n: '', p: 0 });
  const optionId = () => 'opt_' + Math.random().toString(36).slice(2, 10);

  function mount(form) {
    const host = form.querySelector('[data-product-options]');
    let saved = [], groups = [], changed = false;

    function render() {
      host.innerHTML = `
        <div class="row sp wrap" style="margin-bottom:8px">
          <b>Product options</b>
          <button type="button" class="btn s sm" data-add-group>Add option group</button>
        </div>
        ${groups.map((group, index) => `
          <fieldset class="panel" data-option-group style="min-width:0;margin-bottom:12px">
            <legend>Option group ${index + 1}</legend>
            <div class="two">
              <label class="field">Group name
                <input class="in" data-label value="${escape(group.label)}" placeholder="e.g. Size">
              </label>
              <label class="field">Selection type
                <select class="in" data-type>
                  <option value="radio">Choose one</option>
                  <option value="checkbox" ${group.type === 'checkbox' ? 'selected' : ''}>Choose multiple</option>
                </select>
              </label>
            </div>
            <label class="row" style="margin-bottom:12px">
              <input type="checkbox" data-required ${group.req ? 'checked' : ''}> Required selection
            </label>
            ${group.ch.map(choice => `
              <div class="row wrap" data-option-choice style="margin-bottom:8px">
                <input class="in" style="flex:1;min-width:120px" data-name aria-label="Choice name" placeholder="Choice name" value="${escape(choice.n)}">
                <input class="in" style="width:115px" data-price type="number" min="0" step="0.01" aria-label="Additional price in pesos" value="${escape(choice.p)}">
                <button type="button" class="btn d sm" data-remove-choice>Remove choice</button>
              </div>`).join('')}
            <div class="row wrap">
              <button type="button" class="btn s sm" data-add-choice>Add choice</button>
              <button type="button" class="btn d sm" data-remove-group>Remove group</button>
            </div>
          </fieldset>`).join('')}`;

      const changeStructure = change => {
        changed = true;
        change();
        render();
      };
      const bind = (section, selector, key, record, property = 'value') => {
        section.querySelector(selector).oninput = event => {
          changed = true;
          record[key] = event.target[property];
        };
      };

      host.querySelector('[data-add-group]').onclick = () => changeStructure(() => {
        groups.push({ id: optionId(), label: '', type: 'radio', req: false, ch: [newChoice()] });
      });
      host.querySelectorAll('[data-option-group]').forEach((section, index) => {
        const group = groups[index];
        bind(section, '[data-label]', 'label', group);
        bind(section, '[data-type]', 'type', group);
        bind(section, '[data-required]', 'req', group, 'checked');
        section.querySelector('[data-add-choice]').onclick = () => changeStructure(() => group.ch.push(newChoice()));
        section.querySelector('[data-remove-group]').onclick = () => changeStructure(() => groups.splice(index, 1));
        section.querySelectorAll('[data-option-choice]').forEach((row, choiceIndex) => {
          const choice = group.ch[choiceIndex];
          bind(row, '[data-name]', 'n', choice);
          bind(row, '[data-price]', 'p', choice);
          row.querySelector('[data-remove-choice]').onclick = () => changeStructure(() => group.ch.splice(choiceIndex, 1));
        });
      });
    }

    function set(options) {
      saved = options ?? [];
      groups = Array.isArray(saved) ? saved.map(group => ({
        ...group, ch: Array.isArray(group?.ch) ? group.ch.map(choice => ({ ...choice })) : []
      })) : [];
      changed = false;
      render();
    }

    function get() {
      if (!changed) return saved;
      return groups.map(group => {
        const label = String(group.label ?? '').trim();
        if (!label) throw Error('Every option group needs a name.');
        if (!group.ch.length) throw Error(label + ' needs at least one choice.');
        const ch = group.ch.map(choice => {
          const n = String(choice.n ?? '').trim();
          const p = Number(choice.p ?? 0);
          if (!n || !Number.isFinite(p) || p < 0) throw Error('Check the choices and prices in ' + label + '.');
          return { ...choice, n, p };
        });
        return { ...group, id: group.id || optionId(), label, type: group.type === 'checkbox' ? 'checkbox' : 'radio', req: !!group.req, ch };
      });
    }

    render();
    return { set, get };
  }

  window.PapalitaOptions = { mount };
})();
