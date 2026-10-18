import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
import { NETWORKS, MARKET_ABI, ERC20_ABI, ERC721_ABI } from "./config.js";

const $ = (id) => document.getElementById(id);
const s = {}; // estado: provider, signer, account, chainId, net, market, marketAddress
const MAX_PRICE = 2n ** 96n - 1n;

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const txUrl = (hash) => (s.net.explorer ? `${s.net.explorer}/tx/${hash}` : null);
const fmt = (v, decimals) =>
  Number(ethers.formatUnits(v, decimals)).toLocaleString("es-AR", { maximumFractionDigits: 6 });

/* ---------- Avisos ---------- */
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

/* ---------- Arte generativo (mismo que nft-shop) ---------- */
function renderArt(el, seed) {
  const b = ethers.getBytes(ethers.id(seed.toLowerCase()));
  const hue = (i) => Math.round((b[i] / 255) * 360);
  const n = (i, min, max) => min + (b[i] / 255) * (max - min);
  let shapes = "";
  for (let i = 0; i < 4; i++) {
    const k = 3 + i * 4;
    shapes += `<circle cx="${n(k, 10, 90)}" cy="${n(k + 1, 10, 90)}" r="${n(k + 2, 18, 42)}"
      fill="hsl(${hue(k + 3)} 70% 58%)" opacity=".85" style="mix-blend-mode:multiply"/>`;
  }
  el.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
    <rect width="100" height="100" fill="hsl(${hue(0)} 45% 88%)"/>${shapes}
    <rect x="${n(1, 8, 40)}" y="${n(2, 55, 80)}" width="${n(20, 30, 60)}" height="10" rx="5" fill="hsl(${hue(21)} 30% 20%)" opacity=".85"/>
  </svg>`;
}

/* ---------- Datos de tokens y colecciones (con caché) ---------- */
const cache = new Map();
function memo(key, fn) {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
const tokenInfo = (addr) => memo(`t:${addr.toLowerCase()}`, async () => {
  const c = new ethers.Contract(addr, ERC20_ABI, s.provider);
  const [symbol, decimals] = await Promise.all([c.symbol(), c.decimals()]);
  return { symbol, decimals };
});
const nftName = (addr) => memo(`n:${addr.toLowerCase()}`, async () =>
  new ethers.Contract(addr, ERC721_ABI, s.provider).name().catch(() => short(addr)));

/* ---------- 1. Conectar ---------- */
async function connect() {
  if (!window.ethereum) { $("no-metamask").hidden = false; return; }
  const btn = $("connect");
  spin(btn, "Esperando a MetaMask…");
  try {
    s.provider = new ethers.BrowserProvider(window.ethereum);
    await s.provider.send("eth_requestAccounts", []);
    s.chainId = Number((await s.provider.getNetwork()).chainId);
    s.net = NETWORKS[s.chainId] || { name: `Red ${s.chainId}`, explorer: null, knownTokens: [] };
    s.signer = await s.provider.getSigner();
    s.account = await s.signer.getAddress();

    $("connect-view").hidden = true;
    $("app-view").hidden = false;
    $("wallet-chip").hidden = false;
    $("chip-network").textContent = s.net.name;
    $("copy-address").textContent = short(s.account);
    renderNetworks();
    $("known-tokens").innerHTML = (s.net.knownTokens || [])
      .map((t) => `<option value="${t.address}">${t.symbol}</option>`).join("");

    // La dirección fija de config.js tiene prioridad; si no hay, se usa la última ingresada
    const saved = s.net.marketplace || loadSaved().market || "";
    $("market-address").value = saved;
    if (saved) await loadMarket();
  } catch (err) {
    toast(errorMessage(err), "error");
  } finally {
    btn.disabled = false; btn.textContent = "Conectar MetaMask";
  }
}

function renderNetworks() {
  const box = $("networks");
  box.innerHTML = "";
  for (const [id, n] of Object.entries(NETWORKS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = n.name;
    b.setAttribute("aria-pressed", String(Number(id) === s.chainId));
    b.onclick = () => Number(id) !== s.chainId && switchNetwork(id);
    box.appendChild(b);
  }
  const known = NETWORKS[s.chainId];
  $("network-note").hidden = !!known;
  $("network-note").textContent = known ? "" : `Estás en otra red (chainId ${s.chainId}). Podés seguir igual o cambiar a una de estas.`;
}

async function switchNetwork(id) {
  const hex = "0x" + Number(id).toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    if (err.code === 4902 && NETWORKS[id].addParams) {
      try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORKS[id].addParams] }); }
      catch (e) { toast(errorMessage(e), "error"); }
    } else toast(errorMessage(err), "error");
  }
}

async function disconnect() {
  try { await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch {}
  location.reload();
}

/* ---------- 2. Marketplace ---------- */
const storageKey = () => `nft-market:${s.chainId}`;
function loadSaved() { try { return JSON.parse(localStorage.getItem(storageKey())) || {}; } catch { return {}; } }
function save(data) { try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch {} }

async function loadMarket() {
  const btn = $("load-market");
  const addr = $("market-address").value.trim();
  const fail = (msg) => { $("market-error").textContent = msg; $("market-address").setAttribute("aria-invalid", "true"); };
  $("market-error").textContent = ""; $("market-address").removeAttribute("aria-invalid");
  if (!ethers.isAddress(addr)) return fail("No es una dirección válida. Debe empezar con 0x y tener 42 caracteres.");
  spin(btn, "Verificando…");
  try {
    if ((await s.provider.getCode(addr)) === "0x") return fail(`No hay un contrato en esa dirección en ${s.net.name}.`);
    s.marketAddress = ethers.getAddress(addr);
    s.market = new ethers.Contract(s.marketAddress, MARKET_ABI, s.signer);
    await s.market.getListings(); // confirma que es un Marketplace
    save({ market: s.marketAddress });
    showMarketForm(false);
    await loadListings();
  } catch {
    fail(await whatIsIt(addr));
  } finally {
    btn.disabled = false; btn.textContent = "Usar este marketplace";
  }
}

// Si pegaron la dirección de un NFT o de un token, decirle cuál es
async function whatIsIt(addr) {
  const c = new ethers.Contract(addr, [
    "function supportsInterface(bytes4) view returns (bool)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
  ], s.provider);
  const name = await c.name().catch(() => null);
  if (await c.supportsInterface("0x80ac58cd").catch(() => false))
    return `Esa dirección es la colección ${name ? `"${name}"` : ""} (un NFT), no el Marketplace. Usala en Vender, como "Contrato del NFT".`;
  if (await c.decimals().then(() => true).catch(() => false)) {
    const sym = await c.symbol().catch(() => name);
    return `Esa dirección es el token ${sym ? `"${sym}"` : ""}, no el Marketplace. Usala en Vender, en "Cobrar en".`;
  }
  return "Ese contrato no es el Marketplace. Revisá la dirección.";
}

function showMarketForm(show) {
  $("market-form").hidden = !show;
  $("edit-market").hidden = show;
  $("market-summary").hidden = show;
  $("market-view").hidden = show;
  if (!show) $("market-summary").innerHTML = `Conectado a <strong>${short(s.marketAddress)}</strong> en ${s.net.name}`;
}

function showTab(tab) {
  $("tab-browse").setAttribute("aria-selected", String(tab === "browse"));
  $("tab-sell").setAttribute("aria-selected", String(tab === "sell"));
  $("browse-view").hidden = tab !== "browse";
  $("sell-view").hidden = tab !== "sell";
  if (tab === "browse") loadListings();
}

/* ---------- 3. En venta ---------- */
async function loadListings() {
  const list = $("listings");
  $("refresh").disabled = true;
  try {
    const raw = await s.market.getListings();
    const active = raw
      .map((l, id) => ({ id, seller: l.seller, price: l.price, nft: l.nft, token: l.token, tokenId: l.tokenId }))
      .filter((l) => l.seller !== ethers.ZeroAddress)
      .reverse(); // las más nuevas primero

    const items = await Promise.all(active.map(async (l) => {
      const nft = new ethers.Contract(l.nft, ERC721_ABI, s.provider);
      const [name, token, owner, approved, all] = await Promise.all([
        nftName(l.nft),
        tokenInfo(l.token).catch(() => ({ symbol: "?", decimals: 18 })),
        nft.ownerOf(l.tokenId).catch(() => null),
        nft.getApproved(l.tokenId).catch(() => null),
        nft.isApprovedForAll(l.seller, s.marketAddress).catch(() => false),
      ]);
      const available = same(owner, l.seller) && (same(approved, s.marketAddress) || all);
      return { ...l, name, token: { address: l.token, ...token }, available };
    }));

    list.innerHTML = "";
    items.forEach((it) => list.appendChild(renderListing(it)));
    $("empty").hidden = items.length > 0;
    $("list-count").textContent = items.length === 1 ? "1 NFT a la venta" : items.length ? `${items.length} NFTs a la venta` : "";
  } catch (err) {
    toast("No pudimos leer las publicaciones. " + errorMessage(err), "error");
  } finally {
    $("refresh").disabled = false;
  }
}

function renderListing(it) {
  const mine = same(it.seller, s.account);
  const li = document.createElement("li");
  li.className = "listing";
  li.innerHTML = `
    <div class="art" aria-hidden="true"></div>
    <div>
      <p class="l-title"></p>
      <p class="l-meta"></p>
      <p class="l-price"></p>
    </div>
    <div class="l-action"><button class="btn"></button><span class="l-note"></span></div>`;
  renderArt(li.querySelector(".art"), `${it.nft}:${it.tokenId}`);
  const title = li.querySelector(".l-title");
  title.textContent = `${it.name} #${it.tokenId}`;
  if (mine) title.insertAdjacentHTML("beforeend", `<span class="badge mine">Tuyo</span>`);
  li.querySelector(".l-meta").textContent = mine ? "Publicado por vos" : `Vende ${short(it.seller)}`;
  li.querySelector(".l-price").textContent = `${fmt(it.price, it.token.decimals)} ${it.token.symbol}`;

  const btn = li.querySelector(".l-action .btn");
  const note = li.querySelector(".l-note");
  if (mine) {
    btn.className = "btn btn-danger";
    btn.textContent = "Retirar";
    btn.onclick = () => cancelListing(it, btn);
    if (!it.available) { note.textContent = "Ya no está disponible: movista el NFT o quitaste la autorización."; note.classList.add("warn"); }
  } else if (!it.available) {
    btn.className = "btn btn-primary"; btn.disabled = true; btn.textContent = "No disponible";
    note.textContent = "El vendedor ya no tiene este NFT o retiró la autorización.";
  } else {
    btn.className = "btn btn-primary";
    btn.textContent = "Comprar";
    btn.onclick = () => buyListing(it, btn, note);
  }
  return li;
}

