import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
import { NETWORK, DAO_ABI } from "./config.js";

const $ = (id) => document.getElementById(id);
const s = { filter: "abiertas", proposals: [], busy: 0 }; // estado: provider, signer, account, dao, rol, propuestas
const MAX_POR_TANDA = 50; // direcciones por transacción al cargar el padrón

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const txUrl = (hash) => `${NETWORK.explorer}/tx/${hash}`;
const now = () => Math.floor(Date.now() / 1000);
const fmtDate = (ts) => new Date(Number(ts) * 1000).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

/* ---------- Avisos (igual que el marketplace) ---------- */
function toast(msg, type = "info", link) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const text = document.createElement("span");
  text.className = "t-msg";
  text.textContent = msg + " ";
  if (link) {
    const a = document.createElement("a");
    a.href = link; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Ver transacción";
    text.appendChild(a);
  }
  const close = document.createElement("button");
  close.setAttribute("aria-label", "Cerrar"); close.textContent = "×";
  close.onclick = () => el.remove();
  el.append(text, close);
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), type === "error" ? 9000 : 6000);
}

function errorMessage(err) {
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return "Cancelaste la operación en MetaMask.";
  if (err?.code === "CALL_EXCEPTION") return `El contrato rechazó la operación${err.reason ? `: ${err.reason}` : "."}`;
  if (err?.code === "INSUFFICIENT_FUNDS") return "No tenés ETH suficiente para pagar el gas.";
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

function spin(btn, text) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> ${text}`; }

function setCheck(id, text, ok) {
  $(id).textContent = text || "";
  $(id).className = "check" + (text ? (ok ? " ok" : " bad") : "");
}

// Envía una transacción mostrando el progreso en el botón
async function send(btn, label, call, successMsg) {
  const original = btn.textContent;
  s.busy++;
  try {
    spin(btn, "Confirmá en MetaMask…");
    const tx = await call();
    spin(btn, label);
    await tx.wait();
    toast(successMsg, "success", txUrl(tx.hash));
    return true;
  } catch (err) {
    toast(errorMessage(err), "error");
    btn.disabled = false; btn.textContent = original;
    return false;
  } finally {
    s.busy--;
  }
}

/* ---------- 1. Conectar ---------- */
async function connect() {
  if (!window.ethereum) { $("no-metamask").hidden = false; return; }
  const btn = $("connect");
  spin(btn, "Esperando a MetaMask…");
  try {
    s.provider = new ethers.BrowserProvider(window.ethereum);
    await s.provider.send("eth_requestAccounts", []);
    s.chainId = Number((await s.provider.getNetwork()).chainId);
    s.signer = await s.provider.getSigner();
    s.account = await s.signer.getAddress();

    $("connect-view").hidden = true;
    $("app-view").hidden = false;
    $("wallet-chip").hidden = false;
    $("copy-address").textContent = short(s.account);

    // Solo Sepolia: en otra red mostramos el aviso para cambiar y nada más
    if (s.chainId !== NETWORK.chainId) {
      $("chip-network").textContent = "Otra red";
      document.querySelector("#wallet-chip .dot").classList.add("warn");
      $("wrong-network").hidden = false;
      return;
    }
    $("chip-network").textContent = NETWORK.name;

    if ((await s.provider.getCode(NETWORK.dao)) === "0x") {
      $("no-dao-msg").textContent = `No hay un contrato en ${short(NETWORK.dao)} en ${NETWORK.name}. ` +
        "Revisá la dirección en config.js (si lo desplegaste en Remix VM, esa red solo existe dentro de Remix).";
      $("no-dao").hidden = false;
      return;
    }
    s.dao = new ethers.Contract(NETWORK.dao, DAO_ABI, s.signer);
    $("dao-card").hidden = false;
    $("dao-view").hidden = false;
    await loadAll();
    setInterval(() => { if (!s.busy && !document.hidden) loadAll(); }, 30000);
    setInterval(tick, 1000);
  } catch (err) {
    toast(errorMessage(err), "error");
  } finally {
    btn.disabled = false; btn.textContent = "Conectar MetaMask";
  }
}

async function switchNetwork() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: NETWORK.addParams.chainId }] });
  } catch (err) {
    if (err.code === 4902) { // MetaMask no tiene Sepolia: la agregamos
      try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORK.addParams] }); }
      catch (e) { toast(errorMessage(e), "error"); }
    } else toast(errorMessage(err), "error");
  }
}

async function disconnect() {
  try { await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch {}
  location.reload();
}

/* ---------- 2. Leer la DAO ---------- */
async function loadAll() {
  $("refresh").disabled = true;
  try {
    const [admin, total, count, isStudent, regEn] = await Promise.all([
      s.dao.admin(), s.dao.totalEstudiantes(), s.dao.cantidadPropuestas(),
      s.dao.esEstudiante(s.account), s.dao.registradoEn(s.account),
    ]);
    s.isAdmin = same(admin, s.account);
    s.isStudent = isStudent;
    s.regEn = regEn;
    s.total = total;

    const ids = [...Array(Number(count)).keys()];
    s.proposals = (await Promise.all(ids.map(async (id) => {
      const [p, voted] = await Promise.all([s.dao.propuestas(id), s.dao.yaVoto(id, s.account)]);
      return {
        id, voted,
        titulo: p.titulo, descripcion: p.descripcion, creador: p.creador,
        inicio: p.inicio, fin: Number(p.fin), padron: p.padron,
        si: p.votosSi, no: p.votosNo, estado: Number(p.estado),
      };
    }))).reverse(); // las más nuevas primero

    renderSummary();
    if (!s.busy) renderProposals();
    $("admin-card").hidden = !s.isAdmin;
    updateCreate();
  } catch (err) {
    toast("No pudimos leer la DAO. " + errorMessage(err), "error");
  } finally {
    $("refresh").disabled = false;
  }
}

// Fase de una propuesta: abierta, para cerrar o finalizada
function phase(p) {
  if (p.estado !== 0) return "final";
  return now() < p.fin ? "abierta" : "cerrar";
}

function renderSummary() {
  $("stat-padron").textContent = s.total.toString();
  $("stat-abiertas").textContent = s.proposals.filter((p) => phase(p) === "abierta").length;
  $("stat-total").textContent = s.proposals.length;

  const badge = $("role-badge");
  badge.className = "badge";
  if (s.isAdmin && s.isStudent) badge.textContent = "Admin · en el padrón";
  else if (s.isAdmin) badge.textContent = "Admin";
  else if (s.isStudent) badge.textContent = "En el padrón";
  else { badge.textContent = "Sin registrar"; badge.classList.add("warn"); }
  if (s.isAdmin) badge.classList.add("mine");

  $("role-hint").textContent = !s.isStudent && !s.isAdmin
    ? "Tu wallet no está en el padrón: podés ver las votaciones, pero no votar ni proponer. Pedile al admin del centro que te agregue."
    : s.isAdmin && !s.isStudent
      ? "Sos el admin: podés gestionar el padrón. Para votar o proponer, agregá también tu wallet al padrón."
      : "";
  $("role-hint").hidden = !$("role-hint").textContent;
}

/* ---------- 3. Votaciones ---------- */
const EMPTY = {
  abiertas: ["No hay votaciones abiertas.", "Creá una desde la pestaña Proponer."],
  cerrar: ["No hay votaciones para cerrar.", "Acá aparecen las que terminaron y todavía no registraron el resultado."],
  finalizadas: ["Todavía no hay votaciones finalizadas.", ""],
};

function renderProposals() {
  const list = $("proposals");
  const items = s.proposals.filter((p) =>
    s.filter === "abiertas" ? phase(p) === "abierta" : s.filter === "cerrar" ? phase(p) === "cerrar" : phase(p) === "final");
  list.innerHTML = "";
  items.forEach((p) => list.appendChild(renderProposal(p)));
  $("empty").hidden = items.length > 0;
  [$("empty-title").textContent, $("empty-hint").textContent] = EMPTY[s.filter];
}

const STATUS = {
  abierta: ["Abierta", "open"],
  cerrar: ["Para cerrar", "mine"],
  1: ["Aprobada", "ok"],
  2: ["Rechazada", "bad"],
  3: ["Sin quórum", ""],
};

function renderProposal(p) {
  const ph = phase(p);
  const votos = p.si + p.no;
  const padron = p.padron > 0n ? p.padron : 1n;
  const quorum = p.padron / 2n + 1n; // más de la mitad
  const pct = (a, b) => (b > 0n ? Number((a * 1000n) / b) / 10 : 0);

  const li = document.createElement("li");
  li.className = "proposal";
  li.innerHTML = `
    <div class="p-head">
      <p class="l-title"></p>
      <span class="badge status"></span>
    </div>
    <p class="l-meta"></p>
    <p class="p-desc"></p>
    <div class="p-bars">
      <div class="p-row"><span class="p-yes"></span><span class="p-no"></span></div>
      <div class="tally"><span class="t-yes"></span><span class="t-no"></span></div>
      <div class="p-row"><span class="p-quorum"></span></div>
      <div class="meter q-meter"><span></span><i class="q-mark"></i></div>
    </div>
    <div class="p-foot">
      <span class="p-time"></span>
      <div class="p-actions"></div>
    </div>
    <p class="l-note"></p>`;

  li.querySelector(".l-title").textContent = p.titulo;
  const [label, cls] = STATUS[ph === "final" ? p.estado : ph];
  const st = li.querySelector(".status");
  st.textContent = label; if (cls) st.classList.add(cls);
  li.querySelector(".l-meta").textContent =
    `Propuesta #${p.id} · ${same(p.creador, s.account) ? "creada por vos" : `propone ${short(p.creador)}`}`;
  const desc = li.querySelector(".p-desc");
  desc.textContent = p.descripcion; desc.hidden = !p.descripcion;

  // Resultado parcial y quórum
  li.querySelector(".p-yes").textContent = `Sí ${p.si}`;
  li.querySelector(".p-no").textContent = `No ${p.no}`;
  li.querySelector(".t-yes").style.width = `${pct(p.si, votos)}%`;
  li.querySelector(".t-no").style.width = `${pct(p.no, votos)}%`;
  if (votos === 0n) li.querySelector(".tally").classList.add("empty-tally");
  const reached = votos >= quorum;
  li.querySelector(".p-quorum").textContent =
    `${votos} de ${p.padron} votaron · quórum: ${quorum}${reached ? " ✓" : ""}`;
  const meter = li.querySelector(".q-meter");
  meter.querySelector("span").style.width = `${Math.min(100, pct(votos, padron))}%`;
  meter.querySelector(".q-mark").style.left = `${Math.min(100, pct(quorum, padron))}%`;
  if (reached) meter.classList.add("reached");

  // Tiempo
  const time = li.querySelector(".p-time");
  time.dataset.fin = p.fin;
  time.dataset.phase = ph;
  time.textContent = timeText(p.fin, ph);

  // Acciones
  const actions = li.querySelector(".p-actions");
  const note = li.querySelector(".l-note");
  if (ph === "abierta") {
    const reason = !s.isStudent ? "Tu wallet no está en el padrón."
      : p.voted ? "Ya votaste en esta propuesta."
      : s.regEn > p.inicio ? "Te sumaste al padrón después de que se creó esta propuesta."
      : "";
    if (reason) {
      note.textContent = reason;
      if (p.voted) note.classList.add("ok");
    } else {
      const yes = document.createElement("button");
      yes.className = "btn btn-yes"; yes.textContent = "Votar Sí";
      const no = document.createElement("button");
      no.className = "btn btn-no"; no.textContent = "Votar No";
      yes.onclick = () => vote(p, true, yes, no);
      no.onclick = () => vote(p, false, no, yes);
      actions.append(yes, no);
    }
  } else if (ph === "cerrar") {
    const btn = document.createElement("button");
    btn.className = "btn btn-primary"; btn.textContent = "Cerrar votación";
    btn.onclick = () => execute(p, btn);
    actions.append(btn);
    note.textContent = "Terminó el plazo. Cualquiera puede cerrarla para registrar el resultado.";
  } else {
    note.textContent = p.estado === 3
      ? `Votó la mitad del padrón o menos (${votos} de ${p.padron}).`
      : `Resultado: ${p.si} a favor y ${p.no} en contra.`;
  }
  note.hidden = !note.textContent;
  return li;
}

