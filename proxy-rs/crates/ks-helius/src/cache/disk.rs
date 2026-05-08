/// redb-backed disk cache for HeliusClient.
///
/// Spec 09 §"Cache architecture": single-file redb, bounded by total bytes,
/// LRU eviction on `put` when over budget.
///
/// Schema (one redb table):
///   key  = CacheKey string (UTF-8)
///   value = [8-byte expires_unix_secs_le][8-byte last_accessed_unix_secs_le][payload bytes]

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use redb::{Database, ReadableTable, TableDefinition};
use tokio::task;

use crate::cache::key::CacheKey;
use crate::error::HeliusError;

const TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("helius_cache");

/// Header layout inside a stored value.
const HDR_LEN: usize = 16; // 8 expires + 8 last_accessed

/// Convert any redb-family error into `HeliusError::Disk`.
/// redb v2 has separate error types (TransactionError, TableError, CommitError,
/// StorageError, DatabaseError) that each implement `Into<redb::Error>`.
fn disk_err(e: impl Into<redb::Error>) -> HeliusError {
    HeliusError::Disk(e.into())
}

pub struct DiskCache {
    db: Database,
    max_bytes: u64,
}

impl DiskCache {
    pub fn open(path: PathBuf, max_bytes: u64) -> Result<Self, HeliusError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let db = Database::create(path).map_err(disk_err)?;
        // Ensure the table exists.
        let write = db.begin_write().map_err(disk_err)?;
        write.open_table(TABLE).map_err(disk_err)?;
        write.commit().map_err(disk_err)?;
        Ok(Self { db, max_bytes })
    }

    /// Null/in-memory-only mode — no disk writes, always returns None.
    pub fn null() -> Self {
        // A temp file database that is effectively discarded on drop.
        let tmp = std::env::temp_dir().join(format!(
            "ks_helius_null_{}.redb",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let db = Database::create(&tmp).expect("redb null db");
        let write = db.begin_write().expect("redb null write");
        write.open_table(TABLE).expect("redb null table");
        write.commit().expect("redb null commit");
        let _ = std::fs::remove_file(&tmp); // best-effort
        Self { db, max_bytes: 0 }
    }

    /// Read an entry. Returns `None` if expired or missing.
    pub async fn get(&self, key: &CacheKey) -> Result<Option<Bytes>, HeliusError> {
        let key_str = key.0.clone();
        // redb reads are sync; run on blocking thread.
        // We need a raw ptr trick to share the Database — instead, we store
        // max_bytes and db in Arc; but DiskCache is not Clone.
        // Simplest: do the read synchronously (redb reads are fast).
        let read_tx = self.db.begin_read().map_err(disk_err)?;
        let result = task::spawn_blocking(move || -> Result<Option<Bytes>, HeliusError> {
            let table = read_tx.open_table(TABLE).map_err(disk_err)?;
            let entry = match table.get(key_str.as_str()).map_err(disk_err)? {
                Some(e) => e,
                None => return Ok(None),
            };
            let raw = entry.value();
            if raw.len() < HDR_LEN {
                return Ok(None);
            }
            let expires = u64::from_le_bytes(raw[..8].try_into().unwrap());
            let now = unix_secs();
            if now >= expires {
                return Ok(None); // expired — caller will evict lazily on next put
            }
            Ok(Some(Bytes::copy_from_slice(&raw[HDR_LEN..])))
        })
        .await
        .map_err(|e| HeliusError::Disk(redb::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))))??;
        Ok(result)
    }

    /// Write an entry. Evicts LRU entries if over `max_bytes` budget.
    pub async fn put(&self, key: &CacheKey, value: Bytes, ttl: Duration) -> Result<(), HeliusError> {
        if self.max_bytes == 0 {
            return Ok(()); // null cache
        }
        let key_str = key.0.clone();
        let expires = unix_secs() + ttl.as_secs();
        let last_accessed = unix_secs();

        let mut hdr = [0u8; HDR_LEN];
        hdr[..8].copy_from_slice(&expires.to_le_bytes());
        hdr[8..].copy_from_slice(&last_accessed.to_le_bytes());

        let mut record = Vec::with_capacity(HDR_LEN + value.len());
        record.extend_from_slice(&hdr);
        record.extend_from_slice(&value);

        let write_tx = self.db.begin_write().map_err(disk_err)?;
        {
            let mut table = write_tx.open_table(TABLE).map_err(disk_err)?;
            table.insert(key_str.as_str(), record.as_slice()).map_err(disk_err)?;
        }
        write_tx.commit().map_err(disk_err)?;

        // Synchronous eviction — runs infrequently, acceptable.
        self.evict_if_needed();
        Ok(())
    }

    /// Update the `last_accessed` timestamp to implement LRU ordering.
    pub fn touch(&self, key: &CacheKey) {
        // Best-effort; ignore errors.
        let key_str = key.0.clone();
        if let Ok(write_tx) = self.db.begin_write() {
            if let Ok(mut table) = write_tx.open_table(TABLE) {
                // Read current raw bytes into an owned Vec to release the
                // immutable borrow before we call insert().
                let maybe_updated: Option<Vec<u8>> = table
                    .get(key_str.as_str())
                    .ok()
                    .flatten()
                    .and_then(|entry| {
                        let raw = entry.value();
                        if raw.len() >= HDR_LEN {
                            let mut updated = raw.to_vec();
                            let now = unix_secs().to_le_bytes();
                            updated[8..16].copy_from_slice(&now);
                            Some(updated)
                        } else {
                            None
                        }
                        // `entry` (and the immutable borrow) dropped here.
                    });
                if let Some(updated) = maybe_updated {
                    let _ = table.insert(key_str.as_str(), updated.as_slice());
                }
            }
            let _ = write_tx.commit();
        }
    }

    fn evict_if_needed(&self) {
        // Synchronous scan; acceptable since it runs infrequently.
        let read = match self.db.begin_read() {
            Ok(r) => r,
            Err(_) => return,
        };
        let table = match read.open_table(TABLE) {
            Ok(t) => t,
            Err(_) => return,
        };

        let mut total: u64 = 0;
        let mut entries: Vec<(String, u64, u64)> = Vec::new(); // (key, last_accessed, size)

        if let Ok(iter) = table.iter() {
            for item in iter.flatten() {
                let k = item.0.value().to_string();
                let v = item.1.value();
                let size = v.len() as u64;
                total += size;
                if v.len() >= HDR_LEN {
                    let la = u64::from_le_bytes(v[8..16].try_into().unwrap_or([0u8; 8]));
                    entries.push((k, la, size));
                }
            }
        }

        if total <= self.max_bytes {
            return;
        }

        // Sort by last_accessed ascending (oldest first).
        entries.sort_by_key(|(_, la, _)| *la);

        let write_tx = match self.db.begin_write() {
            Ok(w) => w,
            Err(_) => return,
        };
        if let Ok(mut tbl) = write_tx.open_table(TABLE) {
            for (key, _, size) in &entries {
                if total <= self.max_bytes {
                    break;
                }
                let _ = tbl.remove(key.as_str());
                total = total.saturating_sub(*size);
            }
        }
        let _ = write_tx.commit();
    }
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

