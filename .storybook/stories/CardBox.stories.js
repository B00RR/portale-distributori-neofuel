import { html } from 'lit';
import '../../../js/ui/components/CardBox.js';

export default {
    title: 'Components/CardBox',
    component: 'card-box',
    argTypes: {
        title: { control: 'text' },
        subtitle: { control: 'text' },
        variant: {
            control: 'select',
            options: ['default', 'primary', 'success', 'warning', 'danger']
        }
    }
};

const Template = (args) => html`
  <card-box
    title="${args.title}"
    subtitle="${args.subtitle}"
    variant="${args.variant}"
  >
    <p>Questo è il contenuto della card. Può contenere testo, immagini, form o qualsiasi altro elemento HTML.</p>
    <p>Le card sono ottimi contenitori per organizzare le informazioni in modo pulito e leggibile.</p>
  </card-box>
`;

export const Default = Template.bind({});
Default.args = {
    title: 'Card Standard',
    subtitle: 'Sottotitolo opzionale',
    variant: 'default'
};

export const Primary = Template.bind({});
Primary.args = {
    title: 'Card Primaria',
    subtitle: 'Variante primary',
    variant: 'primary'
};

export const Success = Template.bind({});
Success.args = {
    title: 'Operazione Completata',
    subtitle: 'Variante success',
    variant: 'success'
};

export const Warning = Template.bind({});
Warning.args = {
    title: 'Attenzione',
    subtitle: 'Variante warning',
    variant: 'warning'
};

export const Danger = Template.bind({});
Danger.args = {
    title: 'Errore Critico',
    subtitle: 'Variante danger',
    variant: 'danger'
};

export const WithFooter = () => html`
  <card-box title="Card con Footer">
    <p>Contenuto principale della card.</p>
    <div slot="footer" style="display: flex; gap: 10px;">
      <button class="menu-button primary">Conferma</button>
      <button class="menu-button secondary">Annulla</button>
    </div>
  </card-box>
`;

export const DashboardKPI = () => html`
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
    <card-box title="Vendite Totali" variant="primary">
      <h2 style="font-size: 2.5rem; margin: 0; color: var(--primary-color);">€ 45,230</h2>
      <p style="color: var(--success-color); margin: 10px 0 0 0;">
        <i class="fas fa-arrow-up"></i> +12% vs mese scorso
      </p>
    </card-box>
    
    <card-box title="Erogazioni" variant="success">
      <h2 style="font-size: 2.5rem; margin: 0; color: var(--success-color);">1,240 L</h2>
      <p style="color: var(--text-secondary); margin: 10px 0 0 0;">Litri totali erogati</p>
    </card-box>
    
    <card-box title="Operatori Attivi" variant="default">
      <h2 style="font-size: 2.5rem; margin: 0;">12</h2>
      <p style="color: var(--text-secondary); margin: 10px 0 0 0;">Di cui 3 in turno ora</p>
    </card-box>
  </div>
`;