function timeText(fin, ph) {
  if (ph !== "abierta") return `Terminó el ${fmtDate(fin)}`;
  let r = fin - now();
  const d = Math.floor(r / 86400); r %= 86400;
  const h = Math.floor(r / 3600); r %= 3600;
  const m = Math.floor(r / 60); const sec = r % 60;
  const left = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
  return `Cierra en ${left}`;
}

// Actualiza las cuentas regresivas; si alguna venció, vuelve a dibujar
function tick() {
  let expired = false;
  document.querySelectorAll(".p-time[data-phase='abierta']").forEach((el) => {
    const fin = Number(el.dataset.fin);
    if (now() >= fin) expired = true;
    else el.textContent = timeText(fin, "abierta");
  });
  if (expired && !s.busy) { renderProposals(); renderSummary(); }
}

async function vote(p, aFavor, btn, other) {
  other.disabled = true;
  const ok = await send(btn, "Votando…", () => s.dao.votar(p.id, aFavor),
    `Votaste ${aFavor ? "Sí" : "No"} en "${p.titulo}".`);
  if (ok) await loadAll(); else other.disabled = false;
}

async function execute(p, btn) {
  const ok = await send(btn, "Cerrando…", () => s.dao.ejecutar(p.id), `Se registró el resultado de "${p.titulo}".`);
  if (ok) {
    await loadAll();
    const res = s.proposals.find((x) => x.id === p.id);
    if (res) toast(`"${p.titulo}": ${STATUS[res.estado][0]}.`, res.estado === 1 ? "success" : "info");
  }
}

