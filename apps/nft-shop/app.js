import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";
import { NETWORKS, ERC20_ABI, NFT_ABI, PRICE_FN, BUY_FN } from "./config.js";

const $ = (id) => document.getElementById(id);
const s = {}; // estado: provider, signer, account, chainId, net, token, nft, direcciones, price, decimals, symbol, balance

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (v) => Number(ethers.formatUnits(v, s.decimals)).toLocaleString("es-AR", { maximumFractionDigits: 4 });
const txUrl = (hash) => (s.net.explorer ? `${s.net.explorer}/tx/${hash}` : null);

/* ---------- Avisos (toasts) ---------- */
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
  return err?.shortMessage || err?.reason || err?.message || String(err);
}

/* ---------- Arte generativo a partir de una dirección ---------- */
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

/* ---------- Pasos ---------- */
function setStep(step) {
  $("step-contracts").className = step === "contracts" ? "current" : "done";
  $("step-buy").className = step === "buy" ? "current" : "";
}

/* ---------- 1. Conectar MetaMask ---------- */
async function connect() {
  if (!window.ethereum) { $("no-metamask").hidden = false; return; }
  const btn = $("connect");
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Esperando a MetaMask…`;
  try {
    s.provider = new ethers.BrowserProvider(window.ethereum);
    await s.provider.send("eth_requestAccounts", []);
    s.chainId = Number((await s.provider.getNetwork()).chainId);
    s.net = NETWORKS[s.chainId] || { name: `Red ${s.chainId}`, explorer: null };
    s.signer = await s.provider.getSigner();
    s.account = await s.signer.getAddress();

    $("connect-view").hidden = true;
    $("app-view").hidden = false;
    $("wallet-chip").hidden = false;
    $("chip-network").textContent = s.net.name;
    $("copy-address").textContent = short(s.account);
    renderNetworks();

    const saved = loadSaved();
    $("token-address").value = saved.token || "";
    $("nft-address").value = saved.nft || "";
    if (saved.token && saved.nft) await loadContracts();
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
      // MetaMask no conoce la red: la agregamos
      try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [NETWORKS[id].addParams] }); }
      catch (e) { toast(errorMessage(e), "error"); }
    } else {
      toast(errorMessage(err), "error");
    }
  }
}

async function disconnect() {
  try {
    await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {}
  location.reload();
}

/* ---------- 2. Contratos (ingresados desde la interfaz) ---------- */
const storageKey = () => `nft-shop:${s.chainId}`;
function loadSaved() { try { return JSON.parse(localStorage.getItem(storageKey())) || {}; } catch { return {}; } }
function save(data) { try { localStorage.setItem(storageKey(), JSON.stringify(data)); } catch {} }

function fieldError(input, errEl, msg) {
  $(errEl).textContent = msg || "";
  $(input).setAttribute("aria-invalid", msg ? "true" : "false");
  return !msg;
}

async function validateAddress(inputId, errId, kind) {
  const addr = $(inputId).value.trim();
  if (!addr) return fieldError(inputId, errId, "Pegá la dirección del contrato.");
  if (!ethers.isAddress(addr)) return fieldError(inputId, errId, "No es una dirección válida. Debe empezar con 0x y tener 42 caracteres.");
  if ((await s.provider.getCode(addr)) === "0x")
    return fieldError(inputId, errId, `No hay un contrato ${kind} en esa dirección en ${s.net.name}.`);
  return fieldError(inputId, errId, "");
}

async function loadContracts() {
  const btn = $("load");
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Verificando…`;
  try {
    const ok = [
      await validateAddress("token-address", "token-error", "ERC-20"),
      await validateAddress("nft-address", "nft-error", "ERC-721"),
    ];
    if (!ok.every(Boolean)) return;

    s.tokenAddress = ethers.getAddress($("token-address").value.trim());
    s.nftAddress = ethers.getAddress($("nft-address").value.trim());
    s.token = new ethers.Contract(s.tokenAddress, ERC20_ABI, s.signer);
    s.nft = new ethers.Contract(s.nftAddress, NFT_ABI, s.signer);

    await refresh();
    save({ token: s.tokenAddress, nft: s.nftAddress });

    $("sum-token").innerHTML = "";
    $("sum-token").append(`${s.symbol} `, Object.assign(document.createElement("small"), { textContent: short(s.tokenAddress) }));
    $("sum-nft").innerHTML = "";
    $("sum-nft").append(`${s.nftName} `, Object.assign(document.createElement("small"), { textContent: short(s.nftAddress) }));
    showContractsForm(false);
    renderArt($("nft-art"), s.nftAddress);
    $("shop").hidden = false;
    setStep("buy");
  } catch (err) {
    toast("No pudimos leer los contratos. Revisá que sean un ERC-20 y un ERC-721 compatibles. " + errorMessage(err), "error");
  } finally {
    btn.disabled = false; btn.textContent = "Usar estos contratos";
  }
}