async function buyListing(it, btn, note) {
  const token = new ethers.Contract(it.token.address, ERC20_ABI, s.signer);
  const label = `${fmt(it.price, it.token.decimals)} ${it.token.symbol}`;
  try {
    spin(btn, "Revisando saldo…");
    const balance = await token.balanceOf(s.account);
    if (balance < it.price) {
      btn.disabled = false; btn.textContent = "Comprar";
      note.textContent = `Te faltan ${fmt(it.price - balance, it.token.decimals)} ${it.token.symbol}.`;
      note.classList.add("warn");
      return;
    }
    // 1) Autorizar al marketplace a cobrar el precio, si hace falta
    if ((await token.allowance(s.account, s.marketAddress)) < it.price) {
      spin(btn, "Autorizá el pago…");
      note.textContent = `Paso 1 de 2: autorizar ${label}`;
      const tx = await token.approve(s.marketAddress, it.price);
      spin(btn, "Autorizando…");
      await tx.wait();
    }
    // 2) Comprar
    spin(btn, "Confirmá la compra…");
    note.textContent = "Paso 2 de 2: comprar";
    const tx = await s.market.buy(it.id);
    spin(btn, "Comprando…");
    await tx.wait();
    toast(`Compraste ${it.name} #${it.tokenId} por ${label}.`, "success", txUrl(tx.hash));
    await loadListings();
  } catch (err) {
    toast(errorMessage(err), "error");
    btn.disabled = false; btn.textContent = "Comprar"; note.textContent = "";
  }
}