/* ---------- 4. Proponer ---------- */
function duration() {
  const n = $("p-dur").value.trim();
  if (!/^\d+$/.test(n) || BigInt(n) === 0n) return null;
  return BigInt(n) * BigInt($("p-unit").value);
}

function updateCreate() {
  const btn = $("create");
  if (btn.dataset.busy) return;
  const title = $("p-title").value.trim();
  const dur = duration();
  if (!s.isStudent) setCheck("p-check", "Necesitás estar en el padrón para proponer.", false);
  else if ($("p-dur").value.trim() && !dur) setCheck("p-check", "La duración tiene que ser un número entero mayor a 0.", false);
  else if (title && dur) setCheck("p-check", `✓ La votación va a cerrar el ${fmtDate(BigInt(now()) + dur)}.`, true);
  else setCheck("p-check", "");
  btn.disabled = !(s.isStudent && title && dur);
}

async function createProposal() {
  const btn = $("create");
  const title = $("p-title").value.trim();
  btn.dataset.busy = "1";
  const ok = await send(btn, "Creando…",
    () => s.dao.crearPropuesta(title, $("p-desc").value.trim(), duration()),
    `Creaste la propuesta "${title}".`);
  delete btn.dataset.busy;
  btn.textContent = "Crear propuesta";
  if (ok) {
    $("p-title").value = ""; $("p-desc").value = "";
    setFilter("abiertas");
    showTab("votes");
  }
  updateCreate();
}

