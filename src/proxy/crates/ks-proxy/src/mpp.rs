//! Open MPP streams skip the x402 402 round trip.
//!
//! A platform-key call with no balance returns HTTP 402, and the client
//! has to pay and send the request again. An already-open payment stream
//! is the prepaid channel for that call: the proxy reads `mpp_streams`
//! locally, forwards immediately, and the existing fire-and-forget
//! `/mpp/streams/:id/record` hook debits usage after the response.
//!
//! Confirmed-open pairs are kept in memory for a few seconds so a burst
//! of calls does not reopen SQLite. A closed or missing stream is not
//! cached, so closing a stream takes effect on the next request.

use std::path::Path;
use std::time::Duration;

use ks_cache::TtlCache;

/// How long a confirmed-open stream stays in memory. Short enough that a
/// close is visible quickly; long enough to cover a burst of agent calls.
const OPEN_TTL: Duration = Duration::from_secs(5);

/// `true` when `mpp.db` has this stream, owned by `user_id`, status `open`.
/// A missing file, a missing table, or a closed stream all return `false`
/// so the caller falls through to the 402 gate.
pub fn stream_is_open(cache: &TtlCache<u8>, db_path: &Path, user_id: &str, stream_id: u64) -> bool {
    let key = format!("{user_id}:{stream_id}");
    if cache.get(&key).is_some() {
        return true;
    }
    if !read_open(db_path, user_id, stream_id) {
        return false;
    }
    cache.set(key, 1, OPEN_TTL);
    true
}

fn read_open(db_path: &Path, user_id: &str, stream_id: u64) -> bool {
    let Ok(conn) =
        rusqlite::Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
    else {
        return false;
    };
    conn.query_row(
        "SELECT 1 FROM mpp_streams WHERE id = ?1 AND user_id = ?2 AND status = 'open' LIMIT 1",
        rusqlite::params![stream_id as i64, user_id],
        |_| Ok(()),
    )
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mpp.db");
        let conn = rusqlite::Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE mpp_streams (
                id INTEGER PRIMARY KEY,
                user_id TEXT NOT NULL,
                status TEXT NOT NULL
            );
            INSERT INTO mpp_streams (id, user_id, status) VALUES (7, 'user-b', 'open');
            INSERT INTO mpp_streams (id, user_id, status) VALUES (8, 'user-b', 'closed');
            INSERT INTO mpp_streams (id, user_id, status) VALUES (9, 'someone-else', 'open');",
        )
        .unwrap();
        (dir, path)
    }

    #[test]
    fn open_stream_is_accepted_and_cached() {
        let (_dir, path) = temp_db();
        let cache = TtlCache::new();
        assert!(stream_is_open(&cache, &path, "user-b", 7));
        assert_eq!(cache.len(), 1);
        // Second look is the memory hit. Drop the file so a disk read would fail.
        let gone = path.with_file_name(format!(
            "missing-{}.db",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(stream_is_open(&cache, &gone, "user-b", 7));
    }

    #[test]
    fn closed_missing_and_foreign_streams_fail_closed() {
        let (_dir, path) = temp_db();
        let cache = TtlCache::new();
        assert!(!stream_is_open(&cache, &path, "user-b", 8));
        assert!(!stream_is_open(&cache, &path, "user-b", 9));
        assert!(!stream_is_open(&cache, &path, "user-b", 404));
        assert!(!stream_is_open(
            &cache,
            Path::new("/no/such/mpp.db"),
            "user-b",
            7
        ));
        assert_eq!(cache.len(), 0);
    }
}