async function cancelListing(it, btn) {
  try {
    spin(btn, "Confirmá en MetaMask…");
    const tx = await s.market.cancel(it.id);
    spin(btn, "Retirando…");
    await tx.wait();
    toast(`Retiraste ${it.name} #${it.tokenId} de la venta.`, "success", txUrl(tx.hash));
    await loadListings();
  } catch (err) {
    toast(errorMessage(err), "error");
    btn.disabled = false; btn.textContent = "Retirar";
  }
}

/* ---------- 4. Vender ---------- */
const sell = { nftOk: false, tokenOk: false };

function setCheck(id, text, ok) {
  $(id).textContent = text || "";
  $(id).className = "check" + (text ? (ok ? " ok" : " bad") : "");
}

let nftTimer, tokenTimer;
async function checkNft() {
  sell.nftOk = false; updatePublish();
  const addr = $("sell-nft").value.trim(), idText = $("sell-id").value.trim();
  if (!addr || idText === "") return setCheck("nft-check", "");
  if (!ethers.isAddress(addr)) return setCheck("nft-check", "La dirección del NFT no es válida.", false);
  if (!/^\d+$/.test(idText)) return setCheck("nft-check", "El ID tiene que ser un número entero.", false);
  try {
    const nft = new ethers.Contract(addr, ERC721_ABI, s.provider);
    const [owner, name] = await Promise.all([nft.ownerOf(idText), nftName(addr)]);
    if (!same(owner, s.account)) return setCheck("nft-check", `${name} #${idText} no es tuyo. Su dueño es ${short(owner)}.`, false);
    sell.nft = { address: ethers.getAddress(addr), id: BigInt(idText), name };
    sell.nftOk = true;
    setCheck("nft-check", `✓ ${name} #${idText} es tuyo.`, true);
  } catch {
    setCheck("nft-check", "No encontramos ese NFT. Revisá el contrato y el ID.", false);
  }
  updatePublish();
}

