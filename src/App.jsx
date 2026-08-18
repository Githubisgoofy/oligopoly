/*
  PATCH NOTES (bug fixes applied to the file you pasted):

  1) CRITICAL — game freeze on jail:
     In `handleRoll` (human) and the bot autoplay effect, when a player
     is in jail, fails to roll doubles, and hasn't hit 3 turns yet, the
     code set `state.dice` and returned WITHOUT calling `nextTurn()`.
     Since `nextTurn()` is the only place that resets `dice` back to
     null, and the Roll button is disabled while `dice` is truthy, the
     turn could never advance — the game hard-locked as soon as any
     player was jailed and didn't roll doubles. Fixed by calling
     `nextTurn(state)` in that branch (both the human and bot paths),
     while keeping the "3 failed turns -> forced $50 bail" rule intact.

  Everything else in the file is unchanged from what you pasted — only
  the two spots below (search for "FIX:") were touched.
*/

import React, { useState, useEffect, useRef, useCallback } from "react";
import { readRoom, writeRoom, pollRoom, uploadFile, getPublicUrl } from "./supabaseStorage";

/* ------------------------------------------------------------------ */
/*  BOARD DATA                                                         */
/* ------------------------------------------------------------------ */

const GROUP_COLORS = {
  brown: "#8b5e3c",
  cyan: "#a7e0f0",
  pink: "#e86fb0",
  orange: "#f0912b",
  red: "#e5433a",
  yellow: "#f2d13c",
  green: "#3fae5a",
  blue: "#3f6fd1",
};

const RAW_BOARD = [
  { id: 0, name: "GO", type: "corner" },
  { id: 1, name: "Meme Factory", type: "property", group: "brown", price: 60 },
  { id: 2, name: "Lucky Block", type: "lucky" },
  { id: 3, name: "Podcast Booth", type: "property", group: "brown", price: 60 },
  { id: 4, name: "IRS Audit", type: "tax", amount: 200 },
  { id: 5, name: "Slots A", type: "slot", price: 200 },
  { id: 6, name: "Cloud Server", type: "property", group: "cyan", price: 100 },
  { id: 7, name: "Router Hub", type: "property", group: "cyan", price: 100 },
  { id: 8, name: "Lucky Block", type: "lucky" },
  { id: 9, name: "Game Cafe", type: "property", group: "cyan", price: 120 },
  { id: 10, name: "Jail", type: "jail" },
  { id: 11, name: "Vlog House", type: "property", group: "pink", price: 140 },
  { id: 12, name: "Studio Loft", type: "property", group: "pink", price: 140 },
  { id: 13, name: "Slots B", type: "slot", price: 200 },
  { id: 14, name: "Merch Store", type: "property", group: "pink", price: 160 },
  { id: 15, name: "Lucky Block", type: "lucky" },
  { id: 16, name: "Dog Park", type: "property", group: "orange", price: 180 },
  { id: 17, name: "Pet Cafe", type: "property", group: "orange", price: 180 },
  { id: 18, name: "YouTube", type: "property", group: "orange", price: 200 },
  { id: 19, name: "Slots C", type: "slot", price: 200 },
  { id: 20, name: "Free Parking", type: "corner" },
  { id: 21, name: "Search Co", type: "property", group: "red", price: 220 },
  { id: 22, name: "Ad Network", type: "property", group: "red", price: 220 },
  { id: 23, name: "Lucky Block", type: "lucky" },
  { id: 24, name: "Cliffside", type: "property", group: "red", price: 240 },
  { id: 25, name: "Slots D", type: "slot", price: 200 },
  { id: 26, name: "Twitch", type: "property", group: "yellow", price: 260 },
  { id: 27, name: "Live Arena", type: "property", group: "yellow", price: 260 },
  { id: 28, name: "Dog Walkers", type: "property", group: "yellow", price: 280 },
  { id: 29, name: "Lucky Block", type: "lucky" },
  { id: 30, name: "Go To Jail", type: "corner" },
  { id: 31, name: "Birthday Bash", type: "property", group: "green", price: 300 },
  { id: 32, name: "Cat Cafe", type: "property", group: "green", price: 300 },
  { id: 33, name: "PP Tax", type: "tax", amount: 100 },
  { id: 34, name: "Vintage Shop", type: "property", group: "green", price: 320 },
  { id: 35, name: "Slots E", type: "slot", price: 200 },
  { id: 36, name: "Lucky Block", type: "lucky" },
  { id: 37, name: "Search Labs", type: "property", group: "blue", price: 350 },
  { id: 38, name: "Data Cave", type: "property", group: "blue", price: 350 },
  { id: 39, name: "Tailor Shop", type: "property", group: "blue", price: 400 },
];

const LUCKY_CARDS = [
  { text: "Bank error in your favor. Collect $200.", money: 200 },
  { text: "Doctor's fees. Pay $50.", money: -50 },
  { text: "You won a slot machine jackpot! Collect $150.", money: 150 },
  { text: "School fees. Pay $150.", money: -150 },
  { text: "It's your birthday. Collect $10 from every player.", collectFromAll: 10 },
  { text: "Speeding fine. Pay $75.", money: -75 },
  { text: "Advance to GO. Collect $200.", advanceToGo: true },
  { text: "Go directly to jail. Do not pass GO.", goToJail: true },
  { text: "Consulting fee. Collect $25.", money: 25 },
  { text: "Property tax refund. Collect $45.", money: 45 },
  { text: "Chicken jockey chaos. Pay $40.", money: -40 },
  { text: "Slot machine malfunction pays out. Collect $100.", money: 100 },
];

function rentFor(space, ownerProps, groupFullyOwned, railroadsOwned) {
  if (space.type === "property") {
    const base = Math.round(space.price * 0.1) + 2;
    return groupFullyOwned ? base * 2 : base;
  }
  if (space.type === "slot") {
    return 25 * railroadsOwned;
  }
  return 0;
}

const TOKEN_EMOJIS = ["🐱", "🐶", "🦊", "🐸", "🦆", "🐢", "🦁", "🐼"];

// Background music. Drop these two files in your project's /public/audio folder
// (paths below assume that location — adjust if you host them elsewhere).
const MENU_MUSIC_SRC = "/audio/velvet-cornerstones.mp3";
const GAME_MUSIC_SRC = "/audio/velvet-cornerstones-alt.mp3";
const MUSIC_VOLUME = 0.22;

const TOKEN_COLORS = [
  "#e5433a", "#3f6fd1", "#3fae5a", "#f2d13c", "#e86fb0", "#f0912b", "#a7e0f0", "#8b5e3c",
  "#9b59d0", "#2fbfa0", "#ff7a9c", "#c9d13c",
];
const AVATAR_SIZE = 96; // px, square

