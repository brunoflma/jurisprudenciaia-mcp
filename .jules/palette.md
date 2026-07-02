## 2026-06-18 - Missing keyboard focus states in deployment guide
**Learning:** The static documentation/deployment guide (`docs/deploy-guide.html`) lacked visible focus indicators for keyboard navigation on crucial interactive elements like tabs and copy buttons, making it difficult to use for users relying on keyboard navigation.
**Action:** Always verify keyboard accessibility (`:focus-visible`) on custom UI elements and standalone HTML documentation files, not just main application components.

## 2024-06-24 - Missing Cursor on Checkbox Labels
**Learning:** Labels that wrap checkboxes (`<label><input type="checkbox">Text</label>`) natively toggle the checkbox when clicked, but without `cursor: pointer`, users may not realize the text is interactive. This can lead to users trying to precisely click the small checkbox input instead of the larger hit area.
**Action:** Always add `cursor: pointer` to label wrappers for checkboxes/radios, and consider a subtle text color hover state to reinforce interactivity.

## 2024-11-20 - Multi-step Visual Feedback
**Learning:** Multi-step guides often rely on checkboxes for task completion, but clicking the checkbox doesn't visually mark the entire section/step as complete, making it harder for users to track their progress at a glance.
**Action:** When working on multi-step forms or guides, add visual feedback (e.g., border color, background tint) to the entire step container when its associated task is completed.