/* ---------- 5. Padrón ---------- */
async function queryWallet() {
  const addr = $("q-addr").value.trim();
  if (!addr) return setCheck("q-check", "");
  if (!ethers.isAddress(addr)) return setCheck("q-check", "No es una dirección válida. Debe empezar con 0x y tener 42 caracteres.", false);
  try {
    const [isS, reg, admin] = await Promise.all([s.dao.esEstudiante(addr), s.dao.registradoEn(addr), s.dao.admin()]);
    const adminTxt = same(addr, admin) ? " Es el admin." : "";
    if (isS) setCheck("q-check", `✓ Está en el padrón desde el ${fmtDate(reg)}.${adminTxt}`, true);
    else setCheck("q-check", `No está en el padrón.${adminTxt}`, false);
  } catch (err) {
    setCheck("q-check", errorMessage(err), false);
  }
}

function parseList() {
  const parts = $("add-list").value.split(/[\s,;]+/).filter(Boolean);
  const invalid = parts.filter((a) => !ethers.isAddress(a));
  const seen = new Set();
  const valid = parts.filter((a) => ethers.isAddress(a))
    .map((a) => ethers.getAddress(a))
    .filter((a) => !seen.has(a) && seen.add(a));
  return { valid, invalid };
}

function updateAdd() {
  const btn = $("add");
  if (btn.dataset.busy) return;
  const { valid, invalid } = parseList();
  btn.disabled = true;
  btn.textContent = "Agregar al padrón";
  if (invalid.length) {
    const ej = invalid.slice(0, 2).map((a) => (a.length > 14 ? short(a) : a)).join(", ");
    return setCheck("add-check", `Hay ${invalid.length} dirección(es) inválida(s): ${ej}${invalid.length > 2 ? "…" : ""}`, false);
  }
  if (valid.length > MAX_POR_TANDA)
    return setCheck("add-check", `Son ${valid.length} direcciones. Cargá hasta ${MAX_POR_TANDA} por vez para no pasarte de gas.`, false);
  if (!valid.length) return setCheck("add-check", "");
  setCheck("add-check", `✓ ${valid.length} ${valid.length === 1 ? "dirección lista" : "direcciones listas"} para agregar.`, true);
  btn.disabled = false;
  btn.textContent = `Agregar ${valid.length} al padrón`;
}

async function addStudents() {
  const btn = $("add");
  const { valid } = parseList();
  btn.dataset.busy = "1";
  const before = s.total;
  const ok = await send(btn, "Agregando…", () => s.dao.agregarEstudiantes(valid), "Padrón actualizado.");
  delete btn.dataset.busy;
  if (ok) {
    $("add-list").value = "";
    await loadAll();
    const added = s.total - before;
    toast(`Se sumaron ${added} estudiante(s). Ahora hay ${s.total} en el padrón.`);
  }
  updateAdd();
}

