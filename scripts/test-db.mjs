#!/usr/bin/env node
/**
 * データベースの権限（RLS）テスト。
 *
 * 一時的な PostgreSQL を起動し、Supabase と同じ役割（anon / authenticated / service_role）と
 * auth.uid() / auth.jwt() を模擬したうえで、supabase/migrations の SQL を適用して検証します。
 * 本物の Supabase 環境で実行するテストではありません（導入後の手動確認手順は docs/manual-checks.md）。
 *
 * 必要: PostgreSQL 15 以上のサーバー（initdb, pg_ctl）。PG_BIN で場所を指定できます。
 * 使い方: npm run test:db
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { runRlsTests } from '../supabase/tests/rls.test.mjs';

/** Supabase の役割・auth スキーマ・既定の権限を最小限に模擬します */
const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;
grant anon, authenticated, service_role to postgres;

create schema auth;
create table auth.users (id uuid primary key, email text unique);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- Supabase の既定：public の表・関数は anon / authenticated / service_role に権限が付きます
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

function findPgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  for (const v of ['17', '16', '15']) {
    const p = `/usr/lib/postgresql/${v}/bin`;
    if (existsSync(path.join(p, 'initdb'))) return p;
  }
  return '';
}

const bin = findPgBin();
const initdb = bin ? path.join(bin, 'initdb') : 'initdb';
const pgCtl = bin ? path.join(bin, 'pg_ctl') : 'pg_ctl';
const dir = mkdtempSync(path.join(tmpdir(), 'sakura-pg-'));
const dataDir = path.join(dir, 'data');
const port = 54329 + Math.floor(Math.random() * 500);

const asOwner = process.getuid && process.getuid() === 0 ? ['postgres'] : null;
function run(cmd, args) {
  // root では PostgreSQL を起動できないため、postgres ユーザーで実行します
  if (asOwner) return execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' });
  return execFileSync(cmd, args, { stdio: 'pipe' });
}

let started = false;
try {
  if (asOwner) execFileSync('chown', ['-R', 'postgres', dir]);
  run(initdb, ['-D', dataDir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C']);
  run(pgCtl, ['-D', dataDir, '-l', path.join(dir, 'server.log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start']);
  started = true;

  const client = new pg.Client({ host: dir, port, user: 'postgres', database: 'postgres' });
  client.on('error', () => {});
  await client.connect();
  await client.query(SUPABASE_SHIM);
  const migDir = new URL('../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    await client.query(readFileSync(new URL(f, migDir), 'utf8'));
  }
  const failed = await runRlsTests(client);
  await client.end();
  process.exitCode = failed > 0 ? 1 : 0;
} catch (e) {
  console.error(e?.stderr?.toString?.() || e);
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      run(pgCtl, ['-D', dataDir, '-m', 'fast', 'stop']);
    } catch {
      /* ignore */
    }
  }
  rmSync(dir, { recursive: true, force: true });
}

