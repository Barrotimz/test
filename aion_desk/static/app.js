const state = {
  board: null,
  regions: [],
  skill: "",
  drawer: null,
};

const $ = (id) => document.getElementById(id);

const VERDICT = {
  enter: "Enter",
  watch: "Watch",
  skip: "Skip",
  incomplete: "Incomplete",
  unlisted: "No price",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function kina(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  const sign = number < 0 ? "−" : "";
  const abs = Math.abs(number);
  if (abs >= 1_000_000) return sign + trim(abs / 1_000_000, abs >= 10_000_000 ? 1 : 2) + "M";
  if (abs >= 10_000) return sign + trim(abs / 1000, abs >= 100_000 ? 0 : 1) + "k";
  if (abs >= 1000) return sign + trim(abs / 1000, 2) + "k";
  return sign + Math.round(abs).toLocaleString("en-US");
}

function trim(number, digits) {
  return number.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value) * 100;
  const digits = Math.abs(number) >= 100 ? 0 : 1;
  const sign = number > 0 ? "+" : "";
  return sign + number.toFixed(digits) + "%";
}

function rate(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return trim(Number(value) * 100, 1) + "%";
}

function ago(iso) {
  if (!iso) return "time unknown";
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

function quna(amount) {
  const rate = state.board && state.board.quna && state.board.quna.kina_per_quna;
  if (!rate || amount == null) return "";
  return ` · ~${trim(amount / rate, 0)} Quna`;
}

function feesQuery() {
  const params = new URLSearchParams({
    server: $("server").value || "11304",
    sale_fee: String(Number($("sale").value) / 100),
    list_fee: String(Number($("list").value) / 100),
    min_listings: $("min-listings").value || "0",
    min_sold: $("min-sold").value || "0",
  });
  return params;
}

function bankroll() {
  const raw = $("bankroll").value;
  if (raw === "") return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function matches(tier) {
  const query = $("search").value.trim().toLowerCase();
  if (state.skill && tier.skill !== state.skill) return false;
  if (!query) return true;
  const hay = `${tier.name} ${tier.profile_label} ${tier.skill} ${tier.category}`.toLowerCase();
  return hay.includes(query);
}

function overBankroll(tier) {
  const cap = bankroll();
  return cap != null && tier.cost != null && tier.cost > cap;
}

function reason(tier) {
  if (tier.verdict === "incomplete") return "A material has no price, so the cost is unfinished.";
  if (tier.verdict === "unlisted") return "Nothing is listed, so there is no exit.";
  if (tier.flags.includes("ask_above_sales")) {
    return `Sales averaged ${kina(tier.sold_avg)} over 28 days. The ask is ${kina(tier.ask)}, so the profit uses the average.`;
  }
  if (tier.verdict === "skip" && tier.headline_roi > 0) {
    return `The ask is ${pct(tier.headline_roi)} above the craft cost. The fee takes that gap.`;
  }
  if (tier.flags.includes("thin_book")) return `${tier.listings || 0} listing${tier.listings === 1 ? "" : "s"} on the book.`;
  if (tier.flags.includes("no_sales") || tier.flags.includes("unknown_sales")) {
    return "The price is there. Recorded sales are still too few to treat it as an entry.";
  }
  if (tier.flags.includes("ask_below_sales")) {
    return `Recent sales averaged ${kina(tier.sold_avg)}. The profit uses today's ask of ${kina(tier.ask)}.`;
  }
  return `${tier.listings} listings · ${tier.units_sold} sold in 28 days.`;
}

async function loadServers() {
  const response = await fetch("/api/servers");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "Could not load servers");
  state.regions = payload.regions;
  const saved = localStorage.getItem("aion-desk-server");
  const current = saved || String(payload.default || 11304);
  $("server").innerHTML = payload.regions
    .map(
      (region) =>
        `<optgroup label="${esc(region.region)}">${region.servers
          .map(
            (server) =>
              `<option value="${server.server_id}">${esc(server.name)} · ${esc(server.faction)}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("");
  if ([...$("server").options].some((option) => option.value === current)) $("server").value = current;
}

async function loadBoard(refresh) {
  $("error").hidden = true;
  $("status").textContent = "Reading recipes and the latest asks…";
  const params = feesQuery();
  if (refresh) params.set("refresh", "1");
  const response = await fetch("/api/board?" + params.toString());
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || "Could not read the market");
  state.board = payload;
  localStorage.setItem("aion-desk-server", $("server").value);
  $("status").textContent = "";
  render();
}

function render() {
  const board = state.board;
  if (!board) return;
  const server = board.server || {};
  $("snapshot").textContent = `${server.name || "Server"} · ${server.region_name || ""} · ${server.faction || ""} · ${board.race || ""} recipes · snapshot ${ago(board.captured_at)}`;
  markPreset();
  renderSkills();
  renderStats();
  renderEntries();
  renderFamilies();
}

function markPreset() {
  const sale = Number($("sale").value);
  const list = Number($("list").value);
  document.querySelectorAll(".preset").forEach((button) => {
    const on = Number(button.dataset.sale) * 100 === sale && Number(button.dataset.list) * 100 === list;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function renderSkills() {
  const skills = [...new Set(state.board.families.map((family) => family.skill).filter(Boolean))];
  const buttons = [`<button type="button" class="chip" data-skill="" aria-pressed="${state.skill === "" ? "true" : "false"}">All</button>`]
    .concat(
      skills.map(
        (skill) =>
          `<button type="button" class="chip" data-skill="${esc(skill)}" aria-pressed="${state.skill === skill ? "true" : "false"}">${esc(skill)}</button>`,
      ),
    )
    .join("");
  $("skills").innerHTML = buttons;
}

function visibleTiers() {
  return state.board.families.flatMap((family) => family.tiers).filter(matches);
}

function renderStats() {
  const tiers = visibleTiers().filter((tier) => !overBankroll(tier));
  const entries = tiers.filter((tier) => tier.verdict === "enter");
  const bestByRecipe = new Map();
  for (const tier of entries) {
    const previous = bestByRecipe.get(tier.target_key);
    if (!previous || (tier.roi || 0) > (previous.roi || 0)) bestByRecipe.set(tier.target_key, tier);
  }
  const capital = [...bestByRecipe.values()].reduce((sum, tier) => sum + (tier.cost || 0), 0);
  const best = entries.slice().sort((a, b) => (b.roi || 0) - (a.roi || 0))[0];
  const rate = state.board.quna;
  $("stats").hidden = false;
  $("stats").innerHTML = [
    ["Entries", String(entries.length), "clear the fees and the sale minimums"],
    ["Capital for the best stops", kina(capital), "one craft of each recipe's strongest entry"],
    ["Best return", best ? pct(best.roi) : "—", best ? best.profile_label : "no entry on this filter"],
    ["Kina per Quna", rate ? trim(rate.kina_per_quna, 0) : "—", rate ? rate.name || "best chest" : "chest rate unavailable"],
  ]
    .map(([label, value, hint]) => `<div class="stat"><span>${esc(label)}</span><b>${esc(value)}</b><span>${esc(hint)}</span></div>`)
    .join("");
}

function renderEntries() {
  const entries = visibleTiers()
    .filter((tier) => tier.verdict === "enter" && !overBankroll(tier))
    .sort((a, b) => (b.roi || 0) - (a.roi || 0));
  $("entries").hidden = false;
  if (!entries.length) {
    const watches = visibleTiers()
      .filter((tier) => tier.verdict === "watch")
      .sort((a, b) => (b.roi || 0) - (a.roi || 0))
      .slice(0, 3);
    $("entry-list").innerHTML = `<div class="empty"><p>No recipe clears the fees with enough listings and sales.</p>${
      watches.length ? `<p>Closest watches: ${watches.map((tier) => `${esc(tier.name)} ${pct(tier.roi)}`).join(" · ")}</p>` : ""
    }</div>`;
    return;
  }
  $("entry-list").innerHTML = entries
    .map(
      (tier) => `<button type="button" class="entry" data-target="${tier.target_key}" data-tier="${tier.tier}">
        <span class="eyebrow">${esc(tier.skill)} · stop at ${esc(tier.short)}</span>
        <span class="item-name">${esc(tier.profile_label)}</span>
        <span class="roi">${pct(tier.roi)}</span>
        <span class="net">${kina(tier.net)} net${esc(quna(tier.net))}</span>
        <span class="meta">Cost ${kina(tier.cost)} · exit ${kina(tier.exit)} · ${tier.listings} listed · ${tier.units_sold} sold${tier.confidence === "low" ? " · thin book" : ""}</span>
        <span class="reason">${esc(reason(tier))}</span>
      </button>`,
    )
    .join("");
}

function renderFamilies() {
  const families = state.board.families.filter((family) => family.tiers.some(matches));
  $("recipes").hidden = false;
  if (!families.length) {
    $("family-list").innerHTML = `<div class="empty">No recipe matches that search.</div>`;
    return;
  }
  $("family-list").innerHTML = families
    .map((family) => {
      const tiers = family.tiers
        .map((tier) => {
          const shown = matches(tier);
          const cls = [tier.verdict, overBankroll(tier) ? "over" : ""].filter(Boolean).join(" ");
          return `<button type="button" class="tier ${cls}" data-target="${tier.target_key}" data-tier="${tier.tier}" ${shown ? "" : "hidden"}>
            <span class="short">${esc(tier.short)} · ${esc(VERDICT[tier.verdict] || tier.verdict)}</span>
            <span class="pair"><b class="net ${tier.verdict}">${pct(tier.roi)}</b><span>${kina(tier.net)}</span></span>
            <span class="ask-line">Ask ${pct(tier.headline_roi)} · cost ${kina(tier.cost)}</span>
            <span class="ask-line">${tier.listings ?? "—"} listed · ${tier.units_sold ?? "—"} sold</span>
          </button>`;
        })
        .join("");
      return `<article class="family">
        <div class="family-id">
          <span class="eyebrow">${esc(family.skill)} · ${esc(family.category)}</span>
          <h3>${esc(family.profile_label)}</h3>
        </div>
        <div class="tiers">${tiers}</div>
      </article>`;
    })
    .join("");
}

async function openDrawer(target, tier) {
  const drawer = $("drawer");
  drawer.hidden = false;
  $("drawer-body").innerHTML = `<p class="muted">Opening the recipe…</p>`;
  const params = feesQuery();
  params.set("tier", String(tier));
  const token = `${target}:${tier}`;
  state.drawer = token;
  try {
    const sheetRes = await fetch(`/api/craft/${target}?` + params.toString());
    const sheet = await sheetRes.json();
    if (!sheetRes.ok) throw new Error(sheet.detail || "Could not open the recipe");
    if (state.drawer !== token) return;
    const history = await fetch(`/api/prices/${sheet.focus.item_key}?server=${encodeURIComponent($("server").value)}&hours=168`);
    const prices = history.ok ? await history.json() : { points: [] };
    if (state.drawer !== token) return;
    $("drawer-body").innerHTML = sheetHtml(sheet, prices);
  } catch (error) {
    if (state.drawer === token) $("drawer-body").innerHTML = `<p class="error">${esc(error.message)}</p>`;
  }
}

function sheetHtml(sheet, prices) {
  const focus = sheet.focus;
  const ladder = sheet.tiers
    .map(
      (tier) => `<button type="button" data-target="${tier.target_key}" data-tier="${tier.tier}" ${tier.tier === focus.tier ? 'aria-current="true"' : ""}>
        <b>${esc(tier.short)}</b> ${esc(VERDICT[tier.verdict] || "")} · ${pct(tier.roi)} · ${kina(tier.net)}
      </button>`,
    )
    .join("");
  const keep = focus.keep || 0;
  const proceeds = focus.exit == null ? null : focus.exit * keep;
  const steps = (sheet.steps || [])
    .map((step) => {
      const rows = step.materials
        .map((material) => {
          const via = (material.via || [])
            .map((leaf) => `${leaf.name || "input"} ×${trim(Number(leaf.per_unit || 0), 2)}`)
            .join(", ");
          return `<tr>
            <td>${esc(material.name || "Material")}<br><span class="badge">${esc(material.method || "buy")}</span>${via ? `<br><span class="faint">${esc(via)}</span>` : ""}</td>
            <td>${trim(material.expected, 1)}</td>
            <td>${kina(material.unit_price)}</td>
            <td>${kina(material.subtotal)}</td>
          </tr>`;
        })
        .join("");
      return `<section class="step">
        <h4>Step ${step.step_no} · ${esc(step.result_name || "")}</h4>
        <p class="muted">${rate(step.success_rate)} success · ${rate(step.combo_probability)} combo · ${trim(step.attempts, 1)} attempts while making one ${esc(focus.short)}</p>
        <table class="mats"><thead><tr><th>Material</th><th>Expected</th><th>Each</th><th>Line</th></tr></thead><tbody>${rows}</tbody></table>
      </section>`;
    })
    .join("");
  const savings =
    focus.input_savings > focus.cost * 0.01
      ? `<p class="muted">Crafting or morphing inputs saves ${kina(focus.input_savings)} against buying every material.</p>`
      : "";
  return `<div class="sheet">
    <p class="eyebrow">${esc(focus.skill)} · ${esc(focus.short)}</p>
    <h3 id="drawer-title">${esc(focus.name)}</h3>
    <p class="roi ${focus.verdict}">${esc(VERDICT[focus.verdict] || "")} · ${pct(focus.roi)}</p>
    <p>${esc(reason(focus))}</p>
    <table class="math">
      <tr><td>Craft cost</td><td>${kina(focus.cost)}</td></tr>
      <tr><td>Exit (${esc(focus.exit_basis === "sold_avg" ? "28-day average sale" : "current ask")})</td><td>${kina(focus.exit)}</td></tr>
      <tr><td>Kept after fees</td><td>${kina(proceeds)}</td></tr>
      <tr><td>Expected net</td><td>${kina(focus.net)}${esc(quna(focus.net))}</td></tr>
      <tr><td>Ask that breaks even</td><td>${kina(focus.breakeven_ask)}</td></tr>
    </table>
    ${savings}
    <h4>Where to stop</h4>
    <div class="ladder">${ladder}</div>
    ${chart(prices.points || [], focus.breakeven_ask)}
    <p class="muted"><a href="https://aion2.exchange/items/${focus.item_key}" target="_blank" rel="noreferrer">Item on Aion2Market</a> · <a href="https://aion2.exchange/crafts/${focus.target_key}" target="_blank" rel="noreferrer">Full craft</a></p>
    ${steps}
  </div>`;
}

function chart(points, breakeven) {
  if (!points.length) return `<p class="muted">No ask history in the last 7 days.</p>`;
  const values = points.map((point) => point.close).concat(breakeven || []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 440;
  const h = 120;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? w / 2 : (index / (points.length - 1)) * (w - 8) + 4;
    const y = h - 16 - ((point.close - min) / span) * (h - 28);
    return [x, y];
  });
  const line = coords.map((pair) => pair.join(",")).join(" ");
  const breakY = breakeven == null ? null : h - 16 - ((breakeven - min) / span) * (h - 28);
  const guide =
    breakY == null
      ? ""
      : `<line x1="0" x2="${w}" y1="${breakY}" y2="${breakY}" stroke="#e4c27a" stroke-dasharray="4 4" stroke-width="1" /><text x="4" y="${Math.max(12, breakY - 4)}">break even ${esc(kina(breakeven))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Ask over the last week">
    ${guide}
    <polyline fill="none" stroke="#9dca8c" stroke-width="2" points="${line}" />
    <text x="4" y="${h - 2}">${esc(kina(points[0].close))} → ${esc(kina(points[points.length - 1].close))}</text>
  </svg>`;
}

function closeDrawer() {
  $("drawer").hidden = true;
  state.drawer = null;
}

let timer = 0;
function scheduleLoad() {
  clearTimeout(timer);
  timer = setTimeout(() => loadBoard(false).catch(showError), 250);
}

function showError(error) {
  $("status").textContent = "";
  $("error").hidden = false;
  $("error").textContent = error.message || "Something went wrong";
}

document.addEventListener("click", (event) => {
  const preset = event.target.closest(".preset");
  if (preset) {
    $("sale").value = String(Number(preset.dataset.sale) * 100);
    $("list").value = String(Number(preset.dataset.list) * 100);
    loadBoard(false).catch(showError);
    return;
  }
  const chip = event.target.closest(".chip");
  if (chip) {
    state.skill = chip.dataset.skill || "";
    render();
    return;
  }
  if (event.target.closest("[data-close]")) {
    closeDrawer();
    return;
  }
  const opener = event.target.closest("[data-target]");
  if (opener) openDrawer(opener.dataset.target, opener.dataset.tier);
});

$("server").addEventListener("change", () => loadBoard(false).catch(showError));
["sale", "list", "min-listings", "min-sold"].forEach((id) => $(id).addEventListener("input", scheduleLoad));
["search", "bankroll"].forEach((id) => $(id).addEventListener("input", render));
$("refresh").addEventListener("click", () => loadBoard(true).catch(showError));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

loadServers()
  .then(() => loadBoard(false))
  .catch(showError);
