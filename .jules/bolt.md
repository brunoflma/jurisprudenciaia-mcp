## 2024-06-18 - RegExp Array vs Single Pattern
**Learning:** Using an array of multiple `RegExp` objects evaluated with `.some(p => p.test(s))` is extremely slow compared to combining them into a single regex with non-capturing groups `^(?:pattern1|pattern2)$`. The JS regex engine optimizes the combined string into a state-machine resulting in ~10x performance improvement.
**Action:** When filtering out multiple known string patterns, combine them into a single `RegExp` rather than using array methods.

## 2024-06-18 - Chained Array Methods
**Learning:** Chaining `.map().filter().filter()` creates multiple intermediate arrays, significantly increasing memory allocations and GC pressure.
**Action:** Consolidate data transformation pipelines into a single `for...of` loop when performance is a bottleneck.
