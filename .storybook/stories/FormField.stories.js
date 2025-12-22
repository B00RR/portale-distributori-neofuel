import { html } from 'lit';
import '../../../js/ui/components/FormField.js';

export default {
    title: 'Components/FormField',
    component: 'form-field',
    argTypes: {
        label: { control: 'text' },
        name: { control: 'text' },
        type: {
            control: 'select',
            options: ['text', 'email', 'password', 'number', 'tel', 'url', 'date', 'select', 'textarea', 'checkbox']
        },
        value: { control: 'text' },
        placeholder: { control: 'text' },
        required: { control: 'boolean' },
        disabled: { control: 'boolean' },
        error: { control: 'text' }
    }
};

const Template = (args) => html`
  <form-field
    label="${args.label}"
    name="${args.name}"
    type="${args.type}"
    value="${args.value}"
    placeholder="${args.placeholder}"
    ?required="${args.required}"
    ?disabled="${args.disabled}"
    error="${args.error}"
  ></form-field>
`;

export const TextInput = Template.bind({});
TextInput.args = {
    label: 'Nome',
    name: 'name',
    type: 'text',
    placeholder: 'Inserisci il nome',
    required: true
};

export const EmailInput = Template.bind({});
EmailInput.args = {
    label: 'Email',
    name: 'email',
    type: 'email',
    placeholder: 'utente@example.com',
    required: true
};

export const WithError = Template.bind({});
WithError.args = {
    label: 'Password',
    name: 'password',
    type: 'password',
    error: 'La password deve contenere almeno 8 caratteri',
    required: true
};

export const Disabled = Template.bind({});
Disabled.args = {
    label: 'Campo Disabilitato',
    name: 'disabled-field',
    type: 'text',
    value: 'Questo campo è disabilitato',
    disabled: true
};

export const SelectField = () => html`
  <form-field
    label="Seleziona Ruolo"
    name="role"
    type="select"
    required
  >
    <option value="">-- Seleziona --</option>
    <option value="admin">Amministratore</option>
    <option value="operator">Operatore</option>
    <option value="accountant">Contabile</option>
  </form-field>
`;

export const TextAreaField = Template.bind({});
TextAreaField.args = {
    label: 'Descrizione',
    name: 'description',
    type: 'textarea',
    placeholder: 'Inserisci una descrizione dettagliata...'
};

export const CheckboxField = Template.bind({});
CheckboxField.args = {
    label: 'Accetto i termini e condizioni',
    name: 'terms',
    type: 'checkbox',
    required: true
};
