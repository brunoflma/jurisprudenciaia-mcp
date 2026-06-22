## 2024-05-24 - Accessible custom tabs
**Learning:** Custom tab implementations often use `role="tab"` and `role="tablist"`, but forget to add `role="tabpanel"` to the content panels and link them via `aria-controls` and `aria-labelledby`.
**Action:** Always check custom tab components for complete ARIA attribute linkage between the tab buttons and their content panels.
