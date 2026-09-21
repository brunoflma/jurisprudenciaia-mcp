"use strict";

const REPOSITORY = "https://github.com/brunoflma/jurisprudenciaia-mcp";
const examples = new Map();
const tools = new Map();
const byId = (id) => document.getElementById(id);
let activeExample;
let inviteDismissed = false;
let toastTimer;

function notify(message) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

function showInvite(sourceButton) {
  if (inviteDismissed) return;
  document.querySelector(".copy-invite")?.remove();
  const invite = document.createElement("aside");
  invite.className = "copy-invite";
  invite.setAttribute("aria-label", "Conheça o conector no GitHub");
  const content = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = "Próximo passo: conhecer o conector.";
  const text = document.createElement("p");
  text.textContent = "Confira os guias no GitHub. Se o projeto for útil, use Star para salvá-lo e apoiar seu desenvolvimento.";
  const link = document.createElement("a");
  link.href = REPOSITORY;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("data-github-cta", "");
  link.textContent = "Ver e avaliar no GitHub ↗";
  content.append(heading, text, link);
  const close = document.createElement("button");
  close.className = "copy-invite-close";
  close.setAttribute("aria-label", "Fechar convite ao GitHub");
  close.textContent = "×";
  close.addEventListener("click", () => {
    inviteDismissed = true;
    invite.remove();
    sourceButton.focus();
  });
  invite.append(content, close);
  sourceButton.closest(".research-actions").after(invite);
}

async function copyPrompt() {
  if (!activeExample) return;
  try {
    await navigator.clipboard.writeText(activeExample.prompt);
    notify("Pedido copiado. Adapte o recorte e use no seu assistente.");
    showInvite(byId("copy-example"));
  } catch {
    byId("copy-fallback").value = activeExample.prompt;
    byId("copy-dialog").showModal();
    byId("copy-fallback").focus();
    byId("copy-fallback").select();
  }
}

function wireTabs(selector, activate) {
  const tabs = [...document.querySelectorAll(selector)];
  const select = (tab) => {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    activate(tab);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next]);
      tabs[next].focus();
    });
  });
}

function renderExample(id, announce = true) {
  const example = examples.get(id);
  if (!example) return;
  activeExample = example;
  byId("research-panel").setAttribute("aria-labelledby", `tab-${id}`);
  byId("example-title").textContent = example.title;
  byId("example-context").textContent = example.context;
  byId("example-question").textContent = example.question;
  byId("example-check").textContent = example.check;
  byId("example-tool-title").textContent = tools.get(example.tool).title;
  byId("example-tool-id").textContent = example.tool;
  byId("example-arguments").textContent = JSON.stringify(example.arguments, null, 2);
  byId("example-request").replaceChildren(...example.request.map((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    return item;
  }));
  if (announce) byId("demo-status").textContent = `Roteiro de ${example.label} selecionado. ${example.title}`;
}

const groupDescriptions = {
  Pesquisa: "Consultas, precedentes e informativos",
  Teses: "Apoio, divergências e comparação",
  Processos: "Pesquisa a partir do número CNJ",
  Normas: "Legislação, citações e alterações",
  Panorama: "Amostra, cronologia e entendimentos revistos"
};

function renderCatalog(catalog) {
  const groups = new Map();
  catalog.forEach((tool) => {
    if (!groups.has(tool.group)) groups.set(tool.group, []);
    groups.get(tool.group).push(tool);
  });
  byId("tool-catalog").replaceChildren(...[...groups].map(([name, entries]) => {
    const details = document.createElement("details");
    details.className = "tool-group";
    const summary = document.createElement("summary");
    const count = document.createElement("span");
    count.className = "tool-count";
    count.textContent = entries.length;
    const title = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = name;
    const subtitle = document.createElement("small");
    subtitle.textContent = groupDescriptions[name];
    title.append(strong, subtitle);
    summary.append(count, title);
    const list = document.createElement("ul");
    entries.forEach((tool) => {
      const item = document.createElement("li");
      item.className = "tool-item";
      const heading = document.createElement("h4");
      heading.textContent = tool.title;
      const code = document.createElement("code");
      code.textContent = tool.id;
      const description = document.createElement("p");
      description.textContent = tool.description;
      item.append(heading, code, description);
      list.append(item);
    });
    details.append(summary, list);
    return details;
  }));
  document.querySelectorAll("[data-tool-count]").forEach((item) => { item.textContent = catalog.length; });
}

wireTabs("[data-setup]", (tab) => {
  document.querySelectorAll(".install-panel").forEach((panel) => {
    panel.hidden = panel.id !== tab.getAttribute("aria-controls");
  });
});
const menuButton = document.querySelector(".menu-toggle");
function closeMenu() {
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Abrir navegação");
  byId("nav").classList.remove("open");
}
menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Fechar navegação" : "Abrir navegação");
  byId("nav").classList.toggle("open", open);
});
byId("nav").querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menuButton.focus();
  }
});
byId("copy-example").disabled = true;
async function loadContent() {
  try {
    const response = await fetch("assets/site-data.json");
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    data.tools.forEach((tool) => tools.set(tool.id, tool));
    data.examples.forEach((example) => examples.set(example.id, example));
    renderCatalog(data.tools);
    wireTabs("[data-example]", (tab) => renderExample(tab.dataset.example));
    renderExample("precedentes", false);
    byId("copy-example").addEventListener("click", copyPrompt);
    byId("copy-example").disabled = false;
    document.querySelectorAll("[data-example]").forEach((button) => { button.disabled = false; });
  } catch {
    byId("demo-status").textContent = "Os roteiros não carregaram. Consulte as ferramentas e instruções no GitHub.";
    notify("Não foi possível carregar os roteiros. Tente recarregar a página.");
  }
}
loadContent();
