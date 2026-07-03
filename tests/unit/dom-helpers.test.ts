import { describe, it, expect, beforeEach } from 'vitest';
import { createEl, createIcon } from '../../js/ui/dom-helpers.js';

describe('dom-helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('createIcon', () => {
    it('creates an icon element with the provided classes', () => {
      const icon = createIcon('fas fa-plus');
      expect(icon.tagName).toBe('I');
      expect(icon.className).toBe('fas fa-plus');
    });
  });

  describe('createEl', () => {
    it('creates a basic element', () => {
      const el = createEl('div');
      expect(el.tagName).toBe('DIV');
    });

    it('sets id, classes and text', () => {
      const el = createEl('div', {
        id: 'my-id',
        classes: ['a', 'b'],
        text: 'hello'
      });
      expect(el.id).toBe('my-id');
      expect(el.classList.contains('a')).toBe(true);
      expect(el.classList.contains('b')).toBe(true);
      expect(el.textContent).toBe('hello');
    });

    it('sets attributes and dataset', () => {
      const el = createEl('div', {
        attrs: { 'aria-label': 'test' },
        dataset: { row: '1' }
      });
      expect(el.getAttribute('aria-label')).toBe('test');
      expect(el.getAttribute('data-row')).toBe('1');
    });

    it('sets style properties', () => {
      const el = createEl('div', {
        style: { color: 'red', display: 'none' }
      });
      expect(el.style.color).toBe('red');
      expect(el.style.display).toBe('none');
    });

    it('appends children', () => {
      const child1 = document.createElement('span');
      const child2 = document.createTextNode('text');
      const el = createEl('div', { children: [child1, child2] });
      expect(el.children.length).toBe(1);
      expect(el.childNodes.length).toBe(2);
    });

    it('sets input value and attributes for input/select/textarea', () => {
      const input = createEl('input', {
        type: 'text',
        name: 'username',
        value: 'john',
        placeholder: 'Enter name',
        required: true
      });
      expect(input.tagName).toBe('INPUT');
      expect((input as HTMLInputElement).type).toBe('text');
      expect((input as HTMLInputElement).name).toBe('username');
      expect((input as HTMLInputElement).value).toBe('john');
      expect(input.getAttribute('placeholder')).toBe('Enter name');
      expect(input.hasAttribute('required')).toBe(true);

      const select = createEl('select', { value: 'opt1' });
      const opt1 = createEl('option', { attrs: { value: 'opt1' }, text: 'One' });
      const opt2 = createEl('option', { attrs: { value: 'opt2' }, text: 'Two' });
      select.appendChild(opt1);
      select.appendChild(opt2);
      expect((select as HTMLSelectElement).value).toBe('opt1');

      const textarea = createEl('textarea', { value: 'notes' });
      expect((textarea as HTMLTextAreaElement).value).toBe('notes');
    });

    it('does not set value on non-input tags', () => {
      const el = createEl('div', { value: 'ignored' } as Parameters<typeof createEl>[1]);
      expect((el as HTMLDivElement).getAttribute('value')).toBeNull();
    });

    it('filters empty class strings', () => {
      const el = createEl('div', { classes: ['a', '', 'b'] });
      expect(el.className).toBe('a b');
    });
  });
});
