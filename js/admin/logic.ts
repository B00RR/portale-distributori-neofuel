import { renderSettingsPanel } from '../ui/ui-settings-panel.js';

interface LogicViewContext {
  container: HTMLElement | null;
  actions: HTMLElement | null;
}

const logicViewContext: LogicViewContext = { container: null, actions: null };

export async function showSettingsTab(container: HTMLElement, actionsContainer: HTMLElement | null): Promise<void> {
  if (!container) { return; }
  logicViewContext.container = container;
  logicViewContext.actions = actionsContainer || null;

  // Clear Actions Container (Remove "Nuovo Modulo" / "Ricarica Cache")
  if (actionsContainer) {
    actionsContainer.innerHTML = '';
  }

  // Render Settings Shell
  container.innerHTML = `
    <section class="settings-shell" style="padding: 20px;">
      <div id="settings-content-wrapper"></div>
    </section>
  `;

  const contentWrapper = container.querySelector('#settings-content-wrapper') as HTMLElement;

  // Delegate rendering to the UI Panel
  await renderSettingsPanel(contentWrapper);
}
