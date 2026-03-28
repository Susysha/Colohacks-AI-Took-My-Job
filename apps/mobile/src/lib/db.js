import * as SQLite from "expo-sqlite";

let databasePromise;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("medirelay.db");
  }

  return databasePromise;
}

export async function initializeDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transfers (
      handoff_id TEXT PRIMARY KEY NOT NULL,
      transfer_chain_id TEXT NOT NULL,
      status TEXT NOT NULL,
      record_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      mutation_id TEXT PRIMARY KEY NOT NULL,
      handoff_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export async function saveTransfer(record, status = "queued") {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT OR REPLACE INTO transfers (handoff_id, transfer_chain_id, status, record_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      record.handoffId,
      record.transferChainId,
      status,
      JSON.stringify(record),
      now
    ]
  );
}

export async function queueMutation(record) {
  const db = await getDatabase();
  const mutationId = `mutation-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const payload = {
    mutationId,
    entityType: "transfer",
    entityId: record.handoffId,
    operation: "upsert",
    payload: record,
    deviceTimestamp: new Date().toISOString()
  };

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue (mutation_id, handoff_id, payload_json, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [mutationId, record.handoffId, JSON.stringify(payload), "pending", new Date().toISOString()]
  );

  return payload;
}

export async function listTransfers() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT handoff_id, transfer_chain_id, status, record_json, updated_at
     FROM transfers
     ORDER BY updated_at DESC`
  );

  return rows.map((row) => ({
    handoffId: row.handoff_id,
    transferChainId: row.transfer_chain_id,
    syncStatus: row.status,
    updatedAt: row.updated_at,
    ...JSON.parse(row.record_json)
  }));
}

export async function pendingMutations() {
  const db = await getDatabase();
  const rows = await db.getAllAsync(
    `SELECT mutation_id, payload_json FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC`
  );
  return rows.map((row) => JSON.parse(row.payload_json));
}

export async function markSynced(handoffIds = []) {
  if (handoffIds.length === 0) return;
  const db = await getDatabase();

  for (const handoffId of handoffIds) {
    await db.runAsync(`UPDATE transfers SET status = 'synced', updated_at = ? WHERE handoff_id = ?`, [
      new Date().toISOString(),
      handoffId
    ]);
    await db.runAsync(`UPDATE sync_queue SET status = 'done' WHERE handoff_id = ?`, [handoffId]);
  }
}