function processImageToTransparent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext("2d");
        // cover-crop the source image into a square
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

        const data = ctx.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE);
        const px = data.data;
        // sample the four corners to guess the background color
        const corners = [0, (AVATAR_SIZE - 1) * 4, (AVATAR_SIZE - 1) * AVATAR_SIZE * 4, ((AVATAR_SIZE - 1) * AVATAR_SIZE + (AVATAR_SIZE - 1)) * 4];
        let cr = 0, cg = 0, cb = 0;
        corners.forEach((i) => { cr += px[i]; cg += px[i + 1]; cb += px[i + 2]; });
        cr /= 4; cg /= 4; cb /= 4;
        const tolerance = 40;
        for (let i = 0; i < px.length; i += 4) {
          const dr = px[i] - cr, dg = px[i + 1] - cg, db = px[i + 2] - cb;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < tolerance) {
            // fade out pixels close to the guessed background color
            px[i + 3] = Math.max(0, px[i + 3] * (dist / tolerance));
          }
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Avatar({ player, size = 26, ring = true }) {
  if (player.avatar) {
    return (
      <img src={player.avatar} alt={player.name} style={{
        width: size, height: size, borderRadius: "50%", objectFit: "cover",
        border: ring ? `2px solid ${TOKEN_COLORS[player.colorIdx]}` : "none", flexShrink: 0, background: "#fff",
        boxShadow: ring ? `0 0 0 2px rgba(0,0,0,0.35)` : "none",
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: TOKEN_COLORS[player.colorIdx], flexShrink: 0,
      border: "2px solid rgba(255,255,255,0.55)",
      boxShadow: `0 0 0 2px rgba(0,0,0,0.35), inset 0 -3px 5px rgba(0,0,0,0.25), inset 0 2px 3px rgba(255,255,255,0.35)`,
    }} />
  );
}

/* ------------------------------------------------------------------ */
/*  STORAGE HELPERS (shared, polled)                                   */
/* ------------------------------------------------------------------ */

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function initialGameState(code, hostName, hostColorIdx, settings) {
  return {
    code,
    phase: "lobby", // lobby | playing | ended
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings,
    players: [
      {
        id: hostName + "-" + Math.random().toString(36).slice(2, 7),
        name: hostName,
        colorIdx: hostColorIdx,
        money: settings.startingMoney,
        pos: 0,
        inJail: false,
        jailTurns: 0,
        bankrupt: false,
        properties: [],
        isHost: true,
      },
    ],
    turnIdx: 0,
    log: [`${hostName} created the room.`],
    dice: null,
    freeParkingPot: 0,
    ownership: {}, // spaceId -> playerId
    pendingAuction: null,
    pendingTrade: null,
    lastLuckyCard: null,
    awaitingBuyDecision: false,
  };
}

/* ------------------------------------------------------------------ */
/*  BACKGROUND MUSIC                                                   */
/* ------------------------------------------------------------------ */

function BackgroundMusic({ screen }) {
  const menuRef = useRef(null);
  const gameRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false); // browsers block autoplay until a user gesture

  const wantsGameTrack = screen === "game";

  // fade one track in while fading the other out
  const fadeTo = useCallback((activeEl, inactiveEl) => {
    if (!activeEl || !inactiveEl) return;
    let raf;
    const step = () => {
      const target = muted ? 0 : MUSIC_VOLUME;
      activeEl.volume = Math.min(target, (activeEl.volume || 0) + 0.03);
      inactiveEl.volume = Math.max(0, (inactiveEl.volume || 0) - 0.03);
      if (activeEl.volume < target || inactiveEl.volume > 0) raf = requestAnimationFrame(step);
      else if (inactiveEl.volume <= 0) inactiveEl.pause();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [muted]);

  useEffect(() => {
    if (!unlocked) return;
    const menu = menuRef.current, game = gameRef.current;
    if (!menu || !game) return;
    if (wantsGameTrack) {
      if (game.paused) { game.currentTime = game.currentTime || 0; game.play().catch(() => {}); }
      return fadeTo(game, menu);
    } else {
      if (menu.paused) menu.play().catch(() => {});
      return fadeTo(menu, game);
    }
  }, [wantsGameTrack, unlocked, fadeTo]);

  useEffect(() => {
    if (!unlocked) return;
    const active = wantsGameTrack ? gameRef.current : menuRef.current;
    if (active) active.volume = muted ? 0 : MUSIC_VOLUME;
  }, [muted, unlocked, wantsGameTrack]);

  // Most browsers require a user gesture before audio can play — unlock on first click/keypress.
  useEffect(() => {
    if (unlocked) return;
    const unlock = () => {
      setUnlocked(true);
      const el = wantsGameTrack ? gameRef.current : menuRef.current;
      if (el) el.play().catch(() => {});
    };
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [unlocked, wantsGameTrack]);

  return (
    <>
      <audio ref={menuRef} src={MENU_MUSIC_SRC} loop preload="auto" />
      <audio ref={gameRef} src={GAME_MUSIC_SRC} loop preload="auto" />
      <button
        className="og-btn"
        onClick={() => setMuted((m) => !m)}
        title={muted ? "Unmute music" : "Mute music"}
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 100,
          width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
          background: "rgba(23,17,38,0.85)", border: "1px solid #2c2247",
          color: "#a7e0f0", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 16px rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
        }}
      >
        {muted ? "🔇" : "🎵"}
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [screen, setScreen] = useState("start"); // start | settings | lobby | game
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [colorPick, setColorPick] = useState(0);
  const [avatar, setAvatar] = useState(null);
  const [avatarError, setAvatarError] = useState("");
  const [settings, setSettings] = useState({
    auctions: false,
    trading: false,
    freeParking: false,
    freestParking: false,
    bond: false,
    startingMoney: 1500,
  });
  const pollRef = useRef(null);

  // poll room state
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    async function poll() {
      const r = await readRoom(roomCode);
      if (!cancelled && r) setRoom(r);
    }
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [roomCode]);

  useEffect(() => {
    if (room && room.phase === "playing" && screen !== "game") setScreen("game");
    if (room && room.phase === "lobby" && screen === "start") setScreen("lobby");
  }, [room]);

  async function handleAvatarFile(file) {
    setAvatarError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarError("Please pick an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError("Image is too big — 5MB max."); return; }
    try {
      const dataUrl = await processImageToTransparent(file);
      setAvatar(dataUrl);
    } catch (e) {
      setAvatarError(e.message || "Couldn't process that image.");
    }
  }

  async function createRoom() {
    if (!nameInput.trim()) { setError("Enter your name first."); return; }
    setError("");
    setBusy(true);
    try {
      let code = "";
      let state = null;
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        code = makeCode();
        // avoid clobbering an existing room on the rare chance of a code collision
        const existing = await readRoom(code);
        if (existing) { await sleep(80); continue; }
        const id = nameInput.trim() + "-" + Math.random().toString(36).slice(2, 7);
        state = initialGameState(code, nameInput.trim(), colorPick, settings);
        state.players[0].id = id;
        if (avatar) state.players[0].avatar = avatar;
        ok = await writeRoom(code, state);
        if (!ok) await sleep(200 + attempt * 150);
      }
      if (!ok) {
        setError("Couldn't create the room — check your connection and try again.");
        return;
      }
      setMyId(state.players[0].id);
      setMyName(nameInput.trim());
      setRoomCode(code);
      setRoom(state);
      setScreen("lobby");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    if (!nameInput.trim()) { setError("Enter your name first."); return; }
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) { setError("Enter a room code."); return; }
    setError("");
    setBusy(true);
    try {
      const myPlayerId = nameInput.trim() + "-" + Math.random().toString(36).slice(2, 7);
      let ok = false;
      let finalState = null;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        const r = await readRoom(code);
        if (!r) { setError("Room not found. Check the code."); return; }
        if (r.phase !== "lobby") { setError("That game has already started."); return; }
        if (r.players.some((p) => p.name.toLowerCase() === nameInput.trim().toLowerCase())) {
          setError("Someone in the room is already using that name — try a different one.");
          return;
        }
        if (r.players.length >= 8) { setError("That room is full (8 players max)."); return; }
        const takenColors = new Set(r.players.map((p) => p.colorIdx));
        let freeColor = TOKEN_COLORS.findIndex((_, i) => !takenColors.has(i));
        if (freeColor === -1) freeColor = r.players.length % TOKEN_COLORS.length;
        const newPlayer = {
          id: myPlayerId, name: nameInput.trim(), colorIdx: freeColor, money: r.settings.startingMoney,
          pos: 0, inJail: false, jailTurns: 0, bankrupt: false, properties: [], isHost: false,
        };
        if (avatar) newPlayer.avatar = avatar;
        r.players.push(newPlayer);
        r.log = [...r.log, `${nameInput.trim()} joined the room.`];
        r.updatedAt = Date.now();
        ok = await writeRoom(code, r);
        if (ok) { finalState = r; break; }
        await sleep(150 + attempt * 150 + Math.random() * 150); // jitter to de-sync simultaneous joiners
      }
      if (!ok) {
        setError("Couldn't join — someone else was joining at the same time. Try again.");
        return;
      }
      setMyId(myPlayerId);
      setMyName(nameInput.trim());
      setRoomCode(code);
      setRoom(finalState);
      setScreen("lobby");
    } finally {
      setBusy(false);
    }
  }

  if (screen === "start") {
    return (
      <>
        <GlobalStyles />
        <BackgroundMusic screen={screen} />
        <StartScreen
        nameInput={nameInput} setNameInput={setNameInput}
        joinCodeInput={joinCodeInput} setJoinCodeInput={setJoinCodeInput}
        colorPick={colorPick} setColorPick={setColorPick}
        avatar={avatar} onAvatarFile={handleAvatarFile} onClearAvatar={() => setAvatar(null)} avatarError={avatarError}
        error={error}
        onGoSettings={() => setScreen("settings")}
        onJoin={joinRoom}
        />
      </>
    );
  }

  if (screen === "settings") {
    return (
      <>
        <GlobalStyles />
        <BackgroundMusic screen={screen} />
        <SettingsScreen
          settings={settings} setSettings={setSettings}
          onBack={() => setScreen("start")}
          onCreate={createRoom}
        />
      </>
    );
  }

  if (screen === "lobby" && room) {
    return (
      <>
        <GlobalStyles />
        <BackgroundMusic screen={screen} />
        <LobbyScreen
        room={room} myId={myId} roomCode={roomCode}
        onUpdate={setRoom}
        onAddBot={async () => {
          const r = { ...room, players: [...room.players] };
          const takenColors = new Set(r.players.map((p) => p.colorIdx));
          let freeColor = TOKEN_COLORS.findIndex((_, i) => !takenColors.has(i));
          if (freeColor === -1) freeColor = r.players.length % TOKEN_COLORS.length;
          const botNum = r.players.filter((p) => p.isBot).length + 1;
          const bot = {
            id: "bot-" + Math.random().toString(36).slice(2, 8),
            name: `Bot ${botNum}`, colorIdx: freeColor, money: r.settings.startingMoney,
            pos: 0, inJail: false, jailTurns: 0, bankrupt: false, properties: [], isHost: false, isBot: true,
          };
          r.players = [...r.players, bot];
          r.log = [...r.log, `${bot.name} joined the room.`];
          await writeRoom(roomCode, r);
          setRoom(r);
        }}
        onRemoveBot={async (botId) => {
          const r = { ...room, players: room.players.filter((p) => p.id !== botId) };
          await writeRoom(roomCode, r);
          setRoom(r);
        }}
        onStart={async () => {
          const r = { ...room };
          r.phase = "playing";
          r.log.push("Game started! " + r.players[0].name + " goes first.");
          r.updatedAt = Date.now();
          await writeRoom(roomCode, r);
          setRoom(r);
          setScreen("game");
        }}
        />
      </>
    );
  }

  if (screen === "game" && room) {
    return (
      <>
        <GlobalStyles />
        <BackgroundMusic screen={screen} />
        <GameScreen room={room} myId={myId} roomCode={roomCode} onUpdate={setRoom} />
      </>
    );
  }

  return (
    <>
      <GlobalStyles />
        <BackgroundMusic screen={screen} />
      <div style={wrapStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="og-spinner" />
          <p style={{ color: "#a89fc9", fontFamily: "'Inter', sans-serif", fontSize: 13, letterSpacing: 1 }}>Loading…</p>
        </div>
      </div>
    </>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      .og-btn { transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease, opacity 0.12s ease; }
      .og-btn:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
      .og-btn:active:not(:disabled) { transform: translateY(0px) scale(0.97); }
      .og-btn:disabled { cursor: not-allowed; }
      .og-input { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
      .og-input:focus { outline: none; border-color: #ffcf3f !important; box-shadow: 0 0 0 3px rgba(255,207,63,0.18); }
      .og-card { transition: border-color 0.15s ease; }
      .og-swatch { transition: transform 0.12s ease, box-shadow 0.12s ease; }
      .og-swatch:hover { transform: scale(1.14); }
      .og-tile { transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease; }
      .og-tile:hover { background: #241a3d !important; z-index: 2; }
      .og-close:hover { color: #ff8080 !important; }
      @keyframes og-roll { 0% { transform: rotate(0deg) scale(1); } 25% { transform: rotate(-14deg) scale(1.05); } 50% { transform: rotate(10deg) scale(0.96); } 75% { transform: rotate(-6deg) scale(1.04);} 100% { transform: rotate(0deg) scale(1); } }
      .og-dice-rolling { animation: og-roll 0.42s ease-in-out infinite; }
      @keyframes og-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,207,63,0.55); } 50% { box-shadow: 0 0 0 6px rgba(255,207,63,0); } }
      .og-turn-glow { animation: og-pulse 1.6s ease-in-out infinite; }
      @keyframes og-token-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
      .og-token-active { animation: og-token-bob 1.1s ease-in-out infinite; }
      @keyframes og-spin { to { transform: rotate(360deg); } }
      .og-spinner { width: 34px; height: 34px; border-radius: 50%; border: 3px solid #2c2247; border-top-color: #ffcf3f; animation: og-spin 0.8s linear infinite; }
      @keyframes og-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      .og-fade-in { animation: og-fade-in 0.25s ease; }
      @keyframes og-screen-in { from { opacity: 0; transform: translateY(10px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .og-screen-in { animation: og-screen-in 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
      .og-tile, .og-tile * { transition: background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #352a55; border-radius: 8px; }
      ::-webkit-scrollbar-thumb:hover { background: #46396f; }
    `}</style>
  );
}

const wrapStyle = {
  minHeight: "600px",
  background: "radial-gradient(ellipse 900px 500px at 50% -10%, #241a45 0%, #0c0818 55%), #0a0714",
  fontFamily: "'Inter', sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

/* ------------------------------------------------------------------ */
/*  DICE                                                                */
/* ------------------------------------------------------------------ */

const PIP_LAYOUTS = {
  1: [[50, 50]],
  2: [[26, 26], [74, 74]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[26, 26], [26, 74], [74, 26], [74, 74]],
  5: [[26, 26], [26, 74], [50, 50], [74, 26], [74, 74]],
  6: [[26, 24], [26, 50], [26, 76], [74, 24], [74, 50], [74, 76]],
};

function Die({ value, rolling, size = 44 }) {
  const pips = PIP_LAYOUTS[value] || PIP_LAYOUTS[1];
  return (
    <div className={rolling ? "og-dice-rolling" : ""} style={{
      width: size, height: size, borderRadius: size * 0.22, background: "#fff8ea",
      boxShadow: "0 4px 0 #c9b98a, 0 6px 10px rgba(0,0,0,0.4), inset 0 1px 0 #fff",
      position: "relative", flexShrink: 0,
    }}>
      {pips.map(([x, y], i) => (
        <div key={i} style={{
          position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)",
          width: size * 0.16, height: size * 0.16, borderRadius: "50%", background: "#241a3d",
          boxShadow: "inset 0 1px 1px rgba(0,0,0,0.3)",
        }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  START SCREEN                                                       */
/* ------------------------------------------------------------------ */

function StartScreen({ nameInput, setNameInput, joinCodeInput, setJoinCodeInput, colorPick, setColorPick, avatar, onAvatarFile, onClearAvatar, avatarError, error, onGoSettings, onJoin }) {
  const fileInputRef = useRef(null);
  return (
    <div style={wrapStyle} className="og-screen-in">
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: 56, letterSpacing: 2, color: "#ffcf3f", fontFamily: "'Archivo Black', sans-serif",
          textShadow: "3px 3px 0 #e5433a, 6px 6px 0 #0c0818",
          marginBottom: 4, lineHeight: 1,
        }}>OLIGOPOLY</div>
        <div style={{ color: "#a7e0f0", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, marginBottom: 32, letterSpacing: 3 }}>
          HOUSE RULES EDITION · ONLINE
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Your name</label>
          <input
            className="og-input"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Type your name"
            style={inputStyle}
            maxLength={16}
          />

          <label style={{ ...labelStyle, marginTop: 18 }}>Your token</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginBottom: 6 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="og-btn"
              style={{
                width: 64, height: 64, borderRadius: "50%", cursor: "pointer",
                border: `3px dashed ${avatar ? TOKEN_COLORS[colorPick] : "#3f2f66"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", background: "#0c0818", flexShrink: 0,
                backgroundImage: avatar
                  ? "repeating-conic-gradient(#241a3d 0% 25%, #171126 0% 50%)"
                  : "none",
                backgroundSize: "10px 10px",
              }}
            >
              {avatar ? (
                <img src={avatar} alt="your avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ color: "#6a5f8a", fontSize: 22 }}>+</span>
              )}
            </div>
            <div style={{ textAlign: "left", fontFamily: "sans-serif" }}>
              <div style={{ color: "#c9c0e8", fontSize: 12, marginBottom: 4, lineHeight: 1.4 }}>
                Upload a photo — it's auto-cropped square and the background is made transparent.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="og-btn"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "5px 10px", borderRadius: 6, border: "2px solid #3f6fd1", background: "rgba(63,111,209,0.1)",
                    color: "#a7c8f0", fontSize: 12, cursor: "pointer", fontWeight: 700,
                  }}
                >{avatar ? "Change photo" : "Upload photo"}</button>
                {avatar && (
                  <button
                    className="og-btn og-close"
                    onClick={onClearAvatar}
                    style={{
                      padding: "5px 10px", borderRadius: 6, border: "2px solid #4a3f6a", background: "transparent",
                      color: "#8a7fb0", fontSize: 12, cursor: "pointer", fontWeight: 700,
                    }}
                  >Remove</button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { if (e.target.files?.[0]) onAvatarFile(e.target.files[0]); e.target.value = ""; }}
            />
          </div>
          {avatarError && <div style={{ color: "#ff8080", fontSize: 12, marginBottom: 6, fontFamily: "sans-serif" }}>{avatarError}</div>}

          <label style={{ ...labelStyle, marginTop: 12 }}>{avatar ? "Accent color (used as your token's ring)" : "Your token color"}</label>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8, flexWrap: "wrap" }}>
            {TOKEN_COLORS.map((c, i) => (
              <button
                key={i}
                className="og-swatch"
                onClick={() => setColorPick(i)}
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: c,
                  border: colorPick === i ? "3px solid #fff" : "3px solid transparent",
                  boxShadow: colorPick === i ? `0 0 0 3px ${c}55, 0 3px 6px rgba(0,0,0,0.4)` : "0 2px 4px rgba(0,0,0,0.3)",
                  cursor: "pointer", fontSize: 16,
                }}
              >{colorPick === i ? "✓" : ""}</button>
            ))}
          </div>

          <button className="og-btn" style={primaryBtn} onClick={onGoSettings}>Create a new game →</button>

          <div style={{ margin: "22px 0 12px", color: "#6a5f8a", fontSize: 11, letterSpacing: 2, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: "#2c2247" }} />
            OR JOIN A FRIEND
            <div style={{ flex: 1, height: 1, background: "#2c2247" }} />
          </div>

          <input
            className="og-input"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            style={{ ...inputStyle, textAlign: "center", letterSpacing: 4, fontFamily: "'JetBrains Mono', monospace" }}
            maxLength={6}
          />
          <button className="og-btn" style={secondaryBtn} onClick={onJoin}>Join game</button>

          {error && <div style={{ color: "#ff8080", marginTop: 12, fontSize: 13, fontFamily: "sans-serif" }}>{error}</div>}
        </div>

        <div style={{
          marginTop: 22, color: "#4a4070", fontSize: 11, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase",
        }}>
          WinterAG Studios · Original by Tino
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: "linear-gradient(180deg, #191330 0%, #150f28 100%)", border: "1px solid #2c2247", borderRadius: 16,
  padding: 24, boxShadow: "0 14px 44px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)",
};
const labelStyle = { display: "block", color: "#a7e0f0", fontSize: 11, letterSpacing: 2, marginBottom: 7, textAlign: "left", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 };
const inputStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 9, border: "2px solid #352a55",
  background: "#0c0818", color: "#fff", fontSize: 15, marginBottom: 6, boxSizing: "border-box",
  fontFamily: "'Inter', sans-serif",
};
const primaryBtn = {
  width: "100%", padding: "13px", borderRadius: 9, border: "none", marginTop: 18,
  background: "linear-gradient(180deg, #f0554b 0%, #e5433a 100%)", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
  fontFamily: "'Inter', sans-serif", letterSpacing: 0.4,
  boxShadow: "0 4px 0 #a92e26, 0 6px 14px rgba(229,67,58,0.35)",
};
const secondaryBtn = {
  width: "100%", padding: "13px", borderRadius: 9, border: "2px solid #3f6fd1", marginTop: 10,
  background: "rgba(63,111,209,0.08)", color: "#a7c8f0", fontSize: 15, fontWeight: 700, cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
};

/* ------------------------------------------------------------------ */
/*  SETTINGS SCREEN                                                     */
/* ------------------------------------------------------------------ */

function SettingsScreen({ settings, setSettings, onBack, onCreate }) {
  const rules = [
    { key: "auctions", title: "Auctions", desc: "If a player passes on a property (or can't afford it), it's auctioned to the highest bidder." },
    { key: "trading", title: "Trading", desc: "Players may freely trade properties and money with one another." },
    { key: "freeParking", title: "Free Parking", desc: "Money lost to Lucky Block cards and tax spaces piles up here; landing on it collects the pot." },
    { key: "freestParking", title: "Free(est) Parking", desc: "ALL money spent on properties goes to the pot too — bigger jackpots." },
    { key: "bond", title: "Bond", desc: "Pay $50 to get out of jail instead of rolling doubles or waiting." },
  ];
  return (
    <div style={wrapStyle} className="og-screen-in">
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ color: "#ffcf3f", fontSize: 26, marginBottom: 18, textAlign: "center", letterSpacing: 1, fontFamily: "'Archivo Black', sans-serif" }}>GAME SETTINGS</div>
        <div style={cardStyle}>
          {rules.map((r) => (
            <div key={r.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "14px 0", borderBottom: "1px solid #241c3d",
            }}>
              <div style={{ textAlign: "left", paddingRight: 16 }}>
                <div style={{ color: "#fff", fontSize: 14, fontFamily: "sans-serif", fontWeight: 700 }}>{r.title}</div>
                <div style={{ color: "#8a7fb0", fontSize: 12, fontFamily: "sans-serif", marginTop: 3, lineHeight: 1.4 }}>{r.desc}</div>
              </div>
              <Toggle checked={settings[r.key]} onChange={(v) => setSettings((s) => ({ ...s, [r.key]: v }))} />
            </div>
          ))}

          <div style={{ padding: "18px 0 4px", textAlign: "left" }}>
            <label style={labelStyle}>Starting money</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[1000, 1500, 2000, 3000].map((v) => (
                <button key={v} className="og-btn" onClick={() => setSettings((s) => ({ ...s, startingMoney: v }))}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer",
                    border: settings.startingMoney === v ? "2px solid #ffcf3f" : "2px solid #352a55",
                    background: settings.startingMoney === v ? "#3a2f10" : "#0c0818",
                    color: settings.startingMoney === v ? "#ffcf3f" : "#fff",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
                  }}>${v}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button className="og-btn" style={{ ...secondaryBtn, marginTop: 0 }} onClick={onBack}>← Back</button>
            <button className="og-btn" style={{ ...primaryBtn, marginTop: 0 }} onClick={onCreate}>Create room</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      className="og-btn"
      onClick={() => onChange(!checked)}
      style={{
        width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: checked ? "#3fae5a" : "#352a55", position: "relative", flexShrink: 0,
        transition: "background 0.15s",
        boxShadow: checked ? "0 0 0 3px rgba(63,174,90,0.2), inset 0 1px 3px rgba(0,0,0,0.3)" : "inset 0 1px 3px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  LOBBY SCREEN                                                        */
/* ------------------------------------------------------------------ */

function LobbyScreen({ room, myId, roomCode, onUpdate, onStart, onAddBot, onRemoveBot }) {
  const isHost = room.players.find((p) => p.id === myId)?.isHost;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const iv = setInterval(async () => {
      const r = await readRoom(roomCode);
      if (r && !cancelled) onUpdate(r);
    }, 1500);
    return () => { cancelled = true; clearInterval(iv); };
  }, [roomCode]);

  return (
    <div style={wrapStyle} className="og-screen-in">
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{ color: "#ffcf3f", fontSize: 28, marginBottom: 6, fontFamily: "'Archivo Black', sans-serif" }}>LOBBY</div>
        <div style={{ color: "#8a7fb0", fontSize: 13, marginBottom: 20, fontFamily: "sans-serif" }}>
          Share this code with friends so they can join:
        </div>
        <div
          onClick={() => { navigator.clipboard?.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="og-btn"
          style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 34, letterSpacing: 10, color: "#fff",
            background: "#171126", border: "2px dashed #ffcf3f", borderRadius: 12,
            padding: "14px 0", marginBottom: 8, cursor: "pointer",
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >{roomCode}</div>
        <div style={{ color: "#6a5f8a", fontSize: 11, marginBottom: 20 }}>{copied ? "✓ Copied!" : "tap to copy"}</div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>PLAYERS ({room.players.length}/8)</div>
          {room.players.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
              borderBottom: "1px solid #241c3d", textAlign: "left",
            }}>
              <Avatar player={p} size={28} />
              <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 14, flex: 1 }}>
                {p.name}
                {p.isHost && <span style={{ color: "#241a3d", background: "#ffcf3f", fontSize: 10, fontWeight: 800, marginLeft: 8, padding: "2px 6px", borderRadius: 5 }}>HOST</span>}
                {p.isBot && <span style={{ color: "#0f3d24", background: "#3fae5a", fontSize: 10, fontWeight: 800, marginLeft: 8, padding: "2px 6px", borderRadius: 5 }}>BOT</span>}
                {p.id === myId && <span style={{ color: "#6a5f8a", fontSize: 11, marginLeft: 6 }}>(you)</span>}
              </div>
              {isHost && p.isBot && (
                <button className="og-btn og-close" onClick={() => onRemoveBot(p.id)} style={{
                  background: "transparent", border: "none", color: "#8a7fb0", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4,
                }}>×</button>
              )}
            </div>
          ))}

          {isHost && (
            <button
              className="og-btn"
              style={{ ...secondaryBtn, opacity: room.players.length >= 8 ? 0.5 : 1 }}
              disabled={room.players.length >= 8}
              onClick={onAddBot}
            >
              + Add a bot player
            </button>
          )}

          {isHost ? (
            <button
              className="og-btn"
              style={{ ...primaryBtn, opacity: room.players.length < 2 ? 0.5 : 1 }}
              disabled={room.players.length < 2}
              onClick={onStart}
            >
              {room.players.length < 2 ? "Add a bot or wait for a friend…" : "Start game →"}
            </button>
          ) : (
            <div style={{ color: "#8a7fb0", fontSize: 13, marginTop: 16, fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span className="og-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Waiting for the host to start the game…
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, textAlign: "left", fontSize: 12, color: "#6a5f8a", fontFamily: "sans-serif" }}>
          House rules on: {
            [
              room.settings.auctions && "Auctions",
              room.settings.trading && "Trading",
              room.settings.freeParking && "Free Parking",
              room.settings.freestParking && "Free(est) Parking",
              room.settings.bond && "Bond",
            ].filter(Boolean).join(", ") || "none — vanilla rules"
          }
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GAME SCREEN                                                        */
/* ------------------------------------------------------------------ */

function groupSpaces(group) {
  return RAW_BOARD.filter((s) => s.group === group).map((s) => s.id);
}

function GameScreen({ room, myId, roomCode, onUpdate }) {
  const [local, setLocal] = useState(room);
  const [rolling, setRolling] = useState(false);
  const syncingRef = useRef(false);

  useEffect(() => { if (!syncingRef.current) setLocal(room); }, [room]);

  useEffect(() => {
    let cancelled = false;
    const iv = setInterval(async () => {
      const r = await readRoom(roomCode);
      if (r && !cancelled) { onUpdate(r); }
    }, 1500);
    return () => { cancelled = true; clearInterval(iv); };
  }, [roomCode]);

  async function commit(newState) {
    newState.updatedAt = Date.now();
    setLocal(newState);
    onUpdate(newState);
    syncingRef.current = true;
    await writeRoom(roomCode, newState);
    syncingRef.current = false;
  }

  const me = local.players.find((p) => p.id === myId);
  const currentPlayer = local.players[local.turnIdx];
  const myTurn = currentPlayer && currentPlayer.id === myId && !currentPlayer.bankrupt && local.phase === "playing";
  const iAmHost = !!me?.isHost;
  const botActingRef = useRef(false);

  function log(state, msg) { state.log = [...state.log.slice(-30), msg]; }

  function setEvent(state, kind, title, subtitle, playerId) {
    state.lastEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, title, subtitle, playerId: playerId || null };
  }

  function nextTurn(state) {
    let idx = state.turnIdx;
    for (let i = 0; i < state.players.length; i++) {
      idx = (idx + 1) % state.players.length;
      if (!state.players[idx].bankrupt) break;
    }
    state.turnIdx = idx;
    state.dice = null;
    state.awaitingBuyDecision = false;
  }

  function ownerOf(state, spaceId) { return state.ownership[spaceId]; }

  function groupFullyOwned(state, group, playerId) {
    const ids = groupSpaces(group);
    return ids.every((id) => state.ownership[id] === playerId);
  }

  function railroadsOwnedBy(state, playerId) {
    return RAW_BOARD.filter((s) => s.type === "slot" && state.ownership[s.id] === playerId).length;
  }

  // Determine if the game is over (only one non-bankrupt player left) and mark the room as ended.
  function checkWinner(state) {
    if (state.phase === "ended") return;
    const remaining = state.players.filter((p) => !p.bankrupt);
    if (remaining.length <= 1 && state.players.length > 1) {
      state.phase = "ended";
      state.winnerId = remaining[0] ? remaining[0].id : null;
      state.dice = null;
      state.awaitingBuyDecision = false;
      state.pendingAuction = null;
      if (remaining[0]) {
        log(state, `🏆 ${remaining[0].name} wins the game!`);
        setEvent(state, "win", "Game Over", `${remaining[0].name} wins!`, remaining[0].id);
      } else {
        log(state, `Game over — no players remaining.`);
      }
    }
  }

  async function handleRoll() {
    if (!myTurn || local.dice || rolling) return;
    setRolling(true);
    setTimeout(async () => {
      const state = JSON.parse(JSON.stringify(local));
      const p = state.players[state.turnIdx];
      const d1 = 1 + Math.floor(Math.random() * 6);
      const d2 = 1 + Math.floor(Math.random() * 6);
      state.dice = [d1, d2];

      if (p.inJail) {
        if (d1 === d2) {
          p.inJail = false; p.jailTurns = 0;
          log(state, `${p.name} rolled doubles and got out of jail!`);
        } else {
          p.jailTurns += 1;
          log(state, `${p.name} is still in jail (${p.jailTurns}/3 turns).`);
          if (p.jailTurns >= 3) {
            p.inJail = false; p.jailTurns = 0;
            p.money -= 50;
            log(state, `${p.name} paid $50 bail after 3 turns.`);
            checkBankrupt(state, p);
          } else {
            // FIX: previously this returned without ever calling nextTurn(),
            // which left `state.dice` set forever and permanently disabled
            // the Roll button (myTurn check requires !local.dice) — a hard
            // game-freeze. Now we correctly pass the turn to the next player.
            nextTurn(state);
            setRolling(false);
            await commit(state);
            return;
          }
        }
      }

      if (state.phase !== "ended") {
        const steps = d1 + d2;
        const oldPos = p.pos;
        let newPos = (oldPos + steps) % 40;
        if (newPos < oldPos) { p.money += 200; log(state, `${p.name} passed GO and collected $200.`); setEvent(state, "passgo", "Passed GO", `${p.name} collected $200`, p.id); }
        p.pos = newPos;
        resolveLanding(state, p, RAW_BOARD[newPos]);
      }
      setRolling(false);
      await commit(state);
    }, 500);
  }

  function resolveLanding(state, p, space) {
    if (space.type === "corner") {
      if (space.name === "Go To Jail") {
        p.pos = 10; p.inJail = true; p.jailTurns = 0;
        log(state, `${p.name} was sent to jail!`);
        setEvent(state, "jail", "Sent to jail!", `${p.name} didn't pass GO`, p.id);
      } else if (space.name === "Free Parking") {
        if (state.settings.freeParking || state.settings.freestParking) {
          const pot = state.freeParkingPot;
          p.money += pot;
          log(state, `${p.name} landed on Free Parking and collected the $${pot} pot!`);
          if (pot > 0) setEvent(state, "jackpot", "Jackpot!", `${p.name} collected $${pot}`, p.id);
          state.freeParkingPot = 0;
        } else {
          log(state, `${p.name} landed on Free Parking. Nothing happens.`);
        }
      } else {
        log(state, `${p.name} landed on ${space.name}.`);
      }
      nextTurn(state);
      return;
    }
    if (space.type === "tax") {
      p.money -= space.amount;
      if (state.settings.freeParking || state.settings.freestParking) state.freeParkingPot += space.amount;
      log(state, `${p.name} paid $${space.amount} in ${space.name}.`);
      setEvent(state, "tax", space.name, `${p.name} paid $${space.amount}`, p.id);
      checkBankrupt(state, p);
      if (state.phase === "ended") return;
      nextTurn(state);
      return;
    }
    if (space.type === "lucky") {
      const card = LUCKY_CARDS[Math.floor(Math.random() * LUCKY_CARDS.length)];
      state.lastLuckyCard = card.text;
      log(state, `${p.name} drew a Lucky Block: "${card.text}"`);
      setEvent(state, "lucky", "Lucky Block", card.text, p.id);
      if (card.money) {
        p.money += card.money;
        if (card.money < 0 && (state.settings.freeParking || state.settings.freestParking)) state.freeParkingPot += -card.money;
      }
      if (card.advanceToGo) { p.pos = 0; p.money += 200; }
      if (card.goToJail) { p.pos = 10; p.inJail = true; p.jailTurns = 0; }
      if (card.collectFromAll) {
        state.players.forEach((other) => {
          if (other.id !== p.id && !other.bankrupt) {
            other.money -= card.collectFromAll; p.money += card.collectFromAll;
            checkBankrupt(state, other);
          }
        });
      }
      checkBankrupt(state, p);
      if (state.phase === "ended") return;
      nextTurn(state);
      return;
    }
    // property or slot
    const owner = ownerOf(state, space.id);
    if (!owner) {
      state.awaitingBuyDecision = true;
      log(state, `${p.name} landed on ${space.name} ($${space.price}) — unowned.`);
      return; // wait for buy/pass decision, no nextTurn yet
    }
    if (owner === p.id) {
      log(state, `${p.name} landed on their own property, ${space.name}.`);
      nextTurn(state);
      return;
    }
    const ownerPlayer = state.players.find((pl) => pl.id === owner);
    const full = space.type === "property" ? groupFullyOwned(state, space.group, owner) : false;
    const rr = space.type === "slot" ? railroadsOwnedBy(state, owner) : 0;
    const rent = rentFor(space, null, full, rr);
    p.money -= rent;
    ownerPlayer.money += rent;
    log(state, `${p.name} paid $${rent} rent to ${ownerPlayer.name} for ${space.name}${full ? " (monopoly!)" : ""}.`);
    setEvent(state, "rent", "Rent due", `${p.name} paid $${rent} to ${ownerPlayer.name}`, p.id);
    checkBankrupt(state, p);
    if (state.phase === "ended") return;
    nextTurn(state);
  }

  function checkBankrupt(state, p) {
    if (p.money < 0 && !p.bankrupt) {
      p.bankrupt = true;
      log(state, `${p.name} went bankrupt!`);
      setEvent(state, "bankrupt", "Bankrupt", `${p.name} is out of the game`, p.id);
      Object.keys(state.ownership).forEach((id) => { if (state.ownership[id] === p.id) delete state.ownership[id]; });
      p.properties = [];
      checkWinner(state);
    }
  }

  async function handleBuy(buy) {
    const state = JSON.parse(JSON.stringify(local));
    const p = state.players[state.turnIdx];
    const space = RAW_BOARD[p.pos];
    if (buy) {
      p.money -= space.price;
      state.ownership[space.id] = p.id;
      p.properties.push(space.id);
      if (state.settings.freestParking) state.freeParkingPot += space.price;
      log(state, `${p.name} bought ${space.name} for $${space.price}.`);
      setEvent(state, "buy", "Purchased", `${p.name} bought ${space.name}`, p.id);
      state.awaitingBuyDecision = false;
      nextTurn(state);
    } else {
      if (state.settings.auctions) {
        state.pendingAuction = { spaceId: space.id, bids: {}, highBid: 0, highBidder: null, closed: [] };
        log(state, `${p.name} passed. ${space.name} goes to auction!`);
        state.awaitingBuyDecision = false;
      } else {
        log(state, `${p.name} passed on ${space.name}. No auctions rule — it stays unowned.`);
        state.awaitingBuyDecision = false;
        nextTurn(state);
      }
    }
    await commit(state);
  }

  async function handleAuctionBid(amount) {
    const state = JSON.parse(JSON.stringify(local));
    const a = state.pendingAuction;
    if (!a) return;
    if (!Number.isFinite(amount) || amount <= a.highBid) return;
    // A player can never bid more money than they actually have.
    if (!me || amount > me.money) return;
    a.highBid = amount;
    a.highBidder = myId;
    log(state, `${me.name} bid $${amount}.`);
    await commit(state);
  }

  async function handleAuctionClose() {
    const state = JSON.parse(JSON.stringify(local));
    const a = state.pendingAuction;
    if (!a) return;
    const space = RAW_BOARD[a.spaceId];
    if (a.highBidder) {
      const winner = state.players.find((pl) => pl.id === a.highBidder);
      winner.money -= a.highBid;
      state.ownership[space.id] = winner.id;
      winner.properties.push(space.id);
      if (state.settings.freestParking) state.freeParkingPot += a.highBid;
      log(state, `Auction closed: ${winner.name} won ${space.name} for $${a.highBid}.`);
      setEvent(state, "auction_won", "Sold!", `${winner.name} won ${space.name} for $${a.highBid}`, winner.id);
      // Winning an auction can still bankrupt a player if their bid outran a later rent hit;
      // keep the bankruptcy/win check consistent with every other money-losing event.
      checkBankrupt(state, winner);
    } else {
      log(state, `Auction closed: no bids on ${space.name}. It stays unowned.`);
    }
    state.pendingAuction = null;
    if (state.phase !== "ended") nextTurn(state);
    await commit(state);
  }

  async function handlePayBail() {
    const state = JSON.parse(JSON.stringify(local));
    const p = state.players[state.turnIdx];
    if (p.money >= 50) {
      p.money -= 50; p.inJail = false; p.jailTurns = 0;
      log(state, `${p.name} paid the $50 bond to get out of jail.`);
    }
    await commit(state);
  }

  // Bot autoplay: only the host client drives bots, to avoid two clients acting for the same bot.
  useEffect(() => {
    if (!iAmHost || botActingRef.current) return;
    if (local.phase === "ended") return;
    const cp = local.players[local.turnIdx];
    if (!cp || cp.bankrupt) return;

    // Auction with a bot's turn paused mid-way isn't a thing (bots don't pause on buy decisions),
    // but a pending auction from a human pass should auto-close if only bots/host remain to act.
    if (local.pendingAuction) return;

    if (local.awaitingBuyDecision && cp.isBot) {
      botActingRef.current = true;
      const t = setTimeout(async () => {
        const state = JSON.parse(JSON.stringify(local));
        const p = state.players[state.turnIdx];
        const space = RAW_BOARD[p.pos];
        const shouldBuy = p.money - space.price >= 100; // bots keep a small cash buffer
        if (shouldBuy) {
          p.money -= space.price;
          state.ownership[space.id] = p.id;
          p.properties.push(space.id);
          if (state.settings.freestParking) state.freeParkingPot += space.price;
          log(state, `${p.name} (bot) bought ${space.name} for $${space.price}.`);
          setEvent(state, "buy", "Purchased", `${p.name} bought ${space.name}`, p.id);
        } else if (state.settings.auctions) {
          state.pendingAuction = { spaceId: space.id, bids: {}, highBid: 0, highBidder: null, closed: [] };
          log(state, `${p.name} (bot) passed. ${space.name} goes to auction!`);
        } else {
          log(state, `${p.name} (bot) passed on ${space.name}.`);
        }
        state.awaitingBuyDecision = false;
        if (!state.pendingAuction) nextTurn(state);
        botActingRef.current = false;
        await commit(state);
      }, 900);
      return () => clearTimeout(t);
    }

    if (cp.isBot && !local.dice && !local.awaitingBuyDecision) {
      botActingRef.current = true;
      const t = setTimeout(async () => {
        const state = JSON.parse(JSON.stringify(local));
        const p = state.players[state.turnIdx];
        const d1 = 1 + Math.floor(Math.random() * 6);
        const d2 = 1 + Math.floor(Math.random() * 6);
        state.dice = [d1, d2];

        if (p.inJail) {
          if (d1 === d2) {
            p.inJail = false; p.jailTurns = 0;
            log(state, `${p.name} (bot) rolled doubles and got out of jail!`);
          } else if (state.settings.bond && p.money >= 50) {
            p.money -= 50; p.inJail = false; p.jailTurns = 0;
            log(state, `${p.name} (bot) paid the $50 bond.`);
          } else {
            p.jailTurns += 1;
            log(state, `${p.name} (bot) is still in jail (${p.jailTurns}/3 turns).`);
            if (p.jailTurns >= 3) {
              p.inJail = false; p.jailTurns = 0; p.money -= 50;
              log(state, `${p.name} (bot) paid $50 bail after 3 turns.`);
              checkBankrupt(state, p);
            } else {
              // FIX: same freeze bug as the human path above — must advance
              // the turn here too, or the bot (and everyone after it)
              // gets stuck forever with `dice` set and no way to roll again.
              nextTurn(state);
              botActingRef.current = false;
              await commit(state);
              return;
            }
          }
        }

        if (state.phase !== "ended") {
          const steps = d1 + d2;
          const oldPos = p.pos;
          let newPos = (oldPos + steps) % 40;
          if (newPos < oldPos) { p.money += 200; log(state, `${p.name} (bot) passed GO and collected $200.`); setEvent(state, "passgo", "Passed GO", `${p.name} collected $200`, p.id); }
          p.pos = newPos;
          resolveLanding(state, p, RAW_BOARD[newPos]);
        }
        botActingRef.current = false;
        await commit(state);
      }, 900);
      return () => clearTimeout(t);
    }

    // Auto-advance a bot that just rolled and landed somewhere resolved instantly (dice shown, but turn already passed)
  }, [local, iAmHost]);

  // Host also auto-closes auctions after a short window if the only players left are bots.
  useEffect(() => {
    if (!iAmHost || !local.pendingAuction) return;
    const humansLeft = local.players.filter((p) => !p.bankrupt && !p.isBot);
    if (humansLeft.length > 0) return;
    const t = setTimeout(() => { handleAuctionClose(); }, 1500);
    return () => clearTimeout(t);
  }, [local.pendingAuction, iAmHost]);

  const board2d = buildBoardGrid();
  const winner = local.phase === "ended" && local.winnerId ? local.players.find((p) => p.id === local.winnerId) : null;

  return (
    <div style={{ ...wrapStyle, alignItems: "flex-start", flexDirection: "column", gap: 16, padding: 16, position: "relative", overflow: "hidden" }} className="og-screen-in">
      <CutsceneOverlay event={local.lastEvent} players={local.players} />
      {local.phase === "ended" && <GameOverOverlay winner={winner} me={me} />}
      <div style={{ display: "flex", width: "100%", maxWidth: 1760, margin: "0 auto", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, rowGap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <div style={{ color: "#ffcf3f", fontSize: 22, letterSpacing: 1, fontFamily: "'Archivo Black', sans-serif", whiteSpace: "nowrap" }}>OLIGOPOLY</div>
          <div style={{ color: "#4a4070", fontSize: 10, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            WinterAG Studios · Original by Tino
          </div>
        </div>
        <div style={{
          color: "#a7e0f0", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: "#171126",
          border: "1px solid #2c2247", padding: "5px 10px", borderRadius: 7, letterSpacing: 1, flexShrink: 0,
        }}>ROOM {roomCode}</div>
      </div>

      <div style={{ display: "flex", width: "100%", maxWidth: 1760, margin: "0 auto", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "2.4 1 720px", minWidth: 380 }}>
          <BoardView board2d={board2d} state={local} />
        </div>

        <div style={{ flex: "1 1 300px", minWidth: 260, maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 }}>
          <PlayersPanel state={local} myId={myId} />

          <div style={{ ...cardStyle, padding: 20 }} className="og-fade-in">
            {local.phase === "ended" ? (
              <div style={{ textAlign: "center", color: "#c9c0e8", fontFamily: "sans-serif", fontSize: 13 }}>
                {winner ? `🏆 ${winner.name} won the game!` : "Game over."}
              </div>
            ) : local.pendingAuction ? (
              <AuctionPanel state={local} me={me} onBid={handleAuctionBid} onClose={handleAuctionClose} isHost={me?.isHost} />
            ) : local.awaitingBuyDecision && myTurn ? (
              <BuyPanel space={RAW_BOARD[currentPlayer.pos]} me={currentPlayer} onBuy={() => handleBuy(true)} onPass={() => handleBuy(false)} />
            ) : (
              <TurnPanel
                room={local} me={me} myTurn={myTurn} rolling={rolling}
                onRoll={handleRoll} onPayBail={handlePayBail}
              />
            )}
          </div>

          <div style={{ ...cardStyle, padding: 18, maxHeight: 340, overflowY: "auto", textAlign: "left" }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>LOG</div>
            {local.log.slice().reverse().map((l, i) => (
              <div key={i} style={{
                color: i === 0 ? "#d8d0f0" : "#7a7098", fontSize: 12, fontFamily: "'Inter', sans-serif",
                marginBottom: 7, paddingLeft: 10, borderLeft: `2px solid ${i === 0 ? "#ffcf3f" : "#2c2247"}`,
                lineHeight: 1.4,
              }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const EVENT_META = {
  passgo: { icon: "💰", color: "#3fae5a" },
  jail: { icon: "🚔", color: "#e5433a" },
  jackpot: { icon: "🅿️", color: "#ffcf3f" },
  tax: { icon: "🧾", color: "#f0912b" },
  lucky: { icon: "❓", color: "#f2d13c" },
  rent: { icon: "💸", color: "#3f6fd1" },
  buy: { icon: "🏠", color: "#a7e0f0" },
  bankrupt: { icon: "💀", color: "#e5433a" },
  auction_won: { icon: "🔨", color: "#e86fb0" },
  win: { icon: "🏆", color: "#ffcf3f" },
};

function GameOverOverlay({ winner, me }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 60, background: "rgba(8,6,18,0.65)", backdropFilter: "blur(3px)",
    }} className="og-fade-in">
      <div style={{
        background: "linear-gradient(180deg, #211940 0%, #171128 100%)",
        border: "2px solid #ffcf3f", borderRadius: 18, padding: "28px 34px", textAlign: "center",
        boxShadow: "0 0 0 6px rgba(255,207,63,0.15), 0 24px 60px rgba(0,0,0,0.6)", maxWidth: 360,
      }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>🏆</div>
        <div style={{ color: "#ffcf3f", fontFamily: "'Archivo Black', sans-serif", fontSize: 22, marginBottom: 6 }}>GAME OVER</div>
        <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 15, marginBottom: 4 }}>
          {winner ? `${winner.name} wins!` : "No players remaining."}
        </div>
        {winner && me && (
          <div style={{ color: "#8a7fb0", fontFamily: "sans-serif", fontSize: 13 }}>
            {winner.id === me.id ? "Congratulations!" : "Better luck next time."}
          </div>
        )}
      </div>
    </div>
  );
}

function CutsceneOverlay({ event, players }) {
  const [display, setDisplay] = useState(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef(null);
  const timeoutsRef = useRef([]);

  useEffect(() => {
    if (!event || event.id === shownRef.current) return;
    shownRef.current = event.id;
    timeoutsRef.current.forEach(clearTimeout);
    const t1 = setTimeout(() => setVisible(false), 1900);
    const t2 = setTimeout(() => setDisplay(null), 2350);
    timeoutsRef.current = [t1, t2];
    setDisplay(event);
    setVisible(true);
  }, [event]);

  useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);

  if (!display) return null;
  const meta = EVENT_META[display.kind] || { icon: "✨", color: "#ffcf3f" };
  const player = display.playerId ? players.find((p) => p.id === display.playerId) : null;

  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "none", zIndex: 50,
      background: visible ? "rgba(8,6,18,0.35)" : "rgba(8,6,18,0)",
      backdropFilter: visible ? "blur(2px)" : "blur(0px)",
      transition: "background 0.35s ease, backdrop-filter 0.35s ease",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        background: "linear-gradient(180deg, #211940 0%, #171128 100%)",
        border: `2px solid ${meta.color}`, borderRadius: 16, padding: "16px 26px",
        boxShadow: `0 0 0 4px ${meta.color}22, 0 20px 50px rgba(0,0,0,0.6)`,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(14px)",
        transition: "opacity 0.35s cubic-bezier(0.34,1.56,0.64,1), transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        maxWidth: "min(90%, 380px)",
      }}>
        <div style={{ fontSize: 34, flexShrink: 0 }}>{meta.icon}</div>
        <div style={{ textAlign: "left" }}>
          <div style={{
            color: meta.color, fontFamily: "'Archivo Black', sans-serif", fontSize: 17,
            letterSpacing: 0.5, marginBottom: 3, lineHeight: 1.15,
          }}>{display.title}</div>
          {display.subtitle && (
            <div style={{ color: "#c9c0e8", fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.35, display: "flex", alignItems: "center", gap: 6 }}>
              {player && <span style={{ width: 16, height: 16, display: "inline-block" }}><Avatar player={player} size={16} /></span>}
              {display.subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TurnPanel({ room, me, myTurn, rolling, onRoll, onPayBail }) {
  const cp = room.players[room.turnIdx];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...labelStyle, marginBottom: 12, textAlign: "center" }}>
        {myTurn ? "YOUR TURN" : `${cp.name.toUpperCase()}'S TURN`}
      </div>
      {room.dice ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14 }}>
          <Die value={room.dice[0]} rolling={rolling} />
          <Die value={room.dice[1]} rolling={rolling} />
        </div>
      ) : rolling ? (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14 }}>
          <Die value={6} rolling={true} />
          <Die value={6} rolling={true} />
        </div>
      ) : (
        <div style={{ height: 44, marginBottom: 14 }} />
      )}
      {cp.inJail && myTurn && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            color: "#ff9d9d", fontSize: 12, marginBottom: 8, fontFamily: "sans-serif",
            background: "rgba(229,67,58,0.1)", border: "1px solid rgba(229,67,58,0.3)", borderRadius: 8, padding: "8px 10px",
          }}>
            🔒 In jail (turn {cp.jailTurns}/3). Roll doubles to escape{room.settings.bond ? ", or pay a $50 bond." : "."}
          </div>
          {room.settings.bond && (
            <button className="og-btn" style={secondaryBtn} onClick={onPayBail}>Pay $50 bond</button>
          )}
        </div>
      )}
      <button
        className="og-btn"
        style={{ ...primaryBtn, marginTop: 0, opacity: myTurn && !rolling ? 1 : 0.5 }}
        disabled={!myTurn || rolling}
        onClick={onRoll}
      >
        {rolling ? "Rolling…" : myTurn ? "Roll dice" : "Waiting…"}
      </button>
      {me?.bankrupt && <div style={{ color: "#ff8080", marginTop: 10, fontFamily: "sans-serif", fontSize: 13 }}>You're bankrupt — spectating.</div>}
    </div>
  );
}