impl std::convert::From<std::io::Error> for HeliusError {
    fn from(e: std::io::Error) -> Self {
        HeliusError::Disk(redb::Error::Io(e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn key(s: &str) -> CacheKey {
        CacheKey(s.to_string())
    }

    #[tokio::test]
    async fn put_and_get_roundtrip() {
        let dir = tempdir().unwrap();
        let cache = DiskCache::open(dir.path().join("test.redb"), 10 * 1024 * 1024).unwrap();
        let k = key("helius:getBalance:abc");
        let val = Bytes::from_static(b"hello world");
        cache.put(&k, val.clone(), Duration::from_secs(60)).await.unwrap();
        let got = cache.get(&k).await.unwrap();
        assert_eq!(got, Some(val));
    }

    #[tokio::test]
    async fn expired_entry_returns_none() {
        let dir = tempdir().unwrap();
        let cache = DiskCache::open(dir.path().join("test.redb"), 10 * 1024 * 1024).unwrap();
        let k = key("helius:getBalance:expired");
        // Write with TTL=0 (already expired).
        let val = Bytes::from_static(b"stale");
        cache.put(&k, val, Duration::ZERO).await.unwrap();
        let got = cache.get(&k).await.unwrap();
        assert_eq!(got, None);
    }

    #[tokio::test]
    async fn null_cache_always_misses() {
        let cache = DiskCache::null();
        let k = key("helius:getBalance:null");
        cache.put(&k, Bytes::from_static(b"data"), Duration::from_secs(60)).await.unwrap();
        let got = cache.get(&k).await.unwrap();
        assert_eq!(got, None);
    }
}
