(() => {
  'use strict';

  const SUPABASE_URL = 'https://qkhpvqepgozsaamxmugk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_rh5Whcvb9PFt9MI1iL6dlg_qS9BGRNw';
  const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_KEY) || null;
  window.ONPDV_SB = sb;
  const login = document.getElementById('login');
  const email = document.getElementById('liEmail');
  const password = document.getElementById('liPass');
  const submit = document.getElementById('btnLogin');
  const message = document.getElementById('liMsg');
  const appHost = document.getElementById('appHost');
  let appPromise = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  function setMessage(text, isError = false) {
    message.textContent = text || '';
    message.classList.toggle('login-error', isError);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-onpdv-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') resolve();
        else existing.addEventListener('load', resolve, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      script.dataset.onpdvSrc = src;
      script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)), { once: true });
      document.body.appendChild(script);
    });
  }

  async function loadApp() {
    if (appPromise) return appPromise;
    appPromise = (async () => {
      submit.disabled = true;
      appHost.setAttribute('aria-busy', 'true');
      setMessage('Carregando o sistema…');
      const response = await fetch('partials/onpdv-app.html', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar a interface do sistema.');
      appHost.innerHTML = await response.text();
      await Promise.all([loadScript('lib/leaflet/leaflet.js'), loadScript('lib/qrcode.js')]);
      await loadScript('assets/js/onpdv-app.js');
      appHost.removeAttribute('aria-busy');
    })().catch((error) => {
      appPromise = null;
      submit.disabled = false;
      setMessage(error.message || 'Não foi possível abrir o sistema.', true);
      throw error;
    });
    return appPromise;
  }

  async function signIn() {
    if (!sb) {
      setMessage('Não foi possível carregar a autenticação. Verifique sua conexão e tente novamente.', true);
      return;
    }
    const loginEmail = email.value.trim();
    const loginPassword = password.value;
    if (!loginEmail || !loginPassword) {
      setMessage('Preencha e-mail e senha.', true);
      return;
    }
    submit.disabled = true;
    setMessage('Entrando…');
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
      if (error || !data.session) {
        setMessage('E-mail ou senha inválidos.', true);
        return;
      }
      await loadApp();
    } catch (error) {
      setMessage('Não foi possível entrar agora. Verifique sua conexão.', true);
    } finally {
      if (!appPromise) submit.disabled = false;
    }
  }

  submit.addEventListener('click', signIn);
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !submit.disabled) signIn();
  });

  document.getElementById('btnTogglePassword').addEventListener('click', (event) => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? 'Ocultar' : 'Mostrar';
    event.currentTarget.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    event.currentTarget.setAttribute('aria-pressed', String(show));
    password.focus();
  });

  document.getElementById('btnResetPassword').addEventListener('click', async () => {
    if (!sb) {
      setMessage('Não foi possível carregar a autenticação. Verifique sua conexão e tente novamente.', true);
      return;
    }
    const loginEmail = email.value.trim();
    if (!loginEmail) {
      setMessage('Informe seu e-mail para receber a recuperação de senha.', true);
      email.focus();
      return;
    }
    setMessage('Enviando recuperação…');
    const { error } = await sb.auth.resetPasswordForEmail(loginEmail, {
      redirectTo: new URL('index.html', location.href).href
    });
    setMessage(error ? 'Não foi possível enviar agora.' : 'Se o e-mail estiver cadastrado, você receberá as instruções.', !!error);
  });

  if (sb) {
    sb.auth.getSession().then(({ data }) => {
      if (data.session) loadApp();
      else login.classList.remove('hide');
    }).catch(() => setMessage('Não foi possível verificar a sessão.', true));
  } else {
    login.classList.remove('hide');
    setMessage('Não foi possível carregar a autenticação. Verifique sua conexão e tente novamente.', true);
  }
})();
