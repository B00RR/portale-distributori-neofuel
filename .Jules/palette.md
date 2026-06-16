## 2023-10-27 - Aria Labels for Icon-only Buttons
**Learning:** Screen readers and accessibility tools require explicit descriptive text for actions when buttons only contain visual icons. Some toggle buttons like "Show/Hide Password" need their attributes updated dynamically to stay relevant.
**Action:** Ensure all `.icon-btn`, `.header-icon-btn` and generic icon-only buttons (`&times;`) use a matching `aria-label` attribute (usually same as `title`). Remember to dynamically sync these ARIA attributes if the icon toggle state is managed by javascript.
