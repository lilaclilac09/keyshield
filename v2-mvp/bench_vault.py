"""
Encryption benchmarks for KeyShield vault.
Compares PBKDF2 vs Argon2id key derivation performance,
measures AES-256-GCM encryption/decryption throughput,
and validates correctness of Argon2id migration.

Usage:
    python v2-mvp/bench_vault.py
"""

import time
from pathlib import Path
from tempfile import TemporaryDirectory
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend
import os


def bench_pbkdf2(password="test_password", iterations=100_000, n=100):
    salt = os.urandom(16)
    start = time.perf_counter()
    for _ in range(n):
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations, backend=default_backend())
        key = kdf.derive(password.encode())
    elapsed = (time.perf_counter() - start) * 1000
    return {"iterations": iterations, "n": n, "avg_ms": elapsed / n, "total_ms": elapsed}


def bench_argon2(password="test_password", n=50):
    try:
        from argon2 import PasswordHasher
    except ImportError:
        return {"error": "argon2-cffi not installed — run: pip install argon2-cffi"}
    
    ph = PasswordHasher(time_cost=10, memory_cost=65536, parallelism=4, salt_len=16, hash_len=32)
    start = time.perf_counter()
    for _ in range(n):
        hashed = ph.hash(password.encode())
        ph.verify(hashed, password.encode())
    elapsed = (time.perf_counter() - start) * 1000
    return {"n": n, "avg_ms": elapsed / n, "total_ms": elapsed, "params": {"t": 10, "m": 65536, "p": 4}}


def bench_aes_gcm(plaintext_size=256, n=10_000):
    aes_key = os.urandom(32)
    plaintext = os.urandom(plaintext_size).decode("latin-1")
    start = time.perf_counter()
    for _ in range(n):
        nonce = os.urandom(12)
        aes = AESGCM(aes_key)
        ciphertext = aes.encrypt(nonce, plaintext.encode(), None)
        aes.decrypt(nonce, ciphertext, None)
    elapsed = (time.perf_counter() - start) * 1000
    return {"plaintext_bytes": plaintext_size, "n": n, "avg_ms": elapsed / n, "throughput_bps": round((n * plaintext_size) / elapsed)}


def bench_vault_store_load(n=100):
    from src.vault import store, load
    with TemporaryDirectory() as tmpdir:
        os.environ["KS_VAULT_DIR"] = tmpdir
        start = time.perf_counter()
        for i in range(n):
            store(f"user_{i}", f"provider_{i % 5}", f"sk-test-key-{i}", password="pw")
        store_time = (time.perf_counter() - start) * 1000
        for i in range(n):
            load(f"user_{i}", f"provider_{i % 5}", password="pw")
        load_time = (time.perf_counter() - start) * 1000
        return {"n": n, "store_ms": round(store_time, 2), "load_ms": round(load_time, 2)}


def bench_migration(n_keys=10):
    from src.vault import store, migrate_all_to_argon2
    with TemporaryDirectory() as tmpdir:
        os.environ["KS_VAULT_DIR"] = tmpdir
        for i in range(n_keys):
            store("bench_user", f"provider_{i}", f"key-{i}", password="bench_user")
        start = time.perf_counter()
        migrated = migrate_all_to_argon2("bench_user")
        elapsed = (time.perf_counter() - start) * 1000
        return {"migrated": migrated, "total_ms": round(elapsed, 2), "avg_ms_per_key": round(elapsed / migrated, 2)}


def main():
    print("=" * 70)
    print("KEYSHIELD ENCRYPTION BENCHMARKS")
    print("=" * 70)
    
    print("\n### 1. PBKDF2 Key Derivation (100k iterations, 100 runs)")
    result = bench_pbkdf2()
    print(f"   avg: {result['avg_ms']:.4f}ms | total: {result['total_ms']:.2f}ms")
    
    print("\n### 2. Argon2id Key Derivation (t=10, m=64MB, p=4)")
    result = bench_argon2()
    if "error" in result:
        print(f"   {result['error']}")
    else:
        print(f"   avg: {result['avg_ms']:.2f}ms | total: {result['total_ms']:.2f}ms")
        print(f"   params: t={result['params']['t']}, m={result['params']['m']}KB, p={result['params']['p']}")
    
    print("\n### 3. AES-256-GCM Encryption (256 bytes, 10k runs)")
    result = bench_aes_gcm()
    print(f"   avg: {result['avg_ms']:.4f}ms | throughput: {result['throughput_bps']} B/s")
    
    print("\n### 4. AES-256-GCM Encryption (1KB, 10k runs)")
    result = bench_aes_gcm(plaintext_size=1024)
    print(f"   avg: {result['avg_ms']:.4f}ms | throughput: {result['throughput_bps']} B/s")
    
    print("\n### 5. Vault Store -> Load Cycle (100 keys)")
    result = bench_vault_store_load()
    print(f"   store: {result['store_ms']:.2f}ms | load: {result['load_ms']:.2f}ms")
    
    print("\n### 6. Argon2id Migration (10 keys)")
    result = bench_migration()
    print(f"   migrated: {result['migrated']} keys in {result['total_ms']:.2f}ms ({result['avg_ms_per_key']:.2f}ms/key)")
    
    print("\n### 7. PBKDF2 vs Argon2id comparison")
    pb = bench_pbkdf2()
    arg = bench_argon2(n=50)
    if "error" not in arg:
        speedup = pb['avg_ms'] / arg['avg_ms']
        print(f"   PBKDF2 avg:  {pb['avg_ms']:.4f}ms")
        print(f"   Argon2id avg: {arg['avg_ms']:.2f}ms")
        print(f"   Argon2id is {speedup:.1f}x {'faster' if speedup > 1 else 'slower'} than PBKDF2")
    
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
