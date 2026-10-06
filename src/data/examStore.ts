/**
 * 先生が追加した検定問題の保存先。
 *
 * 初版は「この端末（ブラウザの IndexedDB）」だけに保存します。画像・PDF はファイル本体（Blob）を保存し、
 * 一時的な Blob URL の文字列は保存しません。ほかの端末へは自動で配信されないため、教材パックで配布します。
 *
 * 後からクラウド保存を追加しやすいよう、保存処理は ExamProblemStore の形にまとめています。
 * （クラウド版を作るときは、同じ形の実装を追加し、データベースとファイル保存先の権限をサーバー側で制御します）
 */
import type { ExamProblem } from '../core/exam';
import { materialFileIds } from '../core/examProblem';
import { MAX_TEACHER_PROBLEMS, type MaterialFileType } from '../core/examFiles';

export interface StoredFile {
  id: string;
  name: string;
  type: MaterialFileType;
  size: number;
  blob: Blob;
  /** SHA-256（教材パックの照合用。計算できない環境では null） */
  sha256: string | null;
}

export interface ExamProblemStore {
  readonly kind: 'local';
  listProblems(): Promise<ExamProblem[]>;
  getProblem(id: string): Promise<ExamProblem | null>;
  /** 問題と、その問題が使う新しいファイルをまとめて保存します（途中で失敗したら何も保存しません） */
  saveProblem(p: ExamProblem, newFiles: StoredFile[]): Promise<void>;
  /** 問題を削除します。ほかの問題が使っていないファイルも削除します */
  deleteProblem(id: string): Promise<void>;
  getFile(id: string): Promise<StoredFile | null>;
}

export class StoreError extends Error {
  constructor(
    readonly reason: 'unavailable' | 'quota' | 'limit' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

const DB_NAME = 'sakura-type-exam';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

function mapError(e: unknown): StoreError {
  if (e instanceof StoreError) return e;
  const name = (e as { name?: string } | null)?.name;
  if (name === 'QuotaExceededError') {
    return new StoreError('quota', 'この端末の保存できる容量が足りません。使わない問題を削除するか、ファイルを小さくしてください。');
  }
  return new StoreError('failed', 'この端末に保存できませんでした。ブラウザの設定（サイトのデータの保存）やプライベートモードでないかを確認してください。');
}

export class LocalExamStore implements ExamProblemStore {
  readonly kind = 'local' as const;
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: () => IDBFactory | undefined = () => globalThis.indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise<IDBDatabase>((resolve, reject) => {
        let f: IDBFactory | undefined;
        try {
          f = this.factory();
        } catch {
          f = undefined;
        }
        if (!f) {
          reject(new StoreError('unavailable', 'このブラウザでは、端末に教材を保存できません（プライベートモードやブラウザの設定を確認してください）。'));
          return;
        }
        const open = f.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('problems')) db.createObjectStore('problems', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(new StoreError('unavailable', 'この端末の保存場所を開けませんでした。プライベートモードやブラウザの設定を確認してください。'));
        open.onblocked = () => reject(new StoreError('unavailable', 'ほかのタブでこのアプリを開いているため、保存場所を更新できません。ほかのタブを閉じてください。'));
      });
      this.dbp.catch(() => {
        this.dbp = null;
      });
    }
    return this.dbp;
  }

  async listProblems(): Promise<ExamProblem[]> {
    try {
      const db = await this.db();
      const all = (await req(db.transaction('problems').objectStore('problems').getAll())) as ExamProblem[];
      return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } catch (e) {
      throw mapError(e);
    }
  }

  async getProblem(id: string): Promise<ExamProblem | null> {
    try {
      const db = await this.db();
      return ((await req(db.transaction('problems').objectStore('problems').get(id))) as ExamProblem | undefined) ?? null;
    } catch (e) {
      throw mapError(e);
    }
  }

  async saveProblem(p: ExamProblem, newFiles: StoredFile[]): Promise<void> {
    try {
      const db = await this.db();
      const tx = db.transaction(['problems', 'files'], 'readwrite');
      const problems = tx.objectStore('problems');
      const exists = await req(problems.getKey(p.id));
      if (!exists) {
        const n = await req(problems.count());
        if (n >= MAX_TEACHER_PROBLEMS) {
          tx.abort();
          throw new StoreError('limit', `この端末に保存できる問題は${MAX_TEACHER_PROBLEMS}問までです。使わない問題を削除してください。`);
        }
      }
      for (const f of newFiles) tx.objectStore('files').put(f);
      problems.put(p);
      await done(tx);
    } catch (e) {
      throw mapError(e);
    }
  }

  async deleteProblem(id: string): Promise<void> {
    try {
      const db = await this.db();
      const tx = db.transaction(['problems', 'files'], 'readwrite');
      const problems = tx.objectStore('problems');
      const all = (await req(problems.getAll())) as ExamProblem[];
      const target = all.find((p) => p.id === id);
      if (target) {
        const stillUsed = new Set(all.filter((p) => p.id !== id).flatMap((p) => materialFileIds(p.material)));
        for (const fid of materialFileIds(target.material)) if (!stillUsed.has(fid)) tx.objectStore('files').delete(fid);
        problems.delete(id);
      }
      await done(tx);
    } catch (e) {
      throw mapError(e);
    }
  }

  async getFile(id: string): Promise<StoredFile | null> {
    try {
      const db = await this.db();
      return ((await req(db.transaction('files').objectStore('files').get(id))) as StoredFile | undefined) ?? null;
    } catch (e) {
      throw mapError(e);
    }
  }
}

let shared: ExamProblemStore | null = null;
/** アプリで使う保存先（この端末） */
export function examStore(): ExamProblemStore {
  if (!shared) shared = new LocalExamStore();
  return shared;
}