async function checkToken() {
  sell.tokenOk = false; $("price-suffix").textContent = ""; updatePublish();
  const addr = $("sell-token").value.trim();
  if (!addr) return setCheck("token-check", "");
  if (!ethers.isAddress(addr)) return setCheck("token-check", "La dirección del token no es válida.", false);
  try {
    const info = await tokenInfo(addr);
    sell.token = { address: ethers.getAddress(addr), ...info };
    sell.tokenOk = true;
    $("price-suffix").textContent = info.symbol;
    setCheck("token-check", `✓ Vas a cobrar en ${info.symbol}.`, true);
  } catch {
    setCheck("token-check", "Esa dirección no es un token ERC-20 en esta red.", false);
  }
  updatePublish();
}

function parsedPrice() {
  if (!sell.tokenOk) return null;
  try {
    const v = ethers.parseUnits($("sell-price").value.trim().replace(",", "."), sell.token.decimals);
    return v > 0n && v <= MAX_PRICE ? v : null;
  } catch { return null; }
}

function updatePublish() {
  const price = parsedPrice();
  const btn = $("publish");
  if (btn.dataset.busy) return;
  btn.disabled = !(sell.nftOk && sell.tokenOk && price);
  btn.textContent = price && sell.tokenOk ? `Publicar por ${fmt(price, sell.token.decimals)} ${sell.token.symbol}` : "Publicar";
}

function setProgress(id, state, hash) {
  const li = $(id);
  li.className = state;
  const link = li.querySelector(".p-link");
  const url = hash && txUrl(hash);
  link.hidden = !url;
  if (url) link.href = url;
}

async function publish() {
  const btn = $("publish");
  const price = parsedPrice();
  const { nft, token } = sell;
  btn.dataset.busy = "1";
  spin(btn, "Procesando…");
  $("sell-progress").hidden = false;
  setProgress("p-approve", ""); setProgress("p-list", "");
  try {
    // 1) Autorizar al marketplace a transferir el NFT cuando se venda
    const c = new ethers.Contract(nft.address, ERC721_ABI, s.signer);
    const [approved, all] = await Promise.all([c.getApproved(nft.id), c.isApprovedForAll(s.account, s.marketAddress)]);
    if (same(approved, s.marketAddress) || all) {
      setProgress("p-approve", "done skipped");
    } else {
      setProgress("p-approve", "active");
      const tx = await c.approve(s.marketAddress, nft.id);
      setProgress("p-approve", "active", tx.hash);
      await tx.wait();
      setProgress("p-approve", "done", tx.hash);
    }
    // 2) Publicar
    setProgress("p-list", "active");
    const tx = await s.market.list(nft.address, nft.id, token.address, price);
    setProgress("p-list", "active", tx.hash);
    await tx.wait();
    setProgress("p-list", "done", tx.hash);

    toast(`Publicaste ${nft.name} #${nft.id} por ${fmt(price, token.decimals)} ${token.symbol}.`, "success", txUrl(tx.hash));
    $("sell-id").value = ""; $("sell-price").value = "";
    setCheck("nft-check", ""); sell.nftOk = false;
    $("sell-progress").hidden = true;
    showTab("browse");
  } catch (err) {
    document.querySelectorAll("#sell-progress li.active").forEach((li) => (li.className = ""));
    toast(errorMessage(err), "error");
  } finally {
    delete btn.dataset.busy;
    updatePublish();
  }
}

/* ---------- Eventos ---------- */
renderArt($("hero-art-1"), "marketplace-1");
renderArt($("hero-art-2"), "marketplace-2");
$("connect").onclick = connect;
$("disconnect").onclick = disconnect;
$("copy-address").onclick = async () => {
  try { await navigator.clipboard.writeText(s.account); toast("Dirección copiada."); } catch {}
};
$("load-market").onclick = loadMarket;
$("market-address").addEventListener("keydown", (e) => e.key === "Enter" && loadMarket());
$("edit-market").onclick = () => showMarketForm(true);
$("tab-browse").onclick = () => showTab("browse");
$("tab-sell").onclick = () => showTab("sell");
$("refresh").onclick = loadListings;
for (const id of ["sell-nft", "sell-id"]) $(id).addEventListener("input", () => { clearTimeout(nftTimer); nftTimer = setTimeout(checkNft, 400); });
$("sell-token").addEventListener("input", () => { clearTimeout(tokenTimer); tokenTimer = setTimeout(checkToken, 400); });
$("sell-price").addEventListener("input", updatePublish);
$("publish").onclick = publish;

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
