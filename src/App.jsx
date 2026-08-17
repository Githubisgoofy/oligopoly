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
  { id: 1, name: "Chicken Nugget Ornament", type: "property", group: "brown", price: 60 },
  { id: 2, name: "Lucky Block", type: "lucky" },
  { id: 3, name: "Bagel Cheese", type: "property", group: "brown", price: 60 },
  { id: 4, name: "IRS Audit", type: "tax", amount: 200 },
  { id: 5, name: "Slot Machine A", type: "slot", price: 200 },
  { id: 6, name: "Chopper", type: "property", group: "cyan", price: 100 },
  { id: 7, name: "Betty Nuru", type: "property", group: "cyan", price: 100 },
  { id: 8, name: "Lucky Block", type: "lucky" },
  { id: 9, name: "Chicken Jockey", type: "property", group: "cyan", price: 120 },
  { id: 10, name: "Just Visiting / Jail", type: "jail" },
  { id: 11, name: "Blackberri Resort", type: "property", group: "pink", price: 140 },
  { id: 12, name: "Physical Palace", type: "property", group: "pink", price: 140 },
  { id: 13, name: "Slot Machine B", type: "slot", price: 200 },
  { id: 14, name: "Chosen Cat Tree", type: "property", group: "pink", price: 160 },
  { id: 15, name: "Lucky Block", type: "lucky" },
  { id: 16, name: "Wack The Dog", type: "property", group: "orange", price: 180 },
  { id: 17, name: "Jenson Ostrich", type: "property", group: "orange", price: 180 },
  { id: 18, name: "Youtube", type: "property", group: "orange", price: 200 },
  { id: 19, name: "Slot Machine C", type: "slot", price: 200 },
  { id: 20, name: "Free Parking", type: "corner" },
  { id: 21, name: "Scares Squirrel", type: "property", group: "red", price: 220 },
  { id: 22, name: "Odd Goose", type: "property", group: "red", price: 220 },
  { id: 23, name: "Lucky Block", type: "lucky" },
  { id: 24, name: "Chris Cliff", type: "property", group: "red", price: 240 },
  { id: 25, name: "Slot Machine D", type: "slot", price: 200 },
  { id: 26, name: "Twitch", type: "property", group: "yellow", price: 260 },
  { id: 27, name: "Melih Bat", type: "property", group: "yellow", price: 260 },
  { id: 28, name: "Water The Dog", type: "property", group: "yellow", price: 280 },
  { id: 29, name: "Lucky Block", type: "lucky" },
  { id: 30, name: "Go To Jail", type: "corner" },
  { id: 31, name: "Birthday Reunion", type: "property", group: "green", price: 300 },
  { id: 32, name: "Chroma Cat Tree", type: "property", group: "green", price: 300 },
  { id: 33, name: "PP Tax", type: "tax", amount: 100 },
  { id: 34, name: "Forbidden Item Shop", type: "property", group: "green", price: 320 },
  { id: 35, name: "Slot Machine E", type: "slot", price: 200 },
  { id: 36, name: "Lucky Block", type: "lucky" },
  { id: 37, name: "Scares Search", type: "property", group: "blue", price: 350 },
  { id: 38, name: "In The Cave Co", type: "property", group: "blue", price: 350 },
  { id: 39, name: "Stitches", type: "property", group: "blue", price: 400 },
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
const TOKEN_COLORS = ["#e5433a", "#3f6fd1", "#3fae5a", "#f2d13c", "#e86fb0", "#f0912b", "#a7e0f0", "#8b5e3c"];
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

function Avatar({ player, size = 26 }) {
  if (player.avatar) {
    return (
      <img src={player.avatar} alt={player.name} style={{
        width: size, height: size, borderRadius: "50%", objectFit: "cover",
        border: `2px solid ${TOKEN_COLORS[player.colorIdx]}`, flexShrink: 0, background: "#fff",
      }} />
    );
  }
  return <div style={{ width: size, height: size, borderRadius: "50%", background: TOKEN_COLORS[player.colorIdx], flexShrink: 0 }} />;
}

/* ------------------------------------------------------------------ */
/*  STORAGE HELPERS (shared, polled)                                   */
/* ------------------------------------------------------------------ */

function roomKey(code) {
  return `oligopoly-room-${code.toUpperCase()}`;
}

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
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */

