

 
(() => {
"use strict";

 

const SBNow = () => Date.now();
 
const SBTabVisible = () => !(typeof document !== "undefined" && document.hidden);
const SBLog = (...a) => console.log("[SnapBack]", ...a);
const SBErr = (...a) => console.error("[SnapBack]", ...a);

 
const SBStorage = {
	get(key) {
		try { return localStorage.getItem(key); } catch (e) { return null; }
	},
	set(key, value) {
		try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
	},
	remove(key) {
		try { localStorage.removeItem(key); } catch (e) {   }
	},
};

 
function SBDeepClone(x) {
	if (x === undefined || x === null) return x;
	try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; }
}

 

 
function SBStateReplacer(key, value) {
	if (key === "chg" || key === "hash" || key === "first" || key === "last") return undefined;
	return value;
}

 
function SBStateSerialize(state) {
	let json;
	try { json = JSON.stringify(state, SBStateReplacer); } catch (e) { return null; }
	try {
		if (typeof LZString !== "undefined" && typeof LZString.compressToUTF16 === "function") {
			return "SBZ:" + LZString.compressToUTF16(json);
		}
	} catch (e) {   }
	return json;
}

 
function SBStateDeserialize(raw) {
	if (typeof raw !== "string" || !raw) return null;
	try {
		if (raw.indexOf("SBZ:") === 0) {
			if (typeof LZString === "undefined" || typeof LZString.decompressFromUTF16 !== "function") return null;
			const json = LZString.decompressFromUTF16(raw.slice(4));
			if (json === null || json === undefined) return null;
			raw = json;
		}
		const s = JSON.parse(raw);
		return (s && typeof s === "object" && s.chars && typeof s.chars === "object") ? s : null;
	} catch (e) { return null; }
}

 

const SBStore = {
	accountNum: null,       
	state: null,

	 
	baseKey() {
		return "SnapBackData:" + (this.accountNum ?? 0);
	},

	emptyState() {
		return { v: 2, settings: { keep: 20, autoClearOthers: true, keepFirst: false }, deletedAllAt: 0, gone: {}, chars: {}, favs: [], favGone: {} };
	},

	 
	normalize(s) {
		if (!s || typeof s !== "object") s = this.emptyState();
		s.v = 2;
		if (!s.settings || typeof s.settings !== "object") s.settings = {};
		const keepRaw = s.settings.keep | 0;
		s.settings.keep = (keepRaw >= 3 && keepRaw <= 500) ? keepRaw : 20;
		if (typeof s.settings.autoClearOthers !== "boolean") s.settings.autoClearOthers = true;
		if (typeof s.settings.keepFirst !== "boolean") s.settings.keepFirst = false; 
		if (typeof s.deletedAllAt !== "number") s.deletedAllAt = 0;
		if (!s.gone || typeof s.gone !== "object" || Array.isArray(s.gone)) s.gone = {};
		
		const goneKeys = Object.keys(s.gone);
		if (goneKeys.length > 200) {
			goneKeys.sort((a, b) => (s.gone[b] || 0) - (s.gone[a] || 0));
			for (const k of goneKeys.slice(200)) delete s.gone[k];
		}
		
		if (!Array.isArray(s.favs)) s.favs = [];
		s.favs = s.favs.filter(f => f && typeof f === "object" &&
			Number.isInteger(f.num) && typeof f.snapT === "number" && Array.isArray(f.appearance));
		for (const f of s.favs) {
			f.appearance = SBSanitizeBundle(f.appearance);
			if (!Array.isArray(f.pose)) f.pose = [];
			if (typeof f.hash !== "string") f.hash = SBHashOf(f.appearance, f.pose);
			if (typeof f.favName !== "string" || !f.favName) f.favName = (typeof f.charName === "string" && f.charName ? f.charName : ("#" + f.num)) + " " + SBTimeStr(f.snapT);
		}
		if (!s.favGone || typeof s.favGone !== "object" || Array.isArray(s.favGone)) s.favGone = {};
		
		const fgKeys = Object.keys(s.favGone);
		if (fgKeys.length > 200) {
			fgKeys.sort((a, b) => (s.favGone[b] || 0) - (s.favGone[a] || 0));
			for (const k of fgKeys.slice(200)) delete s.favGone[k];
		}
		if (!s.chars || typeof s.chars !== "object" || Array.isArray(s.chars)) s.chars = {};
		for (const key of Object.keys(s.chars)) {
			const c = s.chars[key];
			const num = Number(key);
			if (!Number.isInteger(num) || num < 0 || !c || typeof c !== "object") { delete s.chars[key]; continue; }
			c.num = num;
			if (typeof c.name !== "string") c.name = "";
			if (typeof c.nick !== "string") c.nick = ""; 
			if (!Array.isArray(c.history)) c.history = [];
			SBTrimHistory(c.history, s.settings.keep); 
			
			if (!Array.isArray(c.deletedHashes)) c.deletedHashes = [];
			if (c.deletedHashes.length > 200) c.deletedHashes = c.deletedHashes.slice(-200);
			c.history.forEach((e, i) => {
				if (!e || typeof e !== "object") return;
				if (typeof e.t !== "number") e.t = SBNow();
				
				if (typeof e.imp !== "number" || !isFinite(e.imp) || e.imp <= 0) e.imp = 0;
				if (!Array.isArray(e.appearance)) e.appearance = [];
				e.appearance = SBSanitizeBundle(e.appearance); 
				if (!Array.isArray(e.pose)) e.pose = [];
				delete e.arousal; 
				e.hash = SBHashOf(e.appearance, e.pose); 
				if (e.trigger !== "manual" && e.trigger !== "restore") e.trigger = "auto";
				const prev = (i + 1 < c.history.length) ? c.history[i + 1] : null;
				e.first = !prev;
				e.chg = SBDiffOf(prev, e);
			});
			
			if (c.history.length) {
				let oldest = null, newest = null;
				for (const e of c.history) {
					if (!oldest || e.t < oldest.t) oldest = e;
					if (!newest || e.t > newest.t) newest = e;
				}
				c.first = oldest.t;
				c.last = newest.t;
			} else {
				c.first = null;
				c.last = 0;
			}
		}
		
		SBTrimGlobalCap(s, s.settings.keep);
		return s;
	},

	load() {
		if (this.state) return this.state;
		this.state = this.normalize(this.emptyState());
		this._lastDiskRaw = null;
		
		if (this.accountNum !== null && this.accountNum > 0) {
			const raw = SBStorage.get(this.baseKey());
			this._lastDiskRaw = raw;
			const s = SBStateDeserialize(raw);
			if (s) this.state = this.normalize(s);
		}
		return this.state;
	},

	 
	_dirty: false,
	 
	_lastDiskRaw: null,
	 
	_lastWritten: null,

	 
	save() {
		if (!this.state) return false;
		if (this.accountNum === null || this.accountNum < 1) return false; 
		const key = this.baseKey();
		const raw = SBStorage.get(key);
		
		
		if (raw !== this._lastDiskRaw) {
			this._lastDiskRaw = raw;
			const disk = SBStateDeserialize(raw);
			if (disk) {
				const res = SBMergeInto(this.state, disk);
				if (res.changed) {
					SBUI.dirty = true;
				}
			}
		}
		
		if (!this._dirty) return false;
		const out = SBStateSerialize(this.state);
		if (out === null) return false;
		if (out === this._lastWritten) return false;
		this._lastWritten = out;
		this._lastDiskRaw = out; 
		this._dirty = false;
		return SBStorage.set(key, out);
	},

	 
	_saveTo(key, state) {
		try { SBStorage.set(key, JSON.stringify(state)); return true; } catch (e) { return false; }
	},

	

 
	ensureAccount(num) {
		if (!Number.isInteger(num) || num < 0) return;
		if (this.accountNum === num) return;

		const wasDetached = this.accountNum === null;

		
		if (this.accountNum !== null && this.accountNum > 0 && this.state) {
			this.save();
		}
		
		
		let pending = (wasDetached && this.state && Object.keys(this.state.chars).length) ? this.state : null;
		if (pending) {
			pending = SBDeepClone(pending);
			delete pending.settings;
			const pchars = pending.chars || {};
			for (const k of Object.keys(pchars)) {
				if (!(Number(k) >= 1)) delete pchars[k];
			}
			if (!Object.keys(pchars).length) pending = null;
		}

		
		this.accountNum = num;
		this._dirty = false;
		this._lastDiskRaw = null;
		this._lastWritten = null;
		if (num > 0) {
			
			this.state = null;
			this.load();
			
			if (pending) {
				try { SBImportState(pending, { applySettings: false }); } catch (e) { SBErr("临时数据合并失败", e); }
				this.requestSave();
			}
		} else {
			
			this.state = this.normalize(this.emptyState());
		}
	},

	 
	_pendingTimer: null,
	requestSave() {
		this._dirty = true;
		if (typeof document !== "undefined" && document.hidden) {
			try { this.save(); } catch (e) {   }
			return;
		}
		if (SBStore._pendingTimer) return;
		SBStore._pendingTimer = setTimeout(() => {
			SBStore._pendingTimer = null;
			SBStore.save();
		}, 500);
	},
};

 
function SBCharOf(num) {
	if (!Number.isInteger(num) || num < 0) return null;
	return SBStore.load().chars[String(num)] ?? null;
}

 
function SBCharEnsure(num, name, nick) {
	const s = SBStore.load();
	const key = String(num);
	if (!s.chars[key]) {
		s.chars[key] = { num, name: "", nick: "", first: null, last: 0, history: [] };
	}
	const c = s.chars[key];
	if (typeof name === "string" && name) c.name = name;
	if (typeof nick === "string" && nick) c.nick = nick;
	return c;
}

 
function SBCharDisplayName(c) {
	if (c && typeof c === "object") {
		if (typeof c.nick === "string" && c.nick) return c.nick;
		if (typeof c.name === "string" && c.name) return c.name;
		if (c.num !== undefined && c.num !== null) return "#" + c.num;
	}
	return "";
}

 
function SBGameCharDisplayName(C) {
	if (C && typeof C === "object") {
		if (typeof C.Nickname === "string" && C.Nickname) return C.Nickname;
		if (typeof C.Name === "string" && C.Name) return C.Name;
		if (C.MemberNumber !== undefined && C.MemberNumber !== null) return "#" + C.MemberNumber;
	}
	return "";
}

 
function SBNameOf(num) {
	if (!Number.isInteger(num)) return "#" + num;
	const c = SBCharOf(num);
	if (c) {
		if (typeof c.nick === "string" && c.nick) return c.nick;
		if (typeof c.name === "string" && c.name) return c.name;
	}
	if (typeof Player !== "undefined" && Player && Player.MemberNumber === num) {
		const n = SBGameCharDisplayName(Player);
		if (n && n.indexOf("#") !== 0) return n;
	}
	if (typeof Character !== "undefined" && Array.isArray(Character)) {
		const ch = Character.find(x => x && x.MemberNumber === num);
		if (ch) {
			const n = SBGameCharDisplayName(ch);
			if (n && n.indexOf("#") !== 0) return n;
		}
	}
	return "#" + num;
}

 
function SBIsImported(e) {
	return !!(e && typeof e === "object" && typeof e.imp === "number" && e.imp > 0);
}

 
function SBTrimHistory(history, keep) {
	if (!Array.isArray(history)) return false;
	if (history.length <= keep) return false;
	if (history.length > 1) history.sort((a, b) => b.t - a.t);
	const imp = history.filter(e => SBIsImported(e));
	const loc = history.filter(e => !SBIsImported(e));
	if (loc.length > keep) loc.length = keep;
	const before = history.length;
	history.length = 0;
	for (const e of imp) history.push(e);
	for (const e of loc) history.push(e);
	if (history.length > 1) history.sort((a, b) => b.t - a.t);
	return history.length !== before;
}

 
function SBReindexChar(c) {
	if (!c || !Array.isArray(c.history)) return;
	if (c.history.length > 1) c.history.sort((a, b) => b.t - a.t);
	c.history.forEach((e, i) => {
		const prev = (i + 1 < c.history.length) ? c.history[i + 1] : null;
		e.first = !prev;
		e.chg = SBDiffOf(prev, e);
	});
	const times = c.history.map(e => e.t);
	if (times.length) {
		c.first = Math.min.apply(null, times);
		c.last = Math.max(c.last || 0, Math.max.apply(null, times));
	}
}

 
function SBTrimGlobalCap(s, keep) {
	if (!s || !s.chars || typeof s.chars !== "object") return false;
	const cap = Math.max(3000, (keep | 0 || 50) * 100);
	let total = 0;
	const all = [];
	for (const key of Object.keys(s.chars)) {
		const c = s.chars[key];
		if (!c || !Array.isArray(c.history)) continue;
		for (const e of c.history) {
			total++;
			if (!SBIsImported(e)) all.push({ key, e });
		}
	}
	if (total <= cap) return false;
	const drop = new Set();
	all.sort((a, b) => a.e.t - b.e.t);
	for (let i = 0; i < all.length && drop.size < total - cap; i++) drop.add(all[i].e);
	let changed = false;
	for (const key of Object.keys(s.chars)) {
		const c = s.chars[key];
		if (!c || !Array.isArray(c.history)) continue;
		const before = c.history.length;
		c.history = c.history.filter(e => !drop.has(e));
		if (c.history.length !== before) {
			changed = true;
			if (!c.history.length) delete s.chars[key];
			else SBReindexChar(c);
		}
	}
	return changed;
}

 

 
function SBAppearanceBundleOf(C) {
	if (!C || !Array.isArray(C.Appearance)) return null;
	try {
		if (typeof ServerAppearanceBundle === "function") {
			const b = ServerAppearanceBundle(C.Appearance);
			return Array.isArray(b) ? SBSanitizeBundle(b) : [];
		}
	} catch (e) { SBErr("ServerAppearanceBundle 失败", e); }
	
	try {
		if (typeof ServerBundledItemFromAppearanceItem === "function") {
			return SBSanitizeBundle(C.Appearance.map(it => SBDeepClone(ServerBundledItemFromAppearanceItem(it))));
		}
	} catch (e) { SBErr("逐项打包失败", e); }
	return null;
}

 
function SBPoseOf(C) {
	return Array.isArray(C.ActivePose) ? SBDeepClone(C.ActivePose) : [];
}

 
const SBExcludedGroups = new Set([
	"Emoticon", "Fluids", "Mouth", "Blush",
	"Eyes", "Eyes2", "左眼_Luzi", "右眼_Luzi",
]);

 
const SBVolatilePropKeys = new Set([
	"WornTime", "LastOrgasmTime", "TimeSinceLastOrgasm",
	"RuinedOrgasmCount", "ResistedOrgasmCount",
]);

 
const SBVolatilePropPatterns = [
	/OrgasmCount$/,          
	/^Luzi_/,                
	/^LuziCid$/,
];

 
const SBVolatileKeepKeys = new Set([
	"Luzi_CheekRetractor", "Luzi_NoseHook", "Luzi_TailStraps_0",
	"Luzi_HairAccessory3_1", "Luzi_HairAccessory3_2", "Luzi_Jewelry_0",
	"Luzi_ShockHardcore",
]);

 
const SBExtraVolatileKeys = new Set();

 
const SBTransformPropKeys = new Set([
	"ScaleX", "ScaleY",                       
	"Rotation",                               
	"TranslationX", "TranslationY",           
	"LayerScaleX", "LayerScaleY",             
	"LayerRotation",                          
	"LayerTranslationX", "LayerTranslationY", 
]);

 
const SBExtraTransformKeys = new Set();

 
function SBIsVolatileKey(key) {
	if (SBExtraVolatileKeys.has(key)) return true;
	if (SBVolatileKeepKeys.has(key)) return false;
	if (SBVolatilePropKeys.has(key)) return true;
	for (let i = 0; i < SBVolatilePropPatterns.length; i++) {
		if (SBVolatilePropPatterns[i].test(key)) return true;
	}
	return false;
}

 
function SBIsVolatileValue(v) {
	return typeof v === "number" && v > 1e12;
}

 
function SBSanitizeBundle(appearance) {
	if (!Array.isArray(appearance)) return appearance;
	const out = SBDeepClone(appearance);
	for (const item of out) {
		if (!item || typeof item !== "object" || !item.Property || typeof item.Property !== "object") continue;
		const p = {};
		for (const k of Object.keys(item.Property)) {
			if (SBIsVolatileKey(k) || SBIsVolatileValue(item.Property[k])) continue;
			p[k] = item.Property[k];
		}
		item.Property = Object.keys(p).length > 0 ? p : undefined;
	}
	return out;
}

 
function SBNormalizePlain(v) {
	if (Array.isArray(v)) return v.map(SBNormalizePlain);
	if (v && typeof v === "object") {
		const o = {};
		for (const k of Object.keys(v).sort()) o[k] = SBNormalizePlain(v[k]);
		return o;
	}
	return v;
}

 
function SBTransformViewOf(item) {
	if (!item || !item.Property || typeof item.Property !== "object") return null;
	const t = {};
	for (const k of SBTransformPropKeys) {
		if (item.Property[k] !== undefined) t[k] = SBNormalizePlain(item.Property[k]);
	}
	for (const k of SBExtraTransformKeys) {
		if (item.Property[k] !== undefined) t[k] = SBNormalizePlain(item.Property[k]);
	}
	return Object.keys(t).length ? t : null;
}

 
function SBHashViewOf(appearance) {
	const out = [];
	for (const item of (appearance || [])) {
		if (!item || typeof item !== "object") continue;
		if (typeof item.Group === "string" && SBExcludedGroups.has(item.Group)) continue;
		const o = { Group: item.Group, Name: item.Name };
		if (item.Craft !== undefined) o.Craft = item.Craft;
		const t = SBTransformViewOf(item);
		if (t) o.Transform = t;
		out.push(o);
	}
	return out;
}

 
function SBVolatileSnapshotOf(C) {
	const map = new Map();
	if (!C || !Array.isArray(C.Appearance)) return map;
	for (const it of C.Appearance) {
		if (!it || !it.Asset || !it.Asset.Group || !it.Property || typeof it.Property !== "object") continue;
		const vals = {};
		for (const k of Object.keys(it.Property)) {
			
			if (SBIsVolatileKey(k) || SBIsVolatileValue(it.Property[k])) vals[k] = SBDeepClone(it.Property[k]);
		}
		if (Object.keys(vals).length) {
			map.set(it.Asset.Group.Name, { assetName: it.Asset.Name, vals });
		}
	}
	return map;
}

 
function SBRestoreVolatileKeys(C, backup) {
	if (!C || !Array.isArray(C.Appearance) || !backup || !backup.size) return;
	for (const it of C.Appearance) {
		if (!it || !it.Asset || !it.Asset.Group) continue;
		const rec = backup.get(it.Asset.Group.Name);
		if (!rec || !rec.vals || rec.assetName !== it.Asset.Name) continue;
		if (!it.Property || typeof it.Property !== "object") it.Property = {};
		for (const k of Object.keys(rec.vals)) it.Property[k] = rec.vals[k];
	}
}

 
const SBKnownLockAliases = { "DeviousPadlock": "狗锁" };

 
const SBLockAssetCache = new Map();

 
function SBLockAssetOf(name) {
	if (typeof name !== "string" || !name) return null;
	if (SBLockAssetCache.has(name)) return SBLockAssetCache.get(name);
	let found = null;
	try {
		if (typeof Asset !== "undefined" && Array.isArray(Asset)) {
			found = Asset.find(x => x && x.Name === name && x.IsLock) || null;
			if (!found) found = Asset.find(x => x && x.Name === name) || null;
		} else if (typeof AssetGet === "function") {
			found = AssetGet("Female3DCG", "ItemMisc", name) || null;
		}
	} catch (e) { found = null; }
	if (found) SBLockAssetCache.set(name, found);
	return found;
}

 
function SBLockViewOf(item) {
	if (!item || !item.Property || typeof item.Property !== "object") return null;
	const out = {};
	const base = (item.Property.LockedBy === undefined || item.Property.LockedBy === null) ? undefined : item.Property.LockedBy;
	if (base !== undefined) out.Base = base;
	if (typeof item.Property.Name === "string" && item.Property.Name && SBLockAssetOf(item.Property.Name)) {
		out.Custom = item.Property.Name;
	}
	return Object.keys(out).length ? out : null;
}

 
function SBLocksOf(appearance) {
	const out = [];
	for (const item of (appearance || [])) {
		if (!item || typeof item !== "object") continue;
		if (typeof item.Group === "string" && SBExcludedGroups.has(item.Group)) continue;
		const lock = SBLockViewOf(item);
		if (!lock) continue;
		out.push(Object.assign({ Group: item.Group, Name: item.Name }, lock));
	}
	return out;
}

 
function SBLockDisplayName(lock, C) {
	const name = (typeof lock === "string" && lock) ? lock : (lock === undefined || lock === null ? "" : String(lock));
	if (!name) return SBT("lockNone");
	
	if (SBUI && SBUI.lang === "zh" && SBKnownLockAliases[name]) return SBKnownLockAliases[name];
	try {
		const a = SBLockAssetOf(name);
		if (a) {
			
			if (typeof a.DynamicDescription === "function") {
				try {
					const d = a.DynamicDescription(C);
					if (typeof d === "string" && d && d.indexOf("MISSING") !== 0) return d;
				} catch (e) {   }
			}
			if (typeof a.Description === "string" && a.Description && a.Description.indexOf("MISSING") !== 0) return a.Description;
		}
		if (!a && typeof AssetGet === "function") {
			const x = AssetGet("Female3DCG", "ItemMisc", name);
			if (x && typeof x.Description === "string" && x.Description && x.Description.indexOf("MISSING") !== 0) return x.Description;
		}
	} catch (e) {   }
	return name;
}

 
function SBHashOf(appearance, pose) {
	return JSON.stringify([SBHashViewOf(appearance), SBLocksOf(appearance)]);
}

 
function SBItemDisplayName(group, name) {
	try {
		if (typeof AssetGet === "function" && typeof group === "string" && typeof name === "string") {
			const a = AssetGet("Female3DCG", group, name);
			if (a && typeof a.Description === "string" && a.Description && a.Description.indexOf("MISSING") !== 0) {
				return a.Description;
			}
		}
	} catch (e) {   }
	return name;
}

 
function SBGroupDisplayName(group) {
	try {
		if (typeof AssetGroupGet === "function" && typeof group === "string") {
			const g = AssetGroupGet("Female3DCG", group);
			if (g && typeof g.Description === "string" && g.Description && g.Description.indexOf("MISSING") !== 0) {
				return g.Description;
			}
		}
	} catch (e) {   }
	return group;
}

 
function SBDiffOf(prev, next) {
	const chg = { groups: [], locks: [], pose: false };
	if (!prev || !next) return chg;
	const pm = new Map();
	SBHashViewOf(prev.appearance).forEach(it => pm.set(it.Group, it));
	const nm = new Map();
	SBHashViewOf(next.appearance).forEach(it => nm.set(it.Group, it));
	const keys = new Set();
	pm.forEach((v, k) => keys.add(k));
	nm.forEach((v, k) => keys.add(k));
	keys.forEach(g => {
		if (JSON.stringify(pm.get(g)) !== JSON.stringify(nm.get(g))) chg.groups.push(g);
	});
	
	const pl = new Map();
	(prev.appearance || []).forEach(it => {
		if (it && typeof it === "object" && typeof it.Group === "string" && !SBExcludedGroups.has(it.Group)) pl.set(it.Group, it);
	});
	const nl = new Map();
	(next.appearance || []).forEach(it => {
		if (it && typeof it === "object" && typeof it.Group === "string" && !SBExcludedGroups.has(it.Group)) nl.set(it.Group, it);
	});
	const lkeys = new Set();
	pl.forEach((v, k) => lkeys.add(k));
	nl.forEach((v, k) => lkeys.add(k));
	lkeys.forEach(g => {
		const a = pl.get(g), b = nl.get(g);
		if (!a || !b) return;
		const la = SBLockViewOf(a);
		const lb = SBLockViewOf(b);
		if (JSON.stringify(la) !== JSON.stringify(lb)) {
			chg.locks.push({ g, name: (typeof b.Name === "string" && b.Name) ? b.Name : a.Name, from: la, to: lb });
		}
	});
	
	return chg;
}

 
function SBChgCategories(chg) {
	let items = false, clothing = false, locks = false;
	const groups = (chg && Array.isArray(chg.groups)) ? chg.groups : [];
	for (const g of groups) {
		if (typeof g === "string" && g.indexOf("Item") === 0) items = true;
		else clothing = true;
	}
	if (chg && Array.isArray(chg.locks) && chg.locks.length) locks = true;
	return { items, clothing, locks };
}

 
function SBIsPlayerLike(C) {
	if (!C || typeof C !== "object") return false;
	if (typeof C.IsPlayer === "function" && C.IsPlayer()) return true;
	if (typeof C.IsOnline === "function" && C.IsOnline()) return true;
	return C.Type === "player" || C.Type === "online";
}

 
function SBCurrentNum() {
	if (typeof Player !== "undefined" && Player && Number.isInteger(Player.MemberNumber) && Player.MemberNumber > 0) {
		return Player.MemberNumber;
	}
	return null;
}

 
function SBRecordSnapshot(C, opts) {
	opts = opts || {};
	if (!SBIsPlayerLike(C)) return null;
	if (!SBTabVisible()) return null; 
	const num = C.MemberNumber;
	
	
	if (!Number.isInteger(num) || num < 1) return null;
	const cur = SBCurrentNum();
	if (cur !== null) SBStore.ensureAccount(cur);

	const appearance = SBAppearanceBundleOf(C);
	if (appearance === null) return null; 
	const pose = SBPoseOf(C);
	const hash = SBHashOf(appearance, pose);

	const char = SBCharEnsure(num,
		typeof C.Name === "string" ? C.Name : "",
		typeof C.Nickname === "string" ? C.Nickname : "");
	const last = char.history[0] || null;
	if (!opts.force && last && last.hash === hash) {
		
		
		char.last = SBNow();
		return null;
	}

	const entry = {
		t: SBNow(),
		src: (opts.src === undefined) ? null : opts.src,
		trigger: (opts.trigger === "manual" || opts.trigger === "restore") ? opts.trigger : "auto",
		hash,
		first: !last,
		appearance,
		pose,
		chg: SBDiffOf(last, { appearance, pose }),
	};
	char.history.unshift(entry);
	const keep = Math.max(3, SBStore.load().settings.keep | 0 || 50);
	SBTrimHistory(char.history, keep); 
	if (!char.first) char.first = entry.t;
	char.last = entry.t;
	SBStore.requestSave();
	SBUI.dirty = true;
	return entry;
}

 
function SBApplySnapshot(C, entry) {
	if (!C || !entry || typeof entry !== "object") return { ok: false, num: null };
	const num = C.MemberNumber;
	let ok = true;
	const src = SBCurrentNum();
	const family = (typeof C.AssetFamily === "string" && C.AssetFamily) ? C.AssetFamily : "Female3DCG";

	
	const volatileBackup = SBVolatileSnapshotOf(C);

	
	try {
		if (typeof ServerAppearanceLoadFromBundle === "function") {
			ok = ServerAppearanceLoadFromBundle(C, family, entry.appearance || [], src ?? num) !== false;
		} else {
			C.Appearance = SBDeepClone(entry.appearance || []); 
		}
	} catch (e) { SBErr("应用外观失败", e); ok = false; }

	
	try {
		if (Array.isArray(entry.pose)) C.ActivePose = SBDeepClone(entry.pose);
	} catch (e) { SBErr("应用姿态失败", e); }

	
	SBRestoreVolatileKeys(C, volatileBackup);

	
	try { if (typeof CharacterRefresh === "function") CharacterRefresh(C, true); } catch (e) { SBErr("CharacterRefresh 失败", e); }
	try {
		if (typeof ServerPlayerIsInChatRoom === "function" && ServerPlayerIsInChatRoom() &&
			typeof ChatRoomCharacterUpdate === "function") {
			ChatRoomCharacterUpdate(C);
		}
	} catch (e) { SBErr("聊天室同步失败", e); }

	
	
	
	
	
	
	try {
		if (ok && typeof ServerSend === "function" &&
			typeof ServerPlayerIsInChatRoom === "function" && ServerPlayerIsInChatRoom()) {
			const myNick = (typeof Player !== "undefined" && Player) ? SBGameCharDisplayName(Player) : "";
			const targetNick = SBGameCharDisplayName(C) || ("#" + num);
			const text = SBT("chatRollback", myNick, targetNick);
			ServerSend("ChatRoomChat", {
				Content: "Beep",
				Type: "Action",
				Dictionary: [
					{ Tag: "Beep", Text: "msg" },
					{ Tag: "发送私聊", Text: "msg" },
					{ Tag: "Biep", Text: "msg" },
					{ Tag: "Sonner", Text: "msg" },
					{ Tag: "msg", Text: text },
				],
			});
		}
	} catch (e) {   }

	
	SBRecordSnapshot(C, { trigger: "restore", src });

	return { ok, num };
}

 
function SBCharObjectOf(num) {
	if (typeof Player !== "undefined" && Player && Player.MemberNumber === num &&
		(typeof Player.IsPlayer !== "function" || Player.IsPlayer())) return Player;
	if (typeof Character !== "undefined" && Array.isArray(Character)) {
		for (let i = 0; i < Character.length; i++) {
			const c = Character[i];
			if (c && c.MemberNumber === num) return c;
		}
	}
	return null;
}

 
function SBCharInRoom(num) {
	if (!Number.isInteger(num)) return false;
	if (typeof Player !== "undefined" && Player && Player.MemberNumber === num) return true;
	try {
		if (typeof ChatRoomCharacter !== "undefined" && Array.isArray(ChatRoomCharacter)) {
			return ChatRoomCharacter.some(c => c && c.MemberNumber === num);
		}
	} catch (e) {   }
	if (typeof Character !== "undefined" && Array.isArray(Character)) {
		const c = Character.find(x => x && x.MemberNumber === num);
		if (c) return typeof c.IsOnline === "function" ? c.IsOnline() : (c.Type === "online" || c.Type === "player");
	}
	return false;
}

 
function SBCollectAll(trigger) {
	trigger = trigger || "auto";
	const cur = SBCurrentNum();
	if (cur !== null) SBStore.ensureAccount(cur);
	let count = 0;
	if (typeof Player !== "undefined" && Player) {
		if (SBRecordSnapshot(Player, { trigger, src: SBResolveSrc(Player.MemberNumber) })) count++;
	}
	if (typeof Character !== "undefined" && Array.isArray(Character)) {
		for (let i = 0; i < Character.length; i++) {
			const c = Character[i];
			if (!c || c === Player) continue;
			if (SBRecordSnapshot(c, { trigger, src: SBResolveSrc(c.MemberNumber) })) count++;
		}
	}
	return count;
}

 

function SBExportJSON() {
	const s = SBStore.load();
	return JSON.stringify({ v: s.v, settings: s.settings, chars: s.chars, favs: s.favs, favGone: s.favGone }, SBStateReplacer, 2);
}

 
function SBExportCharJSON(num) {
	const s = SBStore.load();
	const c = s.chars[String(num)];
	if (!c) return null;
	return JSON.stringify({
		v: s.v, settings: s.settings,
		chars: { [String(num)]: c },
		favs: s.favs.filter(f => f.num === num),
		favGone: s.favGone,
	}, SBStateReplacer, 2);
}

 

 
function SBFavKeyOf(f) {
	return f.num + ":" + f.snapT + ":" + f.hash;
}

 
function SBFavoriteSnapshot(num, idx, name) {
	const c = SBCharOf(num);
	const entry = c && c.history[idx];
	if (!entry) return null;
	const s = SBStore.load();
	const fav = {
		num,
		charName: SBCharDisplayName(c),
		snapT: entry.t,
		hash: entry.hash,
		src: entry.src !== undefined ? entry.src : null,
		trigger: entry.trigger,
		favName: (typeof name === "string" && name.trim()) ? name.trim() : SBCharDisplayName(c) + " " + SBTimeStr(entry.t),
		appearance: SBDeepClone(entry.appearance),
		pose: SBDeepClone(entry.pose),
	};
	const key = SBFavKeyOf(fav);
	if (s.favs.some(f => SBFavKeyOf(f) === key)) return null; 
	s.favs.unshift(fav);
	delete s.favGone[key];
	SBStore.requestSave();
	SBUI.dirty = true;
	return fav;
}

 
function SBFavFind(num, idx) {
	const c = SBCharOf(num);
	const entry = c && c.history[idx];
	if (!entry) return null;
	const key = num + ":" + entry.t + ":" + entry.hash;
	return SBStore.load().favs.find(f => SBFavKeyOf(f) === key) ?? null;
}

 
function SBUnfavorite(key) {
	const s = SBStore.load();
	const i = s.favs.findIndex(f => SBFavKeyOf(f) === key);
	if (i < 0) return false;
	s.favs.splice(i, 1);
	s.favGone[key] = SBNow();
	const keys = Object.keys(s.favGone);
	if (keys.length > 200) {
		keys.sort((a, b) => (s.favGone[b] || 0) - (s.favGone[a] || 0));
		for (const k of keys.slice(200)) delete s.favGone[k];
	}
	SBStore.requestSave();
	SBUI.dirty = true;
	return true;
}

 
function SBRenameFavorite(key, name) {
	const s = SBStore.load();
	const f = s.favs.find(x => SBFavKeyOf(x) === key);
	if (!f) return false;
	if (typeof name === "string" && name.trim()) f.favName = name.trim();
	SBStore.requestSave();
	SBUI.dirty = true;
	return true;
}

 
function SBMergeInto(target, source, importMode) {
	const out = { changed: false, addedChars: 0, addedSnaps: 0 };
	if (!target || typeof target !== "object" || !source || typeof source !== "object" ||
		!source.chars || typeof source.chars !== "object") return out;

	
	const impFor = (key) => Math.max(SBNow(), (target.deletedAllAt || 0) + 1, (target.gone[key] || 0) + 1);

	
	if (typeof source.deletedAllAt === "number" && source.deletedAllAt > (target.deletedAllAt || 0)) {
		target.deletedAllAt = source.deletedAllAt;
		out.changed = true;
	}
	if (!target.gone || typeof target.gone !== "object") target.gone = {};
	if (source.gone && typeof source.gone === "object") {
		for (const k of Object.keys(source.gone)) {
			if ((source.gone[k] || 0) > (target.gone[k] || 0)) {
				target.gone[k] = source.gone[k];
				out.changed = true;
			}
		}
	}
	
	if (!target.favGone || typeof target.favGone !== "object") target.favGone = {};
	if (source.favGone && typeof source.favGone === "object") {
		for (const k of Object.keys(source.favGone)) {
			if ((source.favGone[k] || 0) > (target.favGone[k] || 0)) {
				target.favGone[k] = source.favGone[k];
				out.changed = true;
			}
		}
	}
	
	if (!Array.isArray(target.favs)) target.favs = [];
	if (Array.isArray(source.favs)) {
		const seenFav = new Set(target.favs.map(f => SBFavKeyOf(f)));
		for (const f of source.favs) {
			if (!f || typeof f !== "object" || !Number.isInteger(f.num)) continue;
			const key = SBFavKeyOf(f);
			if (target.favGone[key]) continue;
			if (seenFav.has(key)) continue;
			seenFav.add(key);
			target.favs.push(SBDeepClone(f));
			out.changed = true;
		}
		
		target.favs.sort((a, b) => b.snapT - a.snapT);
	}

	 
	const effOf = (e) => (SBIsImported(e) ? e.imp : e.t);
	 
	const dropped = (key, e) => {
		if (!e || typeof e !== "object" || typeof e.t !== "number") return true;
		if ((target.deletedAllAt || 0) && effOf(e) <= target.deletedAllAt) return true;
		if ((target.gone[key] || 0) && effOf(e) < target.gone[key]) return true;
		return false;
	};
	 
	const droppedMem = (key, e) => {
		if (!e || typeof e !== "object" || typeof e.t !== "number") return true;
		if ((target.deletedAllAt || 0) && effOf(e) < target.deletedAllAt) return true;
		if ((target.gone[key] || 0) && e.t < target.gone[key]) return true;
		return false;
	};

	
	
	const blockedByHash = (list, e) =>
		Array.isArray(list) && (list.includes(e.hash + ":" + e.t) || list.includes(e.hash)); 
	for (const key of Object.keys(target.chars)) {
		const tc = target.chars[key];
		if (!tc || !Array.isArray(tc.history)) continue;
		if (!Array.isArray(tc.deletedHashes)) tc.deletedHashes = [];
		const sh = source.chars[key] && Array.isArray(source.chars[key].deletedHashes) ? source.chars[key].deletedHashes : [];
		const before = tc.history.length;
		
		tc.history = tc.history.filter(e =>
			!droppedMem(key, e) &&
			(SBIsImported(e) || (!blockedByHash(tc.deletedHashes, e) && !blockedByHash(sh, e))));
		if (tc.history.length !== before) out.changed = true;
		if (!tc.history.length) { delete target.chars[key]; out.changed = true; }
	}

	
	for (const key of Object.keys(source.chars)) {
		const sc = source.chars[key];
		const num = Number(key);
		if (!Number.isInteger(num) || num < 0 || !sc || typeof sc !== "object" || !Array.isArray(sc.history)) continue;

		if (!target.chars[key]) {
			
			const hist = sc.history
				.map(e => { if (importMode) e.imp = impFor(key); return e; })
				.filter(e => !dropped(key, e))
				.map(e => {
					e.appearance = SBSanitizeBundle(Array.isArray(e.appearance) ? e.appearance : []);
					if (!Array.isArray(e.pose)) e.pose = [];
					e.hash = SBHashOf(e.appearance, e.pose);
					return e;
				});
			if (hist.length) {
				target.chars[key] = {
					num,
					name: typeof sc.name === "string" ? sc.name : "",
					nick: typeof sc.nick === "string" ? sc.nick : "",
					first: null,
					last: sc.last || 0,
					deletedHashes: [],
					history: hist,
				};
				out.addedChars++;
				out.addedSnaps += hist.length;
				out.changed = true;
			}
			continue;
		}

		const tc = target.chars[key];
		
		if (!Array.isArray(tc.deletedHashes)) tc.deletedHashes = [];
		for (const h of (Array.isArray(sc.deletedHashes) ? sc.deletedHashes : [])) {
			if (!tc.deletedHashes.includes(h)) {
				tc.deletedHashes.push(h);
				out.changed = true;
			}
		}
		if (tc.deletedHashes.length > 200) tc.deletedHashes = tc.deletedHashes.slice(-200);

		
		const seen = new Set(tc.history.map(e => e.hash));
		for (const e of sc.history) {
			if (importMode) e.imp = impFor(key);
			if (dropped(key, e)) continue;
			e.appearance = SBSanitizeBundle(Array.isArray(e.appearance) ? e.appearance : []);
			if (!Array.isArray(e.pose)) e.pose = [];
			e.hash = SBHashOf(e.appearance, e.pose);
			
			if ((!SBIsImported(e) && blockedByHash(tc.deletedHashes, e)) || seen.has(e.hash)) {
				
				if (SBIsImported(e)) {
					const ex = tc.history.find(x => x.hash === e.hash);
					if (ex) {
						const upgraded = Math.max(ex.imp || 0, e.imp || 0);
						if (upgraded !== (ex.imp || 0)) { ex.imp = upgraded; out.changed = true; }
					}
				}
				continue;
			}
			seen.add(e.hash);
			tc.history.push(SBDeepClone(e));
			out.addedSnaps++;
			out.changed = true;
		}
	}

	
	const keep = Math.max(3, target.settings.keep | 0 || 50);
	for (const key of Object.keys(target.chars)) {
		const tc = target.chars[key];
		if (!tc || !Array.isArray(tc.history)) continue;
		if (SBTrimHistory(tc.history, keep)) out.changed = true;
		SBReindexChar(tc);
	}
	if (SBTrimGlobalCap(target, keep)) out.changed = true;
	return out;
}

 
function SBImportState(data, opts) {
	if (!data || typeof data !== "object" || !data.chars || typeof data.chars !== "object") {
		throw Object.assign(new Error("不是有效的 SnapBack 数据"), { sbCode: "notValid" });
	}
	const s = SBStore.load();
	const res = SBMergeInto(s, data, true); 
	if (opts && opts.applySettings === false) {
		
	} else {
		if (data.settings && Number.isInteger(data.settings.keep) && data.settings.keep >= 3 && data.settings.keep <= 500) {
			s.settings.keep = data.settings.keep;
		}
		if (data.settings && typeof data.settings.keepFirst === "boolean") {
			s.settings.keepFirst = data.settings.keepFirst;
		}
	}
	
	SBStore.state = SBStore.normalize(s);
	SBStore.requestSave();
	SBUI.dirty = true;
	return { addedChars: res.addedChars, addedSnaps: res.addedSnaps };
}

 
function SBImportJSON(json) {
	let data;
	try { data = JSON.parse(json); } catch (e) {
		throw Object.assign(new Error("JSON 解析失败"), { sbCode: "jsonParse" });
	}
	return SBImportState(data);
}

 
function SBDeleteSnapshot(num, idx) {
	const s = SBStore.load();
	const c = s.chars[String(num)];
	if (!c || !c.history[idx]) return false;
	const entry = c.history[idx];
	if (!Array.isArray(c.deletedHashes)) c.deletedHashes = [];
	c.deletedHashes.push(entry.hash + ":" + entry.t);
	if (c.deletedHashes.length > 200) c.deletedHashes = c.deletedHashes.slice(-200);
	c.history.splice(idx, 1);
	if (!c.history.length) {
		s.gone[String(num)] = SBNow();
		delete s.chars[String(num)];
	} else {
		SBReindexChar(c); 
	}
	SBStore.requestSave();
	SBUI.dirty = true;
	return true;
}

 
function SBClearAll() {
	const now = SBNow();
	const s = SBStore.load();
	s.chars = {};
	s.gone = {};
	s.deletedAllAt = now;
	SBStore._dirty = true; 
	SBStore.save();
	SBUI.dirty = true;
}

 
function SBDeleteChar(num) {
	if (!Number.isInteger(num)) return false;
	const s = SBStore.load();
	if (!s.chars[String(num)]) return false;
	s.gone[String(num)] = SBNow();
	delete s.chars[String(num)];
	SBStore.requestSave();
	SBUI.dirty = true;
	return true;
}

 
function SBClearOtherChar(num) {
	if (!Number.isInteger(num)) return false;
	const cur = SBCurrentNum();
	if (cur !== null && num === cur) return false; 
	const s = SBStore.load();
	const c = s.chars[String(num)];
	if (!c || !Array.isArray(c.history) || !c.history.length) return false;
	
	let oldest = null;
	for (const e of c.history) {
		if (!oldest || e.t < oldest.t) oldest = e;
	}
	const keepFirst = s.settings.keepFirst !== false;
	const keep = c.history.filter(e => SBIsImported(e) || (keepFirst && e === oldest));
	if (keep.length >= c.history.length) return false; 
	if (keep.length) {
		c.history = keep;
		SBReindexChar(c);
	} else {
		s.gone[String(num)] = SBNow();
		delete s.chars[String(num)];
	}
	SBStore.requestSave();
	SBUI.dirty = true;
	return true;
}

 
function SBClearOthers() {
	const s = SBStore.load();
	const cur = SBCurrentNum();
	if (cur === null) return 0; 
	let removed = 0;
	for (const key of Object.keys(s.chars)) {
		const num = Number(key);
		if (num === cur) continue;
		if (SBClearOtherChar(num)) removed++;
	}
	
	for (const t of SBHooks.leaveTimers.values()) clearTimeout(t);
	SBHooks.leaveTimers.clear();
	if (removed) {
		SBStore.requestSave();
		SBUI.dirty = true;
	}
	return removed;
}

 

const SBHooks = {
	mod: null,
	timers: new Map(),      
	lastSrc: new Map(),     
	leaveTimers: new Map(), 
	sweepId: null,
	srcFreshMs: 3000,       
	leaveCleanupMs: 300000, 
};

 
function SBScheduleOthersCleanup(num) {
	if (!Number.isInteger(num)) return;
	const cur = SBCurrentNum();
	if (cur !== null && num === cur) return; 
	const old = SBHooks.leaveTimers.get(num);
	if (old) clearTimeout(old);
	SBHooks.leaveTimers.set(num, setTimeout(() => {
		SBHooks.leaveTimers.delete(num);
		const c = SBCharOf(num);
		if (!c) return;
		if (SBClearOtherChar(num)) {
			SBToast(SBT("toastCharCleanedDelay", SBCharDisplayName(c), num));
		}
	}, SBHooks.leaveCleanupMs));
}

 
function SBCancelOthersCleanup(num) {
	const t = SBHooks.leaveTimers.get(num);
	if (t) {
		clearTimeout(t);
		SBHooks.leaveTimers.delete(num);
	}
}

 
const SB_UNKNOWN_SRC = "SB_UNKNOWN_SRC";

 
function SBHooksSetSrc(num, src) {
	if (!Number.isInteger(num)) return;
	SBHooks.lastSrc.set(num, { src, t: SBNow() });
}

 
function SBHooksFreshSrc(num) {
	const rec = SBHooks.lastSrc.get(num);
	if (!rec || typeof rec.t !== "number" || (SBNow() - rec.t) > SBHooks.srcFreshMs) return null;
	return rec.src;
}

 
function SBHooksTakeSrc(num) {
	const rec = SBHooks.lastSrc.get(num);
	if (!rec || typeof rec.t !== "number" || (SBNow() - rec.t) > SBHooks.srcFreshMs) return undefined;
	SBHooks.lastSrc.delete(num);
	return rec.src;
}

 
function SBResolveSelfDefault(num) {
	const cur = SBCurrentNum();
	return (cur !== null && num === cur) ? cur : null;
}

 
function SBResolveSrc(num) {
	const marked = SBHooksTakeSrc(num);
	if (marked === undefined) return SBResolveSelfDefault(num);
	if (marked === SB_UNKNOWN_SRC) return null;
	return marked;
}

 
function SBQueueCapture(C, trigger, src) {
	if (!C || typeof C !== "object") return;
	const num = C.MemberNumber;
	
	if (!Number.isInteger(num) || num < 1) return;
	const old = SBHooks.timers.get(num);
	if (old) clearTimeout(old);
	SBHooks.timers.set(num, setTimeout(() => {
		SBHooks.timers.delete(num);
		try {
			
			const marked = SBHooksTakeSrc(num);
			SBRecordSnapshot(C, {
				trigger: trigger || "auto",
				src: (src === undefined)
					? (marked === undefined ? SBResolveSelfDefault(num) : (marked === SB_UNKNOWN_SRC ? null : marked))
					: src,
			});
		} catch (e) { SBErr("采集失败", e); }
	}, 300));
}

 
function SnapBackToggle() {
	if (SBUI.open) SnapBackClose(); else SnapBackOpen();
}

function SBInstallHooks(mod) {
	const safe = (fn) => (...args) => {
		try { return fn(...args); } catch (e) { SBErr(e); }
	};

	
	
	
	
	try {
		mod.hookFunction("CharacterRefresh", 10, (args, next) => {
			const res = next(args);
			safe(() => SBQueueCapture(args[0], "auto"))();
			return res;
		});
	} catch (e) { SBErr("hook CharacterRefresh 失败", e); }

	
	
	try {
		mod.hookFunction("CharacterOnlineRefresh", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const Char = args[0];
				const SourceMemberNumber = args[2];
				if (Char && Number.isInteger(Char.MemberNumber)) {
					SBCancelOthersCleanup(Char.MemberNumber);
				}
				if (Char && Number.isInteger(Char.MemberNumber) && Number.isInteger(SourceMemberNumber)) {
					SBHooksSetSrc(Char.MemberNumber, SourceMemberNumber);
				}
				SBQueueCapture(Char, "auto");
			})();
			return res;
		});
	} catch (e) { SBErr("hook CharacterOnlineRefresh 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomSyncMemberLeave", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const s = SBStore.load();
				if (s.settings.autoClearOthers === false) return;
				const data = args[0];
				if (data && Number.isInteger(data.SourceMemberNumber)) {
					SBScheduleOthersCleanup(data.SourceMemberNumber);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomSyncMemberLeave 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomCharacterItemUpdate", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const C = args[0];
				if (C && Number.isInteger(C.MemberNumber)) {
					SBHooksSetSrc(C.MemberNumber, SBCurrentNum() ?? null);
					SBQueueCapture(C, "auto", SBCurrentNum() ?? null);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomCharacterItemUpdate 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomCharacterUpdate", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const C = args[0];
				if (C && Number.isInteger(C.MemberNumber)) {
					SBHooksSetSrc(C.MemberNumber, SBCurrentNum() ?? null);
					SBQueueCapture(C, "auto", SBCurrentNum() ?? null);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomCharacterUpdate 失败", e); }

	
	
	
	try {
		mod.hookFunction("ChatRoomSyncItem", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const data = args[0];
				if (data && data.Item && Number.isInteger(data.Item.Target) && Number.isInteger(data.Source)) {
					SBHooksSetSrc(data.Item.Target, data.Source);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomSyncItem 失败", e); }

	
	
	try {
		mod.hookFunction("ChatRoomSyncPose", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const data = args[0];
				if (data && Number.isInteger(data.MemberNumber)) {
					SBHooksSetSrc(data.MemberNumber, SB_UNKNOWN_SRC);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomSyncPose 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomSyncExpression", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const data = args[0];
				if (data && Number.isInteger(data.MemberNumber)) {
					SBHooksSetSrc(data.MemberNumber, SB_UNKNOWN_SRC);
				}
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomSyncExpression 失败", e); }

	
	
	
	try {
		mod.hookFunction("ChatRoomLeave", 10, (args, next) => {
			const res = next(args);
			safe(() => {
				const s = SBStore.load();
				if (s.settings.autoClearOthers === false) return;
				const removed = SBClearOthers();
				if (removed > 0) SBToast(SBT("toastClearedOthers", removed));
			})();
			return res;
		});
	} catch (e) { SBErr("hook ChatRoomLeave 失败", e); }

	
	try {
		mod.hookFunction("ChatRoomSendChat", 10, (args, next) => {
			const input = document.getElementById("InputChat");
			const raw = input ? input.value : "";
			const t = (raw || "").trim().toLowerCase();
			if (t === "/snapback" || t === "/snap" || t === "/快照" || t === "/回溯") {
				SBInputClear(input);
				safe(SnapBackToggle)();
				return;
			}
			return next(args);
		});
	} catch (e) { SBErr("hook ChatRoomSendChat 失败", e); }

	
	try {
		SBHooks.sweepId = setInterval(() => {
			if (!SBTabVisible()) return;
			safe(SBCollectAll)();
		}, 60000);
	} catch (e) { SBErr("定时补采启动失败", e); }
}

 
function SBInputClear(input) {
	if (!input) return;
	input.value = "";
	try {
		input.dispatchEvent(new InputEvent("input"));
	} catch (e) {
		
	}
}

 

const SBText = {
	zh: {
		title: "SnapBack 时空回溯快照",
		minimizeTitle: "最小化（只剩标题栏，再点标题栏恢复）",
		closeTitle: "关闭浮窗",
		resizeTitle: "拖动拉伸窗口",
		tips: "拖标题栏移动 · 拖右下角拉伸 · 点时间线看情况 · 点「回溯」恢复",
		cmd: "聊天室输入 /snapback 开关本窗",
		btnSnap: "立即快照", btnSnapTitle: "给自己立刻记录一条快照",
		btnSnapAll: "快照全部", btnSnapAllTitle: "把房间里所有在线角色（含自己）各记录一条快照",
		btnSnapSel: "快照此人", btnSnapSelSelf: "快照自己", btnSnapSelTitle: "给当前选中的角色立刻记录一条快照",
		selKeepLabel: "保留：", selKeepTitle: "每个角色保留的快照条数",
		btnExport: "导出", btnExportTitle: "复制数据到剪贴板并下载备份文件（.txt）",
		btnImport: "导入", btnImportTitle: "从 .txt 文件或粘贴文本导入数据（与现有数据合并）",
		btnClear: "清空", btnClearTitle: "删除全部快照数据（不可恢复！）",
		optClearOthers: "离开清理", optClearOthersTitle: "离开房间时自动清空其他玩家的快照（保留自己的；掉线重连不会触发）",
		optKeepFirst: "保留初始记录", optKeepFirstTitle: "离开房间清理时，每个其他玩家保留最早一条「初始记录」（默认关闭；不勾选则连初始记录一起清理）",
		toastClearedOthers: "已清理 {0} 个其他玩家的快照（自己的保留）",
		btnLangTitle: "切换界面语言 / Switch UI language",
		toastLang: "界面语言：中文",
		toastOpened: "SnapBack 浮窗已打开：{0} 个角色 / {1} 条快照。选中角色后右侧点「回溯」恢复外观。",
		toastSnapped: "已记录快照：{0}（#{1}）",
		toastSnapAll: "快照全部完成：新增 {0} 条快照",
		toastSnapSame: "没有新变化，未重复记录",
		toastSnapNone: "没有可快照的角色（需要角色在场且游戏已就绪）",
		toastRestoredOk: "已回溯：{0}（#{1}）",
		toastRestoredPartial: "已回溯（部分内容因权限被游戏拦截）：{0}（#{1}）",
		toastRestoreGone: "该玩家不在房间内，无法回溯",
		toastRestoreFail: "回溯失败，请查看控制台",
		chatRollback: "{0}对{1}执行了一次回溯，将{1}身上的一切恢复到了之前的样子",
		toastDeleted: "已删除该快照",
		toastCharDeleted: "已删除 {0}（#{1}）的全部快照",
		toastCharCleanedDelay: "已清理 {0}（#{1}）的快照（离开超过 5 分钟）",
		toastCleared: "已清空全部快照数据",
		toastExportClip: "已复制到剪贴板，并下载了备份文件",
		toastExportFile: "备份文件已下载（剪贴板不可用）",
		toastExportFail: "导出失败：{0}",
		toastImportDone: "导入完成：合并 {0} 个角色、{1} 条快照",
		toastImportFail: "导入失败：{0}",
		toastClipboardFail: "无法读取剪贴板，请手动粘贴",
		toastBuildFail: "SnapBack 浮窗构建失败，请查看控制台",
		importTitle: "导入备份（.txt）",
		importHint: "点「选择文件」直接选导出的 .txt 文件；或打开该 txt 复制全部内容粘贴到下面，再点「从文本导入」。导入会与现有数据合并（重复内容自动跳过）。",
		importPh: "把导出的 .txt 的全部内容粘贴到这里…",
		btnImportFile: "选择文件", btnImportText: "从文本导入", btnCancel: "取消",
		btnFav: "☆", btnFavTitle: "收藏这条快照（收藏后不受清空/自动清理影响，可在收藏夹重命名）",
		btnFavTitleOn: "已收藏，点一下取消收藏",
		toastFav: "已收藏：{0}（工具栏「收藏夹」可重命名/管理）",
		toastUnfav: "已取消收藏",
		btnFavs: "收藏夹", btnFavsTitle: "查看/管理收藏的快照（不受清空与自动清理影响）",
		favPanelTitle: "收藏夹（不受清理影响）",
		favEmpty: "还没有收藏的快照。在时间线上点 ☆ 收藏。",
		favCharTime: "{0} · #{1} · {2}",
		btnFavRename: "重命名", btnFavSave: "保存", btnFavUnfav: "取消收藏", btnFavUnfavConfirm: "确认取消收藏", btnFavRestore: "回溯",
		toastFavRenamed: "已重命名",
		dotTitle: "SnapBack — 左键点击打开/关闭浮窗，按住拖动位置",
		headItems: "装备 {0} 件", headPose: "姿态：{0}",
		headGone: "⚠ 该角色当前不在场（回溯需要角色在场）",
		headCurrent: "当前状态",
		listMe: "（我）", listTitle: "角色（{0}）",
		listEmpty: "还没有记录到任何角色。进入游戏后换装、加道具、改设置都会自动生成快照。",
		tlEmpty: "还没有快照。换装、加道具、改设置都会自动生成快照，也可以点「立即快照」。",
		badgeAuto: "自动", badgeManual: "手动", badgeRestore: "回溯",
		srcSelf: "我", srcOther: "{0}",
		chipPose: "姿态",
		chipFirst: "初始记录",
		chipItems: "物品更改", chipItemsTitle: "Item 部位（如 ItemNeck/ItemLegs/ItemMouth）变化：{0}（点开快照看详细差异）",
		chipClothing: "服装更改", chipClothingTitle: "非 Item 部位变化：{0}（点开快照看详细差异）",
		chipLocks: "锁更改", chipLocksTitle: "锁变化（上锁/解锁/换锁）的部位：{0}（点开快照看详细差异）",
		chipImported: "导入", chipImportedTitle: "导入的快照：不受离开自动清理和保留条数裁剪影响，只能手动删除或清空全部",
		btnDelCharTitle: "删除该角色的全部快照（点一下进入确认，再点一下执行）",
		btnDelCharConfirmTitle: "再点一下删除该角色的全部快照（3 秒不点自动复原；不可恢复）",
		btnExportChar: "导出此人", btnExportCharTitle: "把该角色的全部快照导出为 .txt 备份（剪贴板 + 文件）",
		toastExportChar: "已导出 {0}（#{1}）：{2} 条快照",
		btnRestore: "回溯", btnRestoreTitle: "点一下进入确认，再点一下才回溯",
		btnRestoreConfirm: "确认回溯", btnRestoreConfirmTitle: "再点一下执行回溯（3 秒不点自动复原；别人的无权限部分会被游戏拦截）",
		btnDel: "删除", btnDelTitle: "点一下进入确认，再点一下才删除",
		btnDelConfirm: "确认删除", btnDelConfirmTitle: "再点一下删除这条快照（3 秒不点自动复原；不可恢复）",
		btnClearConfirm: "确认清空", btnClearConfirmTitle: "再点一下清空全部快照数据（3 秒不点自动复原；不可恢复！）",
		detailTitle: "与上一条的差异",
		diffInit: "初始记录：{0} 件装备（含道具）",
		diffAdd: "新增 {0}", diffRemove: "移除 {0}",
		diffSwap: "{0} → {1}", diffMod: "（颜色/属性/设置变化）", diffTransform: "（移动/缩放/旋转已更改）",
		diffLock: "{0} 锁：{1} → {2}", lockNone: "无", lockPair: "{0}（{1}）",
		diffPose: "姿态：{0} → {1}",
		diffNone: "无可见差异",
		poseNone: "无",
		timeNever: "—",
		errJsonParse: "JSON 解析失败",
		errNotValid: "不是有效的 SnapBack 导出数据",
	},
	en: {
		title: "SnapBack time-warp rollback",
		minimizeTitle: "Minimize (click again to restore)",
		closeTitle: "Close window",
		resizeTitle: "Drag to resize",
		tips: "Drag title to move · drag corner to resize · click a timeline entry for diff · Restore to roll back",
		cmd: "Type /snapback in chat to toggle",
		btnSnap: "Snapshot me", btnSnapTitle: "Take a snapshot of yourself now",
		btnSnapAll: "Snapshot all", btnSnapAllTitle: "Snapshot every online character in the room (including yourself)",
		btnSnapSel: "Snapshot them", btnSnapSelSelf: "Snapshot me", btnSnapSelTitle: "Snapshot the currently selected character",
		selKeepLabel: "Keep: ", selKeepTitle: "Snapshots kept per character",
		btnExport: "Export", btnExportTitle: "Copy data to clipboard and download backup",
		btnImport: "Import", btnImportTitle: "Import data from clipboard (merge)",
		btnClear: "Clear all", btnClearTitle: "Delete ALL snapshot data (irreversible!)",
		optClearOthers: "Clear on leave", optClearOthersTitle: "When leaving a room, clear other players' snapshots (yours are kept; disconnects do not trigger this)",
		optKeepFirst: "Keep initial records", optKeepFirstTitle: "When clearing on leave, keep the earliest \"initial record\" of each other player (off by default; uncheck to clear initial records too)",
		toastClearedOthers: "Cleared snapshots of {0} other players (yours kept)",
		btnLangTitle: "切换界面语言 / Switch UI language",
		toastLang: "UI language: English",
		toastOpened: "SnapBack opened: {0} characters / {1} snapshots. Select a character, then click Restore on a timeline entry.",
		toastSnapped: "Snapshot taken: {0} (#{1})",
		toastSnapAll: "Snapshot all done: {0} new snapshots",
		toastSnapSame: "No change — snapshot skipped",
		toastSnapNone: "No character to snapshot (must be present and game ready)",
		toastRestoredOk: "Restored: {0} (#{1})",
		toastRestoredPartial: "Restored (some parts blocked by the game's permission checks): {0} (#{1})",
		toastRestoreGone: "That player is not in the room — cannot restore",
		toastRestoreFail: "Restore failed — check console",
		chatRollback: "{0} performed a rollback on {1}, restoring everything on {1} to how it was before",
		toastDeleted: "Snapshot deleted",
		toastCharDeleted: "Deleted all snapshots of {0} (#{1})",
		toastCharCleanedDelay: "Cleaned snapshots of {0} (#{1}) (away over 5 minutes)",
		toastCleared: "All snapshot data cleared",
		toastExportClip: "Copied to clipboard and downloaded backup",
		toastExportFile: "Backup downloaded (clipboard unavailable)",
		toastExportFail: "Export failed: {0}",
		toastImportDone: "Imported: {0} characters, {1} snapshots merged",
		toastImportFail: "Import failed: {0}",
		toastClipboardFail: "Cannot read clipboard — paste manually",
		toastBuildFail: "Failed to build the SnapBack window — check console",
		importTitle: "Import backup (.txt)",
		importHint: "Click Choose file to pick the exported .txt directly, or open the txt, copy all of its content into the box below, then click Import text. It merges with existing data (duplicates are skipped).",
		importPh: "Paste the full content of the exported .txt here…",
		btnImportFile: "Choose file", btnImportText: "Import text", btnCancel: "Cancel",
		btnFav: "☆", btnFavTitle: "Favorite this snapshot (favorites survive clears and auto-cleanup; rename it in the Favorites panel)",
		btnFavTitleOn: "Favorited — click to unfavorite",
		toastFav: "Favorited: {0} (manage it in the Favorites panel)",
		toastUnfav: "Unfavorited",
		btnFavs: "Favorites", btnFavsTitle: "View/manage favorited snapshots (survive clears and auto-cleanup)",
		favPanelTitle: "Favorites (protected from cleanup)",
		favEmpty: "No favorites yet. Click ☆ on a timeline entry to favorite it.",
		favCharTime: "{0} · #{1} · {2}",
		btnFavRename: "Rename", btnFavSave: "Save", btnFavUnfav: "Unfavorite", btnFavUnfavConfirm: "Confirm unfavorite", btnFavRestore: "Restore",
		toastFavRenamed: "Renamed",
		dotTitle: "SnapBack — left click to open/close the window, hold and drag to move",
		headItems: "{0} items", headPose: "Pose: {0}",
		headGone: "⚠ This character is not present (restore needs them in the room)",
		headCurrent: "Current state",
		listMe: " (me)", listTitle: "Characters ({0})",
		listEmpty: "No characters recorded yet. Wear/remove items or change settings in game to auto-generate snapshots.",
		tlEmpty: "No snapshots yet. Wearing items, changing colors or settings creates snapshots automatically — or click Snapshot now.",
		badgeAuto: "auto", badgeManual: "manual", badgeRestore: "restore",
		srcSelf: "me", srcOther: "{0}",
		chipPose: "Pose",
		chipFirst: "Initial",
		chipItems: "items changed", chipItemsTitle: "Item group changes (e.g. ItemNeck/ItemLegs/ItemMouth): {0} (expand for details)",
		chipClothing: "clothing changed", chipClothingTitle: "Non-Item group changes: {0} (expand for details)",
		chipLocks: "lock changed", chipLocksTitle: "Lock changes (locked/unlocked/swapped) on: {0} (expand for details)",
		chipImported: "imported", chipImportedTitle: "Imported snapshot: protected from auto-cleanup and trimming; only manual delete or Clear all can remove it",
		btnDelCharTitle: "Delete all snapshots of this character (click once to arm, click again to delete)",
		btnDelCharConfirmTitle: "Click again to delete ALL snapshots of this character (auto-cancels in 3s; irreversible)",
		btnExportChar: "Export this", btnExportCharTitle: "Export all snapshots of this character as a .txt backup (clipboard + file)",
		toastExportChar: "Exported {0} (#{1}): {2} snapshots",
		btnRestore: "Restore", btnRestoreTitle: "Click once to arm, click again to restore",
		btnRestoreConfirm: "Confirm", btnRestoreConfirmTitle: "Click again to restore (auto-cancels in 3s; parts you lack permission for will be blocked by the game)",
		btnDel: "Del", btnDelTitle: "Click once to arm, click again to delete",
		btnDelConfirm: "Confirm del", btnDelConfirmTitle: "Click again to delete this snapshot (auto-cancels in 3s; irreversible)",
		btnClearConfirm: "Confirm clear", btnClearConfirmTitle: "Click again to clear ALL snapshot data (auto-cancels in 3s; irreversible!)",
		detailTitle: "Diff vs previous snapshot",
		diffInit: "Initial snapshot: {0} items",
		diffAdd: "added {0}", diffRemove: "removed {0}",
		diffSwap: "{0} -> {1}", diffMod: " (color/property changed)", diffTransform: " (moved/resized/rotated)",
		diffLock: "{0} Lock: {1} -> {2}", lockNone: "none", lockPair: "{0} ({1})",
		diffPose: "Pose: {0} -> {1}",
		diffNone: "No visible difference",
		poseNone: "none",
		timeNever: "-",
		errJsonParse: "JSON parse failed",
		errNotValid: "Not valid SnapBack export data",
	},
};

 
function SBT(key, ...args) {
	const dict = SBText[SBUI.lang] || SBText.zh;
	let s = dict[key] ?? SBText.zh[key] ?? key;
	for (let i = 0; i < args.length; i++) {
		s = s.split("{" + i + "}").join(String(args[i]));
	}
	return s;
}

 
function SBPoseTextOf(entry) {
	if (entry && Array.isArray(entry.pose) && entry.pose.length) return entry.pose.join(", ");
	return SBT("poseNone");
}

 
function SBLockSideText(v, C) {
	if (v === undefined || v === null) return SBT("lockNone");
	if (typeof v === "string") return SBLockDisplayName(v, C); 
	const parts = [];
	if (v.Custom) parts.push(SBLockDisplayName(v.Custom, C));
	if (v.Base) parts.push(SBLockDisplayName(v.Base, C));
	if (!parts.length) return SBT("lockNone");
	return parts.length === 2 ? SBT("lockPair", parts[0], parts[1]) : parts[0];
}

 
function SBDiffLockLineOf(gd, lc, C) {
	const itemName = (lc && typeof lc.name === "string" && lc.name) ? SBItemDisplayName(lc.g, lc.name) : SBT("lockNone");
	return gd + ": " + SBT("diffLock", itemName, SBLockSideText(lc.from, C), SBLockSideText(lc.to, C));
}

 
function SBDiffTextOf(entry, prev, C) {
	const lines = [];
	if (!prev) {
		lines.push(SBT("diffInit", (entry.appearance || []).length));
		return lines;
	}
	const pm = new Map();
	(prev.appearance || []).forEach(it => pm.set(it.Group, it));
	const nm = new Map();
	(entry.appearance || []).forEach(it => nm.set(it.Group, it));
	
	const lockByGroup = new Map();
	for (const lc of ((entry.chg && entry.chg.locks) || [])) {
		if (lc && typeof lc.g === "string") lockByGroup.set(lc.g, lc);
	}
	for (const g of (entry.chg.groups || [])) {
		const a = pm.get(g), b = nm.get(g);
		
		const an = a ? SBItemDisplayName(a.Group, a.Name) : null;
		const bn = b ? SBItemDisplayName(b.Group, b.Name) : null;
		const gd = SBGroupDisplayName(g);
		if (!an && bn) lines.push(gd + ": " + SBT("diffAdd", bn));
		else if (an && !bn) lines.push(gd + ": " + SBT("diffRemove", an));
		else if (an && bn && an !== bn) lines.push(gd + ": " + SBT("diffSwap", an, bn));
		else if (an && bn) {
			
			const tChanged = JSON.stringify(SBTransformViewOf(a)) !== JSON.stringify(SBTransformViewOf(b));
			lines.push(gd + ": " + bn + " " + SBT(tChanged ? "diffTransform" : "diffMod"));
		}
		else lines.push(gd + ": " + SBT("diffMod"));
		const lc = lockByGroup.get(g);
		if (lc) { lines.push(SBDiffLockLineOf(gd, lc, C)); lockByGroup.delete(g); }
	}
	
	for (const lc of lockByGroup.values()) {
		lines.push(SBDiffLockLineOf(SBGroupDisplayName(lc.g), lc, C));
	}
	if (entry.chg.pose) lines.push(SBT("diffPose", SBPoseTextOf(prev), SBPoseTextOf(entry)));
	if (!lines.length) lines.push(SBT("diffNone"));
	return lines;
}

 
function SBTimeStr(t) {
	if (!t || typeof t !== "number") return SBT("timeNever");
	const d = new Date(t);
	const p = (n) => (n < 10 ? "0" + n : String(n));
	const now = new Date();
	const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
	if (sameDay) return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
	return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

 
function SBPreviewDraw(canvas, entry) {
	const g = canvas && canvas.getContext ? canvas.getContext("2d") : null;
	if (!g || !entry || typeof entry !== "object") return false;
	let temp = null;
	try {
		g.clearRect(0, 0, canvas.width, canvas.height);
		if (typeof CharacterCreate !== "function" || typeof CharacterRefresh !== "function") return false;
		const type = (typeof CharacterType !== "undefined" && CharacterType.SIMPLE) ? CharacterType.SIMPLE : "simple";
		temp = CharacterCreate("Female3DCG", type, "SnapBackPreview");
		const family = (typeof temp.AssetFamily === "string" && temp.AssetFamily) ? temp.AssetFamily : "Female3DCG";
		const items = [];
		for (const b of (entry.appearance || [])) {
			if (!b || typeof b.Group !== "string" || typeof b.Name !== "string") continue;
			let it = null;
			try {
				if (typeof ServerBundledItemToAppearanceItem === "function") {
					it = ServerBundledItemToAppearanceItem(family, b);
				}
				if (!it && typeof AppearanceItem !== "undefined" && AppearanceItem &&
					typeof AppearanceItem.fromAsset === "function" && typeof AssetGet === "function") {
					const asset = AssetGet(family, b.Group, b.Name);
					if (asset) it = AppearanceItem.fromAsset(asset, { difficulty: b.Difficulty, color: b.Color, craft: b.Craft, property: b.Property });
				}
			} catch (e) { it = null; }
			if (it) items.push(it);
		}
		temp.Appearance = items;
		if (Array.isArray(entry.pose) && entry.pose.length) {
			try { temp.ActivePose = entry.pose.slice(); } catch (e) {   }
		}
		CharacterRefresh(temp, false, false);
		if (!temp.Canvas || !temp.Canvas.width) return false;
		
		
		
		let srcCanvas = temp.Canvas;
		try {
			if (typeof DrawCharacterSegment === "function") {
				const seg = DrawCharacterSegment(temp, 0, 0, 500, 1000);
				if (seg && seg.width) srcCanvas = seg;
			}
		} catch (e) {   }
		const dw = canvas.width || 500, dh = canvas.height || 1000;
		if (dw === srcCanvas.width && dh === srcCanvas.height) {
			g.drawImage(srcCanvas, 0, 0);
		} else {
			
			const scale = Math.min(dw / srcCanvas.width, dh / srcCanvas.height);
			const w = srcCanvas.width * scale, h = srcCanvas.height * scale;
			g.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, (dw - w) / 2, (dh - h) / 2, w, h);
		}
		return true;
	} catch (e) {
		SBErr("预览绘制失败", e);
		return false;
	} finally {
		if (temp && typeof CharacterDelete === "function") {
			try { CharacterDelete(temp); } catch (e) {   }
		}
	}
}

 
function SBUIPreviewHide() {
	if (SBUI.prevWin) {
		SBUI.prevWin.remove();
		SBUI.prevWin = null;
	}
	SBUI.prevCanvas = null;
	SBUI.prevEntryRef = null;
}

 
function SBUIPreviewLayout() {
	const w = SBUI.prevWin;
	if (!w) return;
	const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
	const pw = Math.min(360, Math.max(220, Math.floor(SBUI.geo.h * 0.4)));
	const ph = pw * 2;
	let x = SBUI.geo.x + SBUI.geo.w + 14;
	if (x + pw > vw - 8) x = Math.max(8, SBUI.geo.x - pw - 14); 
	const y = Math.min(Math.max(SBUI.geo.y, 8), Math.max(8, vh - ph - 8));
	w.style.left = x + "px";
	w.style.top = y + "px";
	w.style.width = pw + "px";
	w.style.height = ph + "px";
	if (SBUI.prevCanvas) {
		SBUI.prevCanvas.style.width = pw + "px";
		SBUI.prevCanvas.style.height = ph + "px";
	}
}

 
function SBUIPreviewShow(entry, num, name) {
	const idx = (SBUI.expanded && SBUI.expanded.num === num) ? SBUI.expanded.idx : -1;
	const ref = num + ":" + idx + ":" + (entry && entry.t ? entry.t : "");
	if (SBUI.prevEntryRef === ref && SBUI.prevWin) return; 

	SBUIPreviewHide();
	if (!entry) return;
	const win = document.createElement("div");
	SBApplyStyle(win, {
		position: "fixed",
		zIndex: "2147482990",
		background: "#0c0e18",
		border: "2px solid #ffffff",
		borderRadius: "8px",
		boxShadow: "0 6px 30px rgba(0,0,0,.6)",
		overflow: "hidden",
		pointerEvents: "none", 
		userSelect: "none",
		lineHeight: "0",
	});
	const canvas = document.createElement("canvas");
	canvas.width = 500;   
	canvas.height = 1000;
	SBApplyStyle(canvas, {
		display: "block",
		background: "#0c0e18",
	});
	win.appendChild(canvas);
	document.body.appendChild(win);

	SBUI.prevWin = win;
	SBUI.prevCanvas = canvas;
	SBUI.prevEntryRef = ref;

	SBUIPreviewLayout();
	SBPreviewDraw(canvas, entry);
	
	setTimeout(() => {
		if (SBUI.prevEntryRef === ref && SBUI.prevWin) SBPreviewDraw(SBUI.prevCanvas, entry);
	}, 350);
	setTimeout(() => {
		if (SBUI.prevEntryRef === ref && SBUI.prevWin) SBPreviewDraw(SBUI.prevCanvas, entry);
	}, 1200);
}

 
function SBUIDotKey() {
	return "SnapBackDot:" + (SBStore.accountNum ?? 0);
}

function SBUIDotClamp(x, y) {
	const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
	const size = 46;
	return {
		x: Math.min(Math.max(x, 4), Math.max(4, vw - size - 4)),
		y: Math.min(Math.max(y, 4), Math.max(4, vh - size - 4)),
	};
}

function SBUIDotSave() {
	try {
		SBStorage.set(SBUIDotKey(), JSON.stringify(SBUI.dotPos));
	} catch (e) {   }
}

function SBUIDotBuild() {
	if (SBUI.dot) return;
	let pos = { x: null, y: null };
	try {
		const raw = SBStorage.get(SBUIDotKey());
		if (raw) {
			const g = JSON.parse(raw);
			if (g && typeof g === "object" && typeof g.x === "number" && typeof g.y === "number") {
				pos = { x: g.x, y: g.y };
			}
		}
	} catch (e) {   }
	
	if (pos.x === null || pos.y === null) {
		pos = { x: (window.innerWidth || 1000) - 60, y: (window.innerHeight || 700) - 60 };
	}
	const clamped = SBUIDotClamp(pos.x, pos.y);
	SBUI.dotPos = clamped;

	const dot = document.createElement("div");
	dot.id = "sb-dot";
	SBApplyStyle(dot, {
		position: "fixed",
		left: clamped.x + "px",
		top: clamped.y + "px",
		width: "46px",
		height: "46px",
		borderRadius: "50%",
		background: "rgba(208,117,0,.9)",
		border: "2px solid #ffc266",
		color: "#ffffff",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		cursor: "pointer",
		userSelect: "none",
		boxShadow: "0 3px 14px rgba(0,0,0,.5)",
		zIndex: "2147483100",
	});
	
	dot.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">' +
		'<path d="M3 12 C3 6.8 7 4.8 12 12 C7 19.2 3 17.2 3 12 Z"/>' +
		'<path d="M21 12 C21 6.8 17 4.8 12 12 C17 19.2 21 17.2 21 12 Z"/></svg>';
	dot.title = SBT("dotTitle");

	
	dot.addEventListener("mousedown", (e) => {
		const startX = e.clientX, startY = e.clientY;
		const startLeft = parseFloat(dot.style.left) || 0;
		const startTop = parseFloat(dot.style.top) || 0;
		let moved = false;
		e.preventDefault();
		e.stopPropagation();
		const onMove = (ev) => {
			const dx = ev.clientX - startX, dy = ev.clientY - startY;
			if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
			if (!moved) return;
			const c = SBUIDotClamp(startLeft + dx, startTop + dy);
			SBUI.dotPos = c;
			dot.style.left = c.x + "px";
			dot.style.top = c.y + "px";
		};
		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			if (moved) {
				SBUIDotSave();
			} else {
				SnapBackToggle();
			}
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	});

	
	window.addEventListener("resize", () => {
		const c = SBUIDotClamp(SBUI.dotPos.x, SBUI.dotPos.y);
		SBUI.dotPos = c;
		dot.style.left = c.x + "px";
		dot.style.top = c.y + "px";
	});

	document.body.appendChild(dot);
	SBUI.dot = dot;
}

 

const SBUI = {
	win: null,
	titlebar: null,
	titleEl: null,
	toolbar: null,
	body: null,
	listEl: null,          
	headEl: null,          
	tlEl: null,            
	resizeHandle: null,
	toastEl: null,
	styleEl: null,

	open: false,
	minimized: false,
	geo: { x: 80, y: 80, w: 920, h: 620 },
	lang: "zh",            

	selNum: null,          
	expanded: null,        
	arm: null,             
	armTimer: null,        
	btnClear: null,        
	prevWin: null,         
	prevCanvas: null,      
	prevEntryRef: null,    
	importPanel: null,     
	favPanel: null,        
	favListEl: null,       
	favRenaming: null,     
	dot: null,             
	dotPos: { x: null, y: null }, 
	dirty: true,           
	winDrag: null,
	resDrag: null,
	tickId: null,          
	escHandler: null,
	_docHandlers: null,
	_winResize: null,
};

let SBToastTimer = null;

 
function SBApplyStyle(el, styles) {
	if (!el || !el.style) return el;
	for (const k of Object.keys(styles)) {
		try { el.style[k] = styles[k]; } catch (e) {   }
	}
	return el;
}

function SBUIEnsureStyle() {
	if (SBUI.styleEl || document.getElementById("snapback-style")) return;
	const style = document.createElement("style");
	style.id = "snapback-style";
	
	style.textContent = [
		"#sb-win{border:4px solid #ffffff;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.65);",
		"color:#e8eaf6;font-size:13px;font-family:sans-serif;}",
		"#sb-titlebar{gap:6px;padding:8px 10px;background:#1a1e30;border-bottom:1px solid #2a2f45;}",
		"#sb-title{color:#ffd166;font-weight:bold;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
		"#sb-toolbar{gap:6px;padding:8px;background:#151727;border-bottom:1px solid #2a2f45;}",
		"#sb-list{background:#10101c;border-right:1px solid #2a2f45;overflow-y:auto;}",
		"#sb-resize::after{content:'';position:absolute;right:4px;bottom:4px;width:10px;height:10px;",
		"border-right:2px solid #8891b8;border-bottom:2px solid #8891b8;}",
		".sb-btn{background:#2a2f45;color:#e8eaf6;border:1px solid #4a5278;border-radius:8px;padding:7px 14px;",
		"font-size:18px;cursor:pointer;line-height:1.3;}",
		".sb-btn:hover{background:#3a4160;}",
		".sb-btn-danger{background:#5c2030;border-color:#ff5566;}",
		".sb-btn-ok{background:#1d4d33;border-color:#4ade80;}",
		".sb-btn-mini{padding:3px 10px;font-size:15px;margin-left:8px;flex:none;}",
		".sb-btn-title{background:transparent;border:1px solid #4a5278;color:#c5cbe8;border-radius:6px;",
		"width:34px;height:34px;font-size:20px;line-height:1;cursor:pointer;padding:0;}",
		".sb-btn-title:hover{background:#3a4160;}",
		"#sb-toast{position:fixed;left:16px;top:16px;z-index:2147483600;background:#2a2f45;",
		"border:1px solid #ffd166;color:#ffd166;border-radius:8px;padding:10px 16px;font-size:14px;",
		"font-family:sans-serif;transition:opacity .4s;display:none;max-width:420px;pointer-events:none;}",
	].join("\n");
	document.head.appendChild(style);
	SBUI.styleEl = style;
}

 

function SBUIGeoLoad() {
	try {
		const raw = SBStorage.get("SnapBackWin:" + (SBStore.accountNum ?? 0));
		if (raw) {
			const g = JSON.parse(raw);
			if (g && typeof g === "object") {
				const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
				SBUI.geo.w = Math.min(Math.max(+g.w || 920, 360), vw - 10);
				SBUI.geo.h = Math.min(Math.max(+g.h || 620, 280), vh - 10);
				SBUI.geo.x = Math.min(Math.max(+g.x || 80, 0), Math.max(0, vw - SBUI.geo.w - 10));
				SBUI.geo.y = Math.min(Math.max(+g.y || 80, 0), Math.max(0, vh - SBUI.geo.h - 10));
			}
		}
	} catch (e) {   }
}

function SBUIGeoSave() {
	try {
		SBStorage.set("SnapBackWin:" + (SBStore.accountNum ?? 0), JSON.stringify(SBUI.geo));
	} catch (e) {   }
}

 
function SBRaf(cb) {
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(cb);
	} else {
		setTimeout(cb, 16);
	}
}

 

function SBUIBuildWindow() {
	SBUIEnsureStyle();
	SBUIGeoLoad();

	const win = document.createElement("div");
	win.id = "sb-win";
	SBApplyStyle(win, {
		position: "fixed",
		zIndex: "2147483000",
		background: "#10101c",
		border: "4px solid #ffffff",
		borderRadius: "12px",
		boxShadow: "0 8px 40px rgba(0,0,0,.65)",
		display: "flex",
		flexDirection: "column",
		overflow: "hidden",
		pointerEvents: "auto",
		userSelect: "none",
		touchAction: "none",
		fontFamily: "sans-serif",
		color: "#e8eaf6",
		fontSize: "13px",
		left: SBUI.geo.x + "px",
		top: SBUI.geo.y + "px",
		width: SBUI.geo.w + "px",
		height: SBUI.geo.h + "px",
	});

	
	const titlebar = document.createElement("div");
	titlebar.id = "sb-titlebar";
	SBApplyStyle(titlebar, {
		display: "flex",
		alignItems: "center",
		gap: "6px",
		padding: "8px 10px",
		background: "#1a1e30",
		borderBottom: "1px solid #2a2f45",
		cursor: "move",
		userSelect: "none",
		flex: "0 0 auto",
	});
	const title = document.createElement("span");
	title.id = "sb-title";
	SBApplyStyle(title, {
		flex: "1",
		color: "#ffd166",
		fontWeight: "bold",
		fontSize: "15px",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	});
	title.textContent = SBT("title");
	const btnMin = document.createElement("button");
	btnMin.className = "sb-btn-title";
	SBApplyStyle(btnMin, {
		background: "transparent",
		border: "1px solid #4a5278",
		color: "#c5cbe8",
		borderRadius: "6px",
		width: "34px",
		height: "34px",
		fontSize: "20px",
		lineHeight: "1",
		cursor: "pointer",
		padding: "0",
	});
	btnMin.textContent = "—";
	btnMin.title = SBT("minimizeTitle");
	const btnClose = document.createElement("button");
	btnClose.className = "sb-btn-title";
	SBApplyStyle(btnClose, {
		background: "transparent",
		border: "1px solid #4a5278",
		color: "#c5cbe8",
		borderRadius: "6px",
		width: "34px",
		height: "34px",
		fontSize: "20px",
		lineHeight: "1",
		cursor: "pointer",
		padding: "0",
	});
	btnClose.textContent = "✕";
	btnClose.title = SBT("closeTitle");
	titlebar.appendChild(title);
	titlebar.appendChild(btnMin);
	titlebar.appendChild(btnClose);
	win.appendChild(titlebar);

	
	const toolbar = document.createElement("div");
	toolbar.id = "sb-toolbar";
	SBApplyStyle(toolbar, {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		gap: "6px",
		padding: "8px",
		background: "#151727",
		borderBottom: "1px solid #2a2f45",
		flex: "0 0 auto",
	});
	win.appendChild(toolbar);

	
	const body = document.createElement("div");
	SBApplyStyle(body, {
		display: "flex",
		flexDirection: "row",
		flex: "1 1 auto",
		minHeight: "0",
		overflow: "hidden",
	});

	const listEl = document.createElement("div");
	listEl.id = "sb-list";
	SBApplyStyle(listEl, {
		width: "250px",
		maxWidth: "45%",
		flex: "0 0 auto",
		overflowY: "auto",
		background: "#10101c",
		borderRight: "1px solid #2a2f45",
		boxSizing: "border-box",
	});

	const right = document.createElement("div");
	SBApplyStyle(right, {
		flex: "1 1 auto",
		display: "flex",
		flexDirection: "column",
		minWidth: "0",
	});

	const headEl = document.createElement("div");
	SBApplyStyle(headEl, {
		flex: "0 0 auto",
		padding: "8px 10px",
		background: "#151727",
		borderBottom: "1px solid #2a2f45",
	});

	const tlEl = document.createElement("div");
	SBApplyStyle(tlEl, {
		flex: "1 1 auto",
		overflowY: "auto",
		padding: "8px 10px",
		boxSizing: "border-box",
	});

	right.appendChild(headEl);
	right.appendChild(tlEl);
	body.appendChild(listEl);
	body.appendChild(right);
	win.appendChild(body);

	
	const resizeHandle = document.createElement("div");
	resizeHandle.id = "sb-resize";
	SBApplyStyle(resizeHandle, {
		position: "absolute",
		right: "2px",
		bottom: "2px",
		width: "18px",
		height: "18px",
		cursor: "nwse-resize",
		zIndex: "3",
		borderRight: "2px solid #8891b8",
		borderBottom: "2px solid #8891b8",
	});
	resizeHandle.title = SBT("resizeTitle");
	win.appendChild(resizeHandle);

	document.body.appendChild(win);

	SBUI.win = win;
	SBUI.titlebar = titlebar;
	SBUI.titleEl = title;
	SBUI.toolbar = toolbar;
	SBUI.body = body;
	SBUI.listEl = listEl;
	SBUI.headEl = headEl;
	SBUI.tlEl = tlEl;
	SBUI.resizeHandle = resizeHandle;

	
	titlebar.addEventListener("mousedown", (e) => {
		if (e.target.closest && e.target.closest("button")) return; 
		SBUI.winDrag = { dx: e.clientX - SBUI.geo.x, dy: e.clientY - SBUI.geo.y };
		e.preventDefault();
	});
	btnMin.addEventListener("mousedown", (e) => e.stopPropagation());
	btnMin.addEventListener("click", () => {
		SBUI.minimized = !SBUI.minimized;
		toolbar.style.display = SBUI.minimized ? "none" : "";
		body.style.display = SBUI.minimized ? "none" : "";
		resizeHandle.style.display = SBUI.minimized ? "none" : "";
		if (SBUI.minimized) {
			win.style.height = "auto";
			SBUIPreviewHide(); 
		} else {
			win.style.height = SBUI.geo.h + "px";
			SBUI.dirty = true; 
		}
	});
	btnClose.addEventListener("mousedown", (e) => e.stopPropagation());
	btnClose.addEventListener("click", () => SnapBackClose());

	
	resizeHandle.addEventListener("mousedown", (e) => {
		SBUI.resDrag = { sx: e.clientX, sy: e.clientY, w: SBUI.geo.w, h: SBUI.geo.h };
		e.preventDefault();
		e.stopPropagation();
	});

	
	const onDocMove = (e) => {
		if (SBUI.winDrag) {
			const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
			SBUI.geo.x = Math.min(Math.max(e.clientX - SBUI.winDrag.dx, 0), Math.max(0, vw - 60));
			SBUI.geo.y = Math.min(Math.max(e.clientY - SBUI.winDrag.dy, 0), Math.max(0, vh - 40));
			win.style.left = SBUI.geo.x + "px";
			win.style.top = SBUI.geo.y + "px";
		} else if (SBUI.resDrag) {
			const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
			SBUI.geo.w = Math.min(Math.max(SBUI.resDrag.w + (e.clientX - SBUI.resDrag.sx), 360), vw - 10);
			SBUI.geo.h = Math.min(Math.max(SBUI.resDrag.h + (e.clientY - SBUI.resDrag.sy), 280), vh - 10);
			win.style.width = SBUI.geo.w + "px";
			win.style.height = SBUI.geo.h + "px";
			SBUI.dirty = true; 
		}
	};
	const onDocUp = () => {
		if (SBUI.winDrag || SBUI.resDrag) {
			SBUI.winDrag = null;
			SBUI.resDrag = null;
			SBUIPreviewLayout(); 
			SBUIGeoSave();
		}
	};
	document.addEventListener("mousemove", onDocMove);
	document.addEventListener("mouseup", onDocUp);
	SBUI._docHandlers = { onDocMove, onDocUp };

	
	SBUI.escHandler = (e) => {
		if (e.key === "Escape" && SBUI.open) {
			const t = e.target;
			if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
			e.stopPropagation();
			e.preventDefault();
			SnapBackClose();
		}
	};
	document.addEventListener("keydown", SBUI.escHandler, true);

	
	SBUI._winResize = () => {
		if (!SBUI.open) return;
		const vw = window.innerWidth || 1000, vh = window.innerHeight || 700;
		if (SBUI.geo.w > vw - 10) SBUI.geo.w = Math.max(360, vw - 10);
		if (SBUI.geo.h > vh - 10) SBUI.geo.h = Math.max(280, vh - 10);
		SBUI.geo.x = Math.min(SBUI.geo.x, Math.max(0, vw - SBUI.geo.w - 10));
		SBUI.geo.y = Math.min(SBUI.geo.y, Math.max(0, vh - SBUI.geo.h - 10));
		win.style.left = SBUI.geo.x + "px";
		win.style.top = SBUI.geo.y + "px";
		win.style.width = SBUI.geo.w + "px";
		win.style.height = SBUI.geo.h + "px";
		SBUI.dirty = true; 
		SBUIPreviewLayout(); 
		SBUIGeoSave();
	};
	window.addEventListener("resize", SBUI._winResize);

	SBUIToolbarBuild();
	SBUI.dirty = true;
}

 

function SBUIToolbarBuild() {
	const toolbar = SBUI.toolbar;
	toolbar.innerHTML = "";

	const mk = (cls, label, title, colors) => {
		const b = document.createElement("button");
		b.className = cls || "sb-btn";
		SBApplyStyle(b, {
			background: (colors && colors.bg) ? colors.bg
				: (cls === "sb-btn sb-btn-ok") ? "#1d4d33"
				: (cls === "sb-btn sb-btn-danger") ? "#5c2030" : "#2a2f45",
			border: (colors && colors.border) ? "1px solid " + colors.border
				: (cls === "sb-btn sb-btn-ok") ? "1px solid #4ade80"
				: (cls === "sb-btn sb-btn-danger") ? "1px solid #ff5566" : "1px solid #4a5278",
			color: "#e8eaf6",
			borderRadius: "8px",
			padding: "7px 14px",
			fontSize: "18px",
			cursor: "pointer",
			lineHeight: "1.3",
		});
		b.textContent = label;
		b.title = title || "";
		return b;
	};

	
	const btnSnap = mk("sb-btn sb-btn-ok", SBT("btnSnap"), SBT("btnSnapTitle"));
	btnSnap.addEventListener("click", () => SBUISnapshotSelf());
	toolbar.appendChild(btnSnap);

	
	const btnSnapAll = mk("sb-btn", SBT("btnSnapAll"), SBT("btnSnapAllTitle"), { bg: "#2f5d1a", border: "#a3e635" });
	btnSnapAll.addEventListener("click", () => SBUISnapshotAll());
	toolbar.appendChild(btnSnapAll);

	const keepLabel = document.createElement("span");
	SBApplyStyle(keepLabel, { color: "#9aa3c7", fontSize: "14px", marginLeft: "4px" });
	keepLabel.textContent = SBT("selKeepLabel");
	toolbar.appendChild(keepLabel);
	const selKeep = document.createElement("select");
	SBApplyStyle(selKeep, {
		background: "#2a2f45",
		color: "#e8eaf6",
		border: "1px solid #4a5278",
		borderRadius: "8px",
		padding: "5px 8px",
		fontSize: "16px",
		cursor: "pointer",
	});
	selKeep.title = SBT("selKeepTitle");
	for (const n of [10, 30, 50, 100, 200]) {
		const opt = document.createElement("option");
		opt.value = String(n);
		opt.textContent = String(n);
		selKeep.appendChild(opt);
	}
	selKeep.value = String(SBStore.load().settings.keep | 0 || 50);
	selKeep.addEventListener("change", () => {
		const n = parseInt(selKeep.value, 10) | 0;
		if (n >= 3 && n <= 500) {
			SBStore.load().settings.keep = n;
			SBStore.requestSave();
			SBPurgeOverflow();
			SBUI.dirty = true;
		}
	});
	toolbar.appendChild(selKeep);

	
	const optLabel = document.createElement("label");
	SBApplyStyle(optLabel, {
		display: "flex",
		alignItems: "center",
		gap: "5px",
		color: "#c5cbe8",
		fontSize: "14px",
		marginLeft: "4px",
		cursor: "pointer",
	});
	const chkClear = document.createElement("input");
	chkClear.type = "checkbox";
	SBApplyStyle(chkClear, { width: "20px", height: "20px", cursor: "pointer", margin: "0" });
	chkClear.checked = SBStore.load().settings.autoClearOthers !== false;
	chkClear.title = SBT("optClearOthersTitle");
	chkClear.addEventListener("change", () => {
		SBStore.load().settings.autoClearOthers = !!chkClear.checked;
		SBStore.requestSave();
	});
	const optText = document.createElement("span");
	optText.textContent = SBT("optClearOthers");
	optLabel.appendChild(chkClear);
	optLabel.appendChild(optText);
	toolbar.appendChild(optLabel);

	
	const optFirstLabel = document.createElement("label");
	SBApplyStyle(optFirstLabel, {
		display: "flex",
		alignItems: "center",
		gap: "5px",
		color: "#c5cbe8",
		fontSize: "14px",
		marginLeft: "4px",
		cursor: "pointer",
	});
	const chkFirst = document.createElement("input");
	chkFirst.type = "checkbox";
	SBApplyStyle(chkFirst, { width: "20px", height: "20px", cursor: "pointer", margin: "0" });
	chkFirst.checked = SBStore.load().settings.keepFirst !== false;
	chkFirst.title = SBT("optKeepFirstTitle");
	chkFirst.addEventListener("change", () => {
		SBStore.load().settings.keepFirst = !!chkFirst.checked;
		SBStore.requestSave();
	});
	const optFirstText = document.createElement("span");
	optFirstText.textContent = SBT("optKeepFirst");
	optFirstLabel.appendChild(chkFirst);
	optFirstLabel.appendChild(optFirstText);
	toolbar.appendChild(optFirstLabel);

	const btnExport = mk("sb-btn", SBT("btnExport"), SBT("btnExportTitle"));
	btnExport.addEventListener("click", () => SBUIDoExport());
	toolbar.appendChild(btnExport);

	const btnImport = mk("sb-btn", SBT("btnImport"), SBT("btnImportTitle"));
	btnImport.addEventListener("click", () => SBUIDoImport());
	toolbar.appendChild(btnImport);

	
	const btnFavs = mk("sb-btn", SBT("btnFavs"), SBT("btnFavsTitle"));
	btnFavs.addEventListener("click", () => SBUIFavPanelToggle());
	toolbar.appendChild(btnFavs);

	
	const btnClear = mk("sb-btn sb-btn-danger", SBT("btnClear"), SBT("btnClearTitle"));
	SBUI.btnClear = btnClear;
	btnClear.addEventListener("click", () => {
		if (SBUIClearArmed()) {
			SBClearAll();
			SBUIArm(null);
			SBToast(SBT("toastCleared"));
			SBUI.dirty = true;
		} else {
			SBUIArmClear();
		}
	});
	toolbar.appendChild(btnClear);

	const btnLang = mk("sb-btn", SBUI.lang === "zh" ? "EN" : "中文", SBT("btnLangTitle"));
	btnLang.addEventListener("click", () => {
		SBUI.lang = SBUI.lang === "zh" ? "en" : "zh";
		try { SBStorage.set("SnapBackLang", SBUI.lang); } catch (e) {   }
		SBUIToolbarBuild();
		if (SBUI.titleEl) SBUI.titleEl.textContent = SBT("title");
		SBUI.dirty = true;
		SBToast(SBT("toastLang"));
	});
	toolbar.appendChild(btnLang);

	SBUIToolbarRefresh();
}

 

 
function SBPurgeOverflow() {
	const s = SBStore.load();
	const keep = Math.max(3, s.settings.keep | 0 || 50);
	for (const key of Object.keys(s.chars)) {
		const c = s.chars[key];
		if (c.history.length > keep) c.history.length = keep;
	}
}

function SBUIRenderAll() {
	if (!SBUI.open || !SBUI.listEl) return;
	SBUICharListBuild();
	SBUITimelineBuild();
	
	if (SBUI.favPanel) {
		try { SBUIFavPanelBuild(); } catch (e) { SBErr("收藏夹渲染失败", e); }
	}
	
	try {
		const s = SBStore.load();
		if (SBUI.expanded && s.chars[SBUI.expanded.num]) {
			const c = s.chars[SBUI.expanded.num];
			const entry = c.history[SBUI.expanded.idx];
			if (entry) SBUIPreviewShow(entry, SBUI.expanded.num, SBCharDisplayName(c));
			else SBUIPreviewHide();
		} else {
			SBUIPreviewHide();
		}
	} catch (e) {
		SBErr("预览浮窗构建失败（不影响主浮窗）", e);
		try { SBUIPreviewHide(); } catch (e2) {   }
	}
}

 
function SBUICharListBuild() {
	const s = SBStore.load();
	const list = SBUI.listEl;
	const scroll = list.scrollTop;
	list.innerHTML = "";

	const title = document.createElement("div");
	SBApplyStyle(title, { color: "#ffd166", fontWeight: "bold", fontSize: "14px", padding: "8px 10px 6px", borderBottom: "1px solid #2a2f45" });
	title.textContent = SBT("listTitle", Object.keys(s.chars).length);
	list.appendChild(title);

	const nums = Object.keys(s.chars).map(Number);
	nums.sort((a, b) => {
		const ca = s.chars[a], cb = s.chars[b];
		const selfA = SBCurrentNum() !== null && a === SBCurrentNum();
		const selfB = SBCurrentNum() !== null && b === SBCurrentNum();
		if (selfA !== selfB) return selfA ? -1 : 1;
		return (cb.last || 0) - (ca.last || 0);
	});

	if (!nums.length) {
		const empty = document.createElement("div");
		SBApplyStyle(empty, { color: "#6d7699", fontSize: "12px", padding: "10px", lineHeight: "1.6" });
		empty.textContent = SBT("listEmpty");
		list.appendChild(empty);
		return;
	}

	for (const num of nums) {
		const c = s.chars[num];
		const isSelf = SBCurrentNum() !== null && num === SBCurrentNum();
		const row = document.createElement("div");
		SBApplyStyle(row, {
			display: "flex",
			alignItems: "center",
			gap: "6px",
			padding: "7px 10px",
			cursor: "pointer",
			borderBottom: "1px solid #20243a",
			background: (SBUI.selNum === num) ? "#2a2f45" : "transparent",
		});
		const name = document.createElement("span");
		SBApplyStyle(name, {
			flex: "1",
			minWidth: "0",
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap",
			color: isSelf ? "#ffd166" : "#e8eaf6",
			fontWeight: isSelf ? "bold" : "normal",
		});
		name.textContent = SBCharDisplayName(c) + (isSelf ? SBT("listMe") : "");
		const badge = document.createElement("span");
		SBApplyStyle(badge, {
			flex: "none",
			background: "#3a4160",
			borderRadius: "10px",
			padding: "0 8px",
			fontSize: "12px",
			color: "#c5cbe8",
		});
		badge.textContent = String(c.history.length);
		badge.title = SBT("headCurrent");
		const time = document.createElement("span");
		SBApplyStyle(time, { flex: "none", color: "#6d7699", fontSize: "11px" });
		time.textContent = SBTimeStr(c.last || 0);
		
		const delCharArmed = SBUIArmIs("delchar", num, null);
		const btnDelChar = document.createElement("button");
		SBApplyStyle(btnDelChar, {
			flex: "none",
			background: delCharArmed ? "#8a1f2d" : "#5c2030",
			border: delCharArmed ? "1px solid #ffd166" : "1px solid #ff5566",
			color: "#e8eaf6",
			borderRadius: "5px",
			padding: delCharArmed ? "1px 6px" : "1px 7px",
			fontSize: delCharArmed ? "11px" : "13px",
			cursor: "pointer",
			lineHeight: "1.4",
		});
		btnDelChar.textContent = delCharArmed ? SBT("btnDelConfirm") : "✕";
		btnDelChar.title = delCharArmed ? SBT("btnDelCharConfirmTitle") : SBT("btnDelCharTitle");
		btnDelChar.addEventListener("mousedown", (e) => e.stopPropagation());
		btnDelChar.addEventListener("click", (e) => {
			e.stopPropagation();
			if (delCharArmed) {
				SBUIDeleteChar(num);
			} else {
				SBUIArm("delchar", num, null);
			}
		});
		row.appendChild(name);
		row.appendChild(badge);
		row.appendChild(time);
		row.appendChild(btnDelChar);
		row.addEventListener("click", () => {
			SBUI.selNum = num;
			SBUI.expanded = null;
			SBUIArmRestore(null); 
			SBUI.dirty = true;
		});
		list.appendChild(row);
	}
	list.scrollTop = scroll;
}

 
function SBUITimelineBuild() {
	const s = SBStore.load();
	const head = SBUI.headEl;
	const tl = SBUI.tlEl;
	head.innerHTML = "";

	
	if (SBUI.selNum === null) {
		const cur = SBCurrentNum();
		SBUI.selNum = (cur !== null && s.chars[cur]) ? cur : (Object.keys(s.chars).length ? Number(Object.keys(s.chars)[0]) : null);
	}
	if (SBUI.selNum !== null && !s.chars[SBUI.selNum]) SBUI.selNum = null;

	if (SBUI.selNum === null) {
		const empty = document.createElement("div");
		SBApplyStyle(empty, { color: "#6d7699", padding: "10px" });
		empty.textContent = SBT("listEmpty");
		head.appendChild(empty);
		tl.innerHTML = "";
		return;
	}

	const num = SBUI.selNum;
	const c = s.chars[num];
	const C = SBCharObjectOf(num);

	
	const hRow = document.createElement("div");
	SBApplyStyle(hRow, { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" });
	const hName = document.createElement("span");
	SBApplyStyle(hName, { color: "#ffd166", fontWeight: "bold", fontSize: "15px" });
	const isSelf = SBCurrentNum() !== null && num === SBCurrentNum();
	hName.textContent = SBCharDisplayName(c) + (isSelf ? SBT("listMe") : "") + " #" + num;
	hRow.appendChild(hName);
	const btnSnap = document.createElement("button");
	btnSnap.className = "sb-btn sb-btn-ok";
	SBApplyStyle(btnSnap, {
		background: "#1d4d33",
		border: "1px solid #4ade80",
		color: "#e8eaf6",
		borderRadius: "8px",
		padding: "4px 12px",
		fontSize: "15px",
		cursor: "pointer",
	});
	btnSnap.textContent = isSelf ? SBT("btnSnapSelSelf") : SBT("btnSnapSel");
	btnSnap.title = SBT("btnSnapSelTitle");
	btnSnap.addEventListener("click", () => SBUISnapshotSelected());
	hRow.appendChild(btnSnap);
	
	const btnExportChar = document.createElement("button");
	SBApplyStyle(btnExportChar, {
		background: "#2a2f45",
		border: "1px solid #4a5278",
		color: "#e8eaf6",
		borderRadius: "8px",
		padding: "4px 12px",
		fontSize: "15px",
		cursor: "pointer",
	});
	btnExportChar.textContent = SBT("btnExportChar");
	btnExportChar.title = SBT("btnExportCharTitle");
	btnExportChar.addEventListener("click", () => SBUIDoExportChar(num));
	hRow.appendChild(btnExportChar);
	head.appendChild(hRow);

	const hState = document.createElement("div");
	SBApplyStyle(hState, { color: "#9aa3c7", fontSize: "12px", marginTop: "5px", lineHeight: "1.6" });
	if (C) {
		hState.textContent = SBT("headItems", (C.Appearance || []).length) + " · " +
			SBT("headPose", (Array.isArray(C.ActivePose) && C.ActivePose.length) ? C.ActivePose.join(", ") : SBT("poseNone"));
	} else {
		hState.textContent = SBT("headGone");
	}
	head.appendChild(hState);

	const hTips = document.createElement("div");
	SBApplyStyle(hTips, { color: "#6d7699", fontSize: "11px", marginTop: "3px" });
	hTips.textContent = SBT("tips") + " · " + SBT("cmd");
	head.appendChild(hTips);

	
	
	if (SBUI.expanded && SBUI.expanded.num === num &&
		(SBUI.expanded.idx < 0 || SBUI.expanded.idx >= c.history.length)) {
		SBUI.expanded = null;
	}
	const scroll = tl.scrollTop;
	tl.innerHTML = "";
	if (!c.history.length) {
		const empty = document.createElement("div");
		SBApplyStyle(empty, { color: "#6d7699", padding: "10px", lineHeight: "1.6" });
		empty.textContent = SBT("tlEmpty");
		tl.appendChild(empty);
		return;
	}

	for (let i = 0; i < c.history.length; i++) {
		const entry = c.history[i];
		const prev = (i + 1 < c.history.length) ? c.history[i + 1] : null;
		const isExpanded = SBUI.expanded && SBUI.expanded.num === num && SBUI.expanded.idx === i;

		const box = document.createElement("div");
		SBApplyStyle(box, {
			border: "1px solid " + (isExpanded ? "#4a5278" : "#232842"),
			borderRadius: "8px",
			marginBottom: "6px",
			background: isExpanded ? "#161a2c" : "#12152a",
			overflow: "hidden",
		});

		const row = document.createElement("div");
		SBApplyStyle(row, { display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", flexWrap: "wrap", cursor: "pointer" });

		const time = document.createElement("span");
		SBApplyStyle(time, { color: "#8891b8", fontSize: "12px", flex: "none" });
		time.textContent = SBTimeStr(entry.t);
		row.appendChild(time);

		
		
		const badgeText = (entry.trigger === "manual") ? SBT("badgeManual") : (entry.trigger === "restore") ? SBT("badgeRestore") : "";
		const srcText = (entry.src !== null && entry.src !== undefined && SBCurrentNum() !== null)
			? (entry.src === SBCurrentNum() ? SBT("srcSelf") : SBNameOf(entry.src))
			: "";
		if (badgeText || srcText) {
			const badge = document.createElement("span");
			SBApplyStyle(badge, {
				flex: "none",
				background: (entry.trigger === "restore") ? "#1d4d33" : (entry.trigger === "manual") ? "#8a6d1a" : "#3a4160",
				borderRadius: "10px",
				padding: "1px 8px",
				fontSize: "12px",
				color: "#e8eaf6",
			});
			badge.textContent = [badgeText, srcText].filter(Boolean).join("·");
			row.appendChild(badge);
		}

		
		if (SBIsImported(entry)) {
			const imp = document.createElement("span");
			SBApplyStyle(imp, { flex: "none", border: "1px solid #7a5c8a", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#d8b4fe" });
			imp.textContent = SBT("chipImported");
			imp.title = SBT("chipImportedTitle");
			row.appendChild(imp);
		}

		
		
		if (entry.first) {
			const chip = document.createElement("span");
			SBApplyStyle(chip, { flex: "none", border: "1px solid #4a5278", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#9aa3c7" });
			chip.textContent = SBT("chipFirst");
			row.appendChild(chip);
		} else {
			const kinds = SBChgCategories(entry.chg);
			if (kinds.items) {
				const chip = document.createElement("span");
				SBApplyStyle(chip, { flex: "none", border: "1px solid #8a6d1a", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#ffd166" });
				chip.textContent = SBT("chipItems");
				chip.title = SBT("chipItemsTitle", (entry.chg.groups || []).map(SBGroupDisplayName).join(", "));
				row.appendChild(chip);
			}
			if (kinds.clothing) {
				const chip = document.createElement("span");
				SBApplyStyle(chip, { flex: "none", border: "1px solid #8a6d1a", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#ffd166" });
				chip.textContent = SBT("chipClothing");
				chip.title = SBT("chipClothingTitle", (entry.chg.groups || []).map(SBGroupDisplayName).join(", "));
				row.appendChild(chip);
			}
			if (kinds.locks) {
				const chip = document.createElement("span");
				SBApplyStyle(chip, { flex: "none", border: "1px solid #6a4a8a", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#c9a5f0" });
				chip.textContent = SBT("chipLocks");
				chip.title = SBT("chipLocksTitle", [...new Set((entry.chg.locks || []).map(l => l.g))].map(SBGroupDisplayName).join(", "));
				row.appendChild(chip);
			}
			if (!kinds.items && !kinds.clothing && !kinds.locks) {
				const chip = document.createElement("span");
				SBApplyStyle(chip, { flex: "none", border: "1px solid #4a5278", borderRadius: "10px", padding: "1px 8px", fontSize: "11px", color: "#9aa3c7" });
				chip.textContent = SBT("diffNone");
				row.appendChild(chip);
			}
		}

		const spacer = document.createElement("span");
		SBApplyStyle(spacer, { flex: "1" });
		row.appendChild(spacer);

		
		const favState = SBFavFind(num, i);
		const btnFav = document.createElement("button");
		SBApplyStyle(btnFav, {
			flex: "none",
			background: favState ? "#8a6d1a" : "#2a2f45",
			border: favState ? "1px solid #ffd166" : "1px solid #4a5278",
			color: favState ? "#ffd166" : "#c5cbe8",
			borderRadius: "6px",
			padding: "3px 8px",
			fontSize: "14px",
			cursor: "pointer",
			lineHeight: "1",
		});
		btnFav.textContent = favState ? "★" : "☆";
		btnFav.title = favState ? SBT("btnFavTitleOn") : SBT("btnFavTitle");
		btnFav.addEventListener("mousedown", (e) => e.stopPropagation());
		btnFav.addEventListener("click", (e) => {
			e.stopPropagation();
			if (favState) {
				SBUnfavorite(SBFavKeyOf(favState));
				SBToast(SBT("toastUnfav"));
			} else {
				const f = SBFavoriteSnapshot(num, i);
				if (f) SBToast(SBT("toastFav", f.favName));
			}
			SBUI.dirty = true;
		});
		row.appendChild(btnFav);

		
		const btnRestore = document.createElement("button");
		const restoreArmed = SBUIRestoreArmed(num, i);
		SBApplyStyle(btnRestore, {
			flex: "none",
			background: restoreArmed ? "#8a6d1a" : "#1d4d33",
			border: restoreArmed ? "1px solid #ffd166" : "1px solid #4ade80",
			color: "#e8eaf6",
			borderRadius: "6px",
			padding: "3px 12px",
			fontSize: "15px",
			cursor: "pointer",
		});
		btnRestore.textContent = restoreArmed ? SBT("btnRestoreConfirm") : SBT("btnRestore");
		btnRestore.title = restoreArmed ? SBT("btnRestoreConfirmTitle") : SBT("btnRestoreTitle");
		btnRestore.addEventListener("mousedown", (e) => e.stopPropagation());
		btnRestore.addEventListener("click", (e) => {
			e.stopPropagation();
			if (restoreArmed) {
				SBUIDoRestore(num, i);
			} else {
				SBUIArmRestore(num, i);
			}
		});
		row.appendChild(btnRestore);

		
		const btnDel = document.createElement("button");
		const deleteArmed = SBUIDeleteArmed(num, i);
		SBApplyStyle(btnDel, {
			flex: "none",
			background: deleteArmed ? "#8a1f2d" : "#5c2030",
			border: deleteArmed ? "1px solid #ffd166" : "1px solid #ff5566",
			color: "#e8eaf6",
			borderRadius: "6px",
			padding: "3px 10px",
			fontSize: "15px",
			cursor: "pointer",
		});
		btnDel.textContent = deleteArmed ? SBT("btnDelConfirm") : SBT("btnDel");
		btnDel.title = deleteArmed ? SBT("btnDelConfirmTitle") : SBT("btnDelTitle");
		btnDel.addEventListener("mousedown", (e) => e.stopPropagation());
		btnDel.addEventListener("click", (e) => {
			e.stopPropagation();
			if (deleteArmed) {
				SBUIDeleteSnap(num, i);
			} else {
				SBUIArmDelete(num, i);
			}
		});
		row.appendChild(btnDel);

		row.addEventListener("click", () => {
			if (isExpanded) {
				SBUI.expanded = null;
			} else {
				SBUI.expanded = { num, idx: i };
			}
			SBUI.dirty = true;
		});

		box.appendChild(row);

		
		if (isExpanded) {
			const detail = document.createElement("div");
			SBApplyStyle(detail, { padding: "6px 12px 8px", borderTop: "1px dashed #2a2f45" });
			const dTitle = document.createElement("div");
			SBApplyStyle(dTitle, { color: "#9aa3c7", fontSize: "11px", marginBottom: "4px" });
			dTitle.textContent = SBT("detailTitle");
			detail.appendChild(dTitle);
			const lines = SBDiffTextOf(entry, prev, C);
			for (const line of lines) {
				const d = document.createElement("div");
				SBApplyStyle(d, { color: "#c5cbe8", fontSize: "12px", padding: "1px 0", wordBreak: "break-all" });
				d.textContent = "· " + line;
				detail.appendChild(d);
			}
			box.appendChild(detail);
		}

		tl.appendChild(box);
	}
	tl.scrollTop = scroll;
}

 
function SBUISnapshotSelected() {
	let C = null;
	if (SBUI.selNum !== null) C = SBCharObjectOf(SBUI.selNum);
	if (!C && typeof Player !== "undefined" && Player) C = Player;
	if (!C) { SBToast(SBT("toastSnapNone")); return; }
	const cur = SBCurrentNum();
	const e = SBRecordSnapshot(C, { trigger: "manual", src: cur });
	if (e) {
		SBToast(SBT("toastSnapped", SBGameCharDisplayName(C), C.MemberNumber ?? 0));
	} else {
		SBToast(SBT("toastSnapSame"));
	}
	SBUI.dirty = true;
}

 
function SBUISnapshotSelf() {
	const P = (typeof Player !== "undefined") ? Player : null;
	if (!P) { SBToast(SBT("toastSnapNone")); return; }
	const e = SBRecordSnapshot(P, { trigger: "manual", src: SBCurrentNum() });
	if (e) {
		SBToast(SBT("toastSnapped", (typeof P.Name === "string" && P.Name) ? P.Name : "", P.MemberNumber ?? 0));
	} else {
		SBToast(SBT("toastSnapSame"));
	}
	SBUI.dirty = true;
}

 
function SBUISnapshotAll() {
	const n = SBCollectAll("manual");
	SBToast(SBT("toastSnapAll", n));
	SBUI.dirty = true;
	return n;
}

 
function SBUIArm(kind, num, idx) {
	if (SBUI.armTimer) {
		clearTimeout(SBUI.armTimer);
		SBUI.armTimer = null;
	}
	const isClear = kind === "clear";
	const needsIdx = kind === "restore" || kind === "delete";
	if (!kind || (!isClear && (num === null || num === undefined)) ||
		(needsIdx && idx === undefined)) {
		SBUI.arm = null;
	} else {
		SBUI.arm = { kind, num: isClear ? null : num, idx: needsIdx ? idx : null };
		SBUI.armTimer = setTimeout(() => {
			SBUI.armTimer = null;
			SBUI.arm = null;
			SBUI.dirty = true;
			SBUIToolbarRefresh();
		}, 3000);
	}
	SBUIToolbarRefresh();
	SBUI.dirty = true;
}

 
function SBUIArmIs(kind, num, idx) {
	const a = SBUI.arm;
	if (!a || a.kind !== kind) return false;
	if (kind === "clear") return true;
	if (kind === "delchar") return a.num === num;
	return a.num === num && a.idx === idx;
}

 

 
function SBUIArmRestore(num, idx) {
	SBUIArm(num === null || num === undefined ? null : "restore", num, idx);
}

 
function SBUIRestoreArmed(num, idx) {
	return SBUIArmIs("restore", num, idx);
}

 
function SBUIArmDelete(num, idx) {
	SBUIArm("delete", num, idx);
}

 
function SBUIDeleteArmed(num, idx) {
	return SBUIArmIs("delete", num, idx);
}

 
function SBUIArmClear() {
	SBUIArm("clear", null, null);
}

 
function SBUIClearArmed() {
	return SBUIArmIs("clear", null, null);
}

 
function SBUIToolbarRefresh() {
	const b = SBUI.btnClear;
	if (!b) return;
	const armed = SBUIClearArmed();
	b.textContent = armed ? SBT("btnClearConfirm") : SBT("btnClear");
	b.title = armed ? SBT("btnClearConfirmTitle") : SBT("btnClearTitle");
	try {
		b.style.background = armed ? "#8a1f2d" : "#5c2030";
		b.style.border = armed ? "1px solid #ffd166" : "1px solid #ff5566";
	} catch (e) {   }
}

 
function SBUIDoRestore(num, idx) {
	SBUIArmRestore(null); 
	const s = SBStore.load();
	const c = s.chars[String(num)];
	if (!c) return;
	const entry = c.history[idx];
	if (!entry) return;
	const C = SBCharObjectOf(num);
	
	if (!C || !SBCharInRoom(num)) { SBToast(SBT("toastRestoreGone")); return; }
	try {
		const res = SBApplySnapshot(C, entry);
		SBToast(res.ok
			? SBT("toastRestoredOk", SBCharDisplayName(c), num)
			: SBT("toastRestoredPartial", SBCharDisplayName(c), num));
	} catch (e) {
		SBErr("回溯失败", e);
		SBToast(SBT("toastRestoreFail"));
	}
	SBUI.dirty = true;
}

 
function SBUIDeleteSnap(num, idx) {
	const c = SBCharOf(num);
	if (!c || !c.history[idx]) return;
	SBUIArm(null); 
	SBDeleteSnapshot(num, idx);
	if (SBUI.expanded && SBUI.expanded.num === num) SBUI.expanded = null;
	SBToast(SBT("toastDeleted"));
	SBUI.dirty = true;
}

 
function SBUIDeleteChar(num) {
	SBUIArm(null); 
	const c = SBCharOf(num);
	if (!c) return;
	const name = SBCharDisplayName(c);
	SBDeleteChar(num);
	if (SBUI.selNum === num) {
		SBUI.selNum = null;
		SBUI.expanded = null;
	}
	SBToast(SBT("toastCharDeleted", name, num));
	SBUI.dirty = true;
}

 
function SBUIDoExportChar(num) {
	const c = SBCharOf(num);
	const json = SBExportCharJSON(num);
	if (!json || !c) { SBToast(SBT("toastSnapNone")); return; }
	const name = SBCharDisplayName(c);
	try {
		let clip = false;
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(json).catch(() => {});
				clip = true;
			}
		} catch (e) {   }
		let file = false;
		try {
			const blob = new Blob([json], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "SnapBack-char-" + num + "-" + new Date().toISOString().slice(0, 10) + ".txt";
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				try { URL.revokeObjectURL(url); } catch (e) {   }
				try { a.remove(); } catch (e) {   }
			}, 500);
			file = true;
		} catch (e) {   }
		if (clip || file) SBToast(SBT("toastExportChar", name, num, c.history.length));
		else SBToast(SBT("toastExportFail", SBT("toastClipboardFail")));
	} catch (e) {
		SBErr("导出此人失败", e);
		SBToast(SBT("toastExportFail", String(e && e.message || e)));
	}
}

 

function SBUIDoExport() {
	try {
		const json = SBExportJSON();
		let clip = false;
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(json).catch(() => {});
				clip = true;
			}
		} catch (e) {   }
		let file = false;
		try {
			const blob = new Blob([json], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "SnapBack-backup-" + new Date().toISOString().slice(0, 10) + ".txt";
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				try { URL.revokeObjectURL(url); } catch (e) {   }
				try { a.remove(); } catch (e) {   }
			}, 500);
			file = true;
		} catch (e) {   }
		if (clip && file) SBToast(SBT("toastExportClip"));
		else if (file) SBToast(SBT("toastExportFile"));
		else SBToast(SBT("toastExportFail", SBT("toastClipboardFail")));
	} catch (e) {
		SBErr("导出失败", e);
		SBToast(SBT("toastExportFail", String(e && e.message || e)));
	}
}

function SBUIImportText(text) {
	if (!text || !text.trim()) { SBToast(SBT("toastClipboardFail")); return; }
	try {
		const res = SBImportJSON(text.trim());
		SBUI.selNum = null;
		SBUI.expanded = null;
		SBUI.dirty = true;
		SBToast(SBT("toastImportDone", res.addedChars, res.addedSnaps));
	} catch (e) {
		SBErr("导入失败", e);
		const code = e && e.sbCode;
		SBToast(SBT("toastImportFail", code === "jsonParse" ? SBT("errJsonParse") : SBT("errNotValid")));
	}
}

 

function SBUIImportPanelClose() {
	if (SBUI.importPanel) {
		SBUI.importPanel.remove();
		SBUI.importPanel = null;
	}
}

 
function SBUIImportPanelShow() {
	if (SBUI.importPanel || !SBUI.body) return;
	const panel = document.createElement("div");
	panel.id = "sb-import";
	SBApplyStyle(panel, {
		position: "absolute",
		left: "0",
		top: "0",
		right: "0",
		bottom: "0",
		zIndex: "10",
		background: "rgba(10,10,20,.97)",
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		padding: "12px",
		boxSizing: "border-box",
	});

	const title = document.createElement("div");
	SBApplyStyle(title, { color: "#ffd166", fontWeight: "bold", fontSize: "15px" });
	title.textContent = SBT("importTitle");
	panel.appendChild(title);

	const hint = document.createElement("div");
	SBApplyStyle(hint, { color: "#9aa3c7", fontSize: "12px", lineHeight: "1.6" });
	hint.textContent = SBT("importHint");
	panel.appendChild(hint);

	const ta = document.createElement("textarea");
	SBApplyStyle(ta, {
		flex: "1 1 auto",
		minHeight: "0",
		background: "#1a1e30",
		color: "#e8eaf6",
		border: "1px solid #4a5278",
		borderRadius: "6px",
		padding: "8px",
		fontSize: "12px",
		resize: "none",
		boxSizing: "border-box",
		fontFamily: "monospace",
	});
	ta.placeholder = SBT("importPh");
	panel.appendChild(ta);

	const mkBtn = (label, title, colors) => {
		const b = document.createElement("button");
		SBApplyStyle(b, {
			background: (colors && colors.bg) ? colors.bg : "#2a2f45",
			border: (colors && colors.border) ? "1px solid " + colors.border : "1px solid #4a5278",
			color: "#e8eaf6",
			borderRadius: "8px",
			padding: "7px 14px",
			fontSize: "16px",
			cursor: "pointer",
			lineHeight: "1.3",
		});
		b.textContent = label;
		b.title = title || "";
		return b;
	};

	const btnRow = document.createElement("div");
	SBApplyStyle(btnRow, { display: "flex", gap: "8px", flexWrap: "wrap", flex: "0 0 auto" });

	
	const fileInput = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = ".txt,.json,text/plain,application/json";
	SBApplyStyle(fileInput, { display: "none" });
	fileInput.addEventListener("change", () => {
		const f = fileInput.files && fileInput.files[0];
		if (!f) return;
		let handled = false;
		try {
			if (typeof FileReader !== "undefined") {
				const fr = new FileReader();
				fr.onload = () => {
					SBUIImportPanelClose();
					SBUIImportText(String(fr.result || ""));
				};
				fr.onerror = () => SBToast(SBT("toastImportFail", "read-file"));
				fr.readAsText(f);
				handled = true;
			}
		} catch (e) {   }
		if (!handled) SBToast(SBT("toastClipboardFail"));
	});

	const btnFile = mkBtn(SBT("btnImportFile"), SBT("btnImportFile"));
	btnFile.addEventListener("click", () => { try { fileInput.click(); } catch (e) {   } });
	btnRow.appendChild(btnFile);

	const btnText = mkBtn(SBT("btnImportText"), SBT("btnImportText"));
	btnText.addEventListener("click", () => {
		const text = ta.value || "";
		SBUIImportPanelClose();
		SBUIImportText(text);
	});
	btnRow.appendChild(btnText);

	const btnCancel = mkBtn(SBT("btnCancel"), SBT("btnCancel"), { bg: "#5c2030", border: "#ff5566" });
	btnCancel.addEventListener("click", () => SBUIImportPanelClose());
	btnRow.appendChild(btnCancel);

	panel.appendChild(btnRow);
	panel.appendChild(fileInput);
	SBUI.body.appendChild(panel);
	SBUI.importPanel = panel;
}

 
function SBUIDoImport() {
	SBUIImportPanelShow();
}

 

function SBUIFavPanelClose() {
	if (SBUI.favPanel) {
		SBUI.favPanel.remove();
		SBUI.favPanel = null;
	}
	SBUI.favRenaming = null;
}

function SBUIFavPanelToggle() {
	if (SBUI.favPanel) SBUIFavPanelClose();
	else SBUIFavPanelShow();
}

 
function SBUIFavPanelShow() {
	if (SBUI.favPanel || !SBUI.body) return;
	const panel = document.createElement("div");
	panel.id = "sb-favs";
	SBApplyStyle(panel, {
		position: "absolute",
		left: "0",
		top: "0",
		right: "0",
		bottom: "0",
		zIndex: "10",
		background: "rgba(10,10,20,.97)",
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		padding: "12px",
		boxSizing: "border-box",
	});
	const title = document.createElement("div");
	SBApplyStyle(title, { color: "#ffd166", fontWeight: "bold", fontSize: "15px" });
	title.textContent = SBT("favPanelTitle");
	panel.appendChild(title);
	const list = document.createElement("div");
	SBApplyStyle(list, { flex: "1 1 auto", minHeight: "0", overflowY: "auto" });
	panel.appendChild(list);
	const btnRow = document.createElement("div");
	SBApplyStyle(btnRow, { display: "flex", gap: "8px", flex: "0 0 auto" });
	const btnClose = document.createElement("button");
	SBApplyStyle(btnClose, {
		background: "#5c2030",
		border: "1px solid #ff5566",
		color: "#e8eaf6",
		borderRadius: "8px",
		padding: "7px 16px",
		fontSize: "16px",
		cursor: "pointer",
	});
	btnClose.textContent = SBT("btnCancel");
	btnClose.addEventListener("click", () => SBUIFavPanelClose());
	btnRow.appendChild(btnClose);
	panel.appendChild(btnRow);
	SBUI.body.appendChild(panel);
	SBUI.favPanel = panel;
	SBUI.favListEl = list;
	SBUIFavPanelBuild();
}

 
function SBUIFavPanelBuild() {
	const list = SBUI.favListEl;
	if (!list) return;
	list.innerHTML = "";
	const s = SBStore.load();
	if (!s.favs.length) {
		const empty = document.createElement("div");
		SBApplyStyle(empty, { color: "#6d7699", fontSize: "12px", lineHeight: "1.6" });
		empty.textContent = SBT("favEmpty");
		list.appendChild(empty);
		return;
	}
	const mkBtn = (label, title, colors) => {
		const b = document.createElement("button");
		SBApplyStyle(b, {
			background: (colors && colors.bg) ? colors.bg : "#2a2f45",
			border: (colors && colors.border) ? "1px solid " + colors.border : "1px solid #4a5278",
			color: "#e8eaf6",
			borderRadius: "6px",
			padding: "3px 10px",
			fontSize: "14px",
			cursor: "pointer",
		});
		b.textContent = label;
		b.title = title || "";
		return b;
	};
	for (const f of s.favs) {
		const key = SBFavKeyOf(f);
		const row = document.createElement("div");
		SBApplyStyle(row, {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			padding: "7px 8px",
			border: "1px solid #2a2f45",
			borderRadius: "8px",
			marginBottom: "6px",
			flexWrap: "wrap",
		});
		
		if (SBUI.favRenaming === key) {
			const input = document.createElement("input");
			input.type = "text";
			SBApplyStyle(input, {
				flex: "1",
				minWidth: "120px",
				background: "#1a1e30",
				color: "#ffd166",
				border: "1px solid #ffd166",
				borderRadius: "6px",
				padding: "4px 8px",
				fontSize: "14px",
			});
			input.value = f.favName;
			const doSave = () => {
				SBRenameFavorite(key, input.value);
				SBUI.favRenaming = null;
				SBToast(SBT("toastFavRenamed"));
				SBUI.dirty = true;
			};
			input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });
			row.appendChild(input);
			const btnSave = mkBtn(SBT("btnFavSave"), SBT("btnFavSave"), { bg: "#1d4d33", border: "#4ade80" });
			btnSave.addEventListener("click", () => doSave());
			row.appendChild(btnSave);
		} else {
			const name = document.createElement("span");
			SBApplyStyle(name, {
				flex: "1",
				minWidth: "120px",
				color: "#ffd166",
				fontWeight: "bold",
				fontSize: "14px",
				wordBreak: "break-all",
			});
			name.textContent = "★ " + f.favName;
			name.title = SBT("favCharTime", f.charName || ("#" + f.num), f.num, SBTimeStr(f.snapT));
			row.appendChild(name);
		}
		const time = document.createElement("span");
		SBApplyStyle(time, { flex: "none", color: "#6d7699", fontSize: "11px" });
		time.textContent = SBTimeStr(f.snapT);
		row.appendChild(time);
		
		const restoreArmed = SBUIArmIs("favrestore", key, null);
		const btnRestore = mkBtn(restoreArmed ? SBT("btnRestoreConfirm") : SBT("btnFavRestore"),
			restoreArmed ? SBT("btnRestoreConfirmTitle") : SBT("btnFavRestore"),
			{ bg: restoreArmed ? "#8a6d1a" : "#1d4d33", border: restoreArmed ? "#ffd166" : "#4ade80" });
		btnRestore.addEventListener("click", () => {
			if (!restoreArmed) {
				SBUIArm("favrestore", key, null); 
				return;
			}
			SBUIArm(null);
			const C = SBCharObjectOf(f.num);
			if (!C || !SBCharInRoom(f.num)) { SBToast(SBT("toastRestoreGone")); SBUI.dirty = true; return; }
			try {
				const res = SBApplySnapshot(C, f);
				SBToast(res.ok ? SBT("toastRestoredOk", f.charName || ("#" + f.num), f.num)
					: SBT("toastRestoredPartial", f.charName || ("#" + f.num), f.num));
			} catch (e) {
				SBErr("收藏回溯失败", e);
				SBToast(SBT("toastRestoreFail"));
			}
			SBUI.dirty = true;
		});
		row.appendChild(btnRestore);
		const btnRename = mkBtn(SBT("btnFavRename"), SBT("btnFavRename"));
		btnRename.addEventListener("click", () => {
			SBUI.favRenaming = SBUI.favRenaming === key ? null : key;
			SBUI.dirty = true;
		});
		row.appendChild(btnRename);
		
		const unfavArmed = SBUIArmIs("favunfav", key, null);
		const btnUnfav = mkBtn(unfavArmed ? SBT("btnFavUnfavConfirm") : SBT("btnFavUnfav"),
			unfavArmed ? SBT("btnDelConfirmTitle") : SBT("btnFavUnfav"),
			{ bg: unfavArmed ? "#8a1f2d" : "#5c2030", border: unfavArmed ? "#ffd166" : "#ff5566" });
		btnUnfav.addEventListener("click", () => {
			if (!unfavArmed) {
				SBUIArm("favunfav", key, null); 
				return;
			}
			SBUIArm(null);
			SBUnfavorite(key);
			SBToast(SBT("toastUnfav"));
			SBUI.dirty = true;
		});
		row.appendChild(btnUnfav);
		list.appendChild(row);
	}
}

 

function SBUIStartLoop() {
	if (SBUI.tickId) return;
	SBUI.tickId = setInterval(() => {
		
		if (!SBTabVisible()) return;
		if (SBUI.dirty && SBUI.open) {
			SBUI.dirty = false;
			try { SBUIRenderAll(); } catch (e) { SBErr("渲染失败", e); }
		}
	}, 500);
}

function SBUIStopLoop() {
	if (SBUI.tickId) {
		clearInterval(SBUI.tickId);
		SBUI.tickId = null;
	}
}

function SBToast(msg) {
	if (!SBUI.toastEl) {
		SBUI.toastEl = document.createElement("div");
		SBUI.toastEl.id = "sb-toast";
		SBApplyStyle(SBUI.toastEl, {
			position: "fixed",
			left: "16px",
			top: "16px",
			zIndex: "2147483600",
			background: "#2a2f45",
			border: "1px solid #ffd166",
			color: "#ffd166",
			borderRadius: "8px",
			padding: "10px 16px",
			fontSize: "14px",
			fontFamily: "sans-serif",
			transition: "opacity .4s",
			display: "none",
			maxWidth: "420px",
			pointerEvents: "none",
		});
		document.body.appendChild(SBUI.toastEl);
	}
	SBUI.toastEl.textContent = msg;
	SBUI.toastEl.style.display = "block";
	SBUI.toastEl.style.opacity = "1";
	if (SBToastTimer) clearTimeout(SBToastTimer);
	SBToastTimer = setTimeout(() => {
		SBUI.toastEl.style.opacity = "0";
		setTimeout(() => { if (SBUI.toastEl) SBUI.toastEl.style.display = "none"; }, 400);
	}, 3000);
}

function SnapBackOpen() {
	if (SBUI.open) return;
	try {
		SBUIBuildWindow();
		SBUI.open = true;
		SBUIStartLoop();
		
		if (SBUI.titleEl) SBUI.titleEl.textContent = SBT("title");
		SBCollectAll();
		SBUI.dirty = true;
		const s = SBStore.load();
		let total = 0;
		for (const key of Object.keys(s.chars)) total += s.chars[key].history.length;
		SBToast(SBT("toastOpened", Object.keys(s.chars).length, total));
	} catch (e) {
		SBErr("浮窗构建失败", e);
		SBToast(SBT("toastBuildFail"));
	}
}

function SnapBackClose() {
	SBUI.open = false;
	SBUIStopLoop();
	SBUIDestroyWindow();
}

function SBUIDestroyWindow() {
	SBUIFavPanelClose(); 
	SBUIImportPanelClose(); 
	SBUIPreviewHide(); 
	if (SBUI.armTimer) {
		clearTimeout(SBUI.armTimer);
		SBUI.armTimer = null;
	}
	SBUI.arm = null;
	SBUI.btnClear = null;
	if (SBUI._docHandlers) {
		document.removeEventListener("mousemove", SBUI._docHandlers.onDocMove);
		document.removeEventListener("mouseup", SBUI._docHandlers.onDocUp);
		SBUI._docHandlers = null;
	}
	if (SBUI.escHandler) {
		document.removeEventListener("keydown", SBUI.escHandler, true);
		SBUI.escHandler = null;
	}
	if (SBUI._winResize) {
		window.removeEventListener("resize", SBUI._winResize);
		SBUI._winResize = null;
	}
	if (SBUI.win) {
		SBUI.win.remove();
		SBUI.win = null;
	}
	SBUI.titlebar = null;
	SBUI.titleEl = null;
	SBUI.toolbar = null;
	SBUI.body = null;
	SBUI.listEl = null;
	SBUI.headEl = null;
	SBUI.tlEl = null;
	SBUI.resizeHandle = null;
	SBUI.selNum = null;
	SBUI.expanded = null;
	SBUI.winDrag = null;
	SBUI.resDrag = null;
	SBUI.minimized = false;
}

 

 
function SBExposeAPI() {
	const g = (typeof globalThis !== "undefined") ? globalThis
		: (typeof window !== "undefined" ? window : null);
	if (!g) return;
	g.SnapBackOpen = SnapBackOpen;
	g.SnapBackClose = SnapBackClose;
	g.SnapBackToggle = SnapBackToggle;
	g.SnapBack = {
		Open: SnapBackOpen,
		Close: SnapBackClose,
		Toggle: SnapBackToggle,
		IsOpen: () => SBUI.open,
		State: () => SBStore.load(),
		SnapshotNow: (num) => {
			let C = null;
			if (Number.isInteger(num)) C = SBCharObjectOf(num);
			if (!C && typeof Player !== "undefined" && Player) C = Player;
			if (!C) return null;
			return SBRecordSnapshot(C, { trigger: "manual", src: SBCurrentNum() });
		},
		SnapshotSelf: () => {
			if (typeof Player === "undefined" || !Player) return null;
			return SBRecordSnapshot(Player, { trigger: "manual", src: SBCurrentNum() });
		},
		SnapshotAll: () => SBCollectAll("manual"),
		Restore: (num, idx) => {
			if (!Number.isInteger(num) || !Number.isInteger(idx) || idx < 0) return { ok: false };
			const c = SBCharOf(num);
			const entry = c && c.history[idx];
			const C = SBCharObjectOf(num);
			if (!entry || !C) return { ok: false };
			
			if (!SBCharInRoom(num)) return { ok: false, notInRoom: true };
			return SBApplySnapshot(C, entry);
		},
		Export: SBExportJSON,
		ExportChar: (num) => SBExportCharJSON(num),
		DeleteChar: (num) => SBDeleteChar(num),
		Import: (json) => SBImportJSON(json),
		Clear: SBClearAll,
		ClearOthers: SBClearOthers,
		CollectAll: SBCollectAll,
		 
		AddUnstableKey: (key) => {
			if (typeof key !== "string" || !key) return false;
			SBExtraVolatileKeys.add(key);
			return true;
		},
		 
		UnstableKeys: () => [...SBVolatilePropKeys, ...SBExtraVolatileKeys],
		 
		AddExcludedGroup: (group) => {
			if (typeof group !== "string" || !group) return false;
			SBExcludedGroups.add(group);
			return true;
		},
		 
		ExcludedGroups: () => [...SBExcludedGroups],
		 
		AddTransformKey: (key) => {
			if (typeof key !== "string" || !key) return false;
			SBExtraTransformKeys.add(key);
			return true;
		},
		 
		TransformKeys: () => [...SBTransformPropKeys, ...SBExtraTransformKeys],
		 
		Favorite: (num, idx, name) => SBFavoriteSnapshot(num, idx, name),
		 
		Unfavorite: (key) => SBUnfavorite(key),
		 
		RenameFavorite: (key, name) => SBRenameFavorite(key, name),
		 
		Favorites: () => SBStore.load().favs.map(f => ({
			key: SBFavKeyOf(f),
			num: f.num,
			charName: f.charName,
			favName: f.favName,
			snapT: f.snapT,
			appearance: f.appearance,
			pose: f.pose,
		})),
	};
}

function SBMain() {
	if (typeof window !== "undefined" && window.SnapBackInstalled) {
		SBLog("已安装，跳过重复加载");
		return;
	}
	const tryRegister = (tries) => {
		if (typeof bcModSdk === "undefined" || !bcModSdk.registerMod) {
			if (tries > 600) {
				SBErr("等待 bcModSdk 超时（60 秒），mod 未能加载");
				return;
			}
			setTimeout(() => tryRegister(tries + 1), 100);
			return;
		}
		try {
			const mod = bcModSdk.registerMod({
				name: "SnapBack",
				fullName: "SnapBack — 时空回溯快照",
				version: "1.1.54",
				repository: "",
			}, { allowReplace: true });
			SBHooks.mod = mod;
			SBStore.load();
			
			SBUI.lang = SBStorage.get("SnapBackLang") === "en" ? "en" : "zh";
			SBExposeAPI();
			SBInstallHooks(mod);
			if (typeof window !== "undefined") window.SnapBackInstalled = true;
			
			try { SBUIDotBuild(); } catch (e) { SBErr("小圆点按钮构建失败", e); }
			
			try {
				if (typeof document !== "undefined" && document.addEventListener) {
					document.addEventListener("visibilitychange", () => {
						if (document.hidden) {
							try { SBStore.save(); } catch (e) {   }
						} else {
							SBUI.dirty = true;
						}
					});
				}
			} catch (e) {   }
			
			setTimeout(() => {
				try { if (SBTabVisible()) SBCollectAll(); } catch (e) { SBErr("初始采集失败", e); }
			}, 3000);
			SBLog("已加载。聊天室输入 /snapback 开关浮窗；控制台可用 SnapBackOpen() / window.SnapBack 等接口");
		} catch (e) {
			SBErr("注册 mod 失败", e);
		}
	};
	tryRegister(0);
}

if (typeof window !== "undefined" && typeof window.document !== "undefined") {
	SBMain();
}

 
if (typeof module !== "undefined" && module.exports) {
	module.exports = {
		SBStore, SBNow, SBText,
		SBRecordSnapshot, SBApplySnapshot, SBCollectAll,
		SBAppearanceBundleOf, SBPoseOf, SBHashOf, SBHashViewOf, SBDiffOf, SBDiffTextOf,
		SBSanitizeBundle, SBIsVolatileKey, SBIsVolatileValue, SBVolatilePropKeys, SBVolatilePropPatterns, SBExtraVolatileKeys, SBVolatileKeepKeys,
		SBExcludedGroups, SBVolatileSnapshotOf, SBRestoreVolatileKeys,
		SBTransformViewOf, SBNormalizePlain, SBTransformPropKeys, SBExtraTransformKeys,
		SBLocksOf, SBLockViewOf, SBLockAssetOf, SBLockDisplayName, SBLockSideText,
		SBCharOf, SBCharEnsure, SBCharObjectOf, SBCharInRoom, SBIsPlayerLike,
		SBCharDisplayName, SBGameCharDisplayName, SBNameOf, SBChgCategories,
		SBItemDisplayName, SBGroupDisplayName,
		SBTabVisible, SBTrimGlobalCap,
		SBExportJSON, SBExportCharJSON, SBImportJSON, SBImportState, SBMergeInto, SBClearAll, SBClearOthers, SBDeleteSnapshot, SBDeleteChar,
		SBClearOtherChar, SBIsImported, SBTrimHistory, SBReindexChar,
		SBFavoriteSnapshot, SBFavFind, SBFavKeyOf, SBUnfavorite, SBRenameFavorite,
		SBScheduleOthersCleanup, SBCancelOthersCleanup,
		SBQueueCapture, SBHooks, SBHooksSetSrc, SBHooksFreshSrc, SBHooksTakeSrc, SBResolveSrc, SB_UNKNOWN_SRC, SBInstallHooks, SBUI, SBToast,
		SBUIArmRestore, SBUIRestoreArmed, SBUIDoRestore, SBUIRenderAll,
		SBUIArm, SBUIArmIs, SBUIArmDelete, SBUIDeleteArmed, SBUIArmClear, SBUIClearArmed,
		SBUISnapshotSelf, SBUISnapshotAll, SBPreviewDraw,
		SBUIPreviewShow, SBUIPreviewHide, SBUIPreviewLayout, SBUIDotBuild,
		SBUIDeleteChar, SBUIDoExportChar,
		SBUIFavPanelShow, SBUIFavPanelClose, SBUIFavPanelToggle, SBUIFavPanelBuild,
		SnapBackOpen, SnapBackClose, SnapBackToggle,
	};
}

})();
