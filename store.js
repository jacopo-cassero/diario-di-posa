// Archivio dati: copia locale sul dispositivo + sincronizzazione con Supabase.
// Le modifiche vengono salvate subito sul dispositivo e inviate appena c'è rete,
// così l'app funziona anche in cantiere senza segnale.

const KINDS = ['lavori', 'interventi', 'movimenti', 'magazzino', 'cartelle', 'preventivi'];
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function createStore(cfg, onChange) {
  const cloud = !!(cfg && cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  let sb = null, uid = null, channel = null;
  const recs = new Map();          // "kind/id" -> {kind, id, data}
  let outbox = [];                 // modifiche non ancora inviate
  const S = { lavori: [], interventi: [], movimenti: [], magazzino: [], cartelle: [], preventivi: [], furgone: {}, listino: null, azienda: null };
  const st = { mode: cloud ? 'cloud' : 'demo', auth: cloud ? 'checking' : 'demo', email: '', online: navigator.onLine, syncing: false, lastSync: null, error: '' };
  const urlCache = new Map();

  const key = n => `ddp:${n}:${uid || 'demo'}`;
  function rebuild() {
    for (const k of KINDS) S[k] = [];
    S.furgone = {}; S.listino = null; S.azienda = null;
    for (const r of recs.values()) {
      if (r.kind === 'cfg') { if (['furgone', 'listino', 'azienda'].includes(r.id)) S[r.id] = { ...r.data }; continue; }
      if (S[r.kind]) S[r.kind].push({ id: r.id, ...r.data });
    }
  }
  function persist() {
    ls.set(key('cache'), [...recs.values()]);
    ls.set(key('outbox'), outbox);
  }
  function changed() { rebuild(); persist(); onChange && onChange(); }
  function loadLocal() {
    recs.clear();
    for (const r of ls.get(key('cache'), [])) recs.set(r.kind + '/' + r.id, r);
    outbox = ls.get(key('outbox'), []);
    rebuild();
  }

  async function refresh() {
    if (!sb || !uid || !navigator.onLine) return;
    st.syncing = true; onChange && onChange();
    try {
      await flush();
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('records').select('kind,id,data,deleted').eq('user_id', uid).range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const pending = new Set(outbox.map(o => o.kind + '/' + o.id));
      for (const k of [...recs.keys()]) if (!pending.has(k)) recs.delete(k);
      for (const r of rows) {
        const k = r.kind + '/' + r.id;
        if (pending.has(k)) continue;
        if (!r.deleted) recs.set(k, { kind: r.kind, id: r.id, data: r.data });
      }
      st.lastSync = new Date(); st.error = '';
    } catch (e) {
      st.error = 'Sincronizzazione non riuscita. Riprovo da solo.';
      console.warn(e);
    } finally {
      st.syncing = false; changed();
    }
  }

  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (sb && uid && navigator.onLine && outbox.length) {
        const op = outbox[0];
        const { error } = await sb.from('records').upsert({
          user_id: uid, kind: op.kind, id: op.id, data: op.data || {}, deleted: !!op.deleted, updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,kind,id' });
        if (error) { st.error = 'Alcune modifiche non sono ancora state inviate.'; console.warn(error); break; }
        outbox.shift(); persist();
      }
      if (!outbox.length && st.error.startsWith('Alcune')) st.error = '';
    })().finally(() => { flushing = null; onChange && onChange(); });
    return flushing;
  }

  function applyRemote(row) {
    if (!row || row.user_id !== uid) return;
    const k = row.kind + '/' + row.id;
    if (outbox.some(o => o.kind + '/' + o.id === k)) return;
    if (row.deleted) recs.delete(k); else recs.set(k, { kind: row.kind, id: row.id, data: row.data });
    changed();
  }

  async function startSession(session) {
    uid = session.user.id; st.email = session.user.email || ''; st.auth = 'in';
    loadLocal(); onChange && onChange();
    refresh();
    try {
      channel && sb.removeChannel(channel);
      channel = sb.channel('records-' + uid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${uid}` }, p => applyRemote(p.new && p.new.kind ? p.new : null))
        .subscribe();
    } catch (e) { console.warn(e); }
  }

  const api = {
    S, st,
    async init() {
      window.addEventListener('online', () => { st.online = true; refresh(); });
      window.addEventListener('offline', () => { st.online = false; onChange && onChange(); });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
      if (!cloud) { loadLocal(); onChange && onChange(); return; }
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      sb.auth.onAuthStateChange((ev, session) => {
        if (ev === 'SIGNED_OUT') { uid = null; st.auth = 'out'; recs.clear(); rebuild(); onChange && onChange(); }
        else if (ev === 'PASSWORD_RECOVERY') { st.auth = 'recovery'; onChange && onChange(); }
        else if (session && session.user.id !== uid) startSession(session);
      });
      const { data } = await sb.auth.getSession();
      if (data.session) await startSession(data.session);
      else if (st.auth === 'checking') { st.auth = 'out'; onChange && onChange(); }
    },
    async login(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'Email o password sbagliate.' : /confirm/i.test(error.message) ? 'Devi prima confermare l\'email: apri il messaggio che ti è arrivato.' : error.message);
    },
    async signup(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw new Error(/registered|exists/i.test(error.message) ? 'Questa email ha già un account: accedi.' : /signups? not allowed|disabled/i.test(error.message) ? 'Le iscrizioni sono chiuse.' : error.message);
      return !data.session; // true = serve conferma via email
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw new Error(error.message);
    },
    async setPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      st.auth = 'in'; onChange && onChange();
    },
    async logout() { if (sb) await sb.auth.signOut(); },
    refresh,

    put(kind, id, data) {
      id = id || uuid();
      recs.set(kind + '/' + id, { kind, id, data });
      outbox = outbox.filter(o => !(o.kind === kind && o.id === id));
      if (cloud) outbox.push({ kind, id, data });
      changed(); flush();
      return id;
    },
    drop(kind, id) {
      recs.delete(kind + '/' + id);
      outbox = outbox.filter(o => !(o.kind === kind && o.id === id));
      if (cloud) outbox.push({ kind, id, deleted: true });
      changed(); flush();
    },
    pending: () => outbox.length,

    async uploadFile(blob, nome) {
      const ext = ((nome || '').split('.').pop() || (blob.type.split('/')[1] || 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      if (!cloud) {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
        const files = ls.get('ddp:files:demo', {}); const id = 'demo:' + uuid();
        files[id] = dataUrl;
        if (!ls.set('ddp:files:demo', files)) throw Object.assign(new Error('full'), { userMsg: 'Spazio del dispositivo pieno: in modalità prova si possono tenere pochi file.' });
        return id;
      }
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { userMsg: 'Serve la connessione per caricare i file.' });
      const path = `${uid}/${uuid()}.${ext}`;
      const { error } = await sb.storage.from('file').upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
      if (error) throw Object.assign(error, { userMsg: /size|large/i.test(error.message) ? 'File troppo grande (massimo 50 MB).' : 'Caricamento non riuscito, riprova.' });
      return path;
    },
    async fileUrl(path) {
      if (!path) return '';
      if (path.startsWith('demo:')) return ls.get('ddp:files:demo', {})[path] || '';
      const c = urlCache.get(path);
      if (c && c.exp > Date.now()) return c.url;
      if (!sb) return '';
      const { data, error } = await sb.storage.from('file').createSignedUrl(path, 3600);
      if (error) return '';
      urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60e3 });
      return data.signedUrl;
    },
    async removeFile(path) {
      if (!path) return;
      if (path.startsWith('demo:')) { const f = ls.get('ddp:files:demo', {}); delete f[path]; ls.set('ddp:files:demo', f); return; }
      if (sb) await sb.storage.from('file').remove([path]);
    },

    async savePush(sub) {
      if (!sb || !uid) throw new Error('Accedi prima di attivare le notifiche.');
      const j = sub.toJSON();
      const { error } = await sb.from('push_subscriptions').upsert({ user_id: uid, endpoint: j.endpoint, subscription: j, device: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
      if (error) throw error;
    },
    async removePush(endpoint) {
      if (sb && uid) await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    },
  };
  return api;
}
