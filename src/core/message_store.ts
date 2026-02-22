import type { Database as SqliteDatabase } from "better-sqlite3";
import Database from "better-sqlite3";

export interface Message {
  id: number;
  from: string;
  to: string;
  subject: string;
  body: string;
  type: "status" | "question" | "result" | "error";
  read: number; // 0 or 1
  createdAt: string;
}

export interface SendMessageOptions {
  from: string;
  to: string;
  subject: string;
  body: string;
  type: Message["type"];
  payload?: string;
}

export class MessageStore {
  private db: SqliteDatabase;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.init();
  }

  private init() {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                "from" TEXT NOT NULL,
                "to" TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                type TEXT NOT NULL,
                read INTEGER DEFAULT 0,
                payload TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
  }

  async send(options: SendMessageOptions): Promise<void> {
    const stmt = this.db.prepare(`
            INSERT INTO messages ("from", "to", subject, body, type, payload)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
    stmt.run(
      options.from,
      options.to,
      options.subject,
      options.body,
      options.type,
      options.payload || null,
    );
  }

  async check(recipient: string, options: { unreadOnly?: boolean } = {}): Promise<Message[]> {
    let sql = 'SELECT * FROM messages WHERE "to" = ?';
    if (options.unreadOnly) {
      sql += " AND read = 0";
    }
    sql += " ORDER BY createdAt ASC";

    const stmt = this.db.prepare(sql);
    return stmt.all(recipient) as Message[];
  }

  async markAsRead(id: number): Promise<void> {
    const stmt = this.db.prepare("UPDATE messages SET read = 1 WHERE id = ?");
    stmt.run(id);
  }

  close() {
    this.db.close();
  }
}
