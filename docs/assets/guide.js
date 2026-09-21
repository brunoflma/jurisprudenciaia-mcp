const status = document.getElementById("guide-status");
const dialog = document.getElementById("guide-copy-dialog");
const fallback = document.getElementById("guide-copy-text");
let statusTimer;

for (const button of document.querySelectorAll("[data-copy]")) {
  const source = document.getElementById(button.dataset.copy);
  if (!source) continue;
  button.disabled = false;
  button.addEventListener("click", async () => {
    const text = source.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(statusTimer);
      status.textContent = "Copiado. Substitua os endereços de exemplo pelos do seu servidor, quando indicado.";
      status.classList.add("visible");
      statusTimer = setTimeout(() => { status.classList.remove("visible"); }, 4500);
    } catch {
      fallback.value = text;
      dialog.showModal();
      fallback.focus();
      fallback.select();
    }
  });
}

const links = [...document.querySelectorAll(".guide-sidebar nav a")];
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        if (link.hash === `#${entry.target.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      }
    }
  }, { rootMargin: "-12% 0px -60% 0px" });
  for (const link of links) {
    const section = document.getElementById(link.hash.slice(1));
    if (section) observer.observe(section);
  }
}