function BuyPanel({ space, me, onBuy, onPass }) {
  return (
    <div style={{ textAlign: "center" }} className="og-fade-in">
      <div style={{ ...labelStyle, marginBottom: 10, textAlign: "center" }}>UNOWNED SPACE</div>
      {space.group && (
        <div style={{ width: 40, height: 8, borderRadius: 4, background: GROUP_COLORS[space.group], margin: "0 auto 10px" }} />
      )}
      <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{space.name}</div>
      <div style={{ color: "#ffcf3f", fontSize: 24, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginBottom: 14 }}>${space.price}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="og-btn" style={{ ...primaryBtn, marginTop: 0, opacity: me.money >= space.price ? 1 : 0.4 }} disabled={me.money < space.price} onClick={onBuy}>Buy</button>
        <button className="og-btn" style={{ ...secondaryBtn, marginTop: 0 }} onClick={onPass}>Pass</button>
      </div>
    </div>
  );
}

function AuctionPanel({ state, me, onBid, onClose, isHost }) {
  const a = state.pendingAuction;
  const space = RAW_BOARD[a.spaceId];
  const [amt, setAmt] = useState(a.highBid + 10);
  useEffect(() => { setAmt(a.highBid + 10); }, [a.highBid]);
  const highBidderName = a.highBidder ? state.players.find((p) => p.id === a.highBidder)?.name : null;
  const myMoney = me ? me.money : 0;
  const canBid = !!me && !me.bankrupt && amt > a.highBid && amt <= myMoney;
  return (
    <div style={{ textAlign: "center" }} className="og-fade-in">
      <div style={{ ...labelStyle, marginBottom: 10, textAlign: "center" }}>🔨 AUCTION</div>
      <div style={{ color: "#fff", fontFamily: "sans-serif", fontWeight: 800, fontSize: 15 }}>{space.name}</div>
      <div style={{ color: "#8a7fb0", fontSize: 12, margin: "8px 0 12px", fontFamily: "sans-serif" }}>
        Current high bid: <span style={{ color: "#ffcf3f", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>${a.highBid}</span> {highBidderName && `by ${highBidderName}`}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 6 }}>
        <input
          className="og-input" type="number" value={amt}
          onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))}
          max={myMoney}
          style={{ ...inputStyle, width: 90, marginBottom: 0, textAlign: "center" }}
        />
        <button className="og-btn" style={{ ...secondaryBtn, marginTop: 0, width: "auto", padding: "11px 18px", opacity: canBid ? 1 : 0.5 }} disabled={!canBid} onClick={() => onBid(amt)}>Bid</button>
      </div>
      <div style={{ color: "#6a5f8a", fontSize: 11, marginBottom: 10, fontFamily: "sans-serif" }}>
        You have ${myMoney}{amt > myMoney ? " — not enough for that bid" : ""}
      </div>
      {isHost && <button className="og-btn" style={{ ...primaryBtn, marginTop: 4 }} onClick={onClose}>Close auction</button>}
    </div>
  );
}

