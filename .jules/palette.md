## 2024-06-19 - Added focus visible and hover states to deploy guide
**Learning:** Adding `:focus-visible` to interactive elements drastically improves keyboard accessibility without compromising mouse usability. Interactive tab components benefit significantly from `:hover` and `transition` states for visual feedback.
**Action:** Always ensure custom interactive elements like `.client-tab` have explicit hover and focus states, especially in static HTML files where typical frameworks might not automatically provide them.