let rmTimer;
async function checkRemove() {
  const btn = $("remove");
  if (btn.dataset.busy) return;
  btn.disabled = true;
  const addr = $("rm-addr").value.trim();
  if (!addr) return setCheck("rm-check", "");
  if (!ethers.isAddress(addr)) return setCheck("rm-check", "No es una dirección válida.", false);
  try {
    if (!(await s.dao.esEstudiante(addr))) return setCheck("rm-check", "Esa wallet no está en el padrón.", false);
    setCheck("rm-check", "✓ Está en el padrón. Si la quitás, ya no va a poder votar ni proponer.", true);
    btn.disabled = false;
  } catch (err) {
    setCheck("rm-check", errorMessage(err), false);
  }
}

async function removeStudent() {
  const btn = $("remove");
  const addr = ethers.getAddress($("rm-addr").value.trim());
  btn.dataset.busy = "1";
  const ok = await send(btn, "Quitando…", () => s.dao.quitarEstudiante(addr), `Quitaste ${short(addr)} del padrón.`);
  delete btn.dataset.busy;
  btn.textContent = "Quitar del padrón";
  if (ok) { $("rm-addr").value = ""; setCheck("rm-check", ""); btn.disabled = true; await loadAll(); }
}

/* ---------- Pestañas y filtros ---------- */
function showTab(tab) {
  for (const t of ["votes", "propose", "padron"]) {
    $(`tab-${t}`).setAttribute("aria-selected", String(t === tab));
    $(`${t}-view`).hidden = t !== tab;
  }
  if (tab === "votes" && s.dao) loadAll();
}

function setFilter(f) {
  s.filter = f;
  document.querySelectorAll("#filters button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === f)));
  if (s.dao) renderProposals();
}

/* ---------- Eventos ---------- */
$("connect").onclick = connect;
$("disconnect").onclick = disconnect;
$("switch-network").onclick = switchNetwork;
$("copy-address").onclick = async () => {
  try { await navigator.clipboard.writeText(s.account); toast("Dirección copiada."); } catch {}
};
$("tab-votes").onclick = () => showTab("votes");
$("tab-propose").onclick = () => showTab("propose");
$("tab-padron").onclick = () => showTab("padron");
document.querySelectorAll("#filters button").forEach((b) => (b.onclick = () => setFilter(b.dataset.filter)));
$("refresh").onclick = loadAll;
for (const id of ["p-title", "p-dur"]) $(id).addEventListener("input", updateCreate);
$("p-unit").addEventListener("change", updateCreate);
$("create").onclick = createProposal;
let qTimer;
$("q-addr").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(queryWallet, 400); });
$("add-list").addEventListener("input", updateAdd);
$("add").onclick = addStudents;
$("rm-addr").addEventListener("input", () => { clearTimeout(rmTimer); rmTimer = setTimeout(checkRemove, 400); });
$("remove").onclick = removeStudent;

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
  window.ethereum.request({ method: "eth_accounts" }).then((a) => a.length && connect());
}

/* ---------- Ayudas: se abren al pasar el mouse o al tocar el "?" ---------- */
{
  let open = null, pinned = false;
  const canHover = matchMedia("(hover: hover)").matches;

  function place(btn, tip) {
    const r = btn.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.max(16, Math.min(r.left + r.width / 2 - 28, innerWidth - w - 16));
    tip.style.left = `${left}px`;
    tip.style.top = `${r.bottom + 10}px`;
    tip.style.setProperty("--arrow-x", `${r.left + r.width / 2 - left - 6}px`);
  }
  function show(btn, pin) {
    if (open && open.btn !== btn) hide();
    const tip = document.getElementById(btn.dataset.tip);
    tip.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    place(btn, tip);
    open = { btn, tip };
    pinned = pinned || pin;
  }
  function hide() {
    if (!open) return;
    open.tip.hidden = true;
    open.btn.setAttribute("aria-expanded", "false");
    open = null; pinned = false;
  }

  document.querySelectorAll(".info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (open?.btn === btn && pinned) hide(); else show(btn, true);
    });
    if (canHover) {
      btn.addEventListener("mouseenter", () => show(btn, false));
      btn.addEventListener("mouseleave", () => { if (!pinned) hide(); });
    }
  });
  document.addEventListener("click", (e) => { if (open && !open.tip.contains(e.target)) hide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  addEventListener("resize", () => open && place(open.btn, open.tip));
  addEventListener("scroll", () => open && place(open.btn, open.tip), { passive: true });
}
