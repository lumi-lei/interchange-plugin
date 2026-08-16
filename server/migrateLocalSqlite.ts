import { createClient, type InStatement, type Row } from '@libsql/client';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { db, migrate } from './db.js';

const tables = [
  { name: 'roles', primaryKey: 'key' },
  { name: 'role_preference_sets', primaryKey: 'id' },
  { name: 'contacts', primaryKey: 'id' },
  { name: 'input_records', primaryKey: 'id' },
  { name: 'generation_records', primaryKey: 'id' },
  { name: 'send_records', primaryKey: 'id' },
] as const;

function columnNames(rows: Row[]) {
  return rows.map((row) => String(row.name));
}

async function copyTable(source: ReturnType<typeof createClient>, table: typeof tables[number]) {
  const sourceColumns = columnNames((await source.execute(`PRAGMA table_info(${table.name})`)).rows);
  if (!sourceColumns.length) return 0;
  const targetColumns = columnNames((await db.execute(`PRAGMA table_info(${table.name})`)).rows);
  const columns = targetColumns.filter((column) => sourceColumns.includes(column));
  if (!columns.includes(table.primaryKey)) {
    throw new Error(`${table.name} 缺少主键列 ${table.primaryKey}`);
  }

  const sourceRows = await source.execute(`SELECT ${columns.join(', ')} FROM ${table.name}`);
  if (sourceRows.rows.length === 0) return 0;

  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((column) => column !== table.primaryKey)
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  const sql = `
    INSERT INTO ${table.name} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT(${table.primaryKey}) DO UPDATE SET ${updates}
  `;
  const statements: InStatement[] = sourceRows.rows.map((row) => ({
    sql,
    args: columns.map((column) => row[column] as string | number | bigint | null),
  }));
  await db.batch(statements, 'write');
  return sourceRows.rows.length;
}

async function main() {
  if (!config.tursoDatabaseUrl || !config.tursoAuthToken) {
    throw new Error('请先在 .env 中配置 TURSO_DATABASE_URL 和 TURSO_AUTH_TOKEN。');
  }
  if (!fs.existsSync(config.sqlitePath)) {
    throw new Error(`未找到本地 SQLite 数据库：${config.sqlitePath}`);
  }

  const source = createClient({ url: pathToFileURL(config.sqlitePath).href });
  try {
    await migrate();
    let total = 0;
    for (const table of tables) {
      const copied = await copyTable(source, table);
      total += copied;
      console.log(`${table.name}: 已迁移 ${copied} 条`);
    }
    await db.execute(`
      INSERT INTO role_preference_sets (role_key, name, content, sort_order, created_at, updated_at)
      SELECT r.key, '原有自定义偏好', r.custom_preference, 0, r.updated_at, r.updated_at
      FROM roles r
      WHERE TRIM(r.custom_preference) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM role_preference_sets p
          WHERE p.role_key = r.key AND p.name = '原有自定义偏好'
        )
    `);
    console.log(`迁移完成：共 ${total} 条记录已写入 Turso。`);
  } finally {
    source.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
