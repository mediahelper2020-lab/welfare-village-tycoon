/* =========================================================
 * 복지마을 타이쿤 — 랭킹 클라이언트 (Supabase REST)
 *
 * 마을 세이브는 그대로 브라우저(localStorage)에 남는다.
 * 서버로 나가는 것은 랭킹에 필요한 값 몇 개뿐이다.
 *   닉네임 · 마을이름 · 총점 · 인구 · 만족도 · 종결사례 · 경과개월
 *
 * 여기 적힌 anon 키는 브라우저에 노출되는 것을 전제로 설계된 공개 키다.
 * 실제 보호는 테이블의 RLS 정책이 한다 (supabase/schema.sql 참고).
 * ========================================================= */
'use strict';

const Leaderboard = (() => {

  const CONFIG = {
    url: 'https://gulxpjmmsljczgfiowdk.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1bHhwam1tc2xqY3pnZmlvd2RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1ODI2NDgsImV4cCI6MjA5MTE1ODY0OH0.qxTIP6KMpqT0dj8laEESH56_0P16vhG-3lnuGB3eqhA',
    table: 'leaderboard',
    timeout: 8000,
  };

  // 다른 Supabase 프로젝트로 바꿔 쓰고 싶을 때
  function configure(opts) { Object.assign(CONFIG, opts || {}); }
  function configured() { return !!(CONFIG.url && CONFIG.key); }

  const FIELDS = 'id,nickname,village,score,pop,sat,closed_cases,months,created_at';

  function headers(extra) {
    return Object.assign({
      apikey: CONFIG.key,
      Authorization: 'Bearer ' + CONFIG.key,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  async function request(path, opts) {
    if (!configured()) return { ok: false, msg: '랭킹 서버가 설정되지 않았습니다.' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), CONFIG.timeout);
    try {
      const res = await fetch(`${CONFIG.url}/rest/v1/${path}`,
        Object.assign({ signal: ctl.signal }, opts));
      const text = await res.text();
      let body = null;
      if (text) { try { body = JSON.parse(text); } catch (e) { body = text; } }

      if (!res.ok) return { ok: false, status: res.status, msg: explain(res.status, body), body };
      return { ok: true, data: body };
    } catch (e) {
      return {
        ok: false,
        msg: e.name === 'AbortError'
          ? '랭킹 서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.'
          : '랭킹 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // PostgREST 오류를 사람이 읽을 수 있는 문장으로
  function explain(status, body) {
    const code = body && body.code;
    const raw = (body && (body.message || body.hint)) || '';
    if (status === 404 || code === 'PGRST205' || /Could not find the table/i.test(raw))
      return '랭킹 테이블이 아직 없습니다. supabase/schema.sql을 Supabase SQL Editor에서 실행해 주세요.';
    if (status === 401 || status === 403 || code === '42501')
      return '랭킹 서버 권한이 없습니다. 테이블의 RLS 정책을 확인해 주세요.';
    if (code === '23514') return '점수 값이 올바르지 않아 등록하지 못했습니다.';
    if (status === 429) return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
    return raw || `랭킹 서버 오류 (${status})`;
  }

  /** 상위 기록을 점수 내림차순으로 가져온다 */
  function top(limit = 20) {
    return request(
      `${CONFIG.table}?select=${FIELDS}&order=score.desc,created_at.asc&limit=${limit}`,
      { headers: headers() });
  }

  /** 내 기록을 등록한다 */
  function submit(entry) {
    return request(CONFIG.table, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(entry),
    });
  }

  return { configure, configured, top, submit };
})();