export default function App() {
  const [screen, setScreen] = useState("start"); // start | settings | lobby | game
  const [myId, setMyId] = useState(null);
  const [myName, setMyName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
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
    pollRef.current = pollRoom(roomCode, (r) => { if (!cancelled && r) setRoom(r); }, 1500);
    return () => {
      cancelled = true;
      pollRef.current?.();
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
      // convert dataURL to Blob then File for Supabase upload
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const ext = blob.type.split("/")[1] || "png";
      const filename = `avatar_${Date.now()}.${ext}`;
      const fileForUpload = new File([blob], filename, { type: blob.type });
      // upload to Supabase storage and set public URL as avatar
      try {
        const up = await uploadFile({ bucket: 'avatars', file: fileForUpload, path: filename });
        const publicUrl = getPublicUrl({ bucket: 'avatars', path: up?.path || filename });
        setAvatar(publicUrl || dataUrl);
      } catch (e) {
        // fallback to dataUrl if upload fails
        setAvatar(dataUrl);
      }
    } catch (e) {
      setAvatarError(e.message || "Couldn't process that image.");
    }
  }

  async function createRoom() {
    if (!nameInput.trim()) { setError("Enter your name first."); return; }
    setError("");
    const code = makeCode();
    const id = nameInput.trim() + "-" + Math.random().toString(36).slice(2, 7);
    const state = initialGameState(code, nameInput.trim(), colorPick, settings);
    state.players[0].id = id;
    if (avatar) state.players[0].avatar = avatar;
    await writeRoom(code, state);
    setMyId(id);
    setMyName(nameInput.trim());
    setRoomCode(code);
    setRoom(state);
    setScreen("lobby");
  }

  async function joinRoom() {
    if (!nameInput.trim()) { setError("Enter your name first."); return; }
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) { setError("Enter a room code."); return; }
    const r = await readRoom(code);
    if (!r) { setError("Room not found. Check the code."); return; }
    if (r.phase !== "lobby") { setError("That game has already started."); return; }
    const takenColors = new Set(r.players.map((p) => p.colorIdx));
    let freeColor = TOKEN_COLORS.findIndex((_, i) => !takenColors.has(i));
    if (freeColor === -1) freeColor = 0;
    const id = nameInput.trim() + "-" + Math.random().toString(36).slice(2, 7);
    const newPlayer = {
      id, name: nameInput.trim(), colorIdx: freeColor, money: r.settings.startingMoney,
      pos: 0, inJail: false, jailTurns: 0, bankrupt: false, properties: [], isHost: false,
    };
    if (avatar) newPlayer.avatar = avatar;
    r.players.push(newPlayer);
    r.log.push(`${nameInput.trim()} joined the room.`);
    r.updatedAt = Date.now();
    await writeRoom(code, r);
    setMyId(id);
    setMyName(nameInput.trim());
    setRoomCode(code);
    setRoom(r);
    setScreen("lobby");
  }

  if (screen === "start") {
    return (
      <StartScreen
        nameInput={nameInput} setNameInput={setNameInput}
        joinCodeInput={joinCodeInput} setJoinCodeInput={setJoinCodeInput}
        colorPick={colorPick} setColorPick={setColorPick}
        avatar={avatar} onAvatarFile={handleAvatarFile} onClearAvatar={() => setAvatar(null)} avatarError={avatarError}
        error={error}
        onGoSettings={() => setScreen("settings")}
        onJoin={joinRoom}
      />
    );
  }

  if (screen === "settings") {
    return (
      <SettingsScreen
        settings={settings} setSettings={setSettings}
        onBack={() => setScreen("start")}
        onCreate={createRoom}
      />
    );
  }

  if (screen === "lobby" && room) {
    return (
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
    );
  }

  if (screen === "game" && room) {
    return <GameScreen room={room} myId={myId} roomCode={roomCode} onUpdate={setRoom} />;
  }

  return <div style={wrapStyle}><p style={{ color: "#eee" }}>Loading…</p></div>;
}

const wrapStyle = {
  minHeight: "600px",
  background: "radial-gradient(ellipse at top, #1b1330 0%, #0c0818 60%)",
  fontFamily: "'Archivo Black', 'Arial Black', sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
};

/* ------------------------------------------------------------------ */
/*  START SCREEN                                                       */
/* ------------------------------------------------------------------ */

