/* Brass-Hinge Calamity — static Telegram Mini App client. Personal chips and the communal pot are the cabinet's dominant live instruments. */
/* Brass-Hinge Calamity: the Pit Boss Office is a private brass desk within the same cabinet; backend authority, not hidden UI, guards every ledger action. */
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

  playChipClink() {
    this.tone({ frequency: 1180, endFrequency: 830, duration: 0.055, volume: 0.045, type: "triangle" });
    this.tone({ frequency: 760, endFrequency: 520, duration: 0.075, volume: 0.034, type: "sine", delay: 0.035 });
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

  playElimination() {
    this.tone({ frequency: 96, endFrequency: 28, duration: 0.72, volume: 0.18, type: "sawtooth" });
    this.tone({ frequency: 310, endFrequency: 72, duration: 0.38, volume: 0.1, type: "square", delay: 0.03 });
    this.tone({ frequency: 690, endFrequency: 190, duration: 0.29, volume: 0.07, type: "triangle", delay: 0.07 });
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
  let lastPassDeductionHapticAt = 0;
  let shareMessage = "";
  let playerBalance = null;
  let actionPending = false;
  let dailyClaim = null;
  let dailyClaimPending = false;
  let isPitBoss = false;
  let pitBossAuthorityResolved = false;
  let activeAppRoute = "game";
  let pitBossGrant = null;
  let pitBossDashboard = null;
  let pitBossDashboardRequested = false;
  let pitProfileSearchTimer = null;
  let leaderboard = null;
  let leaderboardView = "competitive";
  let leaderboardScope = "global";
  let groupContextAvailable = false;
  let groupSeasons = null;
  let spectatorMode = false;
  let ignitionHolding = false;
  let potCreditTimer = null;
  let stackDeductionTimer = null;
  const moneyMotion = { balance: { current: null, frame: null, cleanup: null }, pot: { current: null, frame: null, cleanup: null } };
  const launchParams = new URLSearchParams(window.location.search);
  const launchStartParam = telegram?.initDataUnsafe?.start_param || launchParams.get("tgWebAppStartParam") || launchParams.get("startapp") || "";
  let inlineJoinRequested = launchStartParam === "join" || /^join_[A-Za-z0-9_-]{8,24}$/.test(launchStartParam);
  let inlineJoinAttempted = false;

  root.innerHTML = `
    <div class="shell">
      <div class="backdrop"></div><div class="grain"></div><div class="smoke-decal"></div>
      <section class="cabinet" data-local-holder="false" aria-label="Dont Splode game cabinet">
        <header class="marquee">
          <span class="brand-mark" aria-label="Dont Splode bomb emblem"></span>
          <div><span class="eyebrow">GROUP GAME / 100 VIRTUAL CHIPS</span><h1 class="wordmark">DON'T SPLODE</h1></div>
          <div class="marquee-tools"><button class="briefing-toggle" id="briefing-toggle" type="button" title="How Dont Splode works">HOW?</button><button class="pit-office-link" id="pit-office-link" type="button" hidden>OFFICE</button><button class="sfx-toggle" id="sfx-toggle" type="button" aria-pressed="false" title="Mute sound effects">SFX ON</button><div class="system-pill" id="connection" data-status="connecting"><span class="lamp"></span><span>Waking engine</span></div></div>
        </header>
        <section class="financial-console" aria-label="Your virtual chips and the communal pot">
          <div class="finance-instrument finance-wallet" id="balance-instrument" data-known="false"><span class="stack-deduction" id="stack-deduction" aria-hidden="true">−5</span><div class="instrument-head"><span class="finance-label">YOUR CHIP STACK</span><span class="instrument-lamp">PRIVATE</span></div><strong class="finance-value finance-balance" id="balance-value" aria-live="polite">—</strong><span class="finance-note">YOUR RUNNING VIRTUAL BALANCE</span></div>
          <div class="finance-instrument finance-pot" id="pot-instrument" data-phase="lobby"><span class="pot-credit" id="pot-credit" aria-hidden="true">+5 TO POT</span><div class="instrument-head"><span class="finance-label">GROUP POT</span><span class="instrument-lamp">ALL IN</span></div><strong class="finance-value finance-pot-value" id="pot-value" aria-live="polite">—</strong><span class="finance-note">WHAT THE CABINET OWES A SURVIVOR</span></div>
        </section>
        <section class="utility-rail" aria-label="Round status">
          <div class="rail-item"><span class="rail-label">Occupants</span><strong class="rail-value" id="player-count">0 / 12</strong></div>
          <div class="rail-item"><span class="rail-label">Round</span><strong class="rail-value" id="round-phase">STANDBY</strong></div>
        </section>
        <section class="chamber" id="chamber" data-phase="lobby">
          <div class="deck-head"><span class="round-tag" id="round-tag">CABINET AWAITS</span><span class="live-tag" id="live-tag" data-urgent="false">SAFE(ISH)</span></div>
          <div class="bomb-stage" id="bomb-stage" data-handoff-direction="right"><span class="bomb-halo"></span><span class="reaction-burst" id="reaction-burst" aria-hidden="true"></span><span class="handoff-arc" aria-hidden="true"></span><span class="handoff-drop" aria-hidden="true"><span class="handoff-orb"><i></i><b></b></span><span class="handoff-catch"><i></i><i></i></span></span><div class="bomb-portrait" id="bomb-portrait"><img class="bomb-mascot" id="bomb-mascot" src="${ASSETS.mascot}" alt="A worried cartoon bomb with a lit fuse, cradled by distressed cartoon gloves" /><span class="eye-mask eye-mask-left" aria-hidden="true"><i></i></span><span class="eye-mask eye-mask-right" aria-hidden="true"><i></i></span></div><span class="bomb-fallback" aria-hidden="true"></span></div>
          <div class="multiplier-wrap"><strong class="multiplier" id="multiplier">1.00×</strong><span class="multiplier-caption">Survival multiplier</span></div>
          <section class="match-ledger" id="match-ledger" aria-label="Match progress"><span id="round-count">MATCH NOT STARTED</span><span id="eliminated-count">0 ASHED</span></section>
          <p class="message-board" id="message">Waking the engine room. Please retain all fingers.</p>
          <section class="roster" aria-label="Players in the lobby"><header class="roster-head"><span>Victim manifest</span><span id="roster-count">00 active</span></header><div class="roster-list" id="roster"><div class="roster-empty">The lobby is making eye contact with nobody.</div></div></section>
          <section class="latest-ticket" id="latest-ticket" aria-label="Latest round record" hidden><header class="latest-ticket-head"><span>LAST CABINET INCIDENT</span><span>ON FILE</span></header><dl class="latest-ticket-stats"><div><dt>CRASH</dt><dd id="latest-multiplier">—</dd></div><div><dt>POT</dt><dd id="latest-payout">—</dd></div><div><dt>LAST</dt><dd id="latest-survivors">—</dd></div></dl></section>
          <section class="leaderboard" id="leaderboard" aria-labelledby="leaderboard-title"><header class="leaderboard-head"><div><span id="leaderboard-title">HALL OF SURVIVORS</span><small id="leaderboard-count">OPENING THE FILES…</small></div><span class="leaderboard-stamp" id="leaderboard-stamp">ALL TIME</span></header><div class="leaderboard-scope" id="leaderboard-scope" role="group" aria-label="Leaderboard scope"><button id="leaderboard-global" type="button" aria-pressed="true">ALL CABINETS</button><button id="leaderboard-group" type="button" aria-pressed="false" hidden>YOUR GROUP</button></div><div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard view"><button id="leaderboard-competitive" type="button" role="tab" aria-selected="true" aria-controls="leaderboard-list" data-view="competitive">COMPETITIVE RECORD</button><button id="leaderboard-chips" type="button" role="tab" aria-selected="false" aria-controls="leaderboard-list" data-view="chips">CHIP STACK</button></div><p class="leaderboard-copy" id="leaderboard-copy">Final survivals first. Cumulative virtual pots break the tie.</p><ol class="leaderboard-list" id="leaderboard-list" aria-live="polite"><li class="leaderboard-empty">The cabinet has not crowned a survivor yet.</li></ol><div class="leaderboard-viewer" id="leaderboard-viewer" hidden></div></section><section class="season-archive" id="season-archive" aria-labelledby="season-archive-title" hidden><header><div><span id="season-archive-title">WEEKLY ASH ARCHIVE</span><small id="season-week">GROUP CARD REQUIRED</small></div><button id="season-refresh" type="button">OPEN FILE</button></header><p id="season-current">Open from a registered group card to inspect its current weekly survivors.</p><ol id="season-history"></ol></section>
        </section>
        <aside class="side-docket" aria-label="Game information"></aside>
        <div class="action-bay"><button class="action-button is-neutral" id="action" type="button" disabled>CONNECTING TO DISASTER</button><button class="lobby-invite" id="lobby-invite" type="button" hidden>SUMMON FRESH VICTIMS <span aria-hidden="true">↗</span></button><p class="invite-status" id="invite-status" role="status" hidden></p><button class="daily-claim" id="daily-claim" type="button" hidden>DAILY CHIP CACHE — +250 ◉</button><section class="pit-boss" id="pit-boss" hidden aria-label="Pit Boss controls"><span>PIT BOSS CHIP DRAWER <small>LIVE LOBBY / +1–10,000 ◉</small></span><select id="pit-target" aria-label="Choose a live lobby player to receive virtual chips"></select><input id="pit-amount" type="number" inputmode="numeric" min="1" max="10000" step="1" value="100" aria-label="Virtual chips to grant" /><button id="pit-grant" type="button">ISSUE</button></section><section class="pit-boss-admin" id="pit-boss-admin" hidden aria-label="Pit Boss persistent ledger"><header><span>CABINET LEDGER</span><button id="pit-ledger-refresh" type="button">REFRESH</button></header><div class="pit-admin-tools"><div class="pit-admin-search"><input id="pit-profile-search" type="search" placeholder="Search name or @handle" aria-label="Search persistent player profiles by name or public handle" aria-describedby="pit-profile-count" /><button id="pit-profile-search-button" type="button">FIND</button></div><label class="pit-sort-control" for="pit-profile-sort"><span>SORT FILES</span><select id="pit-profile-sort" aria-label="Sort persistent player profiles"><option value="balance_desc">MOST CHIPS</option><option value="balance_asc">LEAST CHIPS</option><option value="recent">RECENT ACTIVITY</option><option value="matches_desc">MOST MATCHES</option><option value="name_asc">NAME A–Z</option></select></label></div><p class="pit-profile-count" id="pit-profile-count" aria-live="polite">Awaiting cabinet files…</p><select id="pit-profile" aria-label="Choose a persistent player profile"></select><p class="pit-profile-summary" id="pit-profile-summary">Opening the cabinet files…</p><ol class="pit-ledger-list" id="pit-ledger-list"></ol><fieldset class="pit-adjustment"><legend>PERMANENT CHIP EDIT</legend><select id="pit-adjust-direction" aria-label="Choose whether to add or remove virtual chips"><option value="add">ADD CHIPS</option><option value="remove">REMOVE CHIPS</option></select><input id="pit-adjust-amount" type="number" inputmode="numeric" min="1" max="10000" step="1" value="100" aria-label="Whole virtual chip adjustment amount" /><input id="pit-adjust-reason" type="text" maxlength="96" placeholder="Reason for this edit" aria-label="Reason for persistent chip adjustment" /><button id="pit-adjust-submit" type="button">STAMP LEDGER</button></fieldset><fieldset class="pit-master-reset"><legend>MASTER CHIP RESET</legend><p>RESTORES EVERY KNOWN STACK TO 500 ◉. SURVIVAL RECORDS STAY ON FILE.</p><input id="pit-master-confirm" type="text" maxlength="32" placeholder="Type RESET ALL CHIPS" aria-label="Type RESET ALL CHIPS to confirm master virtual-chip reset" /><input id="pit-master-reason" type="text" maxlength="96" placeholder="Audit reason for master reset" aria-label="Reason for master virtual-chip reset" /><button id="pit-master-reset" type="button">RESET ALL STACKS TO 500 ◉</button></fieldset><section class="pit-groups"><span>REGISTERED GROUPS</span><ul id="pit-group-list"></ul><small>Use <b>/register_dont_splode</b> inside a Telegram group to put it on file.</small></section></section><button class="reconnect" id="reconnect" type="button">Reconnect to the engine</button></div>
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
            <div><dt id="summary-payout-label">POT AT STAKE</dt><dd id="summary-payout">0 ◉</dd></div>
          </dl>
          <section class="elimination-board" id="elimination-board" aria-live="assertive" hidden><span>WHO STILL HAS A PULSE</span><ol id="elimination-list"></ol></section>
          <button class="summary-share" id="summary-share" type="button" hidden>BRAG TO THE GROUP <span aria-hidden="true">↗</span></button>
          <button class="summary-close" id="summary-close" type="button">ACCEPT FATE <span aria-hidden="true">→</span></button>
        </div>
      </section>
      <section class="briefing-overlay" id="briefing-overlay" role="dialog" aria-modal="true" aria-labelledby="briefing-title" aria-describedby="briefing-copy" hidden>
        <article class="briefing-ticket">
          <header class="briefing-head"><span>CABINET ORIENTATION // 01</span><span>READ THIS FIRST</span></header>
          <div class="briefing-view-switch" role="tablist" aria-label="Instruction view"><button id="briefing-full" type="button" role="tab" aria-selected="true" aria-controls="briefing-full-panel">FULL FILE</button><button id="briefing-degen" type="button" role="tab" aria-selected="false" aria-controls="briefing-degen-panel">DEGEN MODE</button></div>
          <section id="briefing-full-panel" role="tabpanel" aria-labelledby="briefing-full">
          <h2 id="briefing-title">WHAT THE HELL<br>IS GOING ON?</h2>
          <p class="briefing-copy" id="briefing-copy">A group of volunteers passes one lit bomb. The person holding it when the fuse pops is ash. Everyone else keeps the match going until one soul remains.</p>
          <ol class="briefing-steps">
            <li><span>01</span><p><b>CHIPS ARE FAKE.</b> You begin with virtual chips. They cannot be bought, cashed out, or used to disappoint a bank.</p></li>
            <li><span>02</span><p><b>GET SOME.</b> The <em>Daily Chip Cache</em> grants 250 virtual chips once every 24 hours. The Pit Boss may also issue chips in a live lobby.</p></li>
            <li><span>03</span><p><b>BUY A SEAT.</b> Signing the waiver costs 100 ◉. It joins you to the public group lobby and grows the pot.</p></li>
            <li><span>04</span><p><b>LIGHT IT TOGETHER.</b> Once two people join, every signed player holds <em>LIGHT IT UP</em> at the same time to ignite. Let go to cool it down. A full lobby lights instantly; three or more victims light after 45 seconds.</p></li>
            <li><span>05</span><p><b>PASS OR PERISH.</b> The holder pays 5 ◉ to pass the bomb. Each pass adds that fee to the pot. Each blast eliminates only the holder; the final survivor receives the whole virtual pot.</p></li>
          </ol>
          <p class="briefing-footnote">POST THE LOBBY CARD IN A GROUP, THEN WATCH IT UPDATE AS THE CABINET COLLECTS VICTIMS.</p>
          <button class="briefing-dismiss" id="briefing-dismiss" type="button">UNDERSTOOD. OPEN THE CABINET <span aria-hidden="true">→</span></button>
          </section>
          <section class="degen-guide" id="briefing-degen-panel" role="tabpanel" aria-labelledby="briefing-degen" hidden>
            <p class="degen-kicker">ATTENTION SPAN: ADHD AT BEST.</p><h2>DEGEN<br>MODE</h2><p class="degen-copy">Too many words? Fine. Wut do in pictures.</p>
            <ol class="degen-steps"><li><span class="degen-icon" aria-hidden="true">◉</span><div><b>PUSH BUTTON.</b><small>GET DAILY. 250.</small></div></li><li class="degen-arrow" aria-hidden="true">↓</li><li><span class="degen-icon" aria-hidden="true">✍</span><div><b>PUSH OTHER BUTTON</b><small>PAY 100 CHIPS. JOIN ROUND.</small></div></li><li class="degen-arrow" aria-hidden="true">↓</li><li><span class="degen-icon degen-bomb" aria-hidden="true">💣</span><div><b>PASSING BOMB WILL<br>COST YOU A LITTLE</b><small>SPLODING WILL COST YOU EVERYTHING.</small></div></li></ol>
            <p class="degen-footnote">IF EVERYONE AFTER 3 JOINED PLAYERS HOLD LIGHT IT UP SIMULTANEOUSLY, ROUND WILL START INSTANTLY. OTHERWISE WAIT FOR TIMER TO BEGIN.</p><button class="briefing-dismiss degen-dismiss" id="degen-dismiss" type="button">YES. I AM READY TO MAKE THIS WORSE <span aria-hidden="true">→</span></button>
          </section>
        </article>
      </section>
    </div>`;

  const actionBayNode = root.querySelector(".action-bay");
  root.querySelector("#message")?.after(actionBayNode);
  const reactionRailNode = document.createElement("section");
  reactionRailNode.className = "reaction-rail";
  reactionRailNode.id = "reaction-rail";
  reactionRailNode.hidden = true;
  reactionRailNode.setAttribute("aria-label", "Spectator reaction rail");
  reactionRailNode.innerHTML = '<span>SPECTATOR SHOUTS</span><div><button type="button" data-reaction="👀" aria-label="React with eyes">👀</button><button type="button" data-reaction="🔥" aria-label="React with fire">🔥</button><button type="button" data-reaction="😱" aria-label="React with scream">😱</button><button type="button" data-reaction="💥" aria-label="React with explosion">💥</button><button type="button" data-reaction="🪦" aria-label="React with grave">🪦</button></div><small id="reaction-status" role="status">WATCH ONLY. SHOUT WITHOUT TOUCHING THE FUSE.</small>';
  root.querySelector("#action")?.after(reactionRailNode);

  const ui = {
    cabinet: root.querySelector(".cabinet"), chamber: root.querySelector("#chamber"), connection: root.querySelector("#connection"), balanceInstrument: root.querySelector("#balance-instrument"), potInstrument: root.querySelector("#pot-instrument"), potCredit: root.querySelector("#pot-credit"), stackDeduction: root.querySelector("#stack-deduction"),
    pot: root.querySelector("#pot-value"), balance: root.querySelector("#balance-value"), count: root.querySelector("#player-count"), phase: root.querySelector("#round-phase"),
    roundTag: root.querySelector("#round-tag"), liveTag: root.querySelector("#live-tag"), mascot: root.querySelector("#bomb-mascot"),
    stage: root.querySelector("#bomb-stage"), portrait: root.querySelector("#bomb-portrait"), reactionBurst: root.querySelector("#reaction-burst"), multiplier: root.querySelector("#multiplier"), message: root.querySelector("#message"),
    roster: root.querySelector("#roster"), rosterCount: root.querySelector("#roster-count"), roundCount: root.querySelector("#round-count"), eliminatedCount: root.querySelector("#eliminated-count"), latestTicket: root.querySelector("#latest-ticket"), latestMultiplier: root.querySelector("#latest-multiplier"), latestPayout: root.querySelector("#latest-payout"), latestSurvivors: root.querySelector("#latest-survivors"), leaderboard: root.querySelector("#leaderboard"), leaderboardCount: root.querySelector("#leaderboard-count"), leaderboardStamp: root.querySelector("#leaderboard-stamp"), leaderboardGlobal: root.querySelector("#leaderboard-global"), leaderboardGroup: root.querySelector("#leaderboard-group"), leaderboardCompetitive: root.querySelector("#leaderboard-competitive"), leaderboardChips: root.querySelector("#leaderboard-chips"), leaderboardCopy: root.querySelector("#leaderboard-copy"), leaderboardList: root.querySelector("#leaderboard-list"), leaderboardViewer: root.querySelector("#leaderboard-viewer"), seasonArchive: root.querySelector("#season-archive"), seasonWeek: root.querySelector("#season-week"), seasonCurrent: root.querySelector("#season-current"), seasonHistory: root.querySelector("#season-history"), seasonRefresh: root.querySelector("#season-refresh"), action: root.querySelector("#action"), dailyClaim: root.querySelector("#daily-claim"), pitBoss: root.querySelector("#pit-boss"), pitTarget: root.querySelector("#pit-target"), pitAmount: root.querySelector("#pit-amount"), pitGrant: root.querySelector("#pit-grant"), pitAdmin: root.querySelector("#pit-boss-admin"), pitLedgerRefresh: root.querySelector("#pit-ledger-refresh"), pitProfileSearch: root.querySelector("#pit-profile-search"), pitProfileSearchButton: root.querySelector("#pit-profile-search-button"), pitProfileSort: root.querySelector("#pit-profile-sort"), pitProfileCount: root.querySelector("#pit-profile-count"), pitProfile: root.querySelector("#pit-profile"), pitProfileSummary: root.querySelector("#pit-profile-summary"), pitLedgerList: root.querySelector("#pit-ledger-list"), pitAdjustDirection: root.querySelector("#pit-adjust-direction"), pitAdjustAmount: root.querySelector("#pit-adjust-amount"), pitAdjustReason: root.querySelector("#pit-adjust-reason"), pitAdjustSubmit: root.querySelector("#pit-adjust-submit"), pitMasterConfirm: root.querySelector("#pit-master-confirm"), pitMasterReason: root.querySelector("#pit-master-reason"), pitMasterReset: root.querySelector("#pit-master-reset"), pitGroupList: root.querySelector("#pit-group-list"), invite: root.querySelector("#lobby-invite"), inviteStatus: root.querySelector("#invite-status"), reconnect: root.querySelector("#reconnect"), soundToggle: root.querySelector("#sfx-toggle"), briefingToggle: root.querySelector("#briefing-toggle"), briefing: root.querySelector("#briefing-overlay"), briefingDismiss: root.querySelector("#briefing-dismiss"), summary: root.querySelector("#summary-overlay"), summaryTitle: root.querySelector("#summary-title"), summaryCopy: root.querySelector("#summary-copy"), summaryLoser: root.querySelector("#summary-loser"), summaryMultiplier: root.querySelector("#summary-multiplier"), summaryPayout: root.querySelector("#summary-payout"), summaryPayoutLabel: root.querySelector("#summary-payout-label"), summaryShare: root.querySelector("#summary-share"), summaryClose: root.querySelector("#summary-close"),
  };
  ui.briefingFull = root.querySelector("#briefing-full");
  ui.briefingDegen = root.querySelector("#briefing-degen");
  ui.briefingFullPanel = root.querySelector("#briefing-full-panel");
  ui.briefingDegenPanel = root.querySelector("#briefing-degen-panel");
  ui.pitOfficeLink = root.querySelector("#pit-office-link");
  ui.pitOffice = document.createElement("section");
  ui.pitOffice.className = "pit-office";
  ui.pitOffice.id = "pit-office";
  ui.pitOffice.hidden = true;
  ui.pitOffice.setAttribute("aria-label", "Pit Boss Office");
  ui.pitOffice.innerHTML = '<header class="pit-office-head"><div><span>PIT BOSS OFFICE</span><small>LEDGER // LIVE CABINET CONTROL</small></div><button id="pit-office-return" type="button">← RETURN TO CABINET</button></header><p class="pit-office-copy">Private desk. The records are real; the chips are not. Every stamp stays on file.</p>';
  ui.pitOfficeReturn = ui.pitOffice.querySelector("#pit-office-return");
  ui.pitOffice.append(ui.pitBoss, ui.pitAdmin);
  ui.cabinet.append(ui.pitOffice);
  ui.degenDismiss = root.querySelector("#degen-dismiss");
  ui.degenLobby = document.createElement("button");
  ui.degenLobby.className = "degen-lobby-link";
  ui.degenLobby.type = "button";
  ui.degenLobby.hidden = true;
  ui.degenLobby.innerHTML = '<span aria-hidden="true">⚡</span><strong>SHOW DEGEN MODE</strong><small>THREE BOXES. NO THESIS.</small><i aria-hidden="true">→</i>';
  ui.action.after(ui.degenLobby);
  ui.reconnect.textContent = "JOLT THE ENGINE ROOM";
  ui.reactionRail = root.querySelector("#reaction-rail");
  ui.reactionStatus = root.querySelector("#reaction-status");

  ui.mascot.addEventListener("error", () => ui.stage.classList.add("fallback"));
  ui.eliminationBoard = root.querySelector("#elimination-board");
  ui.eliminationList = root.querySelector("#elimination-list");
  ui.reconnect.addEventListener("click", () => connect(true));
  ui.action.addEventListener("click", handleAction);
  ui.action.addEventListener("pointerdown", startIgnitionHold);
  ui.action.addEventListener("pointerup", stopIgnitionHold);
  ui.action.addEventListener("pointercancel", stopIgnitionHold);
  ui.action.addEventListener("pointerleave", stopIgnitionHold);
  ui.action.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") startIgnitionHold(event); });
  ui.action.addEventListener("keyup", (event) => { if (event.key === " " || event.key === "Enter") stopIgnitionHold(event); });
  ui.dailyClaim.addEventListener("click", claimDailyChips);
  ui.pitOfficeLink.addEventListener("click", () => setAppRoute("pit-boss"));
  ui.pitOfficeReturn.addEventListener("click", () => setAppRoute("game"));
  ui.pitGrant.addEventListener("click", grantPitBossChips);
  ui.pitLedgerRefresh.addEventListener("click", () => requestPitBossDashboard(ui.pitProfile.value, ui.pitProfileSearch.value, ui.pitProfileSort.value));
  ui.pitProfileSearchButton.addEventListener("click", runPitBossProfileSearch);
  ui.pitProfileSearch.addEventListener("input", queuePitBossProfileSearch);
  ui.pitProfileSearch.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); runPitBossProfileSearch(); } });
  ui.pitProfileSort.addEventListener("change", () => requestPitBossDashboard(ui.pitProfile.value, ui.pitProfileSearch.value, ui.pitProfileSort.value));
  ui.pitProfile.addEventListener("change", () => requestPitBossDashboard(ui.pitProfile.value, ui.pitProfileSearch.value, ui.pitProfileSort.value));
  ui.pitAdjustSubmit.addEventListener("click", adjustPersistentBalance);
  ui.pitMasterReset.addEventListener("click", masterResetVirtualChips);
  ui.leaderboardGlobal.addEventListener("click", () => selectLeaderboardScope("global"));
  ui.leaderboardGroup.addEventListener("click", () => selectLeaderboardScope("group"));
  ui.seasonRefresh.addEventListener("click", requestSeasonArchive);
  ui.leaderboardCompetitive.addEventListener("click", () => selectLeaderboardView("competitive"));
  ui.leaderboardChips.addEventListener("click", () => selectLeaderboardView("chips"));
  root.querySelectorAll("[data-reaction]").forEach((button) => button.addEventListener("click", () => sendSpectatorReaction(button.dataset.reaction)));
  ui.invite.addEventListener("click", inviteVictims);
  ui.soundToggle.addEventListener("click", toggleSfx);
  ui.briefingToggle.addEventListener("click", () => openBriefing());
  ui.degenLobby.addEventListener("click", () => openBriefing("degen"));
  ui.briefingDismiss.addEventListener("click", closeBriefing);
  ui.degenDismiss.addEventListener("click", closeBriefing);
  ui.briefingFull.addEventListener("click", () => selectBriefingView("full"));
  ui.briefingDegen.addEventListener("click", () => selectBriefingView("degen"));
  ui.briefing.addEventListener("pointerdown", (event) => { if (event.target === ui.briefing) closeBriefing(); });
  ui.summaryShare.addEventListener("click", shareSurvival);
  ui.summaryClose.addEventListener("click", closeRoundSummary);
  ui.summary.addEventListener("pointerdown", (event) => { if (event.target === ui.summary) closeRoundSummary(); });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!ui.summary.hidden) closeRoundSummary();
    else if (!ui.briefing.hidden) closeBriefing();
  });
  window.addEventListener("hashchange", applyAppRoute);
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

  const briefingVersionKey = "dont-splode-briefing-v2";
  const briefingViewKey = "dont-splode-briefing-view";
  function selectBriefingView(view, persist = true) {
    const isDegen = view === "degen";
    ui.briefingFull.setAttribute("aria-selected", String(!isDegen));
    ui.briefingDegen.setAttribute("aria-selected", String(isDegen));
    ui.briefingFullPanel.hidden = isDegen;
    ui.briefingDegenPanel.hidden = !isDegen;
    if (persist) { try { localStorage.setItem(briefingViewKey, isDegen ? "degen" : "full"); } catch {} }
  }
  function openBriefing(forcedView = null) {
    let preferredView = forcedView || "full";
    if (!forcedView) { try { preferredView = localStorage.getItem(briefingViewKey) === "degen" ? "degen" : "full"; } catch {} }
    selectBriefingView(preferredView, false);
    ui.briefing.hidden = false;
    window.requestAnimationFrame(() => ui.briefing.classList.add("is-visible"));
    (preferredView === "degen" ? ui.degenDismiss : ui.briefingDismiss).focus({ preventScroll: true });
  }

  function closeBriefing() {
    ui.briefing.classList.remove("is-visible");
    try { localStorage.setItem(briefingVersionKey, "seen"); } catch {}
    window.setTimeout(() => { if (!ui.briefing.classList.contains("is-visible")) ui.briefing.hidden = true; }, 180);
  }

  function getRequestedAppRoute() {
    return window.location.hash.replace(/^#/, "") === "/pit-boss" ? "pit-boss" : "game";
  }

  function setAppRoute(route) {
    const nextHash = route === "pit-boss" ? "#/pit-boss" : "";
    if (window.location.hash === nextHash) {
      applyAppRoute();
      return;
    }
    window.location.hash = nextHash;
  }

  function applyAppRoute() {
    const requestedRoute = getRequestedAppRoute();
    const showOffice = requestedRoute === "pit-boss" && pitBossAuthorityResolved && isPitBoss;
    const enteringOffice = showOffice && activeAppRoute !== "pit-boss";
    activeAppRoute = showOffice ? "pit-boss" : "game";
    ui.cabinet.dataset.route = activeAppRoute;
    ui.pitOffice.hidden = !showOffice;
    ui.pitOfficeLink.hidden = !(pitBossAuthorityResolved && isPitBoss);
    ui.pitOfficeLink.setAttribute("aria-current", showOffice ? "page" : "false");
    if (requestedRoute === "pit-boss" && pitBossAuthorityResolved && !isPitBoss) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      window.setTimeout(() => { if (state) ui.message.textContent = "That office door is bolted from the inside. Only the verified Pit Boss has the key."; }, 0);
      return;
    }
    if (showOffice) {
      if ((enteringOffice || !pitBossDashboard) && !pitBossDashboardRequested) requestPitBossDashboard(ui.pitProfile.value, ui.pitProfileSearch.value, ui.pitProfileSort.value);
      if (enteringOffice) window.setTimeout(() => ui.pitProfileSearch.focus({ preventScroll: true }), 0);
    }
  }

  function showBriefingOnFirstOpen() {
    try {
      if (localStorage.getItem(briefingVersionKey) === "seen") return;
    } catch {}
    window.setTimeout(openBriefing, 300);
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
      else if (kind === "chip_deduction") {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
        const now = Date.now();
        if (now - lastPassDeductionHapticAt < 650) return;
        lastPassDeductionHapticAt = now;
        haptic.impactOccurred("light");
      }
      else if (kind === "sploded") haptic.notificationOccurred("error");
    } catch {}
  }

  function showRoundSummary(event) {
    const roundState = event.state || {};
    const players = Array.isArray(roundState.players) ? roundState.players : [];
    const eliminated = Array.isArray(roundState.eliminated_players) ? roundState.eliminated_players : [];
    const loser = [...players, ...eliminated].find((player) => String(player.id) === String(event.loser));
    const localLoss = String(event.loser) === identity.id;
    const final = event.final === true;
    const localSurvived = final && players.some((player) => String(player.id) === identity.id) && !localLoss;
    const multiplier = safeNumber(roundState.multiplier, 1).toFixed(2);
    const payout = safeNumber(event.payout);
    ui.summary.classList.toggle("is-defeat", localLoss);
    ui.summary.classList.toggle("is-elimination", !final);
    ui.summaryTitle.textContent = localLoss ? "VAPORIZED!" : localSurvived ? "LAST SOUL STANDING" : final ? "FINAL DETONATION" : "ANOTHER SOUL GONE";
    ui.summaryCopy.textContent = localLoss ? "(AND IT WAS YOU.) You are out of this match, but the cabinet keeps counting the ashes." : localSurvived ? "You outlasted the entire incident. The cabinet disgorged the whole pot with visible reluctance." : final ? "The last standing soul claimed the whole pot. Everyone else is now a cautionary tale." : "The ash is settling. The surviving players get another fuse in three seconds.";
    ui.summaryLoser.textContent = loser?.name || "UNKNOWN VICTIM";
    ui.summaryMultiplier.textContent = `${multiplier}×`;
    ui.summaryPayout.textContent = `${payout} ◉`;
    ui.summaryPayoutLabel.textContent = final ? "FINAL POT" : "POT CARRIES";
    ui.eliminationBoard.hidden = final;
    ui.eliminationList.replaceChildren();
    if (!final) {
      players.forEach((player, index) => {
        const entry = document.createElement("li");
        entry.className = "standing-entry";
        entry.textContent = `${String(index + 1).padStart(2, "0")}  ${player.name || "Anonymous troublemaker"} — STILL BREATHING`;
        ui.eliminationList.append(entry);
      });
      [...eliminated].reverse().forEach((player) => {
        const entry = document.createElement("li");
        entry.className = "standing-entry is-ashed";
        entry.textContent = `✕  ${player.name || "Anonymous ashes"} — ELIMINATED`;
        ui.eliminationList.append(entry);
      });
    }
    shareMessage = localSurvived ? `I was the last soul standing in DON'T SPLODE — ${multiplier}× and ${payout} virtual chips. The cabinet ate everybody else.` : "";
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
        setInviteStatus("Telegram opened the group-card composer. Pick a group, then send the lobby card.");
        return;
      }
      if (telegram?.openTelegramLink) {
        telegram.openTelegramLink("https://t.me/dontsplodebot?startapp=join");
        setInviteStatus("This Telegram client cannot post a group card here. The bot launch was opened instead.");
        return;
      }
      if (navigator.share) {
        try {
          await navigator.share({ title: "DON'T SPLODE", text: inviteText, url: pageUrl });
          setInviteStatus("Link copied into your share sheet. Open it in Telegram to start a lobby, then post a card there.");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      window.open(`https://t.me/share/url?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(inviteText)}`, "dont-splode-invite", "noopener,noreferrer");
      setInviteStatus("Opened a share sheet. A normal browser cannot create the live Telegram group card.");
    } catch { setInviteStatus("The group-card composer did not open. Try from Telegram mobile, not a normal browser."); }
  }

  function setInviteStatus(text) {
    ui.inviteStatus.textContent = text;
    ui.inviteStatus.hidden = !text;
  }

  function safeNumber(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function formatChips(value) { const amount = safeNumber(value); return Number.isInteger(amount) ? amount.toLocaleString() : amount.toFixed(2); }
  function formatClaimWait(seconds) { const total = Math.max(0, Math.floor(safeNumber(seconds))); const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); return hours ? `${hours}H ${minutes}M` : `${Math.max(1, minutes)}M`; }
  function setMoneyInstrument(key, element, instrument, value, shouldAnimate) {
    const motion = moneyMotion[key];
    const target = Math.max(0, safeNumber(value));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (motion.frame) cancelAnimationFrame(motion.frame);
    if (motion.cleanup) clearTimeout(motion.cleanup);
    const start = Number.isFinite(motion.current) ? motion.current : target;
    const show = (amount) => { element.textContent = `${formatChips(amount)} ◉`; };
    const changed = Math.abs(target - start) > 0.001;
    if (!shouldAnimate || reducedMotion || !changed) {
      motion.current = target;
      motion.frame = null;
      instrument.classList.remove("is-counting");
      delete instrument.dataset.countDirection;
      show(target);
      return;
    }
    const direction = target > start ? "up" : "down";
    instrument.classList.remove("is-counting");
    instrument.dataset.countDirection = direction;
    void instrument.offsetWidth;
    instrument.classList.add("is-counting");
    const duration = Math.min(620, Math.max(340, Math.abs(target - start) * 24));
    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const raw = start + (target - start) * eased;
      const shown = Number.isInteger(start) && Number.isInteger(target) ? Math.round(raw) : Math.round(raw * 100) / 100;
      motion.current = shown;
      show(shown);
      if (progress < 1) {
        motion.frame = requestAnimationFrame(tick);
        return;
      }
      motion.current = target;
      motion.frame = null;
      show(target);
      motion.cleanup = window.setTimeout(() => { instrument.classList.remove("is-counting"); delete instrument.dataset.countDirection; motion.cleanup = null; }, 260);
    };
    motion.frame = requestAnimationFrame(tick);
  }
  function showPotCredit(amount) {
    if (amount <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (potCreditTimer) clearTimeout(potCreditTimer);
    ui.potCredit.textContent = `+${formatChips(amount)} TO POT`;
    ui.potCredit.classList.remove("is-burst");
    void ui.potCredit.offsetWidth;
    ui.potCredit.classList.add("is-burst");
    potCreditTimer = window.setTimeout(() => { ui.potCredit.classList.remove("is-burst"); potCreditTimer = null; }, 680);
  }
  function showStackDeduction(amount) {
    if (amount <= 0 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (stackDeductionTimer) clearTimeout(stackDeductionTimer);
    ui.stackDeduction.textContent = `−${formatChips(amount)}`;
    ui.stackDeduction.classList.remove("is-burst");
    void ui.stackDeduction.offsetWidth;
    ui.stackDeduction.classList.add("is-burst");
    stackDeductionTimer = window.setTimeout(() => { ui.stackDeduction.classList.remove("is-burst"); stackDeductionTimer = null; }, 680);
  }
  function confirmPassDeductionFeedback(amount) {
    if (amount <= 0) return;
    sfx.playChipClink();
    triggerHaptic("chip_deduction");
  }
  function runPitBossProfileSearch() {
    if (pitProfileSearchTimer) { clearTimeout(pitProfileSearchTimer); pitProfileSearchTimer = null; }
    requestPitBossDashboard("", ui.pitProfileSearch.value.trim(), ui.pitProfileSort.value);
  }
  function queuePitBossProfileSearch() {
    if (!isPitBoss) return;
    if (pitProfileSearchTimer) clearTimeout(pitProfileSearchTimer);
    pitProfileSearchTimer = window.setTimeout(() => { pitProfileSearchTimer = null; runPitBossProfileSearch(); }, 220);
  }
  function sortPitBossProfiles(profiles) {
    const sort = ui.pitProfileSort?.value || "balance_desc";
    const byName = (left, right) => String(left.name || "").localeCompare(String(right.name || ""), undefined, { sensitivity: "base" });
    return [...profiles].sort((left, right) => {
      if (sort === "balance_asc") return safeNumber(left.balance) - safeNumber(right.balance) || byName(left, right);
      if (sort === "recent") return safeNumber(right.last_seen) - safeNumber(left.last_seen) || byName(left, right);
      if (sort === "matches_desc") return safeNumber(right.matches_entered) - safeNumber(left.matches_entered) || safeNumber(right.balance) - safeNumber(left.balance) || byName(left, right);
      if (sort === "name_asc") return byName(left, right) || safeNumber(right.balance) - safeNumber(left.balance);
      return safeNumber(right.balance) - safeNumber(left.balance) || byName(left, right);
    });
  }
  function requestPitBossDashboard(profileRef = "", search = "", sort = ui.pitProfileSort?.value || "balance_desc") {
    if (!isPitBoss || !socket || socket.readyState !== WebSocket.OPEN) return;
    pitBossDashboardRequested = true;
    try { socket.send(JSON.stringify({ action: "pit_boss_dashboard", profile_ref: profileRef, search, sort })); } catch { pitBossDashboardRequested = false; }
  }
  function adjustPersistentBalance() {
    if (!isPitBoss || !socket || socket.readyState !== WebSocket.OPEN || !ui.pitProfile.value) return;
    const reason = ui.pitAdjustReason.value.trim();
    if (reason.length < 3) { ui.message.textContent = "Write a short reason before stamping a permanent chip edit."; return; }
    ui.pitAdjustSubmit.disabled = true;
    ui.pitAdjustSubmit.textContent = "STAMPING…";
    try { socket.send(JSON.stringify({ action: "pit_boss_adjust", target_ref: ui.pitProfile.value, direction: ui.pitAdjustDirection.value, amount: ui.pitAdjustAmount.value, reason })); } catch { render(state); }
  }
  function masterResetVirtualChips() {
    if (!isPitBoss || !socket || socket.readyState !== WebSocket.OPEN) return;
    const confirmation = ui.pitMasterConfirm.value.trim().toUpperCase();
    const reason = ui.pitMasterReason.value.trim();
    if (confirmation !== "RESET ALL CHIPS") { ui.message.textContent = "Type RESET ALL CHIPS exactly before pulling the master reset lever."; return; }
    if (reason.length < 3) { ui.message.textContent = "Write a short audit reason before resetting every virtual stack."; return; }
    ui.pitMasterReset.disabled = true;
    ui.pitMasterReset.textContent = "RESETTING CABINET…";
    try { socket.send(JSON.stringify({ action: "pit_boss_master_reset", confirmation, reason })); } catch { render(state); }
  }
  function renderPitBossDashboard() {
    ui.pitAdmin.hidden = !isPitBoss;
    if (!isPitBoss) return;
    const dashboard = pitBossDashboard || { profiles: [], ledger: [], groups: [], selected_ref: "" };
    const profiles = sortPitBossProfiles(Array.isArray(dashboard.profiles) ? dashboard.profiles : []);
    const selectedRef = dashboard.selected_ref || ui.pitProfile.value || "";
    const query = ui.pitProfileSearch.value.trim();
    ui.pitProfileCount.textContent = profiles.length
      ? `${profiles.length} CABINET FILE${profiles.length === 1 ? "" : "S"}${query ? ` MATCHING “${query}”` : " ON DISPLAY"}`
      : query ? `NO CABINET FILES MATCH “${query}”` : "NO CABINET FILES ON DISPLAY";
    ui.pitProfile.replaceChildren();
    if (!profiles.length) {
      const option = document.createElement("option"); option.value = ""; option.textContent = "No known player profiles found"; ui.pitProfile.append(option);
    } else {
      profiles.forEach((profile) => {
        const option = document.createElement("option"); option.value = profile.ref;
        option.textContent = `${profile.public_handle ? `@${profile.public_handle}` : profile.name} — ${formatChips(profile.balance)} ◉`;
        ui.pitProfile.append(option);
      });
      ui.pitProfile.value = profiles.some((profile) => profile.ref === selectedRef) ? selectedRef : profiles[0].ref;
    }
    const active = profiles.find((profile) => profile.ref === ui.pitProfile.value);
    ui.pitProfileSummary.textContent = active ? `${active.name}${active.public_handle ? ` / @${active.public_handle}` : ""} — ${formatChips(active.balance)} ◉ • ${active.passes || 0} passes • ${active.matches_entered || 0} matches` : "Search a player profile to inspect the persistent cabinet file.";
    ui.pitLedgerList.replaceChildren();
    const ledger = Array.isArray(dashboard.ledger) ? dashboard.ledger : [];
    if (!ledger.length) { const entry = document.createElement("li"); entry.textContent = "No ledger events on file for this profile."; ui.pitLedgerList.append(entry); }
    else ledger.forEach((event) => {
      const entry = document.createElement("li"); entry.className = Number(event.amount) < 0 ? "is-debit" : "is-credit";
      const amount = `${Number(event.amount) >= 0 ? "+" : ""}${formatChips(event.amount)} ◉`;
      entry.textContent = `${amount} • ${String(event.reason || "ledger_adjustment").replaceAll("_", " ")}${event.note ? ` — ${event.note}` : ""} • ${formatChips(event.balance_after)} ◉`;
      ui.pitLedgerList.append(entry);
    });
    ui.pitGroupList.replaceChildren();
    const groups = Array.isArray(dashboard.groups) ? dashboard.groups : [];
    if (!groups.length) { const entry = document.createElement("li"); entry.textContent = "No groups registered yet."; ui.pitGroupList.append(entry); }
    else groups.forEach((group) => { const entry = document.createElement("li"); entry.textContent = `${group.title} • ${group.games_started || 0} lit / ${group.games_completed || 0} settled`; ui.pitGroupList.append(entry); });
    ui.pitAdjustSubmit.disabled = !ui.pitProfile.value;
    ui.pitAdjustSubmit.textContent = "STAMP LEDGER";
  }
  function phraseFor(event) {
    if (!state) return "Waking the engine room. Please retain all fingers.";
    const players = Array.isArray(state.players) ? state.players : [];
    const eliminated = Array.isArray(state.eliminated_players) ? state.eliminated_players : [];
    const inLobby = players.some((player) => String(player.id) === identity.id);
    const locallyEliminated = eliminated.some((player) => String(player.id) === identity.id);
    if (event?.type === "action_rejected") return event.reason || "The cabinet rejected that particular decision.";
    if (event?.type === "daily_claimed") return `Daily chip cache released ${formatChips(event.claim_amount)} ◉. Spend it irresponsibly.`;
    if (event?.type === "pit_boss_granted") return `The Pit Boss slid ${formatChips(event.grant_amount)} ◉ across the felt. Don’t make it weird.`;
    if (event?.type === "pit_boss_grant_sent") return `You issued ${formatChips(event.grant_amount)} ◉ from the chip drawer.`;
    if (event?.type === "pit_boss_adjusted") return `The cabinet ledger recorded ${Number(event.adjustment_amount) >= 0 ? "+" : ""}${formatChips(event.adjustment_amount)} ◉. ${event.adjustment_reason || "Reason stamped on file."}`;
    if (event?.type === "pit_boss_master_reset") return `Master reset restored ${event.reset_count || 0} virtual stack${Number(event.reset_count) === 1 ? "" : "s"} to 500 ◉. Survival files remain on record.`;
    if (event?.type === "reset") return "The cabinet swept the ash aside. Volunteer for virtual peril.";
    if (event?.type === "eliminated") return String(event.loser) === identity.id ? "You were vaporized. Observe the remaining bad decisions." : `${event.loser_name || "A victim"} was vaporized. The next fuse lights shortly.`;
    if (event?.type === "next_round") return "The cabinet relit the fuse. The survivors are still not safe.";
    if (state.phase === "intermission") return locallyEliminated ? "You are ash for this match. The survivors are reassembling their courage." : "Ash is settling. The next fuse is being installed.";
    if (state.phase === "ended") {
      if (event?.type === "sploded") return `BOOM. ${event?.payout ?? 0} virtual chips went to the last soul standing.`;
      return "Round concluded. The cabinet is cooling its gears.";
    }
    if (state.phase === "running") {
      const holder = players.find((player) => String(player.id) === String(state.current_holder));
      return String(state.current_holder) === identity.id ? "You have the bomb. Pass it before your dignity catches fire." : `${holder?.name || "Some poor soul"} is holding the bomb. Practice looking innocent.`;
    }
    if (!inLobby) return "The lobby is open. Volunteer for virtual peril.";
    if (players.length < 2) return "You’re listed. The cabinet requires one more questionable decision.";
    const readyCount = new Set((state.ready_players || []).map(String)).size;
    const autoStartAt = Number(state.lobby_auto_start_at || 0);
    if (autoStartAt && players.length >= 3) return `Hold LIGHT IT UP together (${readyCount}/${players.length}). The cabinet ignites in ${Math.max(0, Math.ceil(autoStartAt - Date.now() / 1000))} seconds.`;
    return `Hold LIGHT IT UP together (${readyCount}/${players.length}). The full lobby ignites on its own.`;
  }

  function renderRoster(players, eliminatedPlayers, readyPlayers) {
    ui.roster.replaceChildren();
    if (!players.length && !eliminatedPlayers.length) {
      const empty = document.createElement("div"); empty.className = "roster-empty"; empty.textContent = "The lobby is making eye contact with nobody."; ui.roster.append(empty); return;
    }
    players.forEach((player, index) => {
      const row = document.createElement("div");
      const isHolder = String(player.id) === String(state.current_holder);
      row.className = `player-row${isHolder ? " is-holder" : ""}`;
      const number = document.createElement("span"); number.className = "player-index"; number.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span"); name.className = "player-name"; name.textContent = player.name || "Anonymous troublemaker";
      const chip = document.createElement("span"); chip.className = "player-chip"; chip.textContent = isHolder ? "BOMB" : readyPlayers.has(String(player.id)) ? "LIT" : "WAITING";
      row.append(number, name, chip); ui.roster.append(row);
    });
    if (eliminatedPlayers.length) {
      const divider = document.createElement("div"); divider.className = "roster-divider"; divider.textContent = `ASH BIN — ${eliminatedPlayers.length} OUT`; ui.roster.append(divider);
      eliminatedPlayers.forEach((player, index) => {
        const row = document.createElement("div"); row.className = "player-row is-eliminated";
        const number = document.createElement("span"); number.className = "player-index"; number.textContent = String(index + 1).padStart(2, "0");
        const name = document.createElement("span"); name.className = "player-name"; name.textContent = player.name || "Anonymous ashes";
        const chip = document.createElement("span"); chip.className = "player-chip"; chip.textContent = "ASHED";
        row.append(number, name, chip); ui.roster.append(row);
      });
    }
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

  function leaderboardIdentity(row) {
    return row.public_handle ? `@${row.public_handle}` : row.name || "UNKNOWN SOUL";
  }

  function appendLeaderboardRow(row, isViewer = false) {
    const entry = document.createElement("li");
    entry.className = `leaderboard-row${isViewer ? " is-viewer" : ""}`;
    const rank = document.createElement("span"); rank.className = "leaderboard-rank"; rank.textContent = `#${String(row.rank).padStart(2, "0")}`;
    const identityLabel = document.createElement("span"); identityLabel.className = "leaderboard-identity"; identityLabel.textContent = leaderboardIdentity(row);
    const score = document.createElement("span"); score.className = "leaderboard-score";
    score.textContent = leaderboardView === "chips" ? `${formatChips(row.balance)} ◉` : `${row.survivals} SURVIVED • ${formatChips(row.pot_won)} ◉ WON`;
    entry.append(rank, identityLabel, score);
    return entry;
  }

  function renderLeaderboard() {
    const board = leaderboard;
    const boardView = board?.view === "chips" ? "chips" : "competitive";
    if (board) leaderboardView = boardView;
    if (board) leaderboardScope = board.scope === "group" ? "group" : "global";
    ui.leaderboard.dataset.view = leaderboardView;
    ui.leaderboard.dataset.scope = leaderboardScope;
    ui.leaderboardGlobal.setAttribute("aria-pressed", String(leaderboardScope === "global"));
    ui.leaderboardGroup.setAttribute("aria-pressed", String(leaderboardScope === "group"));
    ui.leaderboardGroup.hidden = !groupContextAvailable;
    ui.leaderboardCompetitive.setAttribute("aria-selected", String(leaderboardView === "competitive"));
    ui.leaderboardChips.setAttribute("aria-selected", String(leaderboardView === "chips"));
    ui.leaderboardCompetitive.tabIndex = leaderboardView === "competitive" ? 0 : -1;
    ui.leaderboardChips.tabIndex = leaderboardView === "chips" ? 0 : -1;
    ui.leaderboardStamp.textContent = leaderboardScope === "group" ? "YOUR GROUP" : leaderboardView === "chips" ? "VIRTUAL CHIPS" : "ALL TIME";
    ui.leaderboardCopy.textContent = leaderboardScope === "group"
      ? leaderboardView === "chips" ? "Friends’ virtual stacks only. Pit Boss edits can move this board." : "Your group’s final survivals first. Cumulative virtual pots break the tie."
      : leaderboardView === "chips"
      ? "Virtual chip balances only. Pit Boss edits can move this board."
      : "Final survivals first. Cumulative virtual pots break the tie.";
    ui.leaderboardList.replaceChildren();
    const entries = Array.isArray(board?.entries) ? board.entries : [];
    if (!entries.length) {
      const empty = document.createElement("li"); empty.className = "leaderboard-empty";
      empty.textContent = leaderboardScope === "group" ? "This group has not completed a cabinet incident yet." : leaderboardView === "chips" ? "The cabinet has no chip stacks on file yet." : "The cabinet has not crowned a survivor yet.";
      ui.leaderboardList.append(empty);
    } else entries.forEach((row) => ui.leaderboardList.append(appendLeaderboardRow(row, Number(row.rank) === Number(board?.viewer_rank))));
    const count = Math.max(0, Number(board?.eligible_count || 0));
    ui.leaderboardCount.textContent = board ? `${count} ${count === 1 ? "SOUL" : "SOULS"} ON FILE` : "OPENING THE FILES…";
    ui.leaderboardViewer.replaceChildren();
    if (board?.viewer) {
      const kicker = document.createElement("span"); kicker.className = "leaderboard-viewer-label"; kicker.textContent = "YOUR FILE";
      ui.leaderboardViewer.append(kicker, appendLeaderboardRow(board.viewer, true));
      ui.leaderboardViewer.hidden = false;
    } else ui.leaderboardViewer.hidden = true;
  }

  function leaderboardRowLabel(row) {
    return row?.public_handle ? `@${row.public_handle}` : row?.name || "UNKNOWN SOUL";
  }

  function renderSeasonArchive() {
    const archive = groupSeasons;
    const available = Boolean(groupContextAvailable && archive?.available);
    ui.seasonArchive.hidden = !available;
    if (!available) return;
    const current = archive.current || {};
    const entries = Array.isArray(current.entries) ? current.entries : [];
    ui.seasonWeek.textContent = current.week ? `${current.week} // LIVE FILE` : "CURRENT WEEK";
    const winner = current.winner;
    ui.seasonCurrent.textContent = winner
      ? `${leaderboardRowLabel(winner)} leads this week: ${winner.survivals || 0} survived • ${formatChips(winner.pot_won)} ◉ won.`
      : "No final survivor has been stamped into this week’s file yet.";
    ui.seasonHistory.replaceChildren();
    const archives = Array.isArray(archive.archives) ? archive.archives : [];
    if (!archives.length) {
      const entry = document.createElement("li"); entry.textContent = entries.length ? "First weekly archive is stamped after the UTC week closes." : "No past weekly winner is on file yet."; ui.seasonHistory.append(entry);
      return;
    }
    archives.forEach((snapshot) => {
      const entry = document.createElement("li");
      const winnerRow = snapshot?.winner;
      entry.textContent = winnerRow
        ? `${snapshot.week || "ARCHIVE"} — ${leaderboardRowLabel(winnerRow)} // ${winnerRow.survivals || 0} survived • ${formatChips(winnerRow.pot_won)} ◉ won`
        : `${snapshot?.week || "ARCHIVE"} — No confirmed survivor`;
      ui.seasonHistory.append(entry);
    });
  }

  function requestSeasonArchive() {
    if (!groupContextAvailable || !socket || socket.readyState !== WebSocket.OPEN) return;
    ui.seasonRefresh.disabled = true;
    ui.seasonRefresh.textContent = "OPENING…";
    try { socket.send(JSON.stringify({ action: "season_archive" })); } catch { ui.seasonRefresh.disabled = false; ui.seasonRefresh.textContent = "OPEN FILE"; }
  }

  function sendSpectatorReaction(reaction) {
    const phase = state?.phase;
    if (!spectatorMode || !["running", "intermission"].includes(phase) || !reaction || !socket || socket.readyState !== WebSocket.OPEN) return;
    ui.reactionStatus.textContent = "THE CABINET HEARD THAT.";
    root.querySelectorAll("[data-reaction]").forEach((button) => { button.disabled = true; });
    try { socket.send(JSON.stringify({ action: "spectator_reaction", reaction })); } catch { ui.reactionStatus.textContent = "REACTION RAIL LOST ITS WIRING."; }
    window.setTimeout(() => root.querySelectorAll("[data-reaction]").forEach((button) => { button.disabled = false; }), 1850);
  }

  function showSpectatorReaction(reaction) {
    if (!reaction || !ui.reactionBurst) return;
    const stamp = document.createElement("span");
    stamp.textContent = reaction;
    stamp.style.setProperty("--mid-drift", `${Math.round((Math.random() * 42) - 21)}px`);
    stamp.style.setProperty("--drift", `${Math.round((Math.random() * 118) - 59)}px`);
    const rise = Math.round(128 + (Math.random() * 58));
    stamp.style.setProperty("--rise", `${rise}px`);
    stamp.style.setProperty("--mid-rise", `${Math.round(rise * .47)}px`);
    stamp.style.setProperty("--float-duration", `${Math.round(1320 + (Math.random() * 260))}ms`);
    ui.reactionBurst.append(stamp);
    window.setTimeout(() => stamp.remove(), 1800);
  }

  function selectLeaderboardView(view) {
    const nextView = view === "chips" ? "chips" : "competitive";
    if (nextView === leaderboardView && leaderboard) return;
    leaderboardView = nextView;
    if (leaderboard) leaderboard = { ...leaderboard, view: nextView, scope: leaderboardScope, entries: [], viewer: null };
    renderLeaderboard();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify({ action: "leaderboard", view: nextView, scope: leaderboardScope })); } catch {}
  }
  function selectLeaderboardScope(scope) {
    const nextScope = scope === "group" && groupContextAvailable ? "group" : "global";
    if (nextScope === leaderboardScope && leaderboard) return;
    leaderboardScope = nextScope;
    if (leaderboard) leaderboard = { ...leaderboard, scope: nextScope, entries: [], viewer: null };
    renderLeaderboard();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify({ action: "leaderboard", view: leaderboardView, scope: nextScope })); } catch {}
  }

  function render(nextState, event = null, eventBalance = null, eventDailyClaim = null, eventPitBoss = null, eventPitBossGrant = null) {
    const previousState = state;
    const previousBalance = playerBalance;
    state = nextState || state;
    lastEvent = event || lastEvent;
    if (!state) return;
    if (Number.isFinite(Number(eventBalance))) playerBalance = Math.max(0, Number(eventBalance));
    if (eventDailyClaim && typeof eventDailyClaim === "object") dailyClaim = eventDailyClaim;
    if (typeof eventPitBoss === "boolean") { isPitBoss = eventPitBoss; pitBossAuthorityResolved = true; }
    if (eventPitBossGrant && typeof eventPitBossGrant === "object") pitBossGrant = eventPitBossGrant;
    if (event?.pit_boss_dashboard && typeof event.pit_boss_dashboard === "object") { pitBossDashboard = event.pit_boss_dashboard; pitBossDashboardRequested = false; }
    if (event?.leaderboard && typeof event.leaderboard === "object") leaderboard = event.leaderboard;
    if (typeof event?.group_context_available === "boolean") groupContextAvailable = event.group_context_available;
    if (event?.group_seasons && typeof event.group_seasons === "object") groupSeasons = event.group_seasons;
    if (typeof event?.spectator_mode === "boolean") spectatorMode = event.spectator_mode;
    if (event?.type === "pit_boss_master_reset" || event?.type === "action_rejected") { ui.pitMasterReset.disabled = false; ui.pitMasterReset.textContent = "RESET ALL STACKS TO 500 ◉"; }
    const players = Array.isArray(state.players) ? state.players : [];
    const eliminated = Array.isArray(state.eliminated_players) ? state.eliminated_players : [];
    const phase = state.phase || "lobby";
    const localHolder = String(state.current_holder) === identity.id;
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    const locallyEliminated = eliminated.some((player) => String(player.id) === identity.id);
    const readyPlayers = new Set((state.ready_players || []).map(String));
    const multiplier = safeNumber(state.multiplier, 1);
    const isPassUpdate = event?.type === "update" && previousState?.phase === "running" && phase === "running" && String(previousState.current_holder) !== String(state.current_holder);

    ui.cabinet.dataset.localHolder = String(phase === "running" && localHolder);
    ui.cabinet.dataset.localReady = String(phase === "lobby" && readyPlayers.has(identity.id));
    ui.chamber.dataset.phase = phase;
    setMoneyInstrument("pot", ui.pot, ui.potInstrument, state.pot, isPassUpdate);
    if (isPassUpdate) showPotCredit(Math.max(0, safeNumber(state.pot) - safeNumber(previousState.pot)));
    if (playerBalance === null) {
      if (moneyMotion.balance.frame) cancelAnimationFrame(moneyMotion.balance.frame);
      if (moneyMotion.balance.cleanup) clearTimeout(moneyMotion.balance.cleanup);
      moneyMotion.balance.current = null;
      ui.balance.textContent = "—";
    } else {
      setMoneyInstrument("balance", ui.balance, ui.balanceInstrument, playerBalance, isPassUpdate && previousBalance !== null && playerBalance !== previousBalance);
      if (isPassUpdate && previousBalance !== null) {
        const deduction = Math.max(0, previousBalance - playerBalance);
        showStackDeduction(deduction);
        confirmPassDeductionFeedback(deduction);
      }
    }
    ui.balanceInstrument.dataset.known = String(playerBalance !== null);
    ui.potInstrument.dataset.phase = phase;
    ui.count.textContent = `${players.length} / 12`;
    ui.rosterCount.textContent = `${String(players.length).padStart(2, "0")} active`;
    ui.roundCount.textContent = state.round_number ? `FUSE ${String(state.round_number).padStart(2, "0")}` : "MATCH NOT STARTED";
    ui.eliminatedCount.textContent = `${eliminated.length} ASHED`;
    ui.phase.textContent = phase === "running" ? "LIVE" : phase === "intermission" ? "ASHES" : phase === "ended" ? "ENDED" : "LOBBY";
    ui.roundTag.textContent = phase === "running" ? `FUSE ${state.round_number || 1} IS LIT` : phase === "intermission" ? "ASH SETTLING" : phase === "ended" ? "CABINET RESETTING" : "LOBBY DOORS OPEN";
    ui.liveTag.textContent = phase === "running" ? "LIVE ROUND" : phase === "intermission" ? "NEXT FUSE" : phase === "ended" ? "COOLING OFF" : "SAFE(ISH)";
    ui.liveTag.dataset.urgent = String(phase === "running");
    ui.multiplier.textContent = `${multiplier.toFixed(2)}×`;
    ui.multiplier.className = `multiplier${phase === "running" && localHolder ? " is-danger" : ""}${phase === "ended" ? " is-ended" : ""}`;
    ui.message.textContent = phraseFor(event);
    renderRoster(players, eliminated, readyPlayers);
    renderLatestRound(state.latest_round, phase);
    renderLeaderboard();
    renderSeasonArchive();
    if (event?.type === "season_archive") { ui.seasonRefresh.disabled = false; ui.seasonRefresh.textContent = "OPEN FILE"; }
    if (event?.type === "reset") closeRoundSummary();

    if (event?.type === "action_rejected" || isInLobby || phase !== "lobby") actionPending = false;

    ui.action.className = "action-button";
    ui.action.disabled = actionPending;
    ui.invite.hidden = phase !== "lobby";
    ui.degenLobby.hidden = phase !== "lobby";
    const reactionsAvailable = spectatorMode && ["running", "intermission"].includes(phase);
    ui.reactionRail.hidden = !reactionsAvailable;
    if (reactionsAvailable) ui.reactionStatus.textContent = phase === "running" ? "WATCH ONLY. SHOUT WITHOUT TOUCHING THE FUSE." : "ASH IS SETTLING. MAKE IT TASTELESS.";
    ui.dailyClaim.hidden = !dailyClaim;
    if (dailyClaim) {
      if (event?.type === "daily_claimed" || event?.type === "action_rejected") dailyClaimPending = false;
      ui.dailyClaim.disabled = dailyClaimPending || !dailyClaim.available;
      ui.dailyClaim.textContent = dailyClaimPending ? "OPENING CHIP CACHE…" : dailyClaim.available ? `DAILY CHIP CACHE — +${formatChips(dailyClaim.amount)} ◉` : `CHIP CACHE RETURNS IN ${formatClaimWait(dailyClaim.seconds_until)}`;
    }
    ui.pitBoss.hidden = !isPitBoss;
    if (isPitBoss) {
      const previousTarget = ui.pitTarget.value;
      ui.pitTarget.replaceChildren();
      players.forEach((player) => {
        const option = document.createElement("option");
        option.value = String(player.id);
        option.textContent = player.name || "Anonymous troublemaker";
        ui.pitTarget.append(option);
      });
      if (previousTarget && players.some((player) => String(player.id) === previousTarget)) ui.pitTarget.value = previousTarget;
      ui.pitGrant.disabled = !players.length;
      ui.pitAmount.min = String(pitBossGrant?.min || 1);
      ui.pitAmount.max = String(pitBossGrant?.max || 10000);
      if (!ui.pitAmount.value) ui.pitAmount.value = String(pitBossGrant?.default || 100);
      ui.pitGrant.textContent = "ISSUE";
    }
    renderPitBossDashboard();
    applyAppRoute();
    if (isPitBoss) {
      const masterResetAvailable = phase === "lobby" && players.length === 0;
      ui.pitMasterReset.disabled = !masterResetAvailable;
      ui.pitMasterReset.title = masterResetAvailable ? "Requires RESET ALL CHIPS and an audit reason" : "Master reset is locked until the lobby is empty";
    }
    if (isPitBoss && activeAppRoute === "pit-boss" && !pitBossDashboard && !pitBossDashboardRequested) window.setTimeout(() => requestPitBossDashboard(), 0);
    if (spectatorMode) { ui.action.textContent = phase === "running" ? "WATCHING LIVE — NO WAIVER" : phase === "intermission" ? "WATCHING THE ASH SETTLE" : "WATCH-ONLY CABINET RECORD"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else if (phase === "lobby" && !isInLobby && actionPending) { ui.action.textContent = "SIGNING THE WAIVER…"; ui.action.classList.add("is-neutral"); }
    else if (phase === "lobby" && !isInLobby) ui.action.textContent = "SIGN THE WAIVER — 100 ◉";
    else if (phase === "lobby" && players.length >= 2) { const readyCount = readyPlayers.size; ui.action.textContent = readyPlayers.has(identity.id) ? `HOLDING FLAME — ${readyCount}/${players.length}` : `HOLD LIGHT IT UP — ${readyCount}/${players.length}`; ui.action.classList.add("is-ready"); }
    else if (phase === "lobby") { ui.action.textContent = "AWAITING ANOTHER VICTIM"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else if (phase === "running" && localHolder) { ui.action.textContent = "PASS THE BOMB — 5 ◉"; ui.action.classList.add("is-pass"); }
    else if (phase === "running") { ui.action.textContent = locallyEliminated ? "VAPORIZED — OBSERVING" : "PRAYING PROFESSIONALLY"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else if (phase === "intermission") { ui.action.textContent = locallyEliminated ? "VAPORIZED — OBSERVING" : "ASH SETTLING — STAY READY"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
    else { ui.action.textContent = players.length === 1 && !locallyEliminated ? "LAST SOUL STANDING" : "ROUND CONCLUDED"; ui.action.classList.add("is-neutral"); ui.action.disabled = true; }
  }

  function handleAction() {
    sfx.init();
    if (!socket || socket.readyState !== WebSocket.OPEN || !state || actionPending) return;
    const players = Array.isArray(state.players) ? state.players : [];
    const isInLobby = players.some((player) => String(player.id) === identity.id);
    if (state.phase === "lobby") {
      if (!isInLobby) {
        actionPending = true;
        ui.action.disabled = true;
        ui.action.textContent = "SIGNING THE WAIVER…";
        sfx.playChip();
        try { socket.send(JSON.stringify({ action: "join" })); } catch { actionPending = false; render(state); }
      }
    }
    if (state.phase === "running" && String(state.current_holder) === identity.id) socket.send(JSON.stringify({ action: "pass" }));
  }

  function canHoldIgnition() {
    const players = Array.isArray(state?.players) ? state.players : [];
    return Boolean(socket && socket.readyState === WebSocket.OPEN && state?.phase === "lobby" && players.length >= 2 && players.some((player) => String(player.id) === identity.id));
  }

  function startIgnitionHold(event) {
    if (!canHoldIgnition() || ignitionHolding) return;
    event?.preventDefault?.();
    ignitionHolding = true;
    try { event?.currentTarget?.setPointerCapture?.(event.pointerId); } catch {}
    try { socket.send(JSON.stringify({ action: "light_it_up" })); } catch { ignitionHolding = false; }
  }

  function stopIgnitionHold(event) {
    if (!ignitionHolding) return;
    event?.preventDefault?.();
    ignitionHolding = false;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify({ action: "cool_it_down" })); } catch {}
  }

  function joinFromInlineLobbyCard(nextState) {
    if (!inlineJoinRequested || inlineJoinAttempted || !socket || socket.readyState !== WebSocket.OPEN) return;
    const players = Array.isArray(nextState?.players) ? nextState.players : [];
    const alreadyJoined = players.some((player) => String(player.id) === identity.id);
    if (nextState?.phase !== "lobby" || alreadyJoined) {
      inlineJoinRequested = false;
      return;
    }
    inlineJoinAttempted = true;
    inlineJoinRequested = false;
    actionPending = true;
    ui.action.disabled = true;
    ui.action.textContent = "SIGNING THE WAIVER…";
    try { socket.send(JSON.stringify({ action: "join" })); } catch { actionPending = false; render(nextState); }
  }

  function claimDailyChips() {
    if (!socket || socket.readyState !== WebSocket.OPEN || !dailyClaim?.available || dailyClaimPending) return;
    dailyClaimPending = true;
    ui.dailyClaim.disabled = true;
    ui.dailyClaim.textContent = "OPENING CHIP CACHE…";
    try { socket.send(JSON.stringify({ action: "claim_daily" })); } catch { dailyClaimPending = false; render(state); }
  }

  function grantPitBossChips() {
    if (!isPitBoss || !socket || socket.readyState !== WebSocket.OPEN || !ui.pitTarget.value) return;
    ui.pitGrant.disabled = true;
    ui.pitGrant.textContent = "OPENING DRAWER…";
    try { socket.send(JSON.stringify({ action: "pit_boss_grant", target_id: ui.pitTarget.value, amount: ui.pitAmount.value })); } catch { render(state); }
  }

  function triggerBombHandoff(previousState, nextState) {
    const previousHolder = String(previousState?.current_holder || "");
    const nextHolder = String(nextState?.current_holder || "");
    if (!previousHolder || !nextHolder || previousHolder === nextHolder) return;
    const previousPlayers = Array.isArray(previousState?.players) ? previousState.players : [];
    const priorIndex = previousPlayers.findIndex((player) => String(player.id) === previousHolder);
    const nextIndex = previousPlayers.findIndex((player) => String(player.id) === nextHolder);
    ui.stage.dataset.handoffDirection = priorIndex === previousPlayers.length - 1 && nextIndex === 0 ? "left" : "right";
    ui.stage.classList.remove("is-handoff");
    void ui.stage.offsetWidth;
    ui.stage.classList.add("is-handoff");
    window.setTimeout(() => ui.stage.classList.remove("is-handoff"), 760);
  }

  function handleSoundEvent(event, previousState) {
    const nextState = event.state;
    const localHolder = String(nextState.current_holder) === identity.id;
    if (event.type === "start" || event.type === "next_round") sfx.playAlarm();
    if (event.type === "tick") {
      sfx.playTick(localHolder);
      if (localHolder) triggerHaptic("tick_holder");
    }
    if (event.type === "sploded" || event.type === "eliminated") {
      if (event.type === "eliminated") sfx.playElimination(); else sfx.playExplosion();
      if (event.final && String(event.loser) !== identity.id) sfx.playPayout();
      triggerHaptic("sploded");
      showRoundSummary(event);
    }
    if (event.type === "update" && previousState?.phase === "running" && nextState.phase === "running" && String(previousState.current_holder) !== String(nextState.current_holder)) {
      triggerBombHandoff(previousState, nextState);
      sfx.playPass();
    }
  }

  function connect(manual = false) {
    clearTimeout(retryTimer);
    if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
    setConnection("connecting", manual ? "Re-arming engine" : "Waking engine");
    ui.action.textContent = "CONNECTING TO DISASTER"; ui.action.className = "action-button is-neutral"; ui.action.disabled = true;
    const socketUrl = `${ENDPOINT}/${encodeURIComponent(identity.id)}/${encodeURIComponent(identity.name)}?tg_init_data=${encodeURIComponent(telegram?.initData || "")}`;
    try { socket = new WebSocket(socketUrl); } catch { scheduleReconnect(); return; }
    socket.addEventListener("open", () => { reconnectCount = 0; setConnection("online", "Engine online"); });
    socket.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event?.type === "spectator_reaction") { showSpectatorReaction(event.reaction); return; }
        const previousState = state ? { ...state, players: [...(state.players || [])] } : null;
        if (event.state) {
          handleSoundEvent(event, previousState);
          render(event.state, event, event.balance, event.daily_claim, event.pit_boss, event.pit_boss_grant);
          joinFromInlineLobbyCard(event.state);
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
  showBriefingOnFirstOpen();
})();