function MoneyTag({ amount }) {
  const prevRef = useRef(amount);
  const [flash, setFlash] = useState(null); // 'up' | 'down' | null
  useEffect(() => {
    if (prevRef.current !== amount) {
      setFlash(amount > prevRef.current ? "up" : "down");
      prevRef.current = amount;
      const t = setTimeout(() => setFlash(null), 900);
      return () => clearTimeout(t);
    }
  }, [amount]);
  const color = flash === "up" ? "#3fae5a" : flash === "down" ? "#e5433a" : "#a7e0f0";
  return (
    <span style={{
      color, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
      transition: "color 0.5s ease, transform 0.25s ease",
      transform: flash ? "scale(1.12)" : "scale(1)", display: "inline-block",
    }}>${amount}</span>
  );
}

function PlayersPanel({ state, myId }) {
  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <div style={{ ...labelStyle, marginBottom: 12 }}>PLAYERS</div>
      {state.players.map((p, i) => {
        const isTurn = i === state.turnIdx;
        return (
          <div key={p.id} className={isTurn ? "og-turn-glow" : ""} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "8px 9px",
            opacity: p.bankrupt ? 0.4 : 1,
            background: isTurn ? "rgba(255,207,63,0.08)" : "transparent",
            borderRadius: 9, marginBottom: 3,
            border: isTurn ? "1px solid rgba(255,207,63,0.35)" : "1px solid transparent",
            textAlign: "left",
            transition: "background 0.4s ease, border-color 0.4s ease, opacity 0.4s ease",
          }}>
            <Avatar player={p} size={22} />
            <div style={{ flex: 1, color: "#fff", fontFamily: "sans-serif", fontSize: 13, fontWeight: isTurn ? 700 : 500, transition: "font-weight 0.3s ease" }}>
              {p.name}{p.id === myId && <span style={{ color: "#6a5f8a" }}> (you)</span>}{p.inJail && " 🔒"}{p.bankrupt && " 💀"}
            </div>
            <MoneyTag amount={p.money} />
          </div>
        );
      })}
      {(state.settings.freeParking || state.settings.freestParking) && (
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: "1px solid #241c3d", color: "#ffcf3f", fontSize: 12,
          fontFamily: "sans-serif", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>🅿️ Free Parking pot</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>${state.freeParkingPot}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BOARD VIEW                                                         */
/* ------------------------------------------------------------------ */

function buildBoardGrid() {
  // returns 11x11 grid positions for spaces 0-39 around the perimeter
  const grid = Array.from({ length: 11 }, () => Array(11).fill(null));
  // bottom row: id 0..10, right to left (col 10 -> 0), row 10
  for (let i = 0; i <= 10; i++) grid[10][10 - i] = i;
  // left col: id 10..20, bottom to top (row 10 -> 0), col 0
  for (let i = 0; i <= 10; i++) grid[10 - i][0] = 10 + i;
  // top row: id 20..30, left to right (col 0 -> 10), row 0
  for (let i = 0; i <= 10; i++) grid[0][i] = 20 + i;
  // right col: id 30..40(=0), top to bottom (row 0 -> 10), col 10
  for (let i = 0; i <= 10; i++) grid[i][10] = (30 + i) % 40;
  return grid;
}

function BoardView({ board2d, state }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(11, minmax(0, 1fr))", gridTemplateRows: "repeat(11, minmax(0, 1fr))",
      width: "100%", aspectRatio: "1 / 1", background: "#171126", border: "2px solid #2c2247",
      borderRadius: 14, overflow: "hidden", gap: 1, padding: 1, position: "relative",
      boxShadow: "0 16px 50px rgba(0,0,0,0.55)",
    }}>
      {board2d.map((row, r) =>
        row.map((spaceId, c) => {
          if (spaceId === null) {
            if (r === 5 && c === 5) {
              return (
                <div key="center" style={{
                  gridColumn: "2 / 11", gridRow: "2 / 11", display: "flex",
                  alignItems: "center", justifyContent: "center", flexDirection: "column",
                  background: "radial-gradient(ellipse 70% 60% at 50% 30%, #1f1740 0%, #130d26 70%), #110c22",
                  position: "relative", padding: "3%", overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 26px)",
                  }} />

                  <div style={{
                    position: "absolute", top: "5%", left: "50%", transform: "translateX(-50%)",
                    display: "flex", justifyContent: "center", alignItems: "center",
                  }}>
                    <svg viewBox="0 0 120 120" style={{ width: "clamp(48px, 11vw, 108px)", height: "clamp(48px, 11vw, 108px)" }}>
                      <circle cx="60" cy="60" r="56" fill="#171126" stroke="#ffcf3f" strokeWidth="2.5" />
                      <circle cx="60" cy="60" r="48" fill="none" stroke="#3f2f66" strokeWidth="1.5" strokeDasharray="2 4" />
                      {/* orbiting property-color dots, evenly spaced — reads as a proper emblem, not a random skyline */}
                      {Object.values(GROUP_COLORS).map((c, i, arr) => {
                        const angle = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
                        const r = 48;
                        return <circle key={c} cx={60 + r * Math.cos(angle)} cy={60 + r * Math.sin(angle)} r="3.2" fill={c} />;
                      })}
                      {/* two crossed dice, centered */}
                      <g transform="translate(38,38) rotate(-12)">
                        <rect x="0" y="0" width="30" height="30" rx="6" fill="#fff8ea" stroke="#171126" strokeWidth="2" />
                        <circle cx="9" cy="9" r="2.4" fill="#241a3d" />
                        <circle cx="21" cy="9" r="2.4" fill="#241a3d" />
                        <circle cx="15" cy="15" r="2.4" fill="#241a3d" />
                        <circle cx="9" cy="21" r="2.4" fill="#241a3d" />
                        <circle cx="21" cy="21" r="2.4" fill="#241a3d" />
                      </g>
                      <g transform="translate(52,52) rotate(14)">
                        <rect x="0" y="0" width="30" height="30" rx="6" fill="#ffcf3f" stroke="#171126" strokeWidth="2" />
                        <circle cx="15" cy="9" r="2.4" fill="#241a3d" />
                        <circle cx="9" cy="15" r="2.4" fill="#241a3d" />
                        <circle cx="15" cy="15" r="2.4" fill="#241a3d" />
                        <circle cx="21" cy="15" r="2.4" fill="#241a3d" />
                        <circle cx="15" cy="21" r="2.4" fill="#241a3d" />
                      </g>
                    </svg>
                  </div>

                  <div style={{
                    marginTop: "24%", position: "relative", zIndex: 1,
                    background: "linear-gradient(180deg, #f0554b 0%, #e5433a 100%)",
                    border: "3px solid #171126", borderRadius: 8,
                    padding: "3% 7%", boxShadow: "0 6px 0 #a92e26, 0 10px 24px rgba(229,67,58,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                  }}>
                    <div style={{
                      fontSize: "clamp(18px, 4.2vw, 46px)", color: "#fff", fontWeight: 900,
                      letterSpacing: 1, fontFamily: "'Archivo Black', sans-serif", whiteSpace: "nowrap",
                      textShadow: "2px 2px 0 rgba(0,0,0,0.25)",
                    }}>OLIGOPOLY</div>
                  </div>

                  <div style={{
                    marginTop: "6%", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "6%", width: "90%", position: "relative", zIndex: 1,
                  }}>
                    <span style={{ fontSize: "clamp(16px, 3vw, 34px)", filter: "grayscale(1) brightness(1.6)", opacity: 0.55 }}>🕴️</span>
                    <div style={{
                      background: "linear-gradient(180deg, #ffd95c 0%, #f2c93f 100%)",
                      border: "3px solid #171126", borderRadius: 8,
                      padding: "3% 8%", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 5px 0 #b8901a, 0 8px 18px rgba(242,201,63,0.3), inset 0 1px 0 rgba(255,255,255,0.4)",
                    }}>
                      <span style={{
                        fontSize: "clamp(14px, 2.6vw, 26px)", fontWeight: 900, color: "#241a3d",
                        fontFamily: "'Archivo Black', sans-serif", letterSpacing: 1, textAlign: "center", lineHeight: 1.15,
                      }}>?<br />LUCKY<br />BLOCK</span>
                    </div>
                    <span style={{ fontSize: "clamp(16px, 3vw, 34px)", transform: "scaleX(-1)", filter: "grayscale(1) brightness(1.6)", opacity: 0.55 }}>🕴️</span>
                  </div>

                  <div style={{ position: "relative", zIndex: 1, marginTop: "auto" }}>
                    <TokensOnCenter state={state} />
                  </div>
                </div>
              );
            }
            return <div key={`${r}-${c}`} style={{ gridColumn: c + 1, gridRow: r + 1 }} />;
          }
          const space = RAW_BOARD[spaceId];
          const isCorner = space.type === "corner" || space.type === "jail";
          const owner = state.ownership[spaceId];
          const ownerPlayer = owner ? state.players.find((p) => p.id === owner) : null;
          const playersHere = state.players.filter((p) => p.pos === spaceId && !p.bankrupt);
          const isCurrentTurnHere = state.players[state.turnIdx] && state.players[state.turnIdx].pos === spaceId && !state.players[state.turnIdx].bankrupt;
          return (
            <div key={`${r}-${c}`} className="og-tile" style={{
              gridColumn: c + 1, gridRow: r + 1,
              background: isCorner ? "#241a3d" : "#1c1530",
              border: isCurrentTurnHere ? "1px solid rgba(255,207,63,0.5)" : "1px solid #2c2247",
              boxShadow: isCurrentTurnHere ? "inset 0 0 0 1px rgba(255,207,63,0.3)" : "none",
              display: "flex", flexDirection: "column",
              alignItems: "center", position: "relative",
              padding: "1px 2px", overflow: "hidden", minWidth: 0, minHeight: 0,
            }}>
              {space.group && (
                <div style={{
                  width: "100%", height: "12%", minHeight: 3, background: GROUP_COLORS[space.group], flexShrink: 0,
                  boxShadow: "inset 0 -2px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
                }} />
              )}
              <div style={{
                flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden", padding: "0 2px",
              }}>
                <div style={{
                  fontSize: "clamp(5.5px, 0.62vw, 8px)", color: "#e6e0f5", textAlign: "center",
                  fontFamily: "'Inter', sans-serif", fontWeight: 700, lineHeight: 1.15,
                  display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden",
                  wordBreak: "keep-all", overflowWrap: "normal", hyphens: "none", width: "100%", maxHeight: "100%",
                }}>{space.name}</div>
              </div>
              {space.price && <div style={{ fontSize: "clamp(5px, 0.5vw, 7px)", color: "#ffcf3f", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, paddingBottom: 2, flexShrink: 0 }}>${space.price}</div>}
              {ownerPlayer && (
                <div style={{
                  position: "absolute", bottom: 2, right: 2, width: 8, height: 8,
                  borderRadius: "50%", background: TOKEN_COLORS[ownerPlayer.colorIdx],
                  boxShadow: "0 0 0 1.5px rgba(0,0,0,0.5)",
                }} />
              )}
            </div>
          );
        })
      )}
      <TokenLayer state={state} />
    </div>
  );
}

