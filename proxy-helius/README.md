# proxy-helius — stale snapshot

This directory is **not** a Cargo workspace member and is **not** built
by `ks-proxy`.

The live Helius crate is:

```
src/proxy/crates/ks-helius
```

`src/proxy/Cargo.toml` lists that crate. Do not add this folder to either
workspace (`/` owns the Solana program; `src/proxy/` owns the six hot-path
crates). The files under `crates/ks-helius/` here are an older copy that
diverged (extra `scout.rs` / `cache/` tree, missing the current tests).

If you need Helius RPC behaviour, change `src/proxy/crates/ks-helius` and
run:

```
cargo test --manifest-path src/proxy/Cargo.toml -p ks-helius
```
