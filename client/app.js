/* Brass-Hinge Calamity — static Telegram Mini App client. The backend remains authoritative for game state. */
class SFXEngine {
  constructor() {
    this.ctx = null;
    this.armed = false;
    this.muted = false;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      this.ctx = this.ctx || new AudioContext();
      this.armed = true;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  canPlay() {
    return Boolean(!this.muted && this.armed && this.ctx && this.ctx.state === "running");
  }

  tone({ frequency, duration, volume = 0.05, type = "sine", endFrequency = null, delay = 0 }) {
    if (!this.canPlay()) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  playChip() {
    this.tone({ frequency: 195, endFrequency: 132, duration: 0.09, volume: 0.07, type: "triangle" });
    this.tone({ frequency: 420, endFrequency: 285, duration: 0.07, volume: 0.035, type: "sine", delay: 0.04 });
  }

  playAlarm() {
    this.tone({ frequency: 335, endFrequency: 520, duration: 0.22, volume: 0.06, type: "sawtooth" });
    this.tone({ frequency: 520, endFrequency: 335, duration: 0.22, volume: 0.045, type: "sawtooth", delay: 0.23 });
  }

  playTick(isHolder) {
    if (isHolder) {
      this.tone({ frequency: 750, endFrequency: 560, duration: 0.11, volume: 0.045, type: "sawtooth" });
      this.tone({ frequency: 980, endFrequency: 690, duration: 0.065, volume: 0.025, type: "triangle", delay: 0.028 });
      return;
    }
    this.tone({ frequency: 235, endFrequency: 185, duration: 0.065, volume: 0.032, type: "triangle" });
  }

  playPass() {
    this.tone({ frequency: 520, endFrequency: 130, duration: 0.18, volume: 0.045, type: "sawtooth" });
  }

  playExplosion() {
    this.tone({ frequency: 150, endFrequency: 35, duration: 0.48, volume: 0.11, type: "triangle" });
    this.tone({ frequency: 72, endFrequency: 34, duration: 0.38, volume: 0.08, type: "sine", delay: 0.025 });
  }

  playPayout() {
    this.tone({ frequency: 880, duration: 0.085, volume: 0.045, type: "sine", delay: 0.31 });
    this.tone({ frequency: 1175, duration: 0.12, volume: 0.04, type: "sine", delay: 0.405 });
  }
}

(() => {
  const ENDPOINT = "wss://dont-splode-backend.onrender.com/ws";
  const ASSETS = {
    mascot: "./assets/hands-of-calamity.png",
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
  const sfx = new SFXEngine();
  const soundPreferenceKey = "dont-splode-sfx-muted";
  let sfxMuted = localStorage.getItem(soundPreferenceKey) === "true";
  sfx.setMuted(sfxMuted);
  let lastHolderHapticAt = 0;
  let shareMessage = "";
  let playerBalance = null;

  root.innerHTML = `
    <div class="shell">
      <div class="backdrop"></div><div class="grain"></div><div class="smoke-decal"></div>
      <section class="cabinet" data-local-holder="false" aria-label="Dont Splode game cabinet">
        <header class="marquee">
          <span class="brand-mark" aria-label="Dont Splode bomb emblem"></span>
          <div><span class="eyebrow">GROUP GAME / 100 VIRTUAL CHIPS</span><h1 class="wordmark">DON'T SPLODE</h1></div>
          <div class="marquee-tools"><button class="sfx-toggle" id="sfx-toggle" type="button" aria-pressed="false" title="Mute sound effects">SFX ON</button><div class="system-pill" id="connection" data-status="connecting"><span class="lamp"></span><span>Waking engine</span></div></div>
        </header>
        <section class="status-rail" aria-label="Round status">
          <div class="rail-item"><span class="rail-label">Pot</span><strong class="rail-value accent" id="pot-value">—</strong></div>
          <div class="rail-item"><span class="rail-label">Balance</span><strong class="rail-value balance" id="balance-value">—</strong></div>
          <div class="rail-item"><span class="rail-label">Occupants</span><strong class="rail-value" id="player-count">0 / 12</strong></div>
          <div class="rail-item"><span class="rail-label">Round</span><strong class="rail-value" id="round-phase">STANDBY</strong></div>
        </section>
        <section class="chamber" id="chamber" data-phase="lobby">
          <div class="deck-head"><span class="round-tag" id="round-tag">CABINET AWAITS</span><span class="live-tag" id="live-tag" data-urgent="false">SAFE(ISH)</span></div>
          <div class="bomb-stage" id="bomb-stage"><span class="bomb-halo"></span><img class="bomb-mascot" id="bomb-mascot" src="${ASSETS.mascot}" alt="A worried cartoon bomb with a lit fuse, cradled by distressed cartoon gloves" /><span class="bomb-fallback" aria-hidden="true"></span></div>
          <div class="multiplier-wrap"><strong class="multiplier" id="multiplier">1.00×</strong><span class="multiplier-caption">Survival multiplier</span></div>
          <p class="message-board" id="message">Waking the engine room. Please retain all fingers.</p>
          <section class="roster" aria-label="Players in the lobby"><header class="roster-head"><span>Victim manifest</span><span id="roster-count">00 active</span></header><div class="roster-list" id="roster"><div class="roster-empty">The lobby is making eye contact with nobody.</div></div></section>
          <section class="latest-ticket" id="latest-ticket" aria-label="Latest round record" hidden><header class="latest-ticket-head"><span>LAST CABINET INCIDENT</span><span>ON FILE</span></header><dl class="latest-ticket-stats"><div><dt>CRASH</dt><dd id="latest-multiplier">—</dd></div><div><dt>SPLIT</dt><dd id="latest-payout">—</dd></div><div><dt>ESCAPED</dt><dd id="latest-survivors">—</dd></div></dl></section>
        </section>
        <aside class="side-docket" aria-label="Game information"></aside>
        <div class="action-bay"><button class="action-button is-neutral" id="action" type="button" disabled>CONNECTING TO DISASTER</button><button class="lobby-invite" id="lobby-invite" type="button" hidden>POST LOBBY CARD <span aria-hidden="true">↗</span></button><button class="reconnect" id="reconnect" type="button">Reconnect to the engine</button></div>
        <p class="safety-note"><strong>Virtual chips only.</strong> This is a theatrical exercise in probability, not financial advice.</p>
      </section>
      <section class="summary-overlay" id="summary-overlay" role="dialog" aria-modal="true" aria-labelledby="summary-title" aria-describedby="summary-copy" hidden>
        <div class="summary-ticket">
          <span class="summary-kicker">CABINET INCIDENT REPORT</span>
          <h2 id="summary-title">DETONATION REPORT</h2>
          <p class="summary-copy" id="summary-copy">A bad decision has concluded its service.</p>
          <div class="defeat-emblem" aria-hidden="true"><span class="dead-bomb"><i></i></span></div>
          <dl class="summary-stats">
            <div><dt>VAPORIZED</dt><dd id="summary-loser">UNKNOWN</dd></div>
            <div><dt>CRASH POINT</dt><dd id="summary-multiplier">1.00×</dd></div>
            <div><dt>SURVIVOR SPLIT</dt><dd id="summary-payout">0 ◉</dd></div>
          </dl>
          <button class="summary-share" id="summary-share" type="button" hidden>BRAG TO THE GROUP <span aria-hidden="true">↗</span></button>
          <button class="summary-close" id="summary-close" type="button">ACCEPT FATE <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div>`;

  const ui = {
    cabinet: root.querySelector(".cabinet"), chamber: root.querySelector("#chamber"), connection: root.querySelector("#connection"),
    pot: root.querySelector("#pot-value"), balance: root.querySelector("#balance-value"), count: root.querySelector("#player-count"), phase: root.querySelector("#round-phase"),
    roundTag: root.querySelector("#round-tag"), liveTag: root.querySelector("#live-tag"), mascot: root.querySelector("#bomb-mascot"),
    stage: root.querySelector("#bomb-stage"), multiplier: root.querySelector("#multiplier"), message: root.querySelector("#message"),
    roster: root.querySelector("#roster"), rosterCount: root.querySelector("#roster-count"), latestTicket: root.querySelector("#latest-ticket"), latestMultiplier: root.querySelector("#latest-multiplier"), latestPayout: root.querySelector("#latest-payout"), latestSurvivors: root.querySelector("#latest-survivors"), action: root.querySelector("#action"), invite: root.querySelector("#lobby-invite"), reconnect: root.querySelector("#reconnect"), soundToggle: root.querySelector("#sfx-toggle"), summary: root.querySelector("#summary-overlay"), summaryTitle: root.querySelector("#summary-title"), summaryCopy: root.querySelector("#summary-copy"), summaryLoser: root.querySelector("#summary-loser"), summaryMultiplier: root.querySelector("#summary-multiplier"), summaryPayout: root.querySelector("#summary-payout"), summaryShare: root.querySelector("#summary-share"), summaryClose: root.querySelector("#summary-close"),
  };

  ui.mascot.addEventListener("error", () => ui.stage.classList.add("fallback"));
  ui.reconnect.addEventListener("click", () => connect(true));
  ui.action.addEventListener("click", handleAction);
  ui.invite.addEventListener("click", inviteVictims);
  ui.soundToggle.addEventListener("click", toggleSfx);
  ui.summaryShare.addEventListener("click", shareSurvival);
  ui.summaryClose.addEventListener("click", closeRoundSummary);
  ui.summary.addEventListener("pointerdown", (event) => { if (event.target === ui.summary) closeRoundSummary(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !ui.summary.hidden) closeRoundSummary(); });
  updateSoundToggle();

  function setConnection(status, text) {
    ui.connection.dataset.status = status;
    ui.connection.lastElementChild.textContent = text;
    ui.reconnect.classList.toggle("is-visible", status === "offline");
  }

  function updateSoundToggle() {
    ui.soundToggle.textContent = sfxMuted ? "SFX OFF" : "SFX ON";
    ui.soundToggle.setAttribute("aria-pressed", String(!sfxMuted));
    ui.soundToggle.title = sfxMuted ? "Enable sound effects" : "Mute sound effects";
  }

  function toggleSfx() {
    sfxMuted = !sfxMuted;
    sfx.setMuted(sfxMuted);
    try { localStorage.setItem(soundPreferenceKey, String(sfxMuted)); } catch {}
    updateSoundToggle();
  }

  function triggerHaptic(kind) {
    const haptic = telegram?.HapticFeedback;
    if (!haptic) return;
    try {
      if (kind === "tick_holder") {
        const now = Date.now();
        if (now - lastHolderHapticAt < 1200) return;
        lastHolderHapticAt = now;
        haptic.impactOccurred("medium");
      } else if (kind === "pass") haptic.notificationOccurred("success");
      else if (kind === "sploded") haptic.notificationOccurred("error");
    } catch {}
  }

  function showRoundSummary(event) {
    const roundState = event.state || {};
    const players = Array.isArray(roundState.players) ? roundState.players : [];
    const loser = players.find((player) => String(player.id) === String(event.loser));
    const localLoss = String(event.loser) === identity.id;
    const localPlayed = players.some((player) => String(player.id) === identity.id);
    const localSurvived = localPlayed && !localLoss;
    const multiplier = safeNumber(roundState.multiplier, 1).toFixed(2);
    const payout = safeNumber(event.payout);
    ui.summary.classList.toggle("is-defeat", localLoss);
    ui.summaryTitle.textContent = localLoss ? "VAPORIZED!" : "DETONATION REPORT";
    ui.summaryCopy.textContent = localLoss ? "(AND IT WAS YOU.) The cabinet regrets nothing. Your virtual chips have become a cautionary tale." : "Somebody met the fuse. The survivors receive their suspiciously tidy split.";
    ui.summaryLoser.textContent = loser?.name || "UNKNOWN VICTIM";
    ui.summaryMultiplier.textContent = `${multiplier}×`;
    ui.summaryPayout.textContent = `${payout} ◉`;
    shareMessage = localSurvived ? `I dodged the fuse in DON'T SPLODE — ${multiplier}× and ${payout} virtual chips. The cabinet picked somebody else.` : "";
    ui.summaryShare.hidden = !localSurvived;
    ui.summary.hidden = false;
    window.requestAnimationFrame(() => ui.summary.classList.add("is-visible"));
    ui.summaryClose.focus({ preventScroll: true });
  }

  function closeRoundSummary() {
    if (ui.summary.hidden) return;
    ui.summary.classList.remove("is-visible");
    window.setTimeout(() => { if (!ui.summary.classList.contains("is-visible")) ui.summary.hidden = true; }, 180);
  }

  async function shareSurvival() {
    if (!shareMessage) return;
    const pageUrl = `${window.location.origin}${window.location.pathname}`;
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareMessage)}`;
    try {
      if (telegram?.openTelegramLink) {
        telegram.openTelegramLink(telegramShareUrl);
        return;
      }
      if (navigator.share) {
        try {
          await navigator.share({ title: "DON'T SPLODE", text: shareMessage, url: pageUrl });
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      const shareWindow = window.open(telegramShareUrl, "dont-splode-share", "noopener,noreferrer");
      if (!shareWindow && navigator.clipboard) await navigator.clipboard.writeText(`${shareMessage} ${pageUrl}`);
    } catch {}
  }

  async function inviteVictims() {
    const pageUrl = `${window.location.origin}${window.location.pathname}`;
    const inviteText = "DON’T SPLODE lobby is open: 100 virtual chips, one lit fuse, and an excellent chance of embarrassment.";
    try {
      if (telegram?.switchInlineQuery) {
        telegram.switchInlineQuery("lobby", ["groups", "supergroups"]);
        return;
      }
      if (navigator.share) {
        try {
          await navigator.share({ title: "DON'T SPLODE", text: inviteText, url: pageUrl });
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      window.open(`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(inviteText)}`, "dont-splode-invite", "noopener,noreferrer");
    } catch {}
  }

  function safeNumber(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function formatChips(value) { const amount = safeNumber(value); return Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(2); }
  function phraseFor(event) {
    if (!state) return "Waking the engine room. Please retain all fingers.";
    const players = Array.isArray(state.players) ? state.players : [];
    const inLobby = players.some((player) => String(player.id) === identity.id);
    if (event?.type === "reset") return "The cabinet swept the ash aside. Volunteer for virtual peril.";
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

  function renderLatestRound(round, phase) {
    const hasLatestRound = phase === "lobby" && round && Number.isFinite(Number(round.multiplier));
    ui.latestTicket.hidden = !hasLatestRound;
    if (!hasLatestRound) return;
    ui.latestMultiplier.textContent = `${safeNumber(round.multiplier, 1).toFixed(2)}×`;
    ui.latestPayout.textContent = `${formatChips(round.payout)} ◉`;
    const survivors = Math.max(0, Math.floor(safeNumber(round.survivor_count)));
    ui.latestSurvivors.textContent = `${survivors} ${survivors === 1 ? "SOUL" : "SOULS"}`;
  }

  function render(nextState, event = null, eventBalance = null) {
    state = nextState || state;
    lastEvent = event || lastEvent;
    if (!state) return;
    if (Number.isFinite(Number(eventBalance))) playerBalance = Math.max(0, Number(eventBalance));
    const players = Array.isArray(state.players) ? state.players : [];
    const phase = state.phase || "lobby";
    const localHolder = String(state.current_holder) === identity.id;
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    const multiplier = safeNumber(state.multiplier, 1);

    ui.cabinet.dataset.localHolder = String(phase === "running" && localHolder);
    ui.chamber.dataset.phase = phase;
    ui.pot.textContent = `${safeNumber(state.pot)} ◉`;
    ui.balance.textContent = playerBalance === null ? "—" : `${formatChips(playerBalance)} ◉`;
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
    renderLatestRound(state.latest_round, phase);
    if (event?.type === "reset") closeRoundSummary();

    ui.action.className = "action-button";
    ui.action.disabled = false;
    ui.invite.hidden = phase !== "lobby";
    if (phase === "lobby" && !isInLobby) ui.action.textContent = "SIGN THE WAIVER — 100 ◉";
    else if (phase === "lobby" && players.length >= 2) { ui.action.textContent = "LOCK THE DOORS"; ui.action.classList.add("is-start"); }
    else if (phase === "lobby") { ui.action.textContent = "AWAITING ANOTHER VICTIM"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else if (phase === "running" && localHolder) { ui.action.textContent = "PASS THE BOMB — 5 ◉"; ui.action.classList.add("is-pass"); }
    else if (phase === "running") { ui.action.textContent = "PRAYING PROFESSIONALLY"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else { ui.action.textContent = "ROUND CONCLUDED"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
  }

  function handleAction() {
    sfx.init();
    if (!socket || socket.readyState !== WebSocket.OPEN || !state) return;
    const players = Array.isArray(state.players) ? state.players : [];
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    if (state.phase === "lobby") {
      if (!isInLobby) sfx.playChip();
      socket.send(JSON.stringify({ action: isInLobby ? "force_start" : "join" }));
    }
    if (state.phase === "running" && String(state.current_holder) === identity.id) socket.send(JSON.stringify({ action: "pass" }));
  }

  function handleSoundEvent(event, previousState) {
    const nextState = event.state;
    const localHolder = String(nextState.current_holder) === identity.id;
    if (event.type === "start") sfx.playAlarm();
    if (event.type === "tick") {
      sfx.playTick(localHolder);
      if (localHolder) triggerHaptic("tick_holder");
    }
    if (event.type === "sploded") {
      sfx.playExplosion();
      if (String(event.loser) !== identity.id) sfx.playPayout();
      triggerHaptic("sploded");
      showRoundSummary(event);
    }
    if (event.type === "update" && previousState?.phase === "running" && nextState.phase === "running" && String(previousState.current_holder) !== String(nextState.current_holder)) {
      sfx.playPass();
      if (String(previousState.current_holder) === identity.id) triggerHaptic("pass");
    }
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
      try {
        const event = JSON.parse(message.data);
        const previousState = state ? { ...state, players: [...(state.players || [])] } : null;
        if (event.state) {
          handleSoundEvent(event, previousState);
          render(event.state, event, event.balance);
        }
      } catch { ui.message.textContent = "The cabinet spat out an unreadable ticket. Reconnecting may help."; }
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