function StartScreen({ nameInput, setNameInput, joinCodeInput, setJoinCodeInput, colorPick, setColorPick, avatar, onAvatarFile, onClearAvatar, avatarError, error, onGoSettings, onJoin }) {
  const fileInputRef = useRef(null);
  return (
    <div style={wrapStyle}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{
          fontSize: 56, letterSpacing: 2, color: "#ffcf3f",
          textShadow: "3px 3px 0 #e5433a, 6px 6px 0 #0c0818",
          marginBottom: 4, lineHeight: 1,
        }}>OLIGOPOLY</div>
        <div style={{ color: "#a7e0f0", fontFamily: "monospace", fontSize: 13, marginBottom: 32, letterSpacing: 3 }}>
          HOUSE RULES EDITION · ONLINE
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Your name</label>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Type your name"
            style={inputStyle}
            maxLength={16}
          />

          <label style={{ ...labelStyle, marginTop: 16 }}>Your token</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", marginBottom: 6 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
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
              <div style={{ color: "#c9c0e8", fontSize: 12, marginBottom: 4 }}>
                Upload a photo — it's auto-cropped square and the background is made transparent.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: "5px 10px", borderRadius: 6, border: "2px solid #3f6fd1", background: "transparent",
                    color: "#a7c8f0", fontSize: 12, cursor: "pointer", fontWeight: 700,
                  }}
                >{avatar ? "Change photo" : "Upload photo"}</button>
                {avatar && (
                  <button
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
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
            {TOKEN_COLORS.map((c, i) => (
              <button
                key={i}
                onClick={() => setColorPick(i)}
                style={{
                  width: 34, height: 34, borderRadius: "50%", background: c,
                  border: colorPick === i ? "3px solid #fff" : "3px solid transparent",
                  cursor: "pointer", fontSize: 16,
                }}
              >{colorPick === i ? "✓" : ""}</button>
            ))}
          </div>

          <button style={primaryBtn} onClick={onGoSettings}>Create a new game →</button>

          <div style={{ margin: "20px 0 10px", color: "#6a5f8a", fontSize: 12, letterSpacing: 2 }}>— OR JOIN A FRIEND —</div>

          <input
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            style={{ ...inputStyle, textAlign: "center", letterSpacing: 4, fontFamily: "monospace" }}
            maxLength={6}
          />
          <button style={secondaryBtn} onClick={onJoin}>Join game</button>

          {error && <div style={{ color: "#ff8080", marginTop: 12, fontSize: 13, fontFamily: "sans-serif" }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#171126", border: "2px solid #2c2247", borderRadius: 14,
  padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
};
const labelStyle = { display: "block", color: "#a7e0f0", fontSize: 12, letterSpacing: 2, marginBottom: 6, textAlign: "left", fontFamily: "monospace" };
const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "2px solid #352a55",
  background: "#0c0818", color: "#fff", fontSize: 15, marginBottom: 6, boxSizing: "border-box",
  fontFamily: "sans-serif",
};
const primaryBtn = {
  width: "100%", padding: "12px", borderRadius: 8, border: "none", marginTop: 16,
  background: "#e5433a", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
  fontFamily: "sans-serif", letterSpacing: 0.5,
};
const secondaryBtn = {
  width: "100%", padding: "12px", borderRadius: 8, border: "2px solid #3f6fd1", marginTop: 10,
  background: "transparent", color: "#a7c8f0", fontSize: 15, fontWeight: 700, cursor: "pointer",
  fontFamily: "sans-serif",
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
    <div style={wrapStyle}>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ color: "#ffcf3f", fontSize: 28, marginBottom: 18, textAlign: "center", letterSpacing: 1 }}>GAME SETTINGS</div>
        <div style={cardStyle}>
          {rules.map((r) => (
            <div key={r.key} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 0", borderBottom: "1px solid #2c2247",
            }}>
              <div style={{ textAlign: "left", paddingRight: 12 }}>
                <div style={{ color: "#fff", fontSize: 14, fontFamily: "sans-serif", fontWeight: 700 }}>{r.title}</div>
                <div style={{ color: "#8a7fb0", fontSize: 12, fontFamily: "sans-serif", marginTop: 2 }}>{r.desc}</div>
              </div>
              <Toggle checked={settings[r.key]} onChange={(v) => setSettings((s) => ({ ...s, [r.key]: v }))} />
            </div>
          ))}

          <div style={{ padding: "16px 0 4px", textAlign: "left" }}>
            <label style={labelStyle}>Starting money</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[1000, 1500, 2000, 3000].map((v) => (
                <button key={v} onClick={() => setSettings((s) => ({ ...s, startingMoney: v }))}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, cursor: "pointer",
                    border: settings.startingMoney === v ? "2px solid #ffcf3f" : "2px solid #352a55",
                    background: settings.startingMoney === v ? "#3a2f10" : "#0c0818",
                    color: "#fff", fontFamily: "sans-serif", fontSize: 13, fontWeight: 700,
                  }}>${v}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button style={{ ...secondaryBtn, marginTop: 0 }} onClick={onBack}>← Back</button>
            <button style={{ ...primaryBtn, marginTop: 0 }} onClick={onCreate}>Create room</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
        background: checked ? "#3fae5a" : "#352a55", position: "relative", flexShrink: 0,
        transition: "background 0.15s",
      }}
    >
      <div style={{
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.15s",
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
    if (!roomCode) return;
    const stop = pollRoom(roomCode, (r) => { if (r) onUpdate(r); }, 1500);
    return () => stop();
  }, [roomCode]);

  return (
    <div style={wrapStyle}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
        <div style={{ color: "#ffcf3f", fontSize: 28, marginBottom: 6 }}>LOBBY</div>
        <div style={{ color: "#8a7fb0", fontSize: 13, marginBottom: 20, fontFamily: "sans-serif" }}>
          Share this code with friends so they can join:
        </div>
        <div
          onClick={() => { navigator.clipboard?.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          style={{
            fontFamily: "monospace", fontSize: 34, letterSpacing: 10, color: "#fff",
            background: "#171126", border: "2px dashed #ffcf3f", borderRadius: 10,
            padding: "14px 0", marginBottom: 8, cursor: "pointer",
          }}
        >{roomCode}</div>
        <div style={{ color: "#6a5f8a", fontSize: 11, marginBottom: 20 }}>{copied ? "Copied!" : "tap to copy"}</div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>PLAYERS ({room.players.length})</div>
          {room.players.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
              borderBottom: "1px solid #2c2247", textAlign: "left",
            }}>
              <Avatar player={p} size={26} />
              <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 14, flex: 1 }}>
                {p.name}{p.isHost && <span style={{ color: "#ffcf3f", fontSize: 11, marginLeft: 6 }}>HOST</span>}
                {p.isBot && <span style={{ color: "#3fae5a", fontSize: 11, marginLeft: 6 }}>BOT</span>}
                {p.id === myId && <span style={{ color: "#6a5f8a", fontSize: 11, marginLeft: 6 }}>(you)</span>}
              </div>
              {isHost && p.isBot && (
                <button onClick={() => onRemoveBot(p.id)} style={{
                  background: "transparent", border: "none", color: "#8a7fb0", cursor: "pointer", fontSize: 16,
                }}>×</button>
              )}
            </div>
          ))}

          {isHost && (
            <button
              style={{ ...secondaryBtn, opacity: room.players.length >= 8 ? 0.5 : 1 }}
              disabled={room.players.length >= 8}
              onClick={onAddBot}
            >
              + Add a bot player
            </button>
          )}

          {isHost ? (
            <button
              style={{ ...primaryBtn, opacity: room.players.length < 2 ? 0.5 : 1 }}
              disabled={room.players.length < 2}
              onClick={onStart}
            >
              {room.players.length < 2 ? "Add a bot or wait for a friend…" : "Start game →"}
            </button>
          ) : (
            <div style={{ color: "#8a7fb0", fontSize: 13, marginTop: 16, fontFamily: "sans-serif" }}>
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
    if (!roomCode) return;
    const stop = pollRoom(roomCode, (r) => { if (r) onUpdate(r); }, 1500);
    return () => stop();
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
  const myTurn = currentPlayer && currentPlayer.id === myId && !currentPlayer.bankrupt;
  const iAmHost = !!me?.isHost;
  const botActingRef = useRef(false);

  function log(state, msg) { state.log = [...state.log.slice(-30), msg]; }

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
          } else {
            setRolling(false);
            await commit(state);
            return;
          }
        }
      }

      const steps = d1 + d2;
      const oldPos = p.pos;
      let newPos = (oldPos + steps) % 40;
      if (newPos < oldPos) { p.money += 200; log(state, `${p.name} passed GO and collected $200.`); }
      p.pos = newPos;
      resolveLanding(state, p, RAW_BOARD[newPos]);
      setRolling(false);
      await commit(state);
    }, 500);
  }

  function resolveLanding(state, p, space) {
    if (space.type === "corner") {
      if (space.name === "Go To Jail") {
        p.pos = 10; p.inJail = true; p.jailTurns = 0;
        log(state, `${p.name} was sent to jail!`);
      } else if (space.name === "Free Parking") {
        if (state.settings.freeParking || state.settings.freestParking) {
          p.money += state.freeParkingPot;
          log(state, `${p.name} landed on Free Parking and collected the $${state.freeParkingPot} pot!`);
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
      checkBankrupt(state, p);
      nextTurn(state);
      return;
    }
    if (space.type === "lucky") {
      const card = LUCKY_CARDS[Math.floor(Math.random() * LUCKY_CARDS.length)];
      state.lastLuckyCard = card.text;
      log(state, `${p.name} drew a Lucky Block: "${card.text}"`);
      if (card.money) {
        p.money += card.money;
        if (card.money < 0 && (state.settings.freeParking || state.settings.freestParking)) state.freeParkingPot += -card.money;
      }
      if (card.advanceToGo) { p.pos = 0; p.money += 200; }
      if (card.goToJail) { p.pos = 10; p.inJail = true; p.jailTurns = 0; }
      if (card.collectFromAll) {
        state.players.forEach((other) => {
          if (other.id !== p.id && !other.bankrupt) { other.money -= card.collectFromAll; p.money += card.collectFromAll; }
        });
      }
      checkBankrupt(state, p);
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
    checkBankrupt(state, p);
    nextTurn(state);
  }

  function checkBankrupt(state, p) {
    if (p.money < 0) {
      p.bankrupt = true;
      log(state, `${p.name} went bankrupt!`);
      Object.keys(state.ownership).forEach((id) => { if (state.ownership[id] === p.id) delete state.ownership[id]; });
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
    if (amount <= a.highBid) return;
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
    } else {
      log(state, `Auction closed: no bids on ${space.name}. It stays unowned.`);
    }
    state.pendingAuction = null;
    nextTurn(state);
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
            } else {
              botActingRef.current = false;
              await commit(state);
              return;
            }
          }
        }

        const steps = d1 + d2;
        const oldPos = p.pos;
        let newPos = (oldPos + steps) % 40;
        if (newPos < oldPos) { p.money += 200; log(state, `${p.name} (bot) passed GO and collected $200.`); }
        p.pos = newPos;
        resolveLanding(state, p, RAW_BOARD[newPos]);
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

  return (
    <div style={{ ...wrapStyle, alignItems: "flex-start", flexDirection: "column", gap: 16, padding: 16 }}>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: "#ffcf3f", fontSize: 22, letterSpacing: 1 }}>OLIGOPOLY</div>
        <div style={{ color: "#8a7fb0", fontFamily: "monospace", fontSize: 12 }}>ROOM {roomCode}</div>
      </div>

      <div style={{ display: "flex", width: "100%", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 560px", minWidth: 320 }}>
          <BoardView board2d={board2d} state={local} />
        </div>

        <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 12 }}>
          <PlayersPanel state={local} myId={myId} />

          <div style={cardStyle}>
            {local.pendingAuction ? (
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

          <div style={{ ...cardStyle, maxHeight: 200, overflowY: "auto", textAlign: "left" }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>LOG</div>
            {local.log.slice().reverse().map((l, i) => (
              <div key={i} style={{ color: "#a89fc9", fontSize: 12, fontFamily: "sans-serif", marginBottom: 5 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TurnPanel({ room, me, myTurn, rolling, onRoll, onPayBail }) {
  const cp = room.players[room.turnIdx];
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>
        {myTurn ? "YOUR TURN" : `${cp.name.toUpperCase()}'S TURN`}
      </div>
      {room.dice && (
        <div style={{ fontSize: 30, marginBottom: 10 }}>🎲 {room.dice[0]} + {room.dice[1]} = {room.dice[0] + room.dice[1]}</div>
      )}
      {cp.inJail && myTurn && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#ff9d9d", fontSize: 12, marginBottom: 8, fontFamily: "sans-serif" }}>
            In jail (turn {cp.jailTurns}/3). Roll doubles to escape{room.settings.bond ? ", or pay a $50 bond." : "."}
          </div>
          {room.settings.bond && (
            <button style={secondaryBtn} onClick={onPayBail}>Pay $50 bond</button>
          )}
        </div>
      )}
      <button
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
    <div style={{ textAlign: "center" }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>UNOWNED SPACE</div>
      <div style={{ color: "#fff", fontFamily: "sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{space.name}</div>
      <div style={{ color: "#ffcf3f", fontSize: 20, marginBottom: 12 }}>${space.price}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ ...primaryBtn, marginTop: 0, opacity: me.money >= space.price ? 1 : 0.4 }} disabled={me.money < space.price} onClick={onBuy}>Buy</button>
        <button style={{ ...secondaryBtn, marginTop: 0 }} onClick={onPass}>Pass</button>
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
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ ...labelStyle, marginBottom: 8 }}>AUCTION</div>
      <div style={{ color: "#fff", fontFamily: "sans-serif", fontWeight: 700 }}>{space.name}</div>
      <div style={{ color: "#8a7fb0", fontSize: 12, margin: "6px 0", fontFamily: "sans-serif" }}>
        Current high bid: <span style={{ color: "#ffcf3f" }}>${a.highBid}</span> {highBidderName && `by ${highBidderName}`}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
        <input type="number" value={amt} onChange={(e) => setAmt(Number(e.target.value))} style={{ ...inputStyle, width: 90, marginBottom: 0 }} />
        <button style={{ ...secondaryBtn, marginTop: 0 }} onClick={() => onBid(amt)}>Bid</button>
      </div>
      {isHost && <button style={{ ...primaryBtn, marginTop: 4 }} onClick={onClose}>Close auction</button>}
    </div>
  );
}

function PlayersPanel({ state, myId }) {
  return (
    <div style={cardStyle}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>PLAYERS</div>
      {state.players.map((p, i) => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
          opacity: p.bankrupt ? 0.4 : 1,
          borderLeft: i === state.turnIdx ? "3px solid #ffcf3f" : "3px solid transparent",
          paddingLeft: 8, textAlign: "left",
        }}>
          <Avatar player={p} size={20} />
          <div style={{ flex: 1, color: "#fff", fontFamily: "sans-serif", fontSize: 13 }}>
            {p.name}{p.id === myId && " (you)"}{p.inJail && " 🔒"}
          </div>
          <div style={{ color: "#a7e0f0", fontFamily: "monospace", fontSize: 13 }}>${p.money}</div>
        </div>
      ))}
      {(state.settings.freeParking || state.settings.freestParking) && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #2c2247", color: "#ffcf3f", fontSize: 12, fontFamily: "sans-serif" }}>
          Free Parking pot: ${state.freeParkingPot}
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
      display: "grid", gridTemplateColumns: "repeat(11, 1fr)", gridTemplateRows: "repeat(11, 1fr)",
      width: "100%", aspectRatio: "1 / 1", background: "#171126", border: "2px solid #2c2247",
      borderRadius: 12, overflow: "hidden", gap: 1, padding: 1,
    }}>
      {board2d.map((row, r) =>
        row.map((spaceId, c) => {
          if (spaceId === null) {
            if (r === 5 && c === 5) {
              return (
                <div key="center" style={{
                  gridColumn: "2 / 11", gridRow: "2 / 11", display: "flex",
                  alignItems: "center", justifyContent: "center", flexDirection: "column",
                  background: "#fff", position: "relative", padding: "3%",
                }}>
                  <div style={{
                    position: "absolute", top: "5%", width: "78%", display: "flex", justifyContent: "center",
                  }}>
                    <svg viewBox="0 0 300 90" style={{ width: "100%", maxWidth: 260 }}>
                      <g fill="#111">
                        <rect x="4" y="55" width="30" height="30" />
                        <rect x="36" y="42" width="10" height="43" />
                        <rect x="38" y="20" width="6" height="20" />
                        <circle cx="41" cy="15" r="4" />
                        <circle cx="45" cy="10" r="4" />
                        <circle cx="38" cy="9" r="4" />
                        <rect x="52" y="48" width="20" height="37" />
                        <rect x="76" y="30" width="26" height="55" />
                        <rect x="184" y="30" width="26" height="55" />
                        <rect x="212" y="48" width="20" height="37" />
                        <rect x="238" y="42" width="24" height="43" />
                        <rect x="264" y="20" width="6" height="65" />
                        <rect x="284" y="26" width="6" height="59" />
                        <circle cx="267" cy="15" r="4" />
                        <circle cx="271" cy="10" r="4" />
                        <circle cx="264" cy="9" r="4" />
                        <rect x="4" y="83" width="286" height="4" />
                      </g>
                      <g transform="translate(150,42)">
                        <circle r="24" fill="#fff" stroke="#111" strokeWidth="3" />
                        <ellipse rx="10" ry="24" fill="none" stroke="#111" strokeWidth="2" />
                        <ellipse rx="24" ry="10" fill="none" stroke="#111" strokeWidth="2" />
                        <line x1="-24" y1="0" x2="24" y2="0" stroke="#111" strokeWidth="2" />
                        <line x1="0" y1="-24" x2="0" y2="24" stroke="#111" strokeWidth="2" />
                      </g>
                    </svg>
                  </div>

                  <div style={{
                    marginTop: "26%", background: "#e5433a", border: "4px solid #111", borderRadius: 4,
                    padding: "3% 6%", boxShadow: "inset 0 0 0 3px #fff",
                  }}>
                    <div style={{
                      fontSize: "clamp(18px, 4.2vw, 46px)", color: "#fff", fontWeight: 900,
                      letterSpacing: 1, fontFamily: "'Arial Black', sans-serif", whiteSpace: "nowrap",
                      WebkitTextStroke: "1.5px #111",
                    }}>OLIGOPOLY</div>
                  </div>

                  <div style={{
                    marginTop: "5%", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "8%", width: "90%",
                  }}>
                    <span style={{ fontSize: "clamp(16px, 3vw, 34px)" }}>🕴️</span>
                    <div style={{
                      background: "#f5e94e", border: "3px solid #111", borderRadius: 4,
                      padding: "3% 8%", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontSize: "clamp(14px, 2.6vw, 26px)", fontWeight: 900, color: "#111",
                        fontFamily: "'Arial Black', sans-serif", letterSpacing: 1, textAlign: "center", lineHeight: 1.1,
                      }}>?<br />LUCKY<br />BLOCK</span>
                    </div>
                    <span style={{ fontSize: "clamp(16px, 3vw, 34px)", transform: "scaleX(-1)" }}>🕴️</span>
                  </div>

                  <TokensOnCenter state={state} />
                </div>
              );
            }
            return <div key={`${r}-${c}`} />;
          }
          const space = RAW_BOARD[spaceId];
          const isCorner = space.type === "corner" || space.type === "jail";
          const owner = state.ownership[spaceId];
          const ownerPlayer = owner ? state.players.find((p) => p.id === owner) : null;
          const playersHere = state.players.filter((p) => p.pos === spaceId && !p.bankrupt);
          return (
            <div key={`${r}-${c}`} style={{
              background: isCorner ? "#241a3d" : "#1c1530",
              border: "1px solid #2c2247", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-start", position: "relative",
              padding: 2, overflow: "hidden",
            }}>
              {space.group && <div style={{ width: "100%", height: "18%", background: GROUP_COLORS[space.group], flexShrink: 0 }} />}
              <div style={{
                fontSize: "clamp(5px, 0.8vw, 8px)", color: "#d8d0f0", textAlign: "center",
                fontFamily: "sans-serif", lineHeight: 1.1, marginTop: 2, padding: "0 1px",
              }}>{space.name}</div>
              {space.price && <div style={{ fontSize: "clamp(5px, 0.7vw, 7px)", color: "#ffcf3f", fontFamily: "monospace" }}>${space.price}</div>}
              {ownerPlayer && (
                <div style={{
                  position: "absolute", bottom: 2, right: 2, width: 8, height: 8,
                  borderRadius: "50%", background: TOKEN_COLORS[ownerPlayer.colorIdx],
                }} />
              )}
              {playersHere.length > 0 && (
                <div style={{ position: "absolute", top: 2, left: 2, display: "flex", gap: 1, flexWrap: "wrap", maxWidth: "90%" }}>
                  {playersHere.map((p) => (
                    <div key={p.id} title={p.name} style={{ width: 9, height: 9 }}>
                      <Avatar player={p} size={9} />
                    </div>
                  ))}
                </div>
              )}
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
    <div style={{ position: "absolute", bottom: "3%", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 10, height: 10 }}><Avatar player={current} size={10} /></div>
      <div style={{ color: "#333", fontSize: "clamp(9px, 1.1vw, 13px)", fontFamily: "sans-serif" }}>{current.name}'s turn</div>
    </div>
  );
}