function showContractsForm(show) {
  $("contracts-form").hidden = !show;
  $("contracts-summary").hidden = show;
  $("edit-contracts").hidden = show;
  if (show) { $("shop").hidden = true; setStep("contracts"); }
}

/* ---------- 3. Compra con los tokens de la cuenta conectada ---------- */
async function refresh() {
  [s.symbol, s.decimals, s.price, s.nftName] = await Promise.all([
    s.token.symbol(), s.token.decimals(), s.nft[PRICE_FN](), s.nft.name(),
  ]);
  const [balance, owned] = await Promise.all([s.token.balanceOf(s.account), s.nft.balanceOf(s.account)]);
  s.balance = balance;

  $("nft-name").textContent = s.nftName;
  $("nft-owned").textContent = owned === 0n
    ? "Todavía no tenés ninguno de esta colección."
    : `Ya tenés ${owned} de esta colección.`;
  $("price").textContent = `${fmt(s.price)} ${s.symbol}`;
  $("balance").textContent = `${fmt(balance)} ${s.symbol}`;

  const enough = balance >= s.price;
  const pct = s.price === 0n ? 100 : Math.min(100, Number((balance * 100n) / s.price));
  $("meter-fill").style.width = `${pct}%`;
  $("meter-fill").parentElement.classList.toggle("short", !enough);

  if (enough) {
    const times = s.price === 0n ? null : balance / s.price;
    $("balance-note").textContent = times && times > 1n
      ? `Te alcanza para ${times} compras.`
      : "Te alcanza para comprar uno.";
  } else {
    $("balance-note").textContent = `Te faltan ${fmt(s.price - balance)} ${s.symbol} para poder comprar.`;
  }
  setBuyButton(enough ? "ready" : "short");
}

function setBuyButton(state) {
  const btn = $("buy");
  btn.disabled = state !== "ready";
  if (state === "busy") btn.innerHTML = `<span class="spinner"></span> Procesando…`;
  else if (state === "short") btn.textContent = "Saldo insuficiente";
  else btn.textContent = `Comprar por ${fmt(s.price)} ${s.symbol}`;
}

function setProgress(id, state, hash) {
  const li = $(id);
  li.className = state;
  const link = li.querySelector(".p-link");
  const url = hash && txUrl(hash);
  link.hidden = !url;
  if (url) link.href = url;
}

async function buy() {
  setBuyButton("busy");
  $("progress").hidden = false;
  setProgress("p-approve", ""); setProgress("p-buy", "");
  try {
    // Paso A: autorizar al contrato NFT a cobrar el precio desde tu cuenta (solo si hace falta)
    const allowance = await s.token.allowance(s.account, s.nftAddress);
    if (allowance < s.price) {
      setProgress("p-approve", "active");
      $("p-approve").querySelector(".p-text").textContent = `Autorizar el pago de ${fmt(s.price)} ${s.symbol}`;
      const tx = await s.token.approve(s.nftAddress, s.price);
      setProgress("p-approve", "active", tx.hash);
      await tx.wait();
      setProgress("p-approve", "done", tx.hash);
    } else {
      setProgress("p-approve", "done skipped");
    }

    // Paso B: comprar. El contrato cobra los tokens y te mintea el NFT
    setProgress("p-buy", "active");
    const tx = await s.nft[BUY_FN]();
    setProgress("p-buy", "active", tx.hash);
    await tx.wait();
    setProgress("p-buy", "done", tx.hash);

    toast(`Compraste un NFT de ${s.nftName}.`, "success", txUrl(tx.hash));
    await refresh();
  } catch (err) {
    document.querySelectorAll("#progress li.active").forEach((li) => (li.className = ""));
    toast(errorMessage(err), "error");
    await refresh().catch(() => setBuyButton("ready"));
  }
}

/* ---------- Eventos ---------- */
renderArt($("hero-art"), "nft-shop");
$("connect").onclick = connect;
$("load").onclick = loadContracts;
$("buy").onclick = buy;
$("disconnect").onclick = disconnect;
$("edit-contracts").onclick = () => showContractsForm(true);
$("copy-address").onclick = async () => {
  try { await navigator.clipboard.writeText(s.account); toast("Dirección copiada."); } catch {}
};
for (const id of ["token-address", "nft-address"]) {
  $(id).addEventListener("input", () => fieldError(id, id.replace("address", "error"), ""));
  $(id).addEventListener("keydown", (e) => e.key === "Enter" && loadContracts());
}

if (window.ethereum) {
  // Si cambia la cuenta o la red, recargamos para empezar limpio
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
  // Reconectar automáticamente si el sitio ya estaba autorizado
  window.ethereum.request({ method: "eth_accounts" }).then((a) => a.length && connect());
}