function spacePos(id) {
  if (id <= 10) return { row: 10, col: 10 - id };
  if (id <= 20) return { row: 20 - id, col: 0 };
  if (id <= 30) return { row: 0, col: id - 20 };
  return { row: id - 30, col: 10 };
}

function TokenLayer({ state }) {
  // group players by space so we can fan them out instead of stacking exactly on top of each other
  const bySpace = {};
  state.players.forEach((p) => {
    if (p.bankrupt) return;
    (bySpace[p.pos] = bySpace[p.pos] || []).push(p);
  });
  const currentId = state.players[state.turnIdx]?.id;
  return (
    <div style={{ position: "absolute", inset: 1, pointerEvents: "none" }}>
      {Object.entries(bySpace).map(([spaceId, group]) =>
        group.map((p, gi) => {
          const { row, col } = spacePos(Number(spaceId));
          const spread = group.length > 1 ? (gi - (group.length - 1) / 2) * 9 : 0;
          const leftPct = ((col + 0.5) / 11) * 100;
          const topPct = ((row + 0.5) / 11) * 100;
          const isActive = p.id === currentId;
          return (
            <div
              key={p.id}
              title={p.name}
              className={isActive ? "og-token-active" : ""}
              style={{
                position: "absolute", left: `calc(${leftPct}% + ${spread}px)`, top: `${topPct}%`,
                transform: "translate(-50%, -50%)",
                transition: "left 0.65s cubic-bezier(0.4, 0, 0.2, 1), top 0.65s cubic-bezier(0.4, 0, 0.2, 1)",
                width: isActive ? 20 : 16, height: isActive ? 20 : 16,
                filter: isActive ? "drop-shadow(0 2px 5px rgba(255,207,63,0.55))" : "drop-shadow(0 1px 3px rgba(0,0,0,0.5))",
              }}
            >
              <Avatar player={p} size={isActive ? 20 : 16} />
            </div>
          );
        })
      )}
    </div>
  );
}

function TokensOnCenter({ state }) {
  const current = state.players[state.turnIdx];
  if (!current) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "4px 10px 4px 5px", marginBottom: "3%",
    }}>
      <div style={{ width: 10, height: 10 }}><Avatar player={current} size={10} /></div>
      <div style={{ color: "#d8d0f0", fontSize: "clamp(9px, 1.1vw, 13px)", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>{current.name}'s turn</div>
    </div>
  );
}