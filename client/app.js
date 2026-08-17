/* Brass-Hinge Calamity — static Telegram Mini App client. The backend remains authoritative for game state. */
(() => {
  const ENDPOINT = "wss://dont-splode-backend.onrender.com/ws";
  const ASSETS = {
    mascot: "/manus-storage/dont-splode-bomb-mascot_3e8fa59b.png",
    logo: "/manus-storage/dont-splode-logo_8863a007.png",
  };

  const telegram = window.Telegram?.WebApp;
  if (telegram) {
    telegram.ready();
    telegram.expand();
    telegram.setHeaderColor?.("#11100e");
    telegram.setBackgroundColor?.("#0e0d0b");
  }

  const getIdentity = () => {
    const tgUser = telegram?.initDataUnsafe?.user;
    if (tgUser?.id) return { id: String(tgUser.id), name: tgUser.first_name || tgUser.username || "Anon" };

    const key = "dont-splode-dev-user";
    let devUser = localStorage.getItem(key);
    if (!devUser) {
      devUser = String(Math.floor(Math.random() * 900000 + 100000));
      localStorage.setItem(key, devUser);
    }
    return { id: `dev-${devUser}`, name: `Test Subject ${devUser.slice(-3)}` };
  };

  const identity = getIdentity();
  const root = document.querySelector("#app");
  let socket = null;
  let retryTimer = null;
  let reconnectCount = 0;
  let state = null;
  let lastEvent = null;

  root.innerHTML = `
    <div class="shell">
      <div class="backdrop"></div><div class="grain"></div><div class="smoke-decal"></div>
      <section class="cabinet" data-local-holder="false" aria-label="Dont Splode game cabinet">
        <header class="marquee">
          <span class="brand-mark" aria-label="Dont Splode bomb emblem"></span>
          <div><span class="eyebrow">GROUP GAME / 100 VIRTUAL CHIPS</span><h1 class="wordmark">DON'T SPLODE</h1></div>
          <div class="system-pill" id="connection" data-status="connecting"><span class="lamp"></span><span>Waking engine</span></div>
        </header>
        <section class="status-rail" aria-label="Round status">
          <div class="rail-item"><span class="rail-label">Pot</span><strong class="rail-value accent" id="pot-value">—</strong></div>
          <div class="rail-item"><span class="rail-label">Occupants</span><strong class="rail-value" id="player-count">0 / 12</strong></div>
          <div class="rail-item"><span class="rail-label">Round</span><strong class="rail-value" id="round-phase">STANDBY</strong></div>
        </section>
        <section class="chamber" id="chamber" data-phase="lobby">
          <div class="deck-head"><span class="round-tag" id="round-tag">CABINET AWAITS</span><span class="live-tag" id="live-tag" data-urgent="false">SAFE(ISH)</span></div>
          <div class="bomb-stage fallback" id="bomb-stage"><span class="bomb-halo"></span><img class="bomb-mascot" id="bomb-mascot" src="/manus-storage/dont-splode-bomb-mascot-v2_884de318.png" alt="A worried cartoon bomb with a lit fuse" /><span class="bomb-fallback" aria-hidden="true"></span></div>
          <div class="multiplier-wrap"><strong class="multiplier" id="multiplier">1.00×</strong><span class="multiplier-caption">Survival multiplier</span></div>
          <p class="message-board" id="message">Waking the engine room. Please retain all fingers.</p>
          <section class="roster" aria-label="Players in the lobby"><header class="roster-head"><span>Victim manifest</span><span id="roster-count">00 active</span></header><div class="roster-list" id="roster"><div class="roster-empty">The lobby is making eye contact with nobody.</div></div></section>
        </section>
        <aside class="side-docket" aria-label="Game information"></aside>
        <div class="action-bay"><button class="action-button is-neutral" id="action" type="button" disabled>CONNECTING TO DISASTER</button><button class="reconnect" id="reconnect" type="button">Reconnect to the engine</button></div>
        <p class="safety-note"><strong>Virtual chips only.</strong> This is a theatrical exercise in probability, not financial advice.</p>
      </section>
    </div>`;

  const ui = {
    cabinet: root.querySelector(".cabinet"), chamber: root.querySelector("#chamber"), connection: root.querySelector("#connection"),
    pot: root.querySelector("#pot-value"), count: root.querySelector("#player-count"), phase: root.querySelector("#round-phase"),
    roundTag: root.querySelector("#round-tag"), liveTag: root.querySelector("#live-tag"), mascot: root.querySelector("#bomb-mascot"),
    stage: root.querySelector("#bomb-stage"), multiplier: root.querySelector("#multiplier"), message: root.querySelector("#message"),
    roster: root.querySelector("#roster"), rosterCount: root.querySelector("#roster-count"), action: root.querySelector("#action"), reconnect: root.querySelector("#reconnect"),
  };

  ui.mascot.addEventListener("error", () => ui.stage.classList.add("fallback"));
  ui.reconnect.addEventListener("click", () => connect(true));
  ui.action.addEventListener("click", handleAction);

  function setConnection(status, text) {
    ui.connection.dataset.status = status;
    ui.connection.lastElementChild.textContent = text;
    ui.reconnect.classList.toggle("is-visible", status === "offline");
  }

  function safeNumber(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function phraseFor(event) {
    if (!state) return "Waking the engine room. Please retain all fingers.";
    const players = Array.isArray(state.players) ? state.players : [];
    const inLobby = players.some((player) => String(player.id) === identity.id);
    if (state.phase === "ended") {
      if (event?.type === "sploded") return `BOOM. ${event?.payout ?? 0} virtual chips were divided among the survivors.`;
      return "Round concluded. The cabinet is cooling its gears.";
    }
    if (state.phase === "running") {
      const holder = players.find((player) => String(player.id) === String(state.current_holder));
      return String(state.current_holder) === identity.id ? "You have the bomb. Pass it before your dignity catches fire." : `${holder?.name || "Some poor soul"} is holding the bomb. Practice looking innocent.`;
    }
    if (!inLobby) return "The lobby is open. Volunteer for virtual peril.";
    if (players.length < 2) return "You’re listed. The cabinet requires one more questionable decision.";
    return "The doors can be locked whenever you are ready.";
  }

  function renderRoster(players) {
    ui.roster.replaceChildren();
    if (!players.length) {
      const empty = document.createElement("div"); empty.className = "roster-empty"; empty.textContent = "The lobby is making eye contact with nobody."; ui.roster.append(empty); return;
    }
    players.forEach((player, index) => {
      const row = document.createElement("div");
      const isHolder = String(player.id) === String(state.current_holder);
      row.className = `player-row${isHolder ? " is-holder" : ""}`;
      const number = document.createElement("span"); number.className = "player-index"; number.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span"); name.className = "player-name"; name.textContent = player.name || "Anonymous troublemaker";
      const chip = document.createElement("span"); chip.className = "player-chip"; chip.textContent = isHolder ? "BOMB" : "READY";
      row.append(number, name, chip); ui.roster.append(row);
    });
  }

  function render(nextState, event = null) {
    state = nextState || state;
    lastEvent = event || lastEvent;
    if (!state) return;
    const players = Array.isArray(state.players) ? state.players : [];
    const phase = state.phase || "lobby";
    const localHolder = String(state.current_holder) === identity.id;
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    const multiplier = safeNumber(state.multiplier, 1);

    ui.cabinet.dataset.localHolder = String(phase === "running" && localHolder);
    ui.chamber.dataset.phase = phase;
    ui.pot.textContent = `${safeNumber(state.pot)} ◉`;
    ui.count.textContent = `${players.length} / 12`;
    ui.rosterCount.textContent = `${String(players.length).padStart(2, "0")} active`;
    ui.phase.textContent = phase === "running" ? "LIVE" : phase === "ended" ? "ENDED" : "LOBBY";
    ui.roundTag.textContent = phase === "running" ? "FUSE IS LIT" : phase === "ended" ? "CABINET RESETTING" : "LOBBY DOORS OPEN";
    ui.liveTag.textContent = phase === "running" ? "LIVE ROUND" : phase === "ended" ? "COOLING OFF" : "SAFE(ISH)";
    ui.liveTag.dataset.urgent = String(phase === "running");
    ui.multiplier.textContent = `${multiplier.toFixed(2)}×`;
    ui.multiplier.className = `multiplier${phase === "running" && localHolder ? " is-danger" : ""}${phase === "ended" ? " is-ended" : ""}`;
    ui.message.textContent = phraseFor(event);
    renderRoster(players);

    ui.action.className = "action-button";
    ui.action.disabled = false;
    if (phase === "lobby" && !isInLobby) ui.action.textContent = "SIGN THE WAIVER — 100 ◉";
    else if (phase === "lobby" && players.length >= 2) { ui.action.textContent = "LOCK THE DOORS"; ui.action.classList.add("is-start"); }
    else if (phase === "lobby") { ui.action.textContent = "AWAITING ANOTHER VICTIM"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else if (phase === "running" && localHolder) { ui.action.textContent = "PASS THE BOMB — 5 ◉"; ui.action.classList.add("is-pass"); }
    else if (phase === "running") { ui.action.textContent = "PRAYING PROFESSIONALLY"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else { ui.action.textContent = "ROUND CONCLUDED"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
  }

  function handleAction() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !state) return;
    const players = Array.isArray(state.players) ? state.players : [];
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    if (state.phase === "lobby") socket.send(JSON.stringify({ action: isInLobby ? "force_start" : "join" }));
    if (state.phase === "running" && String(state.current_holder) === identity.id) socket.send(JSON.stringify({ action: "pass" }));
  }

  function connect(manual = false) {
    clearTimeout(retryTimer);
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    setConnection("connecting", manual ? "Re-arming engine" : "Waking engine");
    ui.action.textContent = "CONNECTING TO DISASTER"; ui.action.className = "action-button is-neutral"; ui.action.disabled = true;
    const socketUrl = `${ENDPOINT}/${encodeURIComponent(identity.id)}/${encodeURIComponent(identity.name)}`;
    try { socket = new WebSocket(socketUrl); } catch { scheduleReconnect(); return; }
    socket.addEventListener("open", () => { reconnectCount = 0; setConnection("online", "Engine online"); });
    socket.addEventListener("message", (message) => {
      try { const event = JSON.parse(message.data); if (event.state) render(event.state, event); } catch { ui.message.textContent = "The cabinet spat out an unreadable ticket. Reconnecting may help."; }
    });
    socket.addEventListener("close", () => { setConnection("offline", "Engine asleep"); scheduleReconnect(); });
    socket.addEventListener("error", () => setConnection("offline", "Engine trouble"));
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    const delay = Math.min(12000, 1500 * (2 ** Math.min(reconnectCount, 3)));
    reconnectCount += 1;
    retryTimer = window.setTimeout(() => connect(), delay);
  }

  connect();
})();
